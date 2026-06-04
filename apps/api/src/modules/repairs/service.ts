// ============================================================
// Repairs Service — Business logic (§3.10 ТЗ)
// State machine: created → waiting_parts → in_progress → done
// ============================================================
import { db } from '../../db/connection.js';
import { repairPartCatalog, repairRequests, vehicles } from '../../db/schema.js';
import { eq, and, desc, count, or, ilike, gte, lte, sql, inArray, isNull } from 'drizzle-orm';
import { recordEvent } from '../../events/journal.js';
import { REPAIR_STATE_TRANSITIONS } from '@tms/shared';
import { containsLikePattern } from '../../utils/search.js';
import {
    normalizePart,
    mergeRepairParts,
    buildRepairPartsSummary,
    validateRepairParts,
    assertTransitionReadiness,
    type RepairPart,
    type RepairPartsSummary,
} from './validators.js';

type Pagination = { page: number; limit: number };

export type { RepairPart, RepairPartsSummary };

export type RepairPartCatalogItem = {
    id: string;
    code?: string;
    name: string;
    category: string;
    unit: string;
    suggestedUnitCost: number;
    aliases?: string[];
    isArchived?: boolean;
};

export type RepairPartCatalogGroup = {
    category: string;
    count: number;
    items: RepairPartCatalogItem[];
};

export type RepairPartCatalogMeta = {
    total: number;
    categories: RepairPartCatalogGroup[];
    featured: RepairPartCatalogItem[];
    bundles: RepairPartCatalogBundle[];
    sourceTemplates: RepairPartCatalogTemplate[];
};

export type RepairPartCatalogBundle = {
    id: string;
    name: string;
    description: string;
    totalSuggestedCost: number;
    appliesTo?: Array<'all' | 'auto_inspection' | 'driver' | 'mechanic' | 'scheduled'>;
    items: Array<RepairPartCatalogItem & { quantity: number }>;
};

export type RepairPartCatalogTemplate = RepairPartCatalogBundle;

const REPAIR_PART_CATALOG: RepairPartCatalogItem[] = [
    { id: 'oil-filter', name: 'Масляный фильтр', category: 'Фильтры', unit: 'шт', suggestedUnitCost: 650, aliases: ['фильтр масла', 'oil filter'] },
    { id: 'air-filter', name: 'Воздушный фильтр', category: 'Фильтры', unit: 'шт', suggestedUnitCost: 890, aliases: ['фильтр воздуха', 'air filter'] },
    { id: 'cabin-filter', name: 'Салонный фильтр', category: 'Фильтры', unit: 'шт', suggestedUnitCost: 780, aliases: ['фильтр салона'] },
    { id: 'fuel-filter', name: 'Топливный фильтр', category: 'Фильтры', unit: 'шт', suggestedUnitCost: 940, aliases: ['фильтр топлива'] },
    { id: 'engine-oil-5w30', name: 'Моторное масло 5W-30', category: 'Масла и жидкости', unit: 'л', suggestedUnitCost: 980, aliases: ['масло 5w30', 'oil 5w30'] },
    { id: 'engine-oil-5w40', name: 'Моторное масло 5W-40', category: 'Масла и жидкости', unit: 'л', suggestedUnitCost: 1020, aliases: ['масло 5w40', 'oil 5w40'] },
    { id: 'coolant', name: 'Антифриз', category: 'Масла и жидкости', unit: 'л', suggestedUnitCost: 320, aliases: ['охлаждающая жидкость'] },
    { id: 'brake-pads-front', name: 'Тормозные колодки передние', category: 'Тормозная система', unit: 'компл', suggestedUnitCost: 4200, aliases: ['колодки передние'] },
    { id: 'brake-pads-rear', name: 'Тормозные колодки задние', category: 'Тормозная система', unit: 'компл', suggestedUnitCost: 3900, aliases: ['колодки задние'] },
    { id: 'brake-discs-front', name: 'Тормозные диски передние', category: 'Тормозная система', unit: 'компл', suggestedUnitCost: 7600, aliases: ['диски передние'] },
    { id: 'wiper-blade', name: 'Щетка стеклоочистителя', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 900, aliases: ['дворник', 'щетка'] },
    { id: 'battery', name: 'Аккумулятор', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 12400, aliases: ['акб'] },
    { id: 'starter-belt', name: 'Ремень генератора/привода', category: 'Ремни', unit: 'шт', suggestedUnitCost: 2100, aliases: ['ремень генератора', 'ремень привода'] },
    { id: 'alternator', name: 'Генератор', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 16800, aliases: ['альтернатор'] },
    { id: 'starter', name: 'Стартер', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 15400, aliases: ['пускатель'] },
    { id: 'shock-absorber-front', name: 'Амортизатор передний', category: 'Подвеска', unit: 'шт', suggestedUnitCost: 4300, aliases: ['стойка передняя'] },
    { id: 'shock-absorber-rear', name: 'Амортизатор задний', category: 'Подвеска', unit: 'шт', suggestedUnitCost: 3900, aliases: ['стойка задняя'] },
    { id: 'wheel-bearing', name: 'Подшипник ступицы', category: 'Подвеска', unit: 'шт', suggestedUnitCost: 2800, aliases: ['ступичный подшипник'] },
    { id: 'headlight-bulb', name: 'Лампа фары', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 420, aliases: ['лампочка фары'] },
    { id: 'fuse-set', name: 'Набор предохранителей', category: 'Электрика и кузов', unit: 'компл', suggestedUnitCost: 260, aliases: ['предохранители'] },
    { id: 'relay', name: 'Реле', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 580, aliases: ['релюшка'] },
    { id: 'tire-repair-kit', name: 'Ремкомплект шины', category: 'Колеса и шины', unit: 'компл', suggestedUnitCost: 1500, aliases: ['ремонт шины'] },
    { id: 'tire', name: 'Шина', category: 'Колеса и шины', unit: 'шт', suggestedUnitCost: 16800, aliases: ['покрышка'] },
];

