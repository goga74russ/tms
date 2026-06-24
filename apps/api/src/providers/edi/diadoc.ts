// ============================================================
// Контур.Логистика EDI provider — ЭТрН/ЭПЛ → ГИС ЭПД.
// Spec: developer.kontur.ru/doc/logistics.api  ·  hosts: logist-api.kontur.ru
// Design + флоу: apps/api/docs/etrn/DIADOC-INTEGRATION.md
//
// ⚠️ Провайдер исторически зарегистрирован как `diadoc` (registry edi:diadoc,
// UI «Контур.Диадок»), но интегрируемся через ВЫСОКОУРОВНЕВЫЙ Контур.Логистика
// API — он покрывает ровно ЭТрН/ЭПЛ (генерация титулов, подпись, ГИС ЭПД,
// согласование с водителем ПЭП), а не сырой Diadoc message-protocol.
//
// Auth: заголовок `x-kontur-apikey: <ключ>` (схема auth.apikey) либо Bearer.
//
// ⚠️ Боевая отправка титула требует КЭП-подписи (детач PKCS#7/CAdES) —
// загружается multipart в /v1/documents/waybill. Пока signer не внедрён,
// sendDocument честно бросает ошибку, НЕ фейковый success.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    EdiCallbackEvent, EdiExternalStatus, EdiProvider, EdiSendInput, EdiSendResult,
} from './interface.js';
import { assertValidETrNPayload } from '../../lib/xsd-validator-gate.js';
import { httpFetch } from '../_http.js';

export const LOGIST_API_URL = 'https://logist-api.kontur.ru';
export const LOGIST_API_STAGING_URL = 'https://logist-api-staging.kontur.ru';
// Историческое имя — раньше адаптер бил в сырой Diadoc host. Оставлено как
// алиас, чтобы не ломать импорты; для Логистики не используется.
export const DIADOC_API_URL = LOGIST_API_URL;

export interface DiadocCredentials {
    /** Ключ для заголовка x-kontur-apikey (значение из формы кабинета интеграций). */
    apiKey?: string;
    /** Алиас apiKey (если форма прислала под другим именем). */
    apiClientId?: string;
    /** OIDC access_token — альтернатива apiKey (Authorization: Bearer). */
    authToken?: string;
    /** Идентификатор ящика нашей организации (нужен для части операций отправки). */
    boxId?: string;
    /** Override базового URL. Если не задан — staging?staging:prod. */
    baseUrl?: string;
    /** Использовать Staging-хост (logist-api-staging) вместо прод. */
    staging?: boolean;
}

/**
 * Сейм для КЭП-подписи. Реализация (КриптоПро / Контур.Плагин в браузере /
 * серверная подпись) внедряется отдельно — у нас её пока нет. Возвращает
 * detached PKCS#7 (CAdES-BES) в base64 для переданного содержимого.
 */
export interface DiadocSigner {
    signDetached(contentUtf8: string): Promise<string>;
}

export class DiadocEdiProvider implements EdiProvider {
    readonly name = 'diadoc';
    readonly providerType = 'edi' as const;
    readonly mode = 'production' as const;

    private readonly baseUrl: string;

    constructor(
        private readonly creds: DiadocCredentials,
        /** Внедряется отдельно, когда появится КЭП. Без него отправка невозможна. */
        private readonly signer?: DiadocSigner,
    ) {
        const fallback = creds.staging ? LOGIST_API_STAGING_URL : LOGIST_API_URL;
        this.baseUrl = (creds.baseUrl ?? fallback).replace(/\/+$/, '');
    }

    // ---------- Аутентификация ----------

    private get apiKey(): string | undefined {
        return this.creds.apiKey ?? this.creds.apiClientId;
    }

    private authHeaders(): Record<string, string> {
        // Приоритет — x-kontur-apikey (основная схема Логистики). Bearer как
        // альтернатива, если задан только OIDC-токен.
        if (this.apiKey) return { 'x-kontur-apikey': this.apiKey };
        if (this.creds.authToken) return { 'Authorization': `Bearer ${this.creds.authToken}` };
        throw new Error(
            'Контур.Логистика: не задан API-ключ (поле «API ключ»). ' +
            'Впишите ключ в /admin/integrations.',
        );
    }

