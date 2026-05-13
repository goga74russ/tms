// ============================================================
// Repairs — pure helpers extracted from service.ts so that they can
// be unit-tested without booting Drizzle / DB / event journal.
//
// These three functions encapsulate the only repair-state business
// rules outside the kanban transition table itself:
//   - normalizePart   : coerce a partsUsed[] entry into a canonical
//                       shape (used by both the API and validators)
//   - mergeRepairParts: dedupe a partsUsed[] list by catalog identity
//                       and re-derive average unit costs
//   - validateRepairParts / buildRepairPartsSummary / assertTransitionReadiness:
//                       business invariants for status changes.
// Behavior is preserved verbatim — service.ts re-exports these.
// ============================================================

export type RepairPart = {
    name: string;
    quantity?: number;
    cost?: number;
    plannedQuantity?: number;
    estimatedUnitCost?: number;
    catalogId?: string;
    catalogName?: string;
    catalogCategory?: string;
    unit?: string;
    suggestedUnitCost?: number;
    received?: boolean;
    receivedQuantity?: number;
    actualUnitCost?: number;
    usedQuantity?: number;
};

type MergedRepairPart = RepairPart & {
    plannedCostTotal: number;
    receivedCostTotal: number;
    usedCostTotal: number;
};

export type RepairPartsSummary = {
    partCount: number;
    plannedQuantity: number;
    receivedQuantity: number;
    usedQuantity: number;
    plannedCost: number;
    receivedCost: number;
    usedCost: number;
    factCost: number;
    variance: number;
    variancePercent: number;
    plannedRate: number;
    receivedRate: number;
    usedRate: number;
};

export function normalizePart(part: RepairPart): RepairPart {
    const plannedQuantity = Number(part.plannedQuantity ?? part.quantity ?? 0);
    const suggestedUnitCost = part.suggestedUnitCost !== undefined ? Number(part.suggestedUnitCost) : undefined;
    const estimatedUnitCost = Number(part.estimatedUnitCost ?? part.cost ?? suggestedUnitCost ?? 0);
    const receivedQuantity = Number(part.receivedQuantity ?? 0);
    const actualUnitCost = Number(part.actualUnitCost ?? part.cost ?? estimatedUnitCost ?? 0);
    const usedQuantity = Number(part.usedQuantity ?? receivedQuantity ?? 0);

    return {
        name: part.name?.trim() || part.catalogName || '',
        quantity: plannedQuantity,
        cost: estimatedUnitCost,
        plannedQuantity,
        estimatedUnitCost,
        catalogId: part.catalogId?.trim() || undefined,
        catalogName: part.catalogName?.trim() || undefined,
        catalogCategory: part.catalogCategory?.trim() || undefined,
        unit: part.unit?.trim() || undefined,
        suggestedUnitCost,
        received: Boolean(part.received ?? receivedQuantity > 0),
        receivedQuantity,
        actualUnitCost,
        usedQuantity,
    };
}

function partIdentity(part: RepairPart) {
    const catalogId = part.catalogId?.trim();
    if (catalogId) return `catalog:${catalogId.toLowerCase()}`;

    const name = (part.catalogName || part.name || '').trim().toLowerCase();
    const category = (part.catalogCategory || '').trim().toLowerCase();
    const unit = (part.unit || '').trim().toLowerCase();
    return `text:${[name, category, unit].join('|')}`;
}

export function mergeRepairParts(parts: RepairPart[]) {
    const merged = new Map<string, MergedRepairPart>();

    for (const rawPart of parts) {
        const part = normalizePart(rawPart);
        const key = partIdentity(part);
        const existing = merged.get(key);
        const plannedQuantity = Number(part.plannedQuantity || 0);
        const receivedQuantity = Number(part.receivedQuantity || 0);
        const usedQuantity = Number(part.usedQuantity || 0);
        const plannedUnitCost = Number(part.estimatedUnitCost || part.suggestedUnitCost || 0);
        const receivedUnitCost = Number(part.actualUnitCost || part.estimatedUnitCost || part.suggestedUnitCost || 0);
        const usedUnitCost = Number(part.actualUnitCost || part.estimatedUnitCost || part.suggestedUnitCost || 0);

        if (!existing) {
            merged.set(key, {
                ...part,
                quantity: plannedQuantity,
                plannedQuantity,
                receivedQuantity,
                usedQuantity,
                estimatedUnitCost: plannedUnitCost,
                actualUnitCost: receivedUnitCost,
                cost: plannedUnitCost,
                received: Boolean(part.received || receivedQuantity > 0),
                plannedCostTotal: plannedQuantity * plannedUnitCost,
                receivedCostTotal: receivedQuantity * receivedUnitCost,
                usedCostTotal: usedQuantity * usedUnitCost,
            });
            continue;
        }

        existing.quantity = Number(existing.quantity || 0) + plannedQuantity;
        existing.plannedQuantity = Number(existing.plannedQuantity || 0) + plannedQuantity;
        existing.receivedQuantity = Number(existing.receivedQuantity || 0) + receivedQuantity;
        existing.usedQuantity = Number(existing.usedQuantity || 0) + usedQuantity;
        existing.received = Boolean(existing.received || part.received || receivedQuantity > 0);
        existing.plannedCostTotal += plannedQuantity * plannedUnitCost;
        existing.receivedCostTotal += receivedQuantity * receivedUnitCost;
        existing.usedCostTotal += usedQuantity * usedUnitCost;
        if (!existing.catalogId && part.catalogId) existing.catalogId = part.catalogId;
        if (!existing.catalogName && part.catalogName) existing.catalogName = part.catalogName;
        if (!existing.catalogCategory && part.catalogCategory) existing.catalogCategory = part.catalogCategory;
        if (!existing.unit && part.unit) existing.unit = part.unit;
        if (!existing.suggestedUnitCost && part.suggestedUnitCost !== undefined) existing.suggestedUnitCost = part.suggestedUnitCost;
    }

    return Array.from(merged.values()).map((entry: MergedRepairPart) => {
        const { plannedCostTotal, receivedCostTotal, usedCostTotal, ...part } = entry;
        const plannedQuantity = Number(part.plannedQuantity || 0);
        const receivedQuantity = Number(part.receivedQuantity || 0);
        const usedQuantity = Number(part.usedQuantity || 0);
        return {
            ...part,
            plannedQuantity,
            quantity: plannedQuantity,
            receivedQuantity,
            usedQuantity,
            estimatedUnitCost: plannedQuantity > 0 ? plannedCostTotal / plannedQuantity : Number(part.estimatedUnitCost || part.suggestedUnitCost || 0),
            actualUnitCost: receivedQuantity > 0
                ? receivedCostTotal / receivedQuantity
                : usedQuantity > 0
                    ? usedCostTotal / usedQuantity
                    : Number(part.actualUnitCost || part.estimatedUnitCost || part.suggestedUnitCost || 0),
            cost: plannedQuantity > 0 ? plannedCostTotal / plannedQuantity : Number(part.cost || part.estimatedUnitCost || 0),
        } as RepairPart;
    });
}

