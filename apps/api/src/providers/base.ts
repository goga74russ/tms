// ============================================================
// Round 1C — Provider adapter framework: base interfaces + helpers
// ============================================================
// Every external integration (signature, EDI, telematics, fuel-card,
// fines, marking, payment, email) implements ProviderAdapter. The
// runtime picks a concrete adapter for an org via selectAdapter():
// active credentials → real adapter, else fall back to mock.
//
// Credentials live in `provider_credentials` table, encrypted with
// AES-256-GCM. Only loadCredentials() / saveCredentials() touch raw
// JSON — adapters consume the decrypted object.
// ============================================================

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { providerCredentials } from '../db/schema.js';

export type ProviderType =
    | 'signature'
    | 'edi'
    | 'telematics'
    | 'fuel_card'
    | 'fines'
    | 'marking'
    | 'payment'
    | 'email';

export type ProviderMode = 'mock' | 'sandbox' | 'production';
export type ProviderStatus = 'mock' | 'sandbox' | 'active' | 'disabled' | 'error';

export interface ProviderHealth {
    ok: boolean;
    mode: ProviderMode;
    detail?: string;
    checkedAt: string;
}

/**
 * Generic adapter contract. Concrete provider domains (SignatureProvider,
 * EdiProvider, …) extend this with their own input/output types.
 */
export interface ProviderAdapter<TInput = unknown, TOutput = unknown> {
    readonly name: string;
    readonly providerType: ProviderType;
    readonly mode: ProviderMode;
    healthCheck(): Promise<ProviderHealth>;
    execute(input: TInput): Promise<TOutput>;
}

// ---------- Credential encryption (AES-256-GCM) ----------

const KEY_ENV = 'CREDENTIALS_KEY';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // GCM standard
const TAG_LEN = 16;

function getKey(): Buffer {
    const raw = process.env[KEY_ENV];
    if (!raw) {
        // A-P0-2: fail-fast in production. Previously this silently fell back
        // to sha256("tms-dev-credentials-key") — a publicly known key — which
        // means ALL encrypted provider credentials (signature, EDI, telematics,
        // payment, SMTP) were decryptable by anyone with DB access plus public
        // source code. That deterministic fallback is REMOVED entirely.
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                `${KEY_ENV} environment variable is required in production. ` +
                `Generate with: openssl rand -hex 32`,
            );
        }
        // Dev/test: emit a loud warning and use a deterministic-but-clearly-marked
        // dev key so test runs work. Still must never be used in prod.
        // eslint-disable-next-line no-console
        console.warn(
            `[providers/base] ${KEY_ENV} not set — using DEV-ONLY key. ` +
            `Set this env var before any production deploy.`,
        );
        return crypto.createHash('sha256').update('tms-dev-credentials-key-DO-NOT-USE-IN-PROD').digest();
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    try {
        const buf = Buffer.from(raw, 'base64');
        if (buf.length === 32) return buf;
    } catch {
        // fall through
    }
    // Refuse weak keys: a short or non-32-byte value is almost certainly a
    // typo. Hashing it would silently "work" but defeat the purpose of the
    // env var.
    throw new Error(
        `${KEY_ENV} must be 32 bytes (64 hex chars or 44 base64 chars). ` +
        `Got ${raw.length} chars. Generate with: openssl rand -hex 32`,
    );
}

export function encryptCredentials(plain: Record<string, unknown>): string {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const json = JSON.stringify(plain);
    const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // packed: base64( iv | tag | ciphertext )
    return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptCredentials(packed: string): Record<string, unknown> {
    const buf = Buffer.from(packed, 'base64');
    if (buf.length < IV_LEN + TAG_LEN) throw new Error('Invalid credentials blob');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as Record<string, unknown>;
}

// ---------- Credential loader ----------

export interface LoadedCredential {
    id: string;
    providerType: ProviderType;
    providerName: string;
    status: ProviderStatus;
    credentials: Record<string, unknown> | null;
}

export async function loadCredentials(
    organizationId: string,
    providerType: ProviderType,
    providerName?: string,
): Promise<LoadedCredential | null> {
    const where = providerName
        ? and(
            eq(providerCredentials.organizationId, organizationId),
            eq(providerCredentials.providerType, providerType),
            eq(providerCredentials.providerName, providerName),
        )
        : and(
            eq(providerCredentials.organizationId, organizationId),
            eq(providerCredentials.providerType, providerType),
        );

    const rows = await db
        .select()
        .from(providerCredentials)
        .where(where)
        .limit(1);

    const row = rows[0];
    if (!row) return null;

    let creds: Record<string, unknown> | null = null;
    if (row.encryptedCredentials) {
        try {
            creds = decryptCredentials(row.encryptedCredentials);
        } catch {
            creds = null;
        }
    }
    return {
        id: row.id,
        providerType: row.providerType as ProviderType,
        providerName: row.providerName,
        status: row.status as ProviderStatus,
        credentials: creds,
    };
}

/**
 * Pick the right adapter for an organization given a list of registered
 * adapters of the same provider type. Strategy:
 *   1) Look up the active provider name in `provider_credentials`.
 *   2) If found and an adapter matches, return it.
 *   3) Otherwise fall back to the first 'mock' adapter (always present).
 */
export async function selectAdapter<T extends ProviderAdapter>(
    adapters: T[],
    organizationId: string,
    providerType: ProviderType,
): Promise<T> {
    if (adapters.length === 0) {
        throw new Error(`No adapters registered for ${providerType}`);
    }

    const loaded = await loadCredentials(organizationId, providerType);
    if (loaded && loaded.status === 'active') {
        const match = adapters.find(a => a.name === loaded.providerName);
        if (match) return match;
    }

    const mockAdapter = adapters.find(a => a.mode === 'mock');
    if (mockAdapter) return mockAdapter;

    return adapters[0]!;
}

/**
 * Adapter registry helper — pick a specific adapter by name from a list.
 * Used by credential-test endpoint where the user picks the provider.
 */
export function findAdapterByName<T extends ProviderAdapter>(
    adapters: T[],
    name: string,
): T | undefined {
    return adapters.find(a => a.name === name);
}

export function nowIso(): string {
    return new Date().toISOString();
}
