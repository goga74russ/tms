// ============================================================
// Provider framework — public registry + real adapter factories.
// ============================================================
// A-P0-4: Previously this registry only contained MOCK adapters.
// Even after saving real API keys via /admin/integrations, selectAdapter()
// would always fall back to mock because the lookup matches by adapter
// `name` and no real-named adapter was ever in the list.
//
// Fix: a `realAdapterFactories` map keyed by `${type}:${name}` that takes
// decrypted credentials and returns a fresh adapter instance. selectAdapter
// looks up the factory when credentials.status === 'active', instantiates
// the adapter (cached per (orgId, type, name)), and uses it.
//
// The mock fallback remains for tenants without configured credentials.
// ============================================================

import { mockSignatureProvider } from './signature/mock.js';
import { GosklyuchSignatureProvider } from './signature/gosklyuch.js';
import { mockEdiProvider } from './edi/mock.js';
import { DiadocEdiProvider } from './edi/diadoc.js';
import { mockTelematicsProvider } from './telematics/mock.js';
import { WialonTelematicsProvider } from './telematics/wialon.js';
import { OmnicommTelematicsProvider } from './telematics/omnicomm.js';
import { GlonasssoftTelematicsProvider } from './telematics/glonasssoft.js';
import { mockFuelCardProvider } from './fuel-card/mock.js';
import { mockFinesProvider } from './fines/mock.js';
import { mockMarkingProvider } from './marking/mock.js';
import { CrptMarkingProvider } from './marking/crpt.js';
import { mockPaymentProvider } from './payment/mock.js';
import { YookassaPaymentProvider } from './payment/yookassa.js';
import { consoleEmailProvider } from './email/console.js';
import { SmtpEmailProvider } from './email/smtp.js';
import { UnisenderEmailProvider } from './email/unisender.js';
import { mockOsagoProvider } from './osago/mock.js';
import { rsaOsagoProvider } from './osago/rsa.js';
import type { OsagoProvider } from './osago/interface.js';
import { mockOfdProvider } from './ofd/mock.js';
import type { OfdProvider } from './ofd/interface.js';
import type { ProviderAdapter, ProviderType, LoadedCredential } from './base.js';
import { loadCredentials } from './base.js';
import type { SignatureProvider } from './signature/interface.js';
import type { EdiProvider } from './edi/interface.js';
import type { TelematicsProvider } from './telematics/interface.js';
import type { FuelCardProvider } from './fuel-card/interface.js';
import type { FinesProvider } from './fines/interface.js';
import type { MarkingProvider } from './marking/interface.js';
import type { PaymentProvider } from './payment/interface.js';
import type { EmailProvider } from './email/interface.js';

/**
 * Factory map: `${providerType}:${providerName}` -> creds -> adapter.
 *
 * Adding a new real provider: write the adapter class (constructor that
 * takes a typed credentials object), then register the factory here. The
 * runtime picks it up automatically when an org saves matching credentials.
 *
 * NOTE: factories receive the decrypted credentials object verbatim. The
 * adapter is responsible for validating shape and surfacing errors.
 */
type AdapterFactory = (creds: Record<string, unknown>) => ProviderAdapter;
const realAdapterFactories = new Map<string, AdapterFactory>([
    // Signature
    ['signature:gosklyuch', (c) => new GosklyuchSignatureProvider(c as any)],
    // EDI
    ['edi:diadoc', (c) => new DiadocEdiProvider(c as any)],
    // Telematics
    ['telematics:wialon', (c) => new WialonTelematicsProvider(c as any)],
    ['telematics:omnicomm', (c) => new OmnicommTelematicsProvider(c as any)],
    ['telematics:glonasssoft', (c) => new GlonasssoftTelematicsProvider(c as any)],
    // Marking
    ['marking:crpt', (c) => new CrptMarkingProvider(c as any)],
    // Payment
    ['payment:yookassa', (c) => new YookassaPaymentProvider(c as any)],
    // Email
    ['email:mailru_smtp', (c) => new SmtpEmailProvider(c as any)],
    ['email:smtp', (c) => new SmtpEmailProvider(c as any)],
    ['email:unisender', (c) => new UnisenderEmailProvider(c as any)],
]);

/**
 * Lookup-only export so other modules can check if a real adapter exists
 * for a given provider before claiming to "go live."
 */
export function hasRealAdapter(providerType: ProviderType, providerName: string): boolean {
    return realAdapterFactories.has(`${providerType}:${providerName}`);
}

// Per-(org, type, name) adapter instance cache. Adapter classes hold
// connection state (HTTP keep-alive, in-flight tokens) so reusing pays off.
// Cleared when credentials change via invalidateCredentialsCache.
interface AdapterCacheEntry {
    adapter: ProviderAdapter;
    expiresAt: number;
}
const ADAPTER_CACHE_TTL_MS = 5 * 60_000;
const adapterCache = new Map<string, AdapterCacheEntry>();

