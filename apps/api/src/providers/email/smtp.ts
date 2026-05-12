// ============================================================
// SMTP email provider via nodemailer. Works today when SMTP_HOST env
// is set (Mail.ru free tier: smtp.mail.ru:465 SSL).
// ============================================================
import crypto from 'node:crypto';
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

// A-P1-3: previously a single module-level `cachedTransporter` was reused for
// EVERY org. First org to send anything baked its host/port/auth into the
// process and all subsequent sends — across orgs — went through that exact
// transporter unless host+port+user changed. Replace with a small LRU keyed
// by the credentials shape so each org gets its own transporter.
const transporterCache = new Map<string, Transporter>();
const TRANSPORTER_CACHE_MAX = 20;

function credsCacheKey(creds: EmailCredentials): string {
    // Hash includes everything that influences the transporter — including
    // password — so a rotated password creates a fresh entry.
    const raw = JSON.stringify({
        host: creds.host ?? '',
        port: creds.port ?? 465,
        user: creds.user ?? '',
        password: creds.password ?? '',
    });
    return crypto.createHash('sha256').update(raw).digest('hex');
}

async function getTransporter(creds: EmailCredentials): Promise<Transporter> {
    const key = credsCacheKey(creds);
    const hit = transporterCache.get(key);
    if (hit) {
        // Touch for LRU semantics: re-insert so it counts as most-recent.
        transporterCache.delete(key);
        transporterCache.set(key, hit);
        return hit;
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

    transporterCache.set(key, transporter);
    // Evict oldest insertion when over capacity. Map iteration order is
    // insertion order, so the first key is the LRU after our touch above.
    if (transporterCache.size > TRANSPORTER_CACHE_MAX) {
        const oldest = transporterCache.keys().next().value;
        if (oldest !== undefined) transporterCache.delete(oldest);
    }
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
