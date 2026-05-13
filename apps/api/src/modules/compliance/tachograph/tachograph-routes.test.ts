// ============================================================
// Tachograph route-layer guards. Parser already has its own
// test suite (ddd-parser.test.ts) — here we exercise the upload
// validation + ingest-result projection that route handlers use.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    validateTachographUpload,
    summarizeIngestResult,
    MAX_TACHO_BYTES,
} from './helpers.js';

describe('validateTachographUpload', () => {
    const baseOk = {
        filename: 'driver-card.ddd',
        sizeBytes: 1024,
        signatureValid: true,
        nodeEnv: 'development',
    };

    it('accepts a .DDD upload within size limit with valid signature', () => {
        expect(validateTachographUpload(baseOk)).toEqual({ ok: true });
    });

    it('accepts .ESM and is case-insensitive', () => {
        expect(validateTachographUpload({ ...baseOk, filename: 'card.ESM' })).toEqual({ ok: true });
        expect(validateTachographUpload({ ...baseOk, filename: 'card.Ddd' })).toEqual({ ok: true });
    });

    it('400 when filename is empty / missing', () => {
        expect(validateTachographUpload({ ...baseOk, filename: '' })).toMatchObject({
            ok: false, status: 400,
        });
        expect(validateTachographUpload({ ...baseOk, filename: null })).toMatchObject({
            ok: false, status: 400,
        });
    });

    it('415 for unsupported extension', () => {
        expect(validateTachographUpload({ ...baseOk, filename: 'card.pdf' }))
            .toMatchObject({ ok: false, status: 415 });
    });

    it('413 when file exceeds 15 MB cap', () => {
        const guard = validateTachographUpload({
            ...baseOk,
            sizeBytes: MAX_TACHO_BYTES + 1,
        });
        expect(guard).toMatchObject({ ok: false, status: 413 });
    });

    it('rejects unsigned files in production (422)', () => {
        const guard = validateTachographUpload({
            ...baseOk,
            signatureValid: false,
            nodeEnv: 'production',
        });
        expect(guard).toMatchObject({ ok: false, status: 422 });
    });

    it('accepts unsigned files outside production (dev / test)', () => {
        expect(validateTachographUpload({
            ...baseOk,
            signatureValid: false,
            nodeEnv: 'development',
        })).toEqual({ ok: true });
        expect(validateTachographUpload({
            ...baseOk,
            signatureValid: false,
            nodeEnv: 'test',
        })).toEqual({ ok: true });
    });
});

describe('summarizeIngestResult', () => {
    it('projects ingest fields and rounds driving hours to 2 decimals', () => {
        const out = summarizeIngestResult({
            uploadId: 'u-1',
            driverId: 'd-1',
            recordsInserted: 5,
            totalDrivingMinutes: 137, // 2.2833…
            periodFrom: new Date('2026-04-01T00:00:00Z'),
            periodTo: new Date('2026-04-05T23:59:59Z'),
            vehicleVin: 'VIN1234567890',
            driverCardNumber: 'CARD-1',
            warnings: ['w1'],
        });
        expect(out.totalDrivingHours).toBe(2.28);
        expect(out.period.from).toBe('2026-04-01T00:00:00.000Z');
        expect(out.period.to).toBe('2026-04-05T23:59:59.000Z');
        expect(out.driverId).toBe('d-1');
        expect(out.warnings).toEqual(['w1']);
    });

    it('emits null period bounds when parser found no dates', () => {
        const out = summarizeIngestResult({
            uploadId: 'u-2',
            driverId: null,
            recordsInserted: 0,
            totalDrivingMinutes: 0,
            periodFrom: null,
            periodTo: null,
            vehicleVin: null,
            driverCardNumber: null,
            warnings: [],
        });
        expect(out.period).toEqual({ from: null, to: null });
        expect(out.totalDrivingHours).toBe(0);
        expect(out.driverId).toBeNull();
    });
});