function adapterCacheKey(orgId: string, type: ProviderType, name: string): string {
    return `${orgId}:${type}:${name}`;
}

export function invalidateAdapterCache(orgId: string, type: ProviderType): void {
    for (const key of adapterCache.keys()) {
        if (key.startsWith(`${orgId}:${type}:`)) adapterCache.delete(key);
    }
}

// Wire the resolver into base.ts. This is the production path that turns
// saved API keys into running adapters. selectAdapter() calls this with the
// decrypted credentials and we either return a cached/fresh real adapter or
// null (caller then falls back to mock).
import { _setRealAdapterResolver } from './base.js';
_setRealAdapterResolver((orgId, type, name, creds): ProviderAdapter | null => {
    const factory = realAdapterFactories.get(`${type}:${name}`);
    if (!factory) return null;

    const key = adapterCacheKey(orgId, type, name);
    const hit = adapterCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.adapter;

    try {
        const adapter = factory(creds);
        adapterCache.set(key, { adapter, expiresAt: Date.now() + ADAPTER_CACHE_TTL_MS });
        return adapter;
    } catch {
        // Bad credentials shape — caller falls back to mock.
        return null;
    }
});

export interface ProviderRegistry {
    signature: SignatureProvider[];
    edi: EdiProvider[];
    telematics: TelematicsProvider[];
    fuel_card: FuelCardProvider[];
    fines: FinesProvider[];
    marking: MarkingProvider[];
    payment: PaymentProvider[];
    email: EmailProvider[];
}

let cachedRegistry: ProviderRegistry | null = null;

export function getDefaultRegistry(): ProviderRegistry {
    if (cachedRegistry) return cachedRegistry;
    const emailAdapters: EmailProvider[] = [consoleEmailProvider];
    if (process.env.SMTP_HOST) {
        emailAdapters.push(new SmtpEmailProvider());
    }
    // T-12 (W2): Unisender встаёт в default registry если задан полный
    // комплект env-переменных (UNISENDER_API_KEY + UNISENDER_FROM_EMAIL +
    // UNISENDER_LIST_ID). selectAdapter() ставит его впереди console но
    // позади per-org credentials, поэтому org может его переопределить.
    const unisender = UnisenderEmailProvider.fromEnv();
    if (unisender) {
        emailAdapters.push(unisender);
    }
    cachedRegistry = {
        signature: [mockSignatureProvider],
        edi: [mockEdiProvider],
        telematics: [mockTelematicsProvider],
        fuel_card: [mockFuelCardProvider],
        fines: [mockFinesProvider],
        marking: [mockMarkingProvider],
        payment: [mockPaymentProvider],
        email: emailAdapters,
    };
    return cachedRegistry;
}

export function getAdaptersForType(type: ProviderType): ProviderAdapter[] {
    const reg = getDefaultRegistry();
    switch (type) {
        case 'signature': return reg.signature;
        case 'edi': return reg.edi;
        case 'telematics': return reg.telematics;
        case 'fuel_card': return reg.fuel_card;
        case 'fines': return reg.fines;
        case 'marking': return reg.marking;
        case 'payment': return reg.payment;
        case 'email': return reg.email;
        default: {
            const _exh: never = type;
            return _exh;
        }
    }
}

export {
    encryptCredentials, decryptCredentials, loadCredentials, selectAdapter,
    findAdapterByName, invalidateCredentialsCache,
} from './base.js';
export type {
    ProviderAdapter, ProviderType, ProviderMode, ProviderStatus, ProviderHealth,
    LoadedCredential,
} from './base.js';

// Round 2A — OSAGO sits outside the formal ProviderType enum (Round 1C
// fixed that set). Expose its adapters via a parallel registry until the
// type set is opened up.
export const osagoAdapters: OsagoProvider[] = [mockOsagoProvider, rsaOsagoProvider];

export function getOsagoAdapter(name?: string): OsagoProvider {
    if (name) {
        const match = osagoAdapters.find(a => a.name === name);
        if (match) return match;
    }
    return mockOsagoProvider;
}

export type { OsagoProvider } from './osago/interface.js';
export type { OsagoCredentials, OsagoStatus } from './osago/interface.js';

// Round 2B — ОФД 54-ФЗ adapters live in their own registry (parallel to OSAGO)
// because the global ProviderType enum is owned by Round 1C.
export const ofdAdapters: OfdProvider[] = [mockOfdProvider];

export function getOfdAdapter(name?: string): OfdProvider {
    if (name) {
        const match = ofdAdapters.find(a => a.name === name);
        if (match) return match;
    }
    return mockOfdProvider;
}

export type { OfdProvider } from './ofd/interface.js';
export type { OfdCredentials, OfdReceipt, OfdFiscalizeInput } from './ofd/interface.js';