const REPAIR_PART_BUNDLES = [
    {
        id: 'to-light',
        name: 'ТО-1: масло + фильтры',
        description: 'Базовый набор для легкого обслуживания.',
        items: [
            { itemId: 'engine-oil-5w30', quantity: 5 },
            { itemId: 'oil-filter', quantity: 1 },
            { itemId: 'air-filter', quantity: 1 },
            { itemId: 'cabin-filter', quantity: 1 },
        ],
    },
    {
        id: 'to-standard',
        name: 'ТО-2: масло, фильтры, тормоза',
        description: 'Типовой набор для планового ТО среднего уровня.',
        items: [
            { itemId: 'engine-oil-5w40', quantity: 10 },
            { itemId: 'oil-filter', quantity: 1 },
            { itemId: 'fuel-filter', quantity: 1 },
            { itemId: 'air-filter', quantity: 1 },
            { itemId: 'brake-pads-front', quantity: 1 },
        ],
    },
    {
        id: 'winter-readiness',
        name: 'Зимняя готовность',
        description: 'Сезонный набор для подготовки автомобиля.',
        items: [
            { itemId: 'coolant', quantity: 8 },
            { itemId: 'battery', quantity: 1 },
            { itemId: 'wiper-blade', quantity: 2 },
            { itemId: 'headlight-bulb', quantity: 2 },
        ],
    },
] as const;

const REPAIR_SOURCE_TEMPLATES: RepairPartCatalogTemplate[] = [
    {
        id: 'inspection-quick-response',
        name: 'Быстрый ремонт по осмотру',
        description: 'Минимальный набор для оперативного запуска ремонта после дефекта на линии.',
        appliesTo: ['auto_inspection', 'driver', 'mechanic'],
        totalSuggestedCost: 0,
        items: [
            { id: 'brake-pads-front', name: 'Тормозные колодки передние', category: 'Тормозная система', unit: 'компл', suggestedUnitCost: 4200, quantity: 1 },
            { id: 'wiper-blade', name: 'Щетка стеклоочистителя', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 900, quantity: 2 },
            { id: 'fuse-set', name: 'Набор предохранителей', category: 'Электрика и кузов', unit: 'компл', suggestedUnitCost: 260, quantity: 1 },
            { id: 'relay', name: 'Реле', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 580, quantity: 1 },
        ],
    },
    {
        id: 'scheduled-light-service',
        name: 'Плановое ТО по заявке',
        description: 'Базовый набор для быстрого старта стандартного обслуживания.',
        appliesTo: ['scheduled', 'mechanic'],
        totalSuggestedCost: 0,
        items: [
            { id: 'engine-oil-5w30', name: 'Моторное масло 5W-30', category: 'Масла и жидкости', unit: 'л', suggestedUnitCost: 980, quantity: 5 },
            { id: 'oil-filter', name: 'Масляный фильтр', category: 'Фильтры', unit: 'шт', suggestedUnitCost: 650, quantity: 1 },
            { id: 'air-filter', name: 'Воздушный фильтр', category: 'Фильтры', unit: 'шт', suggestedUnitCost: 890, quantity: 1 },
            { id: 'cabin-filter', name: 'Салонный фильтр', category: 'Фильтры', unit: 'шт', suggestedUnitCost: 780, quantity: 1 },
        ],
    },
    {
        id: 'winter-ready-source',
        name: 'Зимняя готовность',
        description: 'Сезонный набор для подготовки автомобиля к холодному периоду.',
        appliesTo: ['scheduled', 'auto_inspection'],
        totalSuggestedCost: 0,
        items: [
            { id: 'coolant', name: 'Антифриз', category: 'Масла и жидкости', unit: 'л', suggestedUnitCost: 320, quantity: 8 },
            { id: 'battery', name: 'Аккумулятор', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 12400, quantity: 1 },
            { id: 'wiper-blade', name: 'Щетка стеклоочистителя', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 900, quantity: 2 },
            { id: 'headlight-bulb', name: 'Лампа фары', category: 'Электрика и кузов', unit: 'шт', suggestedUnitCost: 420, quantity: 2 },
        ],
    },
];

