// ============================================================
// Unisender email provider — реализация (T-12 W2).
//
// API docs: https://www.unisender.com/ru/support/api/messages/sendemail/
//
// Особенности:
//   * Endpoint POST {UNISENDER_API_URL}/sendEmail?format=json
//   * Body: form-urlencoded (НЕ JSON — Unisender old-school)
//   * Auth: api_key как form-параметр (НЕ header)
//   * Recipient: только ОДИН email на вызов — для нескольких отправляем
//     несколько запросов. Unisender это документирует.
//   * list_id ОБЯЗАТЕЛЕН — Unisender требует чтобы получатель был в списке
//     контактов. Для transactional-кейса заводим единый список "Trans-
//     actional / TMS verification codes" и используем его id.
//   * Response: { result: { email_id, index } } на успехе, { error: { code,
//     message } } на ошибке. HTTP 200 даже на бизнес-ошибки — проверяем тело.
//
// Конфигурация через env (см. .env.example):
//   UNISENDER_API_KEY        — api_key
//   UNISENDER_FROM_EMAIL     — sender_email (must be verified в Unisender UI)
//   UNISENDER_FROM_NAME      — sender_name (опц.)
//   UNISENDER_LIST_ID        — числовой id списка контактов
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type { EmailCredentials, EmailMessage, EmailProvider } from './interface.js';

export const UNISENDER_API_URL = 'https://api.unisender.com/ru/api';

export interface UnisenderCredentials extends EmailCredentials {
    apiKey: string;
    /** Sender email registered in Unisender (must be verified). */
    fromAddress: string;
    /** Sender display name. */
    fromName?: string;
    /** Numeric list_id (required by Unisender). */
    listId: string;
    /** Optional override for the API base URL (used in tests). */
    apiUrl?: string;
}

/**
 * Shape of Unisender's sendEmail response. HTTP is always 200 even when
 * the API returns a business-level error.
 */
type UnisenderResponse =
    | { result: { email_id?: string; index?: number; }; }
    | { error: string; code?: string; warnings?: unknown[]; };

function readEnvCreds(): UnisenderCredentials | null {
    const apiKey = process.env.UNISENDER_API_KEY;
    const fromAddress = process.env.UNISENDER_FROM_EMAIL;
    const listId = process.env.UNISENDER_LIST_ID;
    if (!apiKey || !fromAddress || !listId) return null;
    return {
        apiKey,
        fromAddress,
        fromName: process.env.UNISENDER_FROM_NAME,
        listId,
    };
}

export class UnisenderEmailProvider implements EmailProvider {
    readonly name = 'unisender';
    readonly providerType = 'email' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: UnisenderCredentials) { }

    /**
     * Constructor helper: build a provider from environment if env vars are
     * set. Returns null when not configured, so callers can decide whether
     * to register it. Default registry checks env via this helper.
     */
    static fromEnv(): UnisenderEmailProvider | null {
        const c = readEnvCreds();
        return c ? new UnisenderEmailProvider(c) : null;
    }

    async healthCheck(): Promise<ProviderHealth> {
        const ok = Boolean(this.creds.apiKey && this.creds.fromAddress && this.creds.listId);
        return {
            ok,
            mode: 'production',
            detail: ok
                ? `unisender ready (from=${this.creds.fromAddress}, list=${this.creds.listId})`
                : 'unisender misconfigured — apiKey/fromAddress/listId missing',
            checkedAt: nowIso(),
        };
    }

    async execute(input: EmailMessage): Promise<void> {
        return this.send(input.to, input.subject, input.html, input.text);
    }

    /**
     * Sends one or more emails. Unisender's sendEmail accepts a single
     * recipient per call, so an array gets sent in parallel (we do
     * await Promise.all to surface the first failure).
     */
    async send(to: string | string[], subject: string, html: string, text?: string): Promise<void> {
        const recipients = Array.isArray(to) ? to : [to];
        if (recipients.length === 0) return;

        await Promise.all(recipients.map((addr) => this.sendOne(addr, subject, html, text)));
    }

    private async sendOne(recipient: string, subject: string, html: string, text?: string): Promise<void> {
        const baseUrl = this.creds.apiUrl ?? UNISENDER_API_URL;
        const url = `${baseUrl}/sendEmail?format=json`;

        // form-urlencoded body. URLSearchParams handles percent-encoding.
        const body = new URLSearchParams();
        body.set('api_key', this.creds.apiKey);
        body.set('email', recipient);
        body.set('sender_name', this.creds.fromName ?? 'ТрансПульт');
        body.set('sender_email', this.creds.fromAddress);
        body.set('subject', subject);
        body.set('body', html);
        body.set('list_id', this.creds.listId);
        // lang=ru tells Unisender to localise its system messages
        // (bounce notifications, list-unsubscribe links).
        body.set('lang', 'ru');
        if (text) body.set('text_body', text);

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        if (!res.ok) {
            // Transport-level failure (5xx, network). Distinct from API-level
            // errors which Unisender returns with HTTP 200 + { error }.
            throw new Error(`Unisender HTTP ${res.status}: ${res.statusText}`);
        }

        let json: UnisenderResponse;
        try {
            json = await res.json() as UnisenderResponse;
        } catch (err) {
            throw new Error(`Unisender: invalid JSON response — ${(err as Error).message}`);
        }

        if ('error' in json) {
            const code = json.code ?? 'unknown';
            throw new Error(`Unisender API error [${code}]: ${json.error}`);
        }

        // Success: json.result.email_id is the delivery id. We don't store
        // it (signup flow doesn't need it), but logged callers can pull it
        // from a future trace span.
    }
}
