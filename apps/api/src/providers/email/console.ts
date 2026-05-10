// ============================================================
// Console email provider — logs to stdout. Default for dev.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type { EmailMessage, EmailProvider } from './interface.js';

export class ConsoleEmailProvider implements EmailProvider {
    readonly name = 'console';
    readonly providerType = 'email' as const;
    readonly mode = 'mock' as const;

    async healthCheck(): Promise<ProviderHealth> {
        return { ok: true, mode: 'mock', detail: 'console email provider', checkedAt: nowIso() };
    }

    async execute(input: EmailMessage): Promise<void> {
        return this.send(input.to, input.subject, input.html, input.text);
    }

    async send(to: string | string[], subject: string, html: string, text?: string): Promise<void> {
        const recipients = Array.isArray(to) ? to.join(', ') : to;
        // eslint-disable-next-line no-console
        console.log(`[email:console] → ${recipients}\n  subject: ${subject}\n  text: ${text ?? html.replace(/<[^>]+>/g, '').slice(0, 200)}`);
    }
}

export const consoleEmailProvider = new ConsoleEmailProvider();
