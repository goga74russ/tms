// ============================================================
// Tachograph upload route — pure validators extracted so unit
// tests can exercise the guards without booting Fastify + DB.
// Keep these in sync with `routes.ts` (it imports from here).
// ============================================================

export const ALLOWED_TACHO_EXT = /\.(ddd|esm)$/i;
export const MAX_TACHO_BYTES = 15 * 1024 * 1024;

export type UploadGuard =
    | { ok: true }
    | { ok: false; status: 400 | 413 | 415 | 422; error: string };

/**
 * Pre-persist guards for `POST /compliance/tachograph/upload`.
 * Returns the first failure or `{ ok: true }` if accepted.
 *
 * NODE_ENV gating for unverified signature mirrors routes.ts:
 *   - production: reject with 422
 *   - other:      accept (caller is expected to log a warning)
 */
export function validateTachographUpload(args: {
    filename: string | null | undefined;
    sizeBytes: number;
    signatureValid: boolean;
    nodeEnv?: string;
}): UploadGuard {
    if (!args.filename || args.filename.length === 0) {
        return { ok: false, status: 400, error: 'Поле file обязательно' };
    }
    if (!ALLOWED_TACHO_EXT.test(args.filename)) {
        return {
            ok: false,
            status: 415,
            error: 'Поддерживаются только .DDD / .ESM файлы тахографа',
        };
    }
    if (args.sizeBytes > MAX_TACHO_BYTES) {
        return { ok: false, status: 413, error: 'Файл превышает 15 МБ' };
    }
    if (!args.signatureValid && args.nodeEnv === 'production') {
        return {
            ok: false,
            status: 422,
            error: 'Подпись файла тахографа не прошла проверку (СКЗИ)',
        };
    }
    return { ok: true };
}

/** Tachograph upload response shaping — pure projection. */
export interface IngestSummary {
    uploadId: string;
    driverId: string | null;
    recordsInserted: number;
    period: { from: string | null; to: string | null };
    totalDrivingHours: number;
    vehicleVin: string | null;
    driverCardNumber: string | null;
    warnings: string[];
}

export function summarizeIngestResult(args: {
    uploadId: string;
    driverId: string | null;
    recordsInserted: number;
    totalDrivingMinutes: number;
    periodFrom: Date | null;
    periodTo: Date | null;
    vehicleVin: string | null;
    driverCardNumber: string | null;
    warnings: string[];
}): IngestSummary {
    return {
        uploadId: args.uploadId,
        driverId: args.driverId,
        recordsInserted: args.recordsInserted,
        period: {
            from: args.periodFrom?.toISOString() ?? null,
            to: args.periodTo?.toISOString() ?? null,
        },
        totalDrivingHours: +(args.totalDrivingMinutes / 60).toFixed(2),
        vehicleVin: args.vehicleVin,
        driverCardNumber: args.driverCardNumber,
        warnings: args.warnings,
    };
}
