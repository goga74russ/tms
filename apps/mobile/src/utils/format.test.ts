import {
    formatTemp,
    formatTime,
    temperatureSourceLabel,
    formatWindow,
    tripStageForStatus,
} from './format';

describe('formatTemp', () => {
    it('positive values get "+" sign and one decimal', () => {
        expect(formatTemp(2)).toBe('+2.0°C');
        expect(formatTemp(2.7)).toBe('+2.7°C');
    });

    it('zero has no sign', () => {
        expect(formatTemp(0)).toBe('0.0°C');
    });

    it('negative values keep their "-" sign', () => {
        expect(formatTemp(-3.2)).toBe('-3.2°C');
    });

    it('nullish/NaN -> "—"', () => {
        expect(formatTemp(null)).toBe('—');
        expect(formatTemp(undefined)).toBe('—');
        expect(formatTemp(Number.NaN)).toBe('—');
    });
});

describe('formatTime', () => {
    it('formats valid ISO to HH:MM:SS', () => {
        // Use a fixed local-time date to make the output deterministic.
        const d = new Date(2026, 4, 13, 14, 5, 9);
        const out = formatTime(d.toISOString());
        // Expect three colon-separated 2-digit groups.
        expect(out).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('"—" when input is null/undefined/empty', () => {
        expect(formatTime(null)).toBe('—');
        expect(formatTime(undefined)).toBe('—');
        expect(formatTime('')).toBe('—');
    });

    it('returns the raw string when input is unparseable', () => {
        expect(formatTime('not-a-date')).toBe('not-a-date');
    });
});

describe('temperatureSourceLabel', () => {
    it('maps known sources to Russian labels', () => {
        expect(temperatureSourceLabel('manual')).toBe('Ручной');
        expect(temperatureSourceLabel('sensor')).toBe('Датчик');
        expect(temperatureSourceLabel('mock')).toBe('Mock');
    });

    it('returns "—" for unknown / nullish', () => {
        expect(temperatureSourceLabel(undefined)).toBe('—');
        expect(temperatureSourceLabel(null)).toBe('—');
        expect(temperatureSourceLabel('other')).toBe('—');
    });
});

describe('formatWindow', () => {
    it('returns null when both bounds are missing', () => {
        expect(formatWindow(null, null)).toBeNull();
        expect(formatWindow(undefined, undefined)).toBeNull();
    });

    it('formats a complete window with both times and the from-date', () => {
        const from = new Date(2026, 4, 13, 9, 0).toISOString();
        const to = new Date(2026, 4, 13, 11, 30).toISOString();
        const out = formatWindow(from, to);
        // Pattern: HH:MM – HH:MM · DD.MM
        expect(out).toMatch(/^\d{2}:\d{2} – \d{2}:\d{2} · \d{2}\.\d{2}$/);
    });

    it('uses "—" for the missing side of a one-sided window', () => {
        const to = new Date(2026, 4, 13, 11, 30).toISOString();
        const out = formatWindow(null, to);
        expect(out).toMatch(/^— – \d{2}:\d{2} · \d{2}\.\d{2}$/);
    });

    it('skips the date part when neither bound is parseable', () => {
        expect(formatWindow('bogus', 'also-bogus')).toBe('— – —');
    });
});

describe('tripStageForStatus', () => {
    it('maps known statuses to their canonical stage index', () => {
        expect(tripStageForStatus('assigned')).toBe(0);
        expect(tripStageForStatus('waybill_draft')).toBe(1);
        expect(tripStageForStatus('inspection')).toBe(1);
        expect(tripStageForStatus('waybill_issued')).toBe(2);
        expect(tripStageForStatus('loading')).toBe(2);
        expect(tripStageForStatus('in_transit')).toBe(3);
        expect(tripStageForStatus('completed')).toBe(4);
        expect(tripStageForStatus('billed')).toBe(4);
    });

    it('defaults to 0 for unknown statuses', () => {
        expect(tripStageForStatus('weird')).toBe(0);
        expect(tripStageForStatus(null)).toBe(0);
        expect(tripStageForStatus(undefined)).toBe(0);
        expect(tripStageForStatus('')).toBe(0);
    });
});
