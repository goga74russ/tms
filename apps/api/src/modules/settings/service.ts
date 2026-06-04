import { desc, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { appSettings } from '../../db/schema.js';

export const COST_SETTING_KEYS = {
    fuelPricePerLiter: 'cost.fuel_price_per_liter',
    driverSalaryPerHour: 'cost.driver_salary_per_hour',
    amortizationPerKm: 'cost.amortization_per_km',
} as const;

type CostSettingField = keyof typeof COST_SETTING_KEYS;

// settings cost-model глобальный (P1-D): ключ был общий для всех орг —
// tenant-admin перезаписывал топливо/зарплату/амортизацию для ВСЕХ тенантов.
// Делаем per-org ключ `<baseKey>:<orgId>`. Чтение: org-ключ → глобальный
// (legacy/общий дефолт оператора) → env → захардкоженный default.
function orgKey(baseKey: string, orgId?: string | null): string {
    return orgId ? `${baseKey}:${orgId}` : baseKey;
}

const DEFAULT_COST_SETTINGS = {
    fuelPricePerLiter: 60,
    driverSalaryPerHour: 350,
    amortizationPerKm: 3,
} as const satisfies Record<CostSettingField, number>;

const COST_SETTING_DESCRIPTIONS: Record<CostSettingField, string> = {
    fuelPricePerLiter: 'Цена топлива, ₽/л',
    driverSalaryPerHour: 'Ставка водителя, ₽/час',
    amortizationPerKm: 'Амортизация, ₽/км',
};

function toFiniteNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getCostModelSettings(orgId?: string | null) {
    // Грузим и org-scoped, и глобальные ключи — fallback идёт org → global.
    const wantedKeys = Object.values(COST_SETTING_KEYS).flatMap((k) =>
        orgId ? [orgKey(k, orgId), k] : [k]);
    const rows = await db.select()
        .from(appSettings)
        .where(inArray(appSettings.key, wantedKeys));

    const map = new Map(rows.map((row) => [row.key, row]));

    const readSetting = (field: CostSettingField, envName: string) => {
        const baseKey = COST_SETTING_KEYS[field];
        // org-ключ приоритетнее глобального.
        const dbRow = (orgId ? map.get(orgKey(baseKey, orgId)) : undefined) ?? map.get(baseKey);
        if (dbRow) {
            return {
                key: baseKey,
                value: toFiniteNumber(dbRow.value, DEFAULT_COST_SETTINGS[field]),
                source: 'database' as const,
                description: dbRow.description ?? COST_SETTING_DESCRIPTIONS[field],
                updatedAt: dbRow.updatedAt,
            };
        }

        if (process.env[envName]) {
            return {
                key: COST_SETTING_KEYS[field],
                value: toFiniteNumber(process.env[envName], DEFAULT_COST_SETTINGS[field]),
                source: 'env' as const,
                description: COST_SETTING_DESCRIPTIONS[field],
                updatedAt: null,
            };
        }

        return {
            key: COST_SETTING_KEYS[field],
            value: DEFAULT_COST_SETTINGS[field],
            source: 'default' as const,
            description: COST_SETTING_DESCRIPTIONS[field],
            updatedAt: null,
        };
    };

    const fuelPricePerLiter = readSetting('fuelPricePerLiter', 'FUEL_PRICE_PER_LITER');
    const driverSalaryPerHour = readSetting('driverSalaryPerHour', 'DRIVER_SALARY_PER_HOUR');
    const amortizationPerKm = readSetting('amortizationPerKm', 'AMORTIZATION_PER_KM');

    return {
        fuelPricePerLiter,
        driverSalaryPerHour,
        amortizationPerKm,
    };
}

export async function updateCostModelSettings(
    input: Partial<Record<CostSettingField, number>>,
    updatedBy?: string,
    orgId?: string | null,
) {
    // P1-D: пишем в org-scoped ключ — tenant-admin меняет ТОЛЬКО свою орг.
    const patches = (Object.keys(input) as CostSettingField[])
        .filter((field) => input[field] !== undefined)
        .map((field) => ({
            field,
            key: orgKey(COST_SETTING_KEYS[field], orgId),
            value: String(input[field]!),
            description: COST_SETTING_DESCRIPTIONS[field],
        }));

    // Атомарный upsert вместо SELECT-then-INSERT: параллельные запросы больше не
    // дают duplicate key по уникальному app_settings.key. ON CONFLICT по ключу
    // обновляет существующую строку. Дополнительно сериализуем пачку патчей одной
    // орг advisory-lock'ом (паттерн как в orders/service.ts / invoice-workflow.service.ts),
    // чтобы конкурентные updateCostModelSettings одной орг шли последовательно.
    if (patches.length > 0) {
        await db.transaction(async (tx) => {
            await tx.execute(
                sql`SELECT pg_advisory_xact_lock(hashtext(${'cost_model_settings|' + (orgId ?? 'global')})::bigint)`,
            );
            for (const patch of patches) {
                await tx.insert(appSettings).values({
                    key: patch.key,
                    value: patch.value,
                    description: patch.description,
                    updatedBy: updatedBy ?? null,
                }).onConflictDoUpdate({
                    target: appSettings.key,
                    set: {
                        value: patch.value,
                        description: patch.description,
                        updatedBy: updatedBy ?? null,
                        updatedAt: new Date(),
                    },
                });
            }
        });
    }

    return getCostModelSettings(orgId);
}

export async function listRecentSettings(orgId?: string | null, isSuperAdmin = false) {
    // C3 (механизм «а»): app_settings скоупится через KEY (`baseKey:orgId`).
    // Раньше возвращались последние 20 строк ВСЕХ орг (org-ключи чужих тенантов).
    // Отдаём только ключи этой орг (`:orgId`) + глобальные. super-admin — все; прочий org-less → пусто.
    if (!orgId && !isSuperAdmin) return [];
    const rows = await db.select()
        .from(appSettings)
        .orderBy(desc(appSettings.updatedAt))
        .limit(200);
    if (!orgId) return rows.slice(0, 20); // super-admin: кросс-tenant
    const globalKeys = new Set<string>(Object.values(COST_SETTING_KEYS));
    return rows
        .filter((r) => r.key.endsWith(`:${orgId}`) || globalKeys.has(r.key))
        .slice(0, 20);
}
