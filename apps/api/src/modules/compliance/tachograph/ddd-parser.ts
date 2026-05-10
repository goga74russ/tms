// ============================================================
// Tachograph .DDD / .ESM parser — best-effort header read.
//
// Russian СКЗИ-tachographs share the EU "Type Approved Recording
// Equipment" file layout (Regulation (EU) 2016/799 Annex 1C),
// but signing/encryption headers differ. We can't ship a fully
// conformant reader without a certified СКЗИ stack — this module
// extracts the bits we actually use today (driver card number,
// vehicle VIN if present, period bounds, activity timeline) and
// flags the rest with TODOs so the swap to a proper reader is a
// drop-in replacement.
//
// References:
//   • Annex 1C, Appendix 2 — TLV structure
//   • Tag 0x0501 — Driver Card Identification
//   • Tag 0x0502 — Driver Activity Data
//   • Tag 0x0503 — Vehicles Used
// TODO(real-ddd): full parsing requires СКЗИ-aware reader for
//   Russian tachographs; replace this skeleton when available.
// ============================================================

export type TachoActivityType = 'rest' | 'available' | 'work' | 'driving' | 'unknown';

export interface TachoActivity {
    type: TachoActivityType;
    startedAt: Date;
    endedAt: Date;
    /** duration in seconds */
    duration: number;
}

export interface DddParseResult {
    driverCardNumber: string | null;
    vehicleVin: string | null;
    periodFrom: Date | null;
    periodTo: Date | null;
    activities: TachoActivity[];
    /** soft warnings collected during parse — surfaced in the upload audit row */
    warnings: string[];
}

const ACTIVITY_MAP: Record<number, TachoActivityType> = {
    0x00: 'rest',
    0x01: 'available',
    0x02: 'work',
    0x03: 'driving',
};

function readUInt32BE(buf: Buffer, offset: number): number | null {
    if (offset + 4 > buf.length) return null;
    return buf.readUInt32BE(offset);
}

function asciiSlice(buf: Buffer, start: number, end: number): string {
    const sub = buf.subarray(start, Math.min(end, buf.length));
    let out = '';
    for (const b of sub) {
        if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
        else if (b === 0x00) break;
    }
    return out.trim();
}

function looksLikeVin(s: string): boolean {
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(s);
}

/**
 * Parse a .DDD / .ESM buffer best-effort.
 * Never throws — returns whatever could be recovered, with warnings.
 */
