// ============================================================
// Wave 2 — Cold chain v0: synthetic sensor reading generator.
// Pure function. Real provider integration is out of scope here;
// this keeps demos honest while the wire-level shape stays real.
// ============================================================

export interface MockReading {
    tempC: number;
    source: 'mock';
}

function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

/**
 * Generates a plausible refrigerator-like reading.
 *
 * - No SLA: pick a temperature in -2..6 °C (typical refrigerator band).
 * - With SLA: 90% within (min+0.5, max-0.5), 10% slight breach above max
 *   or below min by 0.5..4.0 °C. The breach probability is intentional —
 *   it lets the UI/notifications path stay exercised in dev demos.
 */
export function generateMockReading(slaMin: number | null, slaMax: number | null): MockReading {
    if (slaMin == null || slaMax == null) {
        return { tempC: round1(rand(-2, 6)), source: 'mock' };
    }

    const inRange = Math.random() > 0.10;
    if (inRange) {
        // Stay comfortably inside the band so float jitter doesn't trip the breach check.
        const lo = Math.min(slaMin + 0.5, slaMax);
        const hi = Math.max(slaMax - 0.5, slaMin);
        return { tempC: round1(rand(lo, hi)), source: 'mock' };
    }

    const high = Math.random() > 0.5;
    const drift = round1(rand(0.5, 4.0));
    return { tempC: round1(high ? slaMax + drift : slaMin - drift), source: 'mock' };
}