export function buildRepairPartsSummary(parts: RepairPart[], totalCost?: number | string | null): RepairPartsSummary {
    const summary = mergeRepairParts(parts).reduce(
        (acc, rawPart) => {
            const part = normalizePart(rawPart);
            const plannedQuantity = Number(part.plannedQuantity || 0);
            const receivedQuantity = Number(part.receivedQuantity || 0);
            const usedQuantity = Number(part.usedQuantity || 0);
            const plannedUnitCost = Number(part.estimatedUnitCost || part.suggestedUnitCost || 0);
            const factUnitCost = Number(part.actualUnitCost || part.estimatedUnitCost || part.suggestedUnitCost || 0);

            acc.partCount += 1;
            acc.plannedQuantity += plannedQuantity;
            acc.receivedQuantity += receivedQuantity;
            acc.usedQuantity += usedQuantity;
            acc.plannedCost += plannedQuantity * plannedUnitCost;
            acc.receivedCost += receivedQuantity * factUnitCost;
            acc.usedCost += usedQuantity * factUnitCost;
            return acc;
        },
        {
            partCount: 0,
            plannedQuantity: 0,
            receivedQuantity: 0,
            usedQuantity: 0,
            plannedCost: 0,
            receivedCost: 0,
            usedCost: 0,
            variancePercent: 0,
        },
    );

    const factCost = Number(totalCost ?? 0) > 0 ? Number(totalCost ?? 0) : (summary.usedCost > 0 ? summary.usedCost : summary.receivedCost);
    const plannedRate = summary.plannedQuantity > 0 ? summary.plannedQuantity : 0;
    const receivedRate = summary.plannedQuantity > 0 ? summary.receivedQuantity / summary.plannedQuantity : 0;
    const usedRate = summary.plannedQuantity > 0 ? summary.usedQuantity / summary.plannedQuantity : 0;

    return {
        ...summary,
        factCost,
        variance: factCost - summary.plannedCost,
        variancePercent: summary.plannedCost > 0 ? ((factCost - summary.plannedCost) / summary.plannedCost) * 100 : 0,
        plannedRate,
        receivedRate,
        usedRate,
    };
}

export function validateRepairParts(parts: RepairPart[]) {
    for (const rawPart of mergeRepairParts(parts)) {
        const part = normalizePart(rawPart);
        const label = part.catalogName || part.name || 'Запчасть';

        if (!part.name?.trim() && !part.catalogName?.trim()) {
            throw new Error(`Укажите название для позиции "${label}"`);
        }

        if (Number(part.plannedQuantity ?? 0) <= 0) {
            throw new Error(`Плановое количество для "${label}" должно быть больше 0`);
        }

        if (part.received === true && Number(part.receivedQuantity ?? 0) <= 0) {
            throw new Error(`Для "${label}" укажите фактическое количество при отметке о поступлении`);
        }

        if (Number(part.usedQuantity ?? 0) > Number(part.receivedQuantity ?? 0)) {
            throw new Error(`Использованное количество для "${label}" не может быть больше полученного`);
        }
    }
}

export function assertTransitionReadiness(
    repair: { partsUsed?: RepairPart[] | null; totalCost?: number | string | null; workDescription?: string | null },
    newStatus: string,
) {
    const parts = mergeRepairParts(repair.partsUsed || []);
    const summary = buildRepairPartsSummary(parts, repair.totalCost);

    if (newStatus === 'waiting_parts') {
        if (summary.partCount === 0 || summary.plannedQuantity <= 0 || summary.plannedCost <= 0) {
            throw new Error('Перед переводом в ожидание заполните план закупки запчастей');
        }
    }

    if (newStatus === 'in_progress') {
        const hasReceived = parts.some((part: RepairPart) => part.received || Number(part.receivedQuantity ?? 0) > 0);
        if (!hasReceived) {
            throw new Error('Перед переводом в работу отметьте хотя бы одну полученную запчасть');
        }
    }

    if (newStatus === 'done') {
        if (!repair.workDescription?.trim()) {
            throw new Error('Перед завершением укажите выполненные работы');
        }

        if (summary.usedQuantity <= 0 && Number(repair.totalCost ?? 0) <= 0) {
            throw new Error('Перед завершением укажите использованные запчасти или итоговую стоимость');
        }
    }
}
