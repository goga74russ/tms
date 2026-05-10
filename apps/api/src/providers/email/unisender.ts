// ============================================================
// Unisender — REAL skeleton.
// Docs: https://www.unisender.com/ru/support/api/
// Auth: api_key query param.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type { EmailCredentials, EmailMessage, EmailProvider } from './interface.js';

export const UNISENDER_API_URL = 'https://api.unisender.com/ru/api';

export interface UnisenderCredentials extends EmailCredentials {
    apiKey: string;
    /** Sender email registered in Unisender. */
    fromAddress: string;
    /** Sender display name. */
    fromName?: string;
}

export class UnisenderEmailProvider implements EmailProvider {
    readonly name = 'unisender';
    readonly providerType = 'email' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: UnisenderCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.apiKey && this.creds.fromAddress),
            mode: 'production',
            detail: 'unisender credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(input: EmailMessage): Promise<void> {
        return this.send(input.to, input.subject, input.html, input.text);
    }

    async send(_to: string | string[], _subject: string, _html: string, _text?: string): Promise<void> {
        // POST {UNISENDER_API_URL}/sendEmail?format=json
        //   form-urlencoded:
        //     api_key=<apiKey>
        //     email=<recipient>            (single recipient per call)
        //     sender_name=<fromName>
        //     sender_email=<fromAddress>
        //     subject=<subject>
        //     body=<html>
        //     list_id=<list>               (required by Unisender)
        // Response: { result: { email_id: string } } or { error: ... }
        // For multiple recipients call once per address (Unisender requires
        // single recipient on sendEmail).
        // TODO(real-impl): wire fetch.
        throw new Error('Unisender send() not yet implemented — awaiting credentials.');
    }
}
