// ============================================================
// Diadoc (Контур) EDI provider — реальная интеграция с ГИС ЭПД.
// Docs: developer.kontur.ru/Docs/diadoc-api  ·  host: diadoc-api.kontur.ru
// Design + флоу: apps/api/docs/etrn/DIADOC-INTEGRATION.md
//
// Аутентификация — классическая схема Диадока под выданный API-ключ:
//   1) POST V3/Authenticate?type=password
//        Authorization: DiadocAuth ddauth_api_client_id=<ключ>
//        body { login, password }   → токен (долгоживущий, тело = токен)
//   2) каждый вызов:
//        Authorization: DiadocAuth ddauth_api_client_id=<ключ>, ddauth_token=<токен>
//   (если в кредах уже лежит готовый authToken — шаг 1 пропускается.)
//
// ⚠️ Боевая отправка титула в ГИС ЭПД требует КЭП-подписи
// (SignedContent.Signature, detached PKCS#7/CAdES). Пока signer не
// сконфигурирован — sendDocument честно бросает ошибку, НЕ фейковый success.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    EdiCallbackEvent, EdiExternalStatus, EdiProvider, EdiSendInput, EdiSendResult,
} from './interface.js';
import { assertValidETrNPayload } from '../../lib/xsd-validator-gate.js';
import { httpFetch } from '../_http.js';

export const DIADOC_API_URL = 'https://diadoc-api.kontur.ru';

export interface DiadocCredentials {
    /** ddauth_api_client_id — API-ключ из кабинета Контур.Интегратор. */
    apiClientId: string;
    /** Идентификатор ящика нашей организации в Диадоке. */
    boxId: string;
    /** Готовый долгоживущий токен (из Authenticate). Если есть — login/password не нужны. */
    authToken?: string;
    /** Логин/пароль для Authenticate, если authToken не задан. */
    login?: string;
    password?: string;
    /** Override базового URL (например Staging-хост). По умолчанию production. */
    baseUrl?: string;
}

/**
 * Сейм для КЭП-подписи. Реализация (КриптоПро / Контур.Плагин / серверная
 * подпись) внедряется отдельно — у нас её пока нет. Возвращает detached
 * PKCS#7 (CAdES-BES) в base64 для переданного содержимого.
 */
export interface DiadocSigner {
    signDetached(contentUtf8: string): Promise<string>;
}

/** Тип формализованного документа Диадока + функция + версия для PostMessage. */
interface DiadocDocType {
    typeNamedId: string;
    function: string;
    version: string;
}

/** ЭТрН: единый тип/версия для всех титулов (см. DIADOC-INTEGRATION.md). */
const ETRN_DOC_TYPE: DiadocDocType = {
    typeNamedId: 'LogisticsWaybill',
    function: 'reception',
    version: 'kl_trn_mt_05_01',
};

export class DiadocEdiProvider implements EdiProvider {
    readonly name = 'diadoc';
    readonly providerType = 'edi' as const;
    readonly mode = 'production' as const;

    private readonly baseUrl: string;
    /** Токен кэшируется в памяти процесса; перезапрашивается при 401. */
    private token: string | null;

    constructor(
        private readonly creds: DiadocCredentials,
        /** Внедряется отдельно, когда появится КЭП. Без него отправка невозможна. */
        private readonly signer?: DiadocSigner,
    ) {
        this.baseUrl = (creds.baseUrl ?? DIADOC_API_URL).replace(/\/+$/, '');
        this.token = creds.authToken ?? null;
    }

    // ---------- Аутентификация ----------

    private authHeader(withToken: boolean): string {
        const parts = [`ddauth_api_client_id=${this.creds.apiClientId}`];
        if (withToken && this.token) parts.push(`ddauth_token=${this.token}`);
        return `DiadocAuth ${parts.join(', ')}`;
    }

