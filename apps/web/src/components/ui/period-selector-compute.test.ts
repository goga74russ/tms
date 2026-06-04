import { describe, it, expect } from 'vitest';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays } from 'date-fns';
import { computeRange } from './period-selector';

describe('computeRange', () => {
    const NOW = new Date(2026, 4, 13, 14, 30, 0); // 2026-05-13 14:30

    it("'1w' -> from = now - 7d, to = now, label 'Неделя'", () => {
        const r = computeRange('1w', NOW);
        expect(r.preset).toBe('1w');
        expect(r.label).toBe('Неделя');
        expect(r.from.getTime()).toBe(subDays(NOW, 7).getTime());
        expect(r.to.getTime()).toBe(NOW.getTime());
    });

    it("'4w' -> from = now - 28d", () => {
        const r = computeRange('4w', NOW);
        expect(r.from.getTime()).toBe(subDays(NOW, 28).getTime());
        expect(r.to.getTime()).toBe(NOW.getTime());
        expect(r.label).toBe('4 недели');
    });

    it("'mtd' -> month start to month end", () => {
        const r = computeRange('mtd', NOW);
        expect(r.from.getTime()).toBe(startOfMonth(NOW).getTime());
        expect(r.to.getTime()).toBe(endOfMonth(NOW).getTime());
        expect(r.label).toBe('Месяц');
    });

    it("'qtd' -> quarter start to quarter end", () => {
        const r = computeRange('qtd', NOW);
        expect(r.from.getTime()).toBe(startOfQuarter(NOW).getTime());
        expect(r.to.getTime()).toBe(endOfQuarter(NOW).getTime());
        expect(r.label).toBe('Квартал');
    });

    it("'ytd' -> year start to year end", () => {
        const r = computeRange('ytd', NOW);
        expect(r.from.getTime()).toBe(startOfYear(NOW).getTime());
        expect(r.to.getTime()).toBe(endOfYear(NOW).getTime());
        expect(r.label).toBe('Год');
    });

    it("'all' -> from = 2000-01-01, to = конец текущего дня, label 'Всё'", () => {
        const r = computeRange('all', NOW);
        expect(r.from.getTime()).toBe(new Date(2000, 0, 1).getTime());
        // C9: 'all' теперь фиксирует to на КОНЕЦ текущего дня (а не на now),
        // иначе записи, созданные сегодня но позже now, выпадали из «Всё».
        const endOfDay = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 23, 59, 59, 999);
        expect(r.to.getTime()).toBe(endOfDay.getTime());
        expect(r.label).toBe('Всё');
    });

    it('uses current time when `now` argument is omitted', () => {
        const before = Date.now();
        const r = computeRange('1w');
        const after = Date.now();
        expect(r.to.getTime()).toBeGreaterThanOrEqual(before);
        expect(r.to.getTime()).toBeLessThanOrEqual(after);
    });
});