export function parseDddBuffer(buf: Buffer): DddParseResult {
    const result: DddParseResult = {
        driverCardNumber: null,
        vehicleVin: null,
        periodFrom: null,
        periodTo: null,
        activities: [],
        warnings: [],
    };

    if (buf.length < 32) {
        result.warnings.push('Файл слишком короткий — не похоже на .DDD');
        return result;
    }

    // ---- Header probe (first 512 bytes) ----
    // Annex 1C uses 2-byte tags; the driver-data block starts with
    // tag 0x0501 (card identification). We scan the first 512 bytes
    // for the magic so files with vendor-specific prefixes still parse.
    const head = buf.subarray(0, Math.min(512, buf.length));
    let cardOffset = -1;
    for (let i = 0; i < head.length - 1; i++) {
        if (head[i] === 0x05 && head[i + 1] === 0x01) {
            cardOffset = i;
            break;
        }
    }

    if (cardOffset >= 0) {
        // Card number = next 16 ASCII bytes after a 2-byte length field.
        // TODO(real-ddd): actual layout is Annex 1C §2.61 — fixed-width
        //   string with country/issuer prefix; current heuristic catches
        //   common vendor exports.
        result.driverCardNumber = asciiSlice(buf, cardOffset + 4, cardOffset + 4 + 16) || null;
    } else {
        result.warnings.push('Не найдена идентификация карты водителя (tag 0x0501)');
    }

    // ---- VIN scan ----
    // VIN is fixed 17-char ASCII alphanumeric — easy to recognise.
    for (let i = 0; i < buf.length - 17; i++) {
        const slice = asciiSlice(buf, i, i + 17);
        if (slice.length === 17 && looksLikeVin(slice)) {
            result.vehicleVin = slice;
            break;
        }
    }

    // ---- Activity records ----
    // Annex 1C §2.1 — each record is 4 bytes timestamp (seconds since
    // 1970-01-01 UTC, big-endian) + 1 byte activity type. We scan for
    // ascending timestamp runs as an additional filter to skip random
    // bytes that happen to look like records.
    const activities: TachoActivity[] = [];
    const minTs = Math.floor(Date.UTC(2000, 0, 1) / 1000);
    const maxTs = Math.floor(Date.UTC(2100, 0, 1) / 1000);

    let prevTs = 0;
    let runStart = -1;
    for (let i = 0; i + 5 <= buf.length; i++) {
        const ts = readUInt32BE(buf, i);
        if (ts === null || ts < minTs || ts > maxTs) {
            if (runStart >= 0 && i - runStart >= 25) {
                // commit run
                extractActivityRun(buf, runStart, i, activities);
            }
            runStart = -1;
            prevTs = 0;
            continue;
        }
        if (runStart < 0) {
            runStart = i;
            prevTs = ts;
            i += 4; // jump to next 5-byte record start
            continue;
        }
        if (ts < prevTs || ts - prevTs > 86400 * 30) {
            // gap too large — break run
            if (i - runStart >= 25) extractActivityRun(buf, runStart, i, activities);
            runStart = -1;
            prevTs = 0;
            continue;
        }
        prevTs = ts;
        i += 4;
    }
    if (runStart >= 0 && buf.length - runStart >= 25) {
        extractActivityRun(buf, runStart, buf.length, activities);
    }

    // Aggregate runs into segments — collapse adjacent records of same
    // activity type into one segment.
    const aggregated: TachoActivity[] = [];
    for (const a of activities) {
        const prev = aggregated[aggregated.length - 1];
        if (prev && prev.type === a.type && a.startedAt.getTime() - prev.endedAt.getTime() <= 60_000) {
            prev.endedAt = a.endedAt;
            prev.duration = Math.round((prev.endedAt.getTime() - prev.startedAt.getTime()) / 1000);
        } else {
            aggregated.push({ ...a });
        }
    }

    result.activities = aggregated;
    if (aggregated.length === 0) {
        result.warnings.push('Активность не распознана (формат может быть зашифрован СКЗИ)');
    } else {
        result.periodFrom = aggregated[0]!.startedAt;
        result.periodTo = aggregated[aggregated.length - 1]!.endedAt;
    }

    return result;
}

function extractActivityRun(
    buf: Buffer,
    start: number,
    end: number,
    out: TachoActivity[],
): void {
    let prev: { ts: number; type: TachoActivityType } | null = null;
    for (let i = start; i + 5 <= end; i += 5) {
        const ts = buf.readUInt32BE(i);
        const code = buf.readUInt8(i + 4);
        const type = ACTIVITY_MAP[code] ?? 'unknown';
        if (prev) {
            const startedAt = new Date(prev.ts * 1000);
            const endedAt = new Date(ts * 1000);
            const duration = ts - prev.ts;
            if (duration > 0 && duration < 86400 * 7) {
                out.push({ type: prev.type, startedAt, endedAt, duration });
            }
        }
        prev = { ts, type };
    }
}

/**
 * Aggregate parsed activities to per-day driving / rest minutes for
 * insertion into `tachograph_records`. Days are UTC-aligned (matches
 * how existing records are stored).
 */
export function aggregateToDailyRecords(parsed: DddParseResult): Array<{
    date: Date;
    drivingMinutes: number;
    restMinutes: number;
    continuousDrivingMinutes: number;
}> {
    const buckets = new Map<string, { driving: number; rest: number; continuousDriving: number }>();
    let runningContinuous = 0;
    for (const a of parsed.activities) {
        const day = new Date(Date.UTC(
            a.startedAt.getUTCFullYear(),
            a.startedAt.getUTCMonth(),
            a.startedAt.getUTCDate(),
        ));
        const key = day.toISOString();
        const entry = buckets.get(key) ?? { driving: 0, rest: 0, continuousDriving: 0 };
        const minutes = Math.round(a.duration / 60);
        if (a.type === 'driving') {
            entry.driving += minutes;
            runningContinuous += minutes;
            entry.continuousDriving = Math.max(entry.continuousDriving, runningContinuous);
        } else if (a.type === 'rest') {
            entry.rest += minutes;
            // EU rule: 45+ minutes resets the continuous-driving counter.
            if (minutes >= 45) runningContinuous = 0;
        }
        buckets.set(key, entry);
    }
    return Array.from(buckets.entries()).map(([key, v]) => ({
        date: new Date(key),
        drivingMinutes: v.driving,
        restMinutes: v.rest,
        continuousDrivingMinutes: v.continuousDriving,
    }));
}
