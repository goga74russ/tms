// ============================================================
// ГИБДД — REAL skeleton.
// Прямого публичного API нет; самый стабильный путь — через ГИС ГМП
// или через посредников (api-cloud.ru, gibdd.ru/check/auto через
// captcha-relay). Здесь конфигурируем endpoint и контракт ответа.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    FineLookupResult, FinesCredentials, FinesProvider,
} from './interface.js';

export const GIBDD_API_URL = 'https://api-cloud.ru/api/gibdd.php';

export interface GibddCredentials extends FinesCredentials {
    apiKey: string;
}

export class GibddFinesProvider implements FinesProvider {
    readonly name = 'gibdd';
    readonly providerType = 'fines' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: GibddCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.apiKey),
            mode: 'production',
            detail: 'gibdd credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> { return { ok: true }; }

    async lookupByPlate(_creds: FinesCredentials, _plate: string, _vin?: string): Promise<FineLookupResult[]> {
        // GET {GIBDD_API_URL}?type=fines&grz=<plate>&sts=<sts>&token=<apiKey>
        // Response (api-cloud): { task: string }; poll for { result: [{
        //   number, date, koap_text, amount, discount_until, due_date }] }.
        // TODO(real-impl).
        throw new Error('GIBDD lookupByPlate() not yet implemented — awaiting credentials.');
    }

    async lookupByDriverPassport(_creds: FinesCredentials, _passport: string): Promise<FineLookupResult[]> {
        // ГИБДД lookups by passport are not public — proxies require ВУ номер.
        return [];
    }
}
