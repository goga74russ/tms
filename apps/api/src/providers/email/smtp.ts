// ============================================================
// SMTP email provider via nodemailer. Works today when SMTP_HOST env
// is set (Mail.ru free tier: smtp.mail.ru:465 SSL).
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type { EmailCredentials, EmailMessage, EmailProvider } from './interface.js';

type Transporter = {
    sendMail(opts: {
        from?: string;
        to: string | string[];
        subject: string;
        html: string;
        text?: string;
        replyTo?: string;
    }): Promise<unknown>;
    verify?(): Promise<true>;
};

let cachedTransporter: Transporter | null = null;
let cachedCreds: EmailCredentials | null = null;

async function getTransporter(creds: EmailCredentials): Promise<Transporter> {
    if (cachedTransporter && cachedCreds &&
        cachedCreds.host === creds.host &&
        cachedCreds.port === creds.port &&
        cachedCreds.user === creds.user) {
        return cachedTransporter;
    }
    // Lazy import — nodemailer is optional dep until SMTP_HOST is configured.
    const mod: unknown = await import('nodemailer');
    const ns = mod as { default?: { createTransport: (opts: unknown) => Transporter }; createTransport?: (opts: unknown) => Transporter };
    const createTransport = ns.default?.createTransport ?? ns.createTransport;
    if (typeof createTransport !== 'function') {
        throw new Error('nodemailer.createTransport not found');
    }

    const port = creds.port ?? 465;
    const transporter = createTransport({
        host: creds.host,
        port,
        secure: port === 465,
        auth: creds.user ? { user: creds.user, pass: creds.password ?? '' } : undefined,
    });

    cachedTransporter = transporter;
    cachedCreds = creds;
    return transporter;
}

function readEnvCreds(): EmailCredentials {
    return {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT ? Number.parseInt(process.env.SMTP_PORT, 10) : undefined,
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
        fromAddress: process.env.SMTP_FROM,
    };
}

export class SmtpEmailProvider implements EmailProvider {
    readonly name = 'mailru_smtp';
    readonly providerType = 'email' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: EmailCredentials = readEnvCreds()) { }

    async healthCheck(): Promise<ProviderHealth> {
        if (!this.creds.host) {
            return { ok: false, mode: 'production', detail: 'SMTP_HOST not set', checkedAt: nowIso() };
        }
        try {
            const tr = await getTransporter(this.creds);
            if (typeof tr.verify === 'function') await tr.verify();
            return { ok: true, mode: 'production', detail: `SMTP ${this.creds.host}:${this.creds.port ?? 465}`, checkedAt: nowIso() };
        } catch (err) {
            return { ok: false, mode: 'production', detail: (err as Error).message, checkedAt: nowIso() };
        }
    }

    async execute(input: EmailMessage): Promise<void> {
        return this.send(input.to, input.subject, input.html, input.text);
    }

    async send(to: string | string[], subject: string, html: string, text?: string): Promise<void> {
        if (!this.creds.host) throw new Error('SMTP_HOST not configured.');
        const tr = await getTransporter(this.creds);
        await tr.sendMail({
            from: this.creds.fromAddress ?? this.creds.user,
            to,
            subject,
            html,
            text,
        });
    }
}
