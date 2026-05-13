// ============================================================
// Repairs — pure helpers extracted to validators.ts.
// These cover the kanban-transition gates and the parts-summary
// math that powers the repair detail page. No DB required.
// ============================================================
import { describe, it, expect } from 'vitest';

import {
    normalizePart,
    mergeRepairParts,
    buildRepairPartsSummary,
    validateRepairParts,
    assertTransitionReadiness,
    type RepairPart,
} from './validators.js';

describe('normalizePart', () => {
    it('coerces a freshly-typed part with only name + plannedQuantity', () => {
        const out = normalizePart({ name: ' Масло  ', plannedQuantity: 5 });
        expect(out.name).toBe('Масло');
        expect(out.plannedQuantity).toBe(5);
        expect(out.quantity).toBe(5);
        expect(out.received).toBe(false);
        expect(out.receivedQuantity).toBe(0);
        expect(out.usedQuantity).toBe(0);
    });

    it('falls back to catalogName when name is empty', () => {
        const out = normalizePart({ name: '', catalogName: 'Антифриз', plannedQuantity: 1 });
        expect(out.name).toBe('Антифриз');
    });

    it('infers received=true when receivedQuantity > 0', () => {
        const out = normalizePart({ name: 'X', plannedQuantity: 2, receivedQuantity: 2 });
        expect(out.received).toBe(true);
    });
});

describe('mergeRepairParts', () => {
    it('dedupes by catalogId and sums quantities + recomputes unit cost', () => {
        const parts: RepairPart[] = [
            { name: 'Масло', catalogId: 'oil-5w30', plannedQuantity: 3, estimatedUnitCost: 1000 },
            { name: 'Масло', catalogId: 'oil-5w30', plannedQuantity: 2, estimatedUnitCost: 1500 },
        ];
        const out = mergeRepairParts(parts);
        expect(out).toHaveLength(1);
        expect(out[0]!.plannedQuantity).toBe(5);
        // Weighted unit cost: (3*1000 + 2*1500) / 5 = 1200
        expect(out[0]!.estimatedUnitCost).toBeCloseTo(1200, 5);
    });

    it('treats parts with different catalogIds as separate even when names match', () => {
        const parts: RepairPart[] = [
            { name: 'Масло', catalogId: 'oil-5w30', plannedQuantity: 1 },
            { name: 'Масло', catalogId: 'oil-5w40', plannedQuantity: 1 },
        ];
        const out = mergeRepairParts(parts);
        expect(out).toHaveLength(2);
    });

    it('falls back to (name+category+unit) identity when catalogId is missing', () => {
        const parts: RepairPart[] = [
            { name: 'Свеча', unit: 'шт', plannedQuantity: 4 },
            { name: 'Свеча', unit: 'шт', plannedQuantity: 2 },
        ];
        const out = mergeRepairParts(parts);
        expect(out).toHaveLength(1);
        expect(out[0]!.plannedQuantity).toBe(6);
    });
});

describe('buildRepairPartsSummary', () => {
    it('returns zero summary for empty parts list', () => {
        const s = buildRepairPartsSummary([]);
        expect(s.partCount).toBe(0);
        expect(s.plannedCost).toBe(0);
        expect(s.factCost).toBe(0);
        expect(s.variancePercent).toBe(0);
    });

    it('computes plannedCost, usedCost, variance and rates', () => {
        const s = buildRepairPartsSummary([
            { name: 'A', catalogId: 'a', plannedQuantity: 10, estimatedUnitCost: 100, receivedQuantity: 8, actualUnitCost: 120, usedQuantity: 8 },
        ]);
        expect(s.partCount).toBe(1);
        expect(s.plannedQuantity).toBe(10);
        expect(s.plannedCost).toBe(1000);
        expect(s.receivedQuantity).toBe(8);
        expect(s.usedQuantity).toBe(8);
        // usedCost = usedQty * actualUnitCost = 8 * 120 = 960
        expect(s.usedCost).toBe(960);
        // No explicit totalCost → fact = usedCost = 960
        expect(s.factCost).toBe(960);
        expect(s.variance).toBe(-40);
        expect(s.variancePercent).toBeCloseTo(-4, 5);
        expect(s.usedRate).toBeCloseTo(0.8, 5);
    });

    it('uses explicit totalCost when provided as the factCost', () => {
        const s = buildRepairPartsSummary(
            [{ name: 'A', catalogId: 'a', plannedQuantity: 1, estimatedUnitCost: 100 }],
            500,
        );
        expect(s.factCost).toBe(500);
        expect(s.variance).toBe(400);
    });
});

describe('validateRepairParts — input invariants', () => {
    it('passes for a well-formed parts list', () => {
        expect(() => validateRepairParts([
            { name: 'OK', catalogId: 'ok', plannedQuantity: 1 },
        ])).not.toThrow();
    });

    it('throws when plannedQuantity ≤ 0', () => {
        expect(() => validateRepairParts([
            { name: 'X', catalogId: 'x', plannedQuantity: 0 },
        ])).toThrow(/больше 0/);
    });

    it('throws when received=true but receivedQuantity is 0', () => {
        expect(() => validateRepairParts([
            { name: 'X', catalogId: 'x', plannedQuantity: 1, received: true, receivedQuantity: 0 },
        ])).toThrow(/фактическое количество/);
    });

    it('throws when usedQuantity exceeds receivedQuantity', () => {
        expect(() => validateRepairParts([
            { name: 'X', catalogId: 'x', plannedQuantity: 5, receivedQuantity: 3, usedQuantity: 4 },
        ])).toThrow(/не может быть больше полученного/);
    });
});

describe('assertTransitionReadiness — kanban gate', () => {
    const partsWithPlan: RepairPart[] = [
        { name: 'A', catalogId: 'a', plannedQuantity: 2, estimatedUnitCost: 500 },
    ];

    it('blocks → waiting_parts when no plan is filled', () => {
        expect(() => assertTransitionReadiness({ partsUsed: [], totalCost: 0 }, 'waiting_parts'))
            .toThrow(/план закупки запчастей/);
    });

    it('allows → waiting_parts once a plan with quantity + cost exists', () => {
        expect(() => assertTransitionReadiness({ partsUsed: partsWithPlan, totalCost: 0 }, 'waiting_parts'))
            .not.toThrow();
    });

    it('blocks → in_progress until at least one part is marked received', () => {
        expect(() => assertTransitionReadiness({ partsUsed: partsWithPlan, totalCost: 0 }, 'in_progress'))
            .toThrow(/полученную запчасть/);

        const received = [{ ...partsWithPlan[0]!, receivedQuantity: 2 }];
        expect(() => assertTransitionReadiness({ partsUsed: received, totalCost: 0 }, 'in_progress'))
            .not.toThrow();
    });

    it('blocks → done without workDescription', () => {
        expect(() => assertTransitionReadiness(
            { partsUsed: partsWithPlan, totalCost: 1000, workDescription: '' },
            'done',
        )).toThrow(/выполненные работы/);
    });

    it('blocks → done when neither usedQuantity nor totalCost is recorded', () => {
        expect(() => assertTransitionReadiness(
            { partsUsed: partsWithPlan, totalCost: 0, workDescription: 'Заменили масло' },
            'done',
        )).toThrow(/использованные запчасти или итоговую стоимость/);
    });

    it('allows → done with workDescription + totalCost (even without usedQuantity)', () => {
        expect(() => assertTransitionReadiness(
            { partsUsed: partsWithPlan, totalCost: 1500, workDescription: 'Заменили масло' },
            'done',
        )).not.toThrow();
    });
});
