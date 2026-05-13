// ============================================================
// Smoke tests for the DDD parser. We don't have a real .DDD here
// so we craft a minimal buffer that hits the heuristics.
// ============================================================
import { describe, it, expect } from 'vitest';
import { parseDddBuffer, aggregateToDailyRecords } from './ddd-parser.js';

describe('parseDddBuffer', () => {
    it('returns empty result with warning on too-short input', () => {
        const r = parseDddBuffer(Buffer.from([1, 2, 3]));
        expect(r.activities).toHaveLength(0);
        expect(r.warnings.length).toBeGreaterThan(0);
    });

    it('extracts a VIN when present in the buffer', () => {
        // 17-char VIN bytes embedded in random data
        const vin = '1HGCM82633A004352';
        const padding = Buffer.alloc(50, 0xff);
        const buf = Buffer.concat([padding, Buffer.from(vin, 'ascii'), padding]);
        const r = parseDddBuffer(buf);
        expect(r.vehicleVin).toBe(vin);
    });

    it('parses a synthetic activity stream and aggregates daily', () => {
        // Build 30 records: alternate driving/rest, 60 sec apart.
        const records: number[] = [];
        let ts = Math.floor(Date.UTC(2025, 0, 1, 8, 0, 0) / 1000);
        for (let i = 0; i < 30; i++) {
            const buf = Buffer.alloc(5);
            buf.writeUInt32BE(ts, 0);
            buf.writeUInt8(i % 2 === 0 ? 0x03 : 0x00, 4); // driving / rest
            for (const b of buf) records.push(b);
            ts += 60;
        }
        // Pad with prefix that includes the card-id tag for completeness.
        const prefix = Buffer.from([0x05, 0x01, 0x00, 0x10, ...Buffer.from('RU0000001234567A', 'ascii')]);
        const buf = Buffer.concat([prefix, Buffer.from(records)]);
        const r = parseDddBuffer(buf);
        expect(r.driverCardNumber).toContain('RU0000001234567A');
        expect(r.activities.length).toBeGreaterThan(0);
        expect(r.periodFrom).toBeInstanceOf(Date);

        const daily = aggregateToDailyRecords(r);
        expect(daily.length).toBeGreaterThan(0);
        expect(daily[0]!.drivingMinutes + daily[0]!.restMinutes).toBeGreaterThan(0);
    });
});
