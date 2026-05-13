// ============================================================
// Email provider interface — Console / SMTP / Unisender.
// ============================================================
import type { ProviderAdapter, ProviderType } from '../base.js';

export interface EmailMessage {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
    /** ReplyTo override. */
    replyTo?: string;
}

export interface EmailCredentials {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    apiKey?: string;
    fromAddress?: string;
}

export interface EmailProvider extends ProviderAdapter<EmailMessage, void> {
    readonly providerType: Extract<ProviderType, 'email'>;
    send(to: string | string[], subject: string, html: string, text?: string): Promise<void>;
}
