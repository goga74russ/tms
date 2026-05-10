// ============================================================
// Provider framework — public registry.
// Construct concrete adapters lazily because real ones need creds
// at instantiation time. The default registry returned by
// getDefaultRegistry() contains the mock for every type so the
// application has a working fallback even with zero configuration.
// ============================================================

import { mockSignatureProvider } from './signature/mock.js';
import { mockEdiProvider } from './edi/mock.js';
import { mockTelematicsProvider } from './telematics/mock.js';
import { mockFuelCardProvider } from './fuel-card/mock.js';
import { mockFinesProvider } from './fines/mock.js';
import { mockMarkingProvider } from './marking/mock.js';
import { mockPaymentProvider } from './payment/mock.js';
import { consoleEmailProvider } from './email/console.js';
import { SmtpEmailProvider } from './email/smtp.js';
import { mockOsagoProvider } from './osago/mock.js';
import { rsaOsagoProvider } from './osago/rsa.js';
import type { OsagoProvider } from './osago/interface.js';
import { mockOfdProvider } from './ofd/mock.js';
import type { OfdProvider } from './ofd/interface.js';
import type { ProviderAdapter, ProviderType } from './base.js';
import type { SignatureProvider } from './signature/interface.js';
import type { EdiProvider } from './edi/interface.js';
import type { TelematicsProvider } from './telematics/interface.js';
import type { FuelCardProvider } from './fuel-card/interface.js';
import type { FinesProvider } from './fines/interface.js';
import type { MarkingProvider } from './marking/interface.js';
import type { PaymentProvider } from './payment/interface.js';
import type { EmailProvider } from './email/interface.js';

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
    findAdapterByName,
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
