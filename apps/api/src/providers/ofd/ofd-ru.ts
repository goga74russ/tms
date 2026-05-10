// ============================================================
// OFD.ru (ООО "ОФД") — REAL skeleton.
// Docs: https://ofd.ru/razrabotchikam/
// Auth: login + password → bearer token, refreshed via /v2/Auth.
// ============================================================
import type {
    OfdCredentials, OfdFiscalizeInput, OfdProvider, OfdProviderHealth, OfdReceipt,
} from './interface.js';

export const OFD_RU_API = 'https://ofd.ru/api/integration/v2';

function nowIso(): string { return new Date().toISOString(); }

export class OfdRuProvider implements OfdProvider {
    readonly name = 'ofd_ru';
    readonly mode = 'production' as const;

    constructor(private readonly creds: OfdCredentials) { }

    async healthCheck(): Promise<OfdProviderHealth> {
        return {
            ok: Boolean(this.creds.login && this.creds.password),
            mode: 'production',
            detail: 'ofd.ru credentials present',
            checkedAt: nowIso(),
        };
    }

    async fiscalize(_input: OfdFiscalizeInput): Promise<OfdReceipt> {
        // 1) Auth: POST {OFD_RU_API}/Auth { Login, Password } → { AuthToken, ExpirationDateUtc }
        // 2) Submit cheque: POST {OFD_RU_API}/cheque
        //    Headers: AuthToken: <token>
        //    Body: { Inn, KktRegId, Type: 'Income', Items: [...], Payments: [...], Customer: {...} }
        // Response: { ChequeNumber, FnNumber, FiscalSign, ChequeUrl }
        // TODO(real-impl): wire fetch.
        throw new Error('OFD.ru fiscalize() not yet implemented — awaiting credentials.');
    }

    async getReceipt(_externalId: string): Promise<OfdReceipt | null> {
        // GET {OFD_RU_API}/cheque/{externalId}
        // TODO(real-impl).
        throw new Error('OFD.ru getReceipt() not yet implemented.');
    }
}