function resolveCatalogItem(itemId: string) {
    return REPAIR_PART_CATALOG.find((item) => item.id === itemId) || null;
}

function resolvePersistedCatalogItem(items: RepairPartCatalogItem[], itemCode: string) {
    return items.find((item) => (item.code || item.id) === itemCode) || null;
}

function resolveCatalogBundle(bundleId: string, items: RepairPartCatalogItem[] = REPAIR_PART_CATALOG): RepairPartCatalogBundle | null {
    const bundle = REPAIR_PART_BUNDLES.find((item) => item.id === bundleId);
    if (!bundle) return null;

    const bundleItems = bundle.items
        .map((entry) => {
            const catalogItem = resolvePersistedCatalogItem(items, entry.itemId);
            if (!catalogItem) return null;
            return { ...catalogItem, quantity: entry.quantity };
        })
        .filter(Boolean) as Array<RepairPartCatalogItem & { quantity: number }>;

    const totalSuggestedCost = bundleItems.reduce((sum, item) => sum + item.quantity * item.suggestedUnitCost, 0);

    return {
        id: bundle.id,
        name: bundle.name,
        description: bundle.description,
        totalSuggestedCost,
        items: bundleItems,
    };
}

function resolveCatalogTemplate(templateId: string, items: RepairPartCatalogItem[] = REPAIR_PART_CATALOG): RepairPartCatalogTemplate | null {
    const template = REPAIR_SOURCE_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return null;

    const templateItems = template.items
        .map((entry) => {
            const catalogItem = resolvePersistedCatalogItem(items, entry.id);
            if (!catalogItem) return null;
            return { ...catalogItem, quantity: entry.quantity };
        })
        .filter(Boolean) as Array<RepairPartCatalogItem & { quantity: number }>;

    const totalSuggestedCost = templateItems.reduce((sum, item) => sum + item.quantity * item.suggestedUnitCost, 0);

    return {
        id: template.id,
        name: template.name,
        description: template.description,
        appliesTo: template.appliesTo,
        totalSuggestedCost,
        items: templateItems,
    };
}

function mapPersistedCatalogItem(row: typeof repairPartCatalog.$inferSelect): RepairPartCatalogItem {
    return {
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        unit: row.unit,
        suggestedUnitCost: Number(row.suggestedUnitCost ?? 0),
        aliases: Array.isArray(row.aliases) ? row.aliases : [],
        isArchived: row.isArchived,
    };
}

function createCatalogCode(input: { code?: string; name?: string }) {
    const base = String(input.code || input.name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-zа-я0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '');

    return base || `part-${Date.now()}`;
}

