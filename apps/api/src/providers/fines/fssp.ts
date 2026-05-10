// ============================================================
// ФССП — REAL skeleton (банк данных исполнительных производств).
// Public API: https://api-ip.fssp.gov.ru/api/v1.0/search/physical
// Most operators use api-cloud.ru paid mirror because the public
// endpoint is heavily rate-limited and returns CAPTCHA challenges.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    FineLookupResult, FinesCredentials, FinesProvider,
} from './interface.js';

export const FSSP_API_URL = 'https://api-cloud.ru/api/fssp.php';

export interface FsspCredentials extends FinesCredentials {
    apiKey: string;
    /** Регион для регионального ФССП (опционально, ускоряет поиск). */
    regionCode?: string;
}

export class FsspFinesProvider implements FinesProvider {
    readonly name = 'fssp';
    readonly providerType = 'fines' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: FsspCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.apiKey),
            mode: 'production',
            detail: 'fssp credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> { return { ok: true }; }

    async lookupByPlate(_creds: FinesCredentials, _plate: string): Promise<FineLookupResult[]> {
        // ФССП API не работает по гос-номеру — только по ФИО+ДР+регион/паспорту.
        // Возвращаем пусто и фиксируем NotImplemented для контракта.
        return [];
    }

    async lookupByDriverPassport(_creds: FinesCredentials, _passport: string): Promise<FineLookupResult[]> {
        // GET {FSSP_API_URL}?type=physical&token=<apiKey>&region=<regionCode>
        //   &firstname=...&lastname=...&secondname=...&birthdate=YYYY-MM-DD
        // Ответ (api-cloud): { task: string }; poll GET ?type=result&id=<task>&token=<apiKey>
        // → { records: [{ ip_number, ip_date, exe_production, subject, sum, ... }] }.
        // Для нас relevant rows — административные штрафы (КоАП).
        // TODO(real-impl): wire fetch + polling.
        throw new Error('FSSP lookupByDriverPassport() not yet implemented — awaiting credentials.');
    }
}
