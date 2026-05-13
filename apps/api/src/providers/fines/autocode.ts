// ============================================================
// АвтоКод (avtocod.ru) fines/check — REAL skeleton.
// Docs: https://b2b-api.checkperson.ru/docs (запрос отчёта по госномеру/VIN).
// Auth: Bearer token; reports are async — we POST query, poll for ready.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    FineLookupResult, FinesCredentials, FinesProvider,
} from './interface.js';

export const AUTOCODE_API_URL = 'https://b2b-api.checkperson.ru/b2b/api/v1';

export interface AutocodeCredentials extends FinesCredentials {
    apiKey: string;
    /** Каталог отчёта/запроса в системе АвтоКод (выдаётся при покупке доступа). */
    reportType: string;
}

export class AutocodeFinesProvider implements FinesProvider {
    readonly name = 'autocode';
    readonly providerType = 'fines' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: AutocodeCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.apiKey && this.creds.reportType),
            mode: 'production',
            detail: 'autocode credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> { return { ok: true }; }

    async lookupByPlate(_creds: FinesCredentials, _plate: string, _vin?: string): Promise<FineLookupResult[]> {
        // POST {AUTOCODE_API_URL}/user/reports
        //   Headers: Authorization: Bearer <apiKey>
        //   Body: { queryType: 'GRZ', query: plate, reportTypeUid: reportType }
        // Response: { uid, state }; poll GET /user/reports/{uid} until state=='OK'.
        // Final report contains `content.fines: [{ number, date, koap, amount, discount, … }]`.
        // TODO(real-impl).
        throw new Error('Autocode lookupByPlate() not yet implemented — awaiting credentials.');
    }

    async lookupByDriverPassport(_creds: FinesCredentials, _passport: string): Promise<FineLookupResult[]> {
        // Autocode supports driver lookups via reportTypeUid='driver_passport'.
        // TODO(real-impl).
        throw new Error('Autocode lookupByDriverPassport() not yet implemented.');
    }
}