    private async api(method: string, path: string, init: RequestInit = {}): Promise<Response> {
        return httpFetch(
            `${this.baseUrl}${path}`,
            {
                ...init,
                method,
                headers: {
                    ...this.authHeaders(),
                    ...(init.headers as Record<string, string> | undefined),
                },
            },
            { timeoutMs: 20000, retries: 2 },
        );
    }

    async healthCheck(): Promise<ProviderHealth> {
        // GET /v1/organizations/my — лёгкий аутентифицированный пинг.
        // Проверяемо ключом уже сейчас (до КЭП и боевой отправки).
        try {
            const res = await this.api('GET', '/v1/organizations/my');
            const ok = res.ok;
            return {
                ok,
                mode: 'production',
                detail: ok
                    ? `Контур.Логистика доступен (${this.baseUrl})`
                    : `Контур.Логистика /v1/organizations/my HTTP ${res.status} ${await safeText(res)}`,
                checkedAt: nowIso(),
            };
        } catch (err) {
            return {
                ok: false,
                mode: 'production',
                detail: `Контур.Логистика недоступен: ${err instanceof Error ? err.message : String(err)}`,
                checkedAt: nowIso(),
            };
        }
    }

    async execute(input: EdiSendInput): Promise<EdiSendResult> {
        return this.sendDocument(input.organizationId, input.documentId, input.payload, input.counterpartyInn);
    }

    async sendDocument(
        _orgId: string,
        _documentId: string,
        payload: string,
        _counterpartyInn?: string,
    ): Promise<EdiSendResult> {
        // Defense-in-depth: структурная XSD-проверка ЭТрН-XML до отправки.
        assertValidETrNPayload(payload);

        // Боевая отправка в ГИС ЭПД невозможна без КЭП-подписи. Честно
        // блокируем, пока signer не внедрён (см. DIADOC-INTEGRATION.md §блокеры).
        // Флоу Логистики: POST /v1/documents/transportation/generation/consignor-reception
        // (генерация Т1 из структурных данных) → подпись КЭП → POST /v1/documents/waybill
        // (multipart: подписанный файл) → driver-approve (ПЭП водителя).
        if (!this.signer) {
            throw new Error(
                'Контур.Логистика sendDocument: КЭП-подпись не сконфигурирована (signer отсутствует). ' +
                'Титул нельзя отправить в ГИС ЭПД без квалифицированной подписи.',
            );
        }
        throw new Error('Контур.Логистика sendDocument: отправка титулов ещё не реализована (этап после КЭП).');
    }

    async getStatus(externalId: string): Promise<EdiExternalStatus> {
        // GET /v1/transportations/{id}/full-docflow — статусы документооборота.
        const res = await this.api('GET', `/v1/transportations/${encodeURIComponent(externalId)}/full-docflow`);
        if (!res.ok) {
            throw new Error(`Контур.Логистика full-docflow(${externalId}) failed: HTTP ${res.status}`);
        }
        const data = await res.json() as { status?: string; documents?: Array<{ status?: string }> };
        const joined = [data.status, ...(data.documents ?? []).map(d => d.status)]
            .filter(Boolean).join(' ').toLowerCase();
        return mapLogistStatus(joined);
    }

    async handleCallback(payload: Record<string, unknown>): Promise<EdiCallbackEvent> {
        const externalId = String(payload.transportationId ?? payload.id ?? payload.messageId ?? '');
        const eventType = String(payload.eventType ?? payload.type ?? '');
        const status: EdiExternalStatus =
            /reject/i.test(eventType) ? 'rejected' :
            /signedbyrecipient|recipient/i.test(eventType) ? 'signed_by_client' :
            /signedbysender|sender/i.test(eventType) ? 'signed_by_carrier' :
            /receive|deliver/i.test(eventType) ? 'delivered' : 'sent';
        return { externalId, status, occurredAt: nowIso(), payload };
    }
}

// ---------- helpers ----------

function mapLogistStatus(joined: string): EdiExternalStatus {
    if (/reject/.test(joined)) return 'rejected';
    if (/recipientsigned|signedbyrecipient|подписанполуч/.test(joined)) return 'signed_by_client';
    if (/sendersigned|signedbysender|подписанотпр/.test(joined)) return 'signed_by_carrier';
    if (/delivered|received|доставлен/.test(joined)) return 'delivered';
    return 'sent';
}

async function safeText(res: Response): Promise<string> {
    try {
        return (await res.text()).slice(0, 300);
    } catch {
        return '';
    }
}