async function ensureRepairPartCatalogHydrated() {
    const [existing] = await db
        .select({ id: repairPartCatalog.id })
        .from(repairPartCatalog)
        .limit(1);

    if (existing) return;

    // Гидрация выполняется один раз. Два параллельных первых запроса оба проходят проверку
    // LIMIT 1 выше, поэтому захватываем транзакционный advisory-lock и перепроверяем
    // наличие записей уже внутри транзакции, чтобы только один воркер выполнял гидрацию.
    await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('repair_part_catalog:hydrate')::bigint)`);

        const [stillEmpty] = await tx
            .select({ id: repairPartCatalog.id })
            .from(repairPartCatalog)
            .limit(1);

        if (stillEmpty) return;

        const repairs = await tx
            .select({ partsUsed: repairRequests.partsUsed })
            .from(repairRequests)
            .limit(1000);

        const candidates = new Map<string, {
            code: string;
            name: string;
            category: string;
            unit: string;
            suggestedUnitCost: number;
            aliases: string[];
        }>();

        for (const repair of repairs) {
            for (const rawPart of mergeRepairParts((repair.partsUsed as RepairPart[] | null) || [])) {
                const part = normalizePart(rawPart);
                const name = (part.catalogName || part.name || '').trim();
                if (!name) continue;

                const category = (part.catalogCategory || 'Без категории').trim();
                const unit = (part.unit || 'шт').trim();
                const code = createCatalogCode({ code: `${name}-${category}-${unit}` });

                if (!candidates.has(code)) {
                    candidates.set(code, {
                        code,
                        name,
                        category,
                        unit,
                        suggestedUnitCost: Number(part.suggestedUnitCost ?? part.estimatedUnitCost ?? part.actualUnitCost ?? part.cost ?? 0),
                        aliases: [],
                    });
                }
            }
        }

        if (candidates.size === 0) return;

        await tx
            .insert(repairPartCatalog)
            .values(Array.from(candidates.values()).map((item) => ({
                ...item,
                isArchived: false,
            })))
            .onConflictDoNothing();
    });
}

async function loadRepairPartCatalogItems(options?: {
    search?: string;
    limit?: number;
    includeArchived?: boolean;
    organizationId?: string | null;
}) {
    await ensureRepairPartCatalogHydrated();

    const query = options?.search?.trim();
    const conditions = [];

    if (!options?.includeArchived) {
        conditions.push(eq(repairPartCatalog.isArchived, false));
    }
    if (options?.organizationId) {
        conditions.push(or(isNull(repairPartCatalog.organizationId), eq(repairPartCatalog.organizationId, options.organizationId)));
    }

    if (query) {
        const likePattern = containsLikePattern(query);
        conditions.push(or(
            ilike(repairPartCatalog.name, likePattern),
            ilike(repairPartCatalog.category, likePattern),
            ilike(repairPartCatalog.unit, likePattern),
            ilike(repairPartCatalog.code, likePattern),
            ilike(sql`${repairPartCatalog.aliases}::text`, likePattern),
        ));
    }

    const rows = await db
        .select()
        .from(repairPartCatalog)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(repairPartCatalog.category, repairPartCatalog.name)
        .limit(options?.limit ?? 500);

    return rows.map(mapPersistedCatalogItem);
}

function matchesPartCatalog(item: RepairPartCatalogItem, query: string) {
    const term = query.trim().toLowerCase();
    if (!term) return true;

    const haystack = [
        item.name,
        item.category,
        item.unit,
        ...(item.aliases || []),
    ].join(' ').toLowerCase();

    return haystack.includes(term);
}

export async function listRepairPartCatalog(
    search?: string,
    options?: { limit?: number; includeArchived?: boolean; organizationId?: string | null },
) {
    const query = search?.trim() || '';
    const items = await loadRepairPartCatalogItems({
        search: query,
        limit: Math.min(500, Math.max(1, options?.limit ?? 50)),
        includeArchived: options?.includeArchived,
        organizationId: options?.organizationId,
    });
    return items
        .filter((item) => matchesPartCatalog(item, query))
        .sort((a, b) => a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru'))
        .slice(0, Math.min(500, Math.max(1, options?.limit ?? 20)));
}

export async function getRepairPartCatalogMeta(organizationId?: string | null): Promise<RepairPartCatalogMeta> {
    const catalogItems = await loadRepairPartCatalogItems({ limit: 1000, organizationId });
    const grouped = new Map<string, RepairPartCatalogItem[]>();

    for (const item of catalogItems) {
        const key = item.category || 'Без категории';
        const bucket = grouped.get(key) || [];
        bucket.push(item);
        grouped.set(key, bucket);
    }

    const categories = Array.from(grouped.entries())
        .map(([category, items]) => ({
            category,
            count: items.length,
            items: items
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
                .slice(0, 4),
        }))
        .sort((a, b) => a.category.localeCompare(b.category, 'ru'));

    const featured = catalogItems
        .slice()
        .sort((a, b) => a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru'))
        .slice(0, 8);
    const bundles = REPAIR_PART_BUNDLES.map((bundle) => resolveCatalogBundle(bundle.id, catalogItems)).filter(Boolean) as RepairPartCatalogBundle[];
    const sourceTemplates = REPAIR_SOURCE_TEMPLATES.map((template) => resolveCatalogTemplate(template.id, catalogItems)).filter(Boolean) as RepairPartCatalogTemplate[];

    return {
        total: catalogItems.length,
        categories,
        featured,
        bundles,
        sourceTemplates,
    };
}

export async function createRepairPartCatalogItem(
    data: {
        code?: string;
        name: string;
        category: string;
        unit: string;
        suggestedUnitCost: number;
        aliases?: string[];
    },
    user: { userId: string; organizationId?: string | null },
) {
    await ensureRepairPartCatalogHydrated();

    const [created] = await db
        .insert(repairPartCatalog)
        .values({
            code: createCatalogCode(data),
            name: data.name.trim(),
            category: data.category.trim(),
            unit: data.unit.trim(),
            suggestedUnitCost: Number(data.suggestedUnitCost || 0),
            aliases: (data.aliases || []).map((item) => item.trim()).filter(Boolean),
            organizationId: user.organizationId ?? null,
            createdBy: user.userId,
            updatedAt: new Date(),
        })
        .returning();

    await recordEvent({
        authorId: user.userId,
        authorRole: 'repair_service',
        eventType: 'repair.catalog_item_created',
        entityType: 'repair_part_catalog',
        entityId: created.id,
        data: {
            code: created.code,
            name: created.name,
            category: created.category,
        },
    });

    return mapPersistedCatalogItem(created);
}

async function syncRepairCatalogFromParts(parts: RepairPart[] | undefined, organizationId?: string | null) {
    if (!parts || parts.length === 0) return;

    const rows = mergeRepairParts(parts)
        .map((rawPart) => normalizePart(rawPart))
        .filter((part) => (part.catalogName || part.name || '').trim())
        .map((part) => {
            const name = (part.catalogName || part.name || '').trim();
            const category = (part.catalogCategory || 'Без категории').trim();
            const unit = (part.unit || 'шт').trim();
            const code = createCatalogCode({ code: `${name}-${category}-${unit}` });
            return {
                code,
                name,
                category,
                unit,
                suggestedUnitCost: Number(part.suggestedUnitCost ?? part.estimatedUnitCost ?? part.actualUnitCost ?? part.cost ?? 0),
                aliases: [],
                isArchived: false,
                organizationId: organizationId ?? null,
            };
        });

    if (rows.length === 0) return;

    await db
        .insert(repairPartCatalog)
        .values(rows)
        .onConflictDoNothing();
}

export async function updateRepairPartCatalogItem(
    id: string,
    data: Partial<{
        code: string;
        name: string;
        category: string;
        unit: string;
        suggestedUnitCost: number;
        aliases: string[];
        isArchived: boolean;
    }>,
    user: { userId: string; organizationId?: string | null },
) {
    const [updated] = await db
        .update(repairPartCatalog)
        .set({
            code: data.code ? createCatalogCode({ code: data.code }) : undefined,
            name: data.name?.trim(),
            category: data.category?.trim(),
            unit: data.unit?.trim(),
            suggestedUnitCost: data.suggestedUnitCost !== undefined ? Number(data.suggestedUnitCost) : undefined,
            aliases: data.aliases ? data.aliases.map((item) => item.trim()).filter(Boolean) : undefined,
            isArchived: data.isArchived,
            updatedAt: new Date(),
        })
        .where(user.organizationId
            ? and(eq(repairPartCatalog.id, id), eq(repairPartCatalog.organizationId, user.organizationId))
            : eq(repairPartCatalog.id, id))
        .returning();

    if (!updated) {
        throw new Error('Позиция справочника не найдена');
    }

    await recordEvent({
        authorId: user.userId,
        authorRole: 'repair_service',
        eventType: 'repair.catalog_item_updated',
        entityType: 'repair_part_catalog',
        entityId: updated.id,
        data: {
            code: updated.code,
            name: updated.name,
            category: updated.category,
            isArchived: updated.isArchived,
        },
    });

    return mapPersistedCatalogItem(updated);
}

export async function archiveRepairPartCatalogItem(id: string, user: { userId: string; organizationId?: string | null }) {
    const [updated] = await db
        .update(repairPartCatalog)
        .set({
            isArchived: true,
            updatedAt: new Date(),
        })
        .where(user.organizationId
            ? and(eq(repairPartCatalog.id, id), eq(repairPartCatalog.organizationId, user.organizationId))
            : eq(repairPartCatalog.id, id))
        .returning();

    if (!updated) {
        throw new Error('Позиция справочника не найдена');
    }

    await recordEvent({
        authorId: user.userId,
        authorRole: 'repair_service',
        eventType: 'repair.catalog_item_archived',
        entityType: 'repair_part_catalog',
        entityId: updated.id,
        data: {
            code: updated.code,
            name: updated.name,
        },
    });

    return mapPersistedCatalogItem(updated);
}

function normalizeRepair<T extends { partsUsed?: RepairPart[] | null; totalCost?: number | string | null }>(
    repair: T,
): T & { partsUsed: RepairPart[]; totalCost: number; partsSummary: RepairPartsSummary } {
    const partsUsed = mergeRepairParts(repair.partsUsed || []);
    return {
        ...repair,
        partsUsed,
        totalCost: Number(repair.totalCost ?? 0),
        partsSummary: buildRepairPartsSummary(partsUsed, repair.totalCost),
    };
}

function paginationDefaults(p?: Partial<Pagination>): Pagination {
    return {
        page: Math.max(1, p?.page ?? 1),
        limit: Math.min(100, Math.max(1, p?.limit ?? 20)),
    };
}

function paginationMeta(total: number, p: Pagination) {
    return { total, page: p.page, limit: p.limit, totalPages: Math.ceil(total / p.limit) };
}

function scopedRepairCondition(id: string, organizationId?: string | null) {
    return organizationId
        ? and(
            eq(repairRequests.id, id),
            inArray(
                repairRequests.vehicleId,
                db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, organizationId)),
            ),
        )
        : eq(repairRequests.id, id);
}

// ================================================================
// CRUD
// ================================================================

export async function listRepairs(
    filters: {
        status?: string; vehicleId?: string;
        search?: string; dateFrom?: string; dateTo?: string;
        organizationId?: string | null;
    },
    pagination?: Partial<Pagination>,
) {
    const p = paginationDefaults(pagination);
    const conditions = [];

    if (filters.status) conditions.push(eq(repairRequests.status, filters.status as 'created' | 'waiting_parts' | 'in_progress' | 'done'));
    if (filters.vehicleId) conditions.push(eq(repairRequests.vehicleId, filters.vehicleId));
    if (filters.search) {
        conditions.push(
            or(
                ilike(repairRequests.description, containsLikePattern(filters.search)),
                ilike(repairRequests.assignedTo, containsLikePattern(filters.search)),
            ),
        );
    }
    if (filters.dateFrom) conditions.push(gte(repairRequests.createdAt, new Date(filters.dateFrom)));
    if (filters.dateTo) conditions.push(lte(repairRequests.createdAt, new Date(filters.dateTo)));
    if (filters.organizationId) {
        conditions.push(
            inArray(repairRequests.vehicleId, db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, filters.organizationId)))
        );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(repairRequests).where(where);
    const total = totalResult?.count ?? 0;

    const rows = await db.select()
        .from(repairRequests)
        .where(where)
        .orderBy(desc(repairRequests.createdAt))
        .limit(p.limit)
        .offset((p.page - 1) * p.limit);

    return { data: rows.map((row: any) => normalizeRepair(row)), pagination: paginationMeta(total, p) };
}

export async function getRepair(id: string, organizationId?: string | null) {
    const [repair] = await db.select().from(repairRequests).where(scopedRepairCondition(id, organizationId));
    if (!repair) return null;

    // Fetch vehicle info
    const [vehicle] = await db.select({
        id: vehicles.id,
        plateNumber: vehicles.plateNumber,
        make: vehicles.make,
        model: vehicles.model,
    })
        .from(vehicles)
        .where(eq(vehicles.id, repair.vehicleId));

    return { ...normalizeRepair(repair), vehicle: vehicle || null };
}

export async function createRepair(
    data: {
        vehicleId: string;
        description: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
        source: 'auto_inspection' | 'driver' | 'mechanic' | 'scheduled';
        inspectionId?: string;
        assignedTo?: string;
        photoUrls?: string[];
        odometerAtRepair?: number;
    },
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    const vehicleStatus = data.priority === 'critical' ? 'broken' : 'maintenance';

    // H-10 / S-4: Wrap INSERT repair and UPDATE vehicle in a single transaction
    const repair = await db.transaction(async (tx) => {
        const [rep] = await tx.insert(repairRequests).values({
            vehicleId: data.vehicleId,
            description: data.description,
            priority: data.priority,
            source: data.source,
            inspectionId: data.inspectionId,
            assignedTo: data.assignedTo,
            photoUrls: data.photoUrls || [],
            odometerAtRepair: data.odometerAtRepair,
        }).returning();

        // Set vehicle status based on priority
        await tx.update(vehicles)
            .set({ status: vehicleStatus, updatedAt: new Date() })
            .where(user.organizationId
                ? and(eq(vehicles.id, data.vehicleId), eq(vehicles.organizationId, user.organizationId))
                : eq(vehicles.id, data.vehicleId));

        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'repair.created',
            entityType: 'repair',
            entityId: rep.id,
            data: {
                vehicleId: data.vehicleId,
                description: data.description,
                priority: data.priority,
                source: data.source,
            },
        }, tx);

        // Also log vehicle status change
        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType: 'vehicle.status_changed',
            entityType: 'vehicle',
            entityId: data.vehicleId,
            data: { newStatus: vehicleStatus, reason: `repair_created:${rep.id}` },
        }, tx);

        return rep;
    });

    return normalizeRepair(repair);
}

export async function updateRepairStatus(
    id: string,
    newStatus: string,
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    // Get current repair
    const [repair] = await db.select().from(repairRequests).where(scopedRepairCondition(id, user.organizationId));
    if (!repair) throw new Error('Заявка на ремонт не найдена');

    // Validate transition
    const allowed = REPAIR_STATE_TRANSITIONS[repair.status] || [];
    if (!allowed.includes(newStatus)) {
        throw new Error(`Недопустимый переход статуса: ${repair.status} → ${newStatus}`);
    }

    assertTransitionReadiness(repair, newStatus);

    const updateData: Record<string, any> = {
        status: newStatus,
        updatedAt: new Date(),
    };

    if (newStatus === 'done') {
        updateData.completedAt = new Date();
    }

    // H-11: Wrap repair status + vehicle status in single transaction
    const updated = await db.transaction(async (tx) => {
        const [result] = await tx.update(repairRequests)
            .set(updateData)
            .where(scopedRepairCondition(id, user.organizationId))
            .returning();

        // On completion, conditionally set vehicle back to available
        // FIX: Only set available if NO other active repairs exist for this vehicle
        if (newStatus === 'done') {
            const otherActiveRepairs = await tx.select({ id: repairRequests.id })
                .from(repairRequests)
                .where(and(
                    eq(repairRequests.vehicleId, repair.vehicleId),
                    inArray(repairRequests.status, ['created', 'waiting_parts', 'in_progress']),
                    sql`${repairRequests.id} != ${id}`
                ))
                .limit(1);

            if (otherActiveRepairs.length === 0) {
                await tx.update(vehicles)
                    .set({ status: 'available', updatedAt: new Date() })
                    .where(eq(vehicles.id, repair.vehicleId));
            }
            // else: vehicle stays in maintenance/broken — other repairs still active
        }

        // Events inside transaction (N-2)
        if (newStatus === 'done') {
            await recordEvent({
                authorId: user.userId,
                authorRole: user.roles[0],
                eventType: 'vehicle.status_changed',
                entityType: 'vehicle',
                entityId: repair.vehicleId,
                data: { newStatus: 'available', reason: `repair_completed:${id}` },
            }, tx);
        }

        const eventType = newStatus === 'done' ? 'repair.completed' : 'repair.status_changed';
        await recordEvent({
            authorId: user.userId,
            authorRole: user.roles[0],
            eventType,
            entityType: 'repair',
            entityId: id,
            data: {
                previousStatus: repair.status,
                newStatus,
                vehicleId: repair.vehicleId,
            },
        }, tx);

        return result;
    });

    return normalizeRepair(updated);
}

export async function updateRepair(
    id: string,
    data: Partial<{
        description: string;
        priority: string;
        assignedTo: string;
        workDescription: string;
        partsUsed: RepairPart[];
        totalCost: number;
        odometerAtRepair: number;
        photoUrls: string[];
    }>,
    user: { userId: string; roles: string[]; organizationId?: string | null },
) {
    if (data.partsUsed !== undefined) {
        validateRepairParts(data.partsUsed);
        await syncRepairCatalogFromParts(data.partsUsed, user.organizationId);
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (data.description !== undefined) updateData.description = data.description;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
    if (data.workDescription !== undefined) updateData.workDescription = data.workDescription;
    if (data.partsUsed !== undefined) updateData.partsUsed = mergeRepairParts(data.partsUsed);
    if (data.totalCost !== undefined) updateData.totalCost = data.totalCost;
    if (data.odometerAtRepair !== undefined) updateData.odometerAtRepair = data.odometerAtRepair;
    if (data.photoUrls !== undefined) updateData.photoUrls = data.photoUrls;

    // Auto-calculate totalCost from parts if parts provided but cost isn't
    if (data.partsUsed && data.totalCost === undefined) {
        const normalizedParts = mergeRepairParts(data.partsUsed);
        updateData.totalCost = normalizedParts.reduce((sum, part) => {
            const quantity = Number(part.usedQuantity ?? part.receivedQuantity ?? 0);
            const unitCost = Number(part.actualUnitCost ?? part.estimatedUnitCost ?? 0);
            return sum + quantity * unitCost;
        }, 0);
    }

    const [updated] = await db.update(repairRequests)
        .set(updateData)
        .where(scopedRepairCondition(id, user.organizationId))
        .returning();

    if (!updated) throw new Error('Заявка на ремонт не найдена');
    return normalizeRepair(updated);
}

// ================================================================
// Scheduled maintenance check
// ================================================================

/**
 * Check all vehicles for scheduled maintenance triggers.
 * Creates repair requests when km or date thresholds are reached.
 * Should be called periodically (e.g., daily cron job).
 */
// C-6: Use filtered DB query instead of loading ALL vehicles into RAM
export async function checkScheduledMaintenance(systemUserId: string) {
    const now = new Date();

    // Only fetch vehicles that actually need maintenance (date or km threshold)
    const vehiclesNeedingMaintenance = await db.select()
        .from(vehicles)
        .where(
            and(
                eq(vehicles.isArchived, false),
                eq(vehicles.status, 'available'),
                or(
                    lte(vehicles.maintenanceNextDate, now),
                    sql`${vehicles.currentOdometerKm} >= ${vehicles.maintenanceNextKm}`,
                ),
            ),
        );

    const created: string[] = [];

    for (const vehicle of vehiclesNeedingMaintenance) {
        let reason = '';

        if (vehicle.maintenanceNextDate && vehicle.maintenanceNextDate <= now) {
            reason = `Плановое ТО по дате (${vehicle.maintenanceNextDate.toISOString().slice(0, 10)})`;
        } else if (vehicle.maintenanceNextKm && vehicle.currentOdometerKm >= vehicle.maintenanceNextKm) {
            reason = `Плановое ТО по пробегу (${vehicle.currentOdometerKm} >= ${vehicle.maintenanceNextKm} км)`;
        }

        // Check if there's already an open repair for this vehicle
        const [existing] = await db.select({ id: repairRequests.id })
            .from(repairRequests)
            .where(
                and(
                    eq(repairRequests.vehicleId, vehicle.id),
                    eq(repairRequests.source, 'scheduled'),
                    or(
                        eq(repairRequests.status, 'created'),
                        eq(repairRequests.status, 'waiting_parts'),
                        eq(repairRequests.status, 'in_progress'),
                    ),
                ),
            );

        if (!existing) {
            const repair = await createRepair({
                vehicleId: vehicle.id,
                description: reason,
                priority: 'medium',
                source: 'scheduled',
                odometerAtRepair: vehicle.currentOdometerKm,
            }, { userId: systemUserId, roles: ['repair_service'] });

            created.push(repair.id);
        }
    }

    return { created: created.length, repairIds: created };
}

// ================================================================
// Analytics
// ================================================================

export async function repairsCostByVehicle(vehicleId: string, organizationId?: string | null) {
    const rows = await db.select({
        totalCost: sql<number>`sum(${repairRequests.totalCost})`,
        count: count(),
    })
        .from(repairRequests)
        .where(organizationId
            ? and(
                eq(repairRequests.vehicleId, vehicleId),
                inArray(
                    repairRequests.vehicleId,
                    db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, organizationId)),
                ),
            )
            : eq(repairRequests.vehicleId, vehicleId));

    return rows[0] || { totalCost: 0, count: 0 };
}

export async function repairsByStatus(organizationId?: string | null) {
    return db.select({
        status: repairRequests.status,
        count: count(),
    })
        .from(repairRequests)
        .where(organizationId
            ? inArray(
                repairRequests.vehicleId,
                db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, organizationId)),
            )
            : undefined)
        .groupBy(repairRequests.status);
}