    /** Получить (и закэшировать) токен. Идемпотентно. */
    private async ensureToken(): Promise<string> {
        if (this.token) return this.token;
        if (!this.creds.login || !this.creds.password) {
            throw new Error(
                'Diadoc: нет authToken и не заданы login/password для Authenticate. ' +
                'Заполните креды через /admin/integrations.',
            );
        }
        const res = await httpFetch(
            `${this.baseUrl}/V3/Authenticate?type=password`,
            {
                method: 'POST',
                headers: {
                    'Authorization': this.authHeader(false),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ login: this.creds.login, password: this.creds.password }),
            },
            { timeoutMs: 20000, retries: 1 },
        );
        if (!res.ok) {
            throw new Error(`Diadoc Authenticate failed: HTTP ${res.status}`);
        }
        // Тело ответа = сам токен (plain text).
        const token = (await res.text()).trim();
        if (!token) throw new Error('Diadoc Authenticate: пустой токен в ответе');
        this.token = token;
        return token;
    }

    /** Авторизованный запрос к API. Один ретрай при 401 (протух токен). */
    private async api(
        method: string,
        path: string,
        init: RequestInit = {},
        opts: { contentType?: string } = {},
    ): Promise<Response> {
        await this.ensureToken();
        const doFetch = (): Promise<Response> => httpFetch(
            `${this.baseUrl}${path}`,
            {
                ...init,
                method,
                headers: {
                    'Authorization': this.authHeader(true),
                    ...(opts.contentType ? { 'Content-Type': opts.contentType } : {}),
                    ...(init.headers as Record<string, string> | undefined),
                },
            },
            { timeoutMs: 20000, retries: 2 },
        );
        let res = await doFetch();
        if (res.status === 401) {
            // Сбросить токен и попробовать переаутентифицироваться один раз.
            this.token = this.creds.authToken ?? null;
            if (!this.token) {
                await this.ensureToken();
                res = await doFetch();
            }
        }
        return res;
    }

    async healthCheck(): Promise<ProviderHealth> {
        // GetMyOrganizations — лёгкий аутентифицированный пинг. Проверяемо
        // тестовым ключом уже сейчас (до КЭП и боевой отправки).
        try {
            const res = await this.api('GET', '/GetMyOrganizations');
            const ok = res.ok;
            return {
                ok,
                mode: 'production',
                detail: ok
                    ? `diadoc reachable (box ${this.creds.boxId})`
                    : `diadoc GetMyOrganizations HTTP ${res.status}`,
                checkedAt: nowIso(),
            };
        } catch (err) {
            return {
                ok: false,
                mode: 'production',
                detail: `diadoc unreachable: ${err instanceof Error ? err.message : String(err)}`,
                checkedAt: nowIso(),
            };
        }
    }

    async execute(input: EdiSendInput): Promise<EdiSendResult> {
        return this.sendDocument(input.organizationId, input.documentId, input.payload, input.counterpartyInn);
    }

    // ---------- Резолв ящика контрагента ----------

    /** ИНН контрагента → BoxId его ящика в Диадоке. */
    private async resolveBoxId(inn: string): Promise<string> {
        const res = await this.api('GET', `/GetOrganizationByInnKpp?inn=${encodeURIComponent(inn)}`);
        if (!res.ok) {
            throw new Error(`Diadoc GetOrganizationByInnKpp(${inn}) failed: HTTP ${res.status}`);
        }
        const org = await res.json() as {
            Organizations?: Array<{ Boxes?: Array<{ BoxId?: string }> }>;
            Boxes?: Array<{ BoxId?: string }>;
        };
        const boxes = org.Organizations?.[0]?.Boxes ?? org.Boxes ?? [];
        const boxId = boxes.find(b => b.BoxId)?.BoxId;
        if (!boxId) {
            throw new Error(`Diadoc: у контрагента ИНН ${inn} нет активного ящика (не подключён к ЭДО)`);
        }
        return boxId;
    }

    // ---------- Отправка ----------

    async sendDocument(
        _orgId: string,
        _documentId: string,
        payload: string,
        counterpartyInn?: string,
    ): Promise<EdiSendResult> {
        // Defense-in-depth: структурная XSD-проверка ЭТрН-XML до отправки.
        // No-op для не-XML payload.
        assertValidETrNPayload(payload);

        if (!counterpartyInn) {
            throw new Error('Diadoc sendDocument: не передан ИНН контрагента — некуда отправлять');
        }
        const toBoxId = await this.resolveBoxId(counterpartyInn);

        // Боевая отправка в ГИС ЭПД невозможна без КЭП-подписи. Честно
        // блокируем, пока signer не внедрён (см. DIADOC-INTEGRATION.md §блокеры).
        if (!this.signer) {
            throw new Error(
                'Diadoc sendDocument: КЭП-подпись не сконфигурирована (signer отсутствует). ' +
                'Титул нельзя отправить в ГИС ЭПД без квалифицированной подписи. ' +
                `Резолв выполнен: FromBox=${this.creds.boxId} → ToBox=${toBoxId}.`,
            );
        }

        // Payload приходит как base64(XML) или raw XML — приводим к base64 и
        // одновременно достаём UTF-8 для подписи.
        const { base64, utf8 } = normalizePayload(payload);
        const signature = await this.signer.signDetached(utf8);

        const res = await this.api(
            'POST',
            '/V3/PostMessage',
            {
                body: JSON.stringify({
                    FromBoxId: this.creds.boxId,
                    ToBoxId: toBoxId,
                    DocumentAttachments: [{
                        SignedContent: { Content: base64, Signature: signature },
                        TypeNamedId: ETRN_DOC_TYPE.typeNamedId,
                        Function: ETRN_DOC_TYPE.function,
                        Version: ETRN_DOC_TYPE.version,
                    }],
                }),
            },
            { contentType: 'application/json' },
        );
        if (!res.ok) {
            throw new Error(`Diadoc PostMessage failed: HTTP ${res.status} ${await safeText(res)}`);
        }
        const data = await res.json() as { MessageId?: string; Entities?: Array<{ EntityId?: string }> };
        const externalId = data.MessageId ?? data.Entities?.[0]?.EntityId ?? '';
        if (!externalId) throw new Error('Diadoc PostMessage: пустой MessageId в ответе');
        return { externalId, status: 'sent' };
    }

    async getStatus(externalId: string): Promise<EdiExternalStatus> {
        // Документооборот по messageId. Маппинг статусов сверяется на Staging —
        // best-effort: ищем признаки подписи/отказа в событиях сообщения.
        const res = await this.api(
            'GET',
            `/V3/GetMessage?boxId=${encodeURIComponent(this.creds.boxId)}&messageId=${encodeURIComponent(externalId)}`,
        );
        if (!res.ok) {
            throw new Error(`Diadoc GetMessage(${externalId}) failed: HTTP ${res.status}`);
        }
        const msg = await res.json() as {
            Entities?: Array<{ DocumentInfo?: { DocflowStatus?: { Status?: string } } }>;
        };
        const statuses = (msg.Entities ?? [])
            .map(e => e.DocumentInfo?.DocflowStatus?.Status)
            .filter(Boolean) as string[];
        return mapDiadocStatus(statuses);
    }

    async handleCallback(payload: Record<string, unknown>): Promise<EdiCallbackEvent> {
        // Диадок шлёт webhook-события на push-URL, настроенный в кабинете.
        const externalId = String(payload.messageId ?? payload.MessageId ?? '');
        const eventType = String(payload.eventType ?? payload.EventType ?? '');
        const status: EdiExternalStatus =
            /sign/i.test(eventType) ? 'signed_by_client' :
            /reject/i.test(eventType) ? 'rejected' :
            /receive|deliver/i.test(eventType) ? 'delivered' : 'sent';
        return { externalId, status, occurredAt: nowIso(), payload };
    }
}

// ---------- helpers ----------

/** Привести payload (base64 или raw XML) к { base64, utf8 }. */
function normalizePayload(payload: string): { base64: string; utf8: string } {
    const trimmed = payload.trimStart();
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
        return { utf8: payload, base64: Buffer.from(payload, 'utf8').toString('base64') };
    }
    // Похоже на base64 — декодируем для подписи, оставляем исходный base64.
    const utf8 = Buffer.from(payload, 'base64').toString('utf8');
    return { base64: payload, utf8 };
}

/** Маппинг статусов документооборота Диадока → наш EdiExternalStatus. */
function mapDiadocStatus(statuses: string[]): EdiExternalStatus {
    const joined = statuses.join(' ').toLowerCase();
    if (/reject/.test(joined)) return 'rejected';
    if (/signed.*recipient|recipientsigned|подписан/.test(joined)) return 'signed_by_client';
    if (/delivered|received|доставлен/.test(joined)) return 'delivered';
    return 'sent';
}

async function safeText(res: Response): Promise<string> {
    try {
        return (await res.text()).slice(0, 500);
    } catch {
        return '';
    }
}
