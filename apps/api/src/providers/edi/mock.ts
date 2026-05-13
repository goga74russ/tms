// ============================================================
// Mock EDI provider — setTimeout state machine.
// Mirrors the existing apps/api/src/modules/edi/service.ts flow:
//   sent → signed_by_carrier (5s) → signed_by_client (10s).
// ============================================================
import { nanoid } from 'nanoid';
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    EdiCallbackEvent, EdiExternalStatus, EdiProvider, EdiSendInput, EdiSendResult,
} from './interface.js';

const SIGN_BY_CARRIER_DELAY_MS = 5000;
const SIGN_BY_CLIENT_DELAY_MS = 10000;

interface MockState {
    status: EdiExternalStatus;
    timers: NodeJS.Timeout[];
}

const stateByExternalId = new Map<string, MockState>();

export class MockEdiProvider implements EdiProvider {
    readonly name = 'mock';
    readonly providerType = 'edi' as const;
    readonly mode = 'mock' as const;

    async healthCheck(): Promise<ProviderHealth> {
        return { ok: true, mode: 'mock', detail: 'mock EDI provider', checkedAt: nowIso() };
    }

    async execute(input: EdiSendInput): Promise<EdiSendResult> {
        return this.sendDocument(input.organizationId, input.documentId, input.payload, input.counterpartyInn);
    }

    async sendDocument(_orgId: string, _documentId: string, _payload: string, _counterpartyInn?: string): Promise<EdiSendResult> {
        const externalId = `mock-${nanoid(12)}`;
        const state: MockState = { status: 'sent', timers: [] };
        stateByExternalId.set(externalId, state);

        const t1 = setTimeout(() => {
            const s = stateByExternalId.get(externalId);
            if (s && s.status === 'sent') s.status = 'signed_by_carrier';
        }, SIGN_BY_CARRIER_DELAY_MS);
        const t2 = setTimeout(() => {
            const s = stateByExternalId.get(externalId);
            if (s && s.status === 'signed_by_carrier') s.status = 'signed_by_client';
        }, SIGN_BY_CLIENT_DELAY_MS);
        state.timers.push(t1, t2);
        return { externalId, status: 'sent' };
    }

    async getStatus(externalId: string): Promise<EdiExternalStatus> {
        return stateByExternalId.get(externalId)?.status ?? 'sent';
    }

    async handleCallback(payload: Record<string, unknown>): Promise<EdiCallbackEvent> {
        const externalId = String(payload.externalId ?? '');
        const status = (payload.status as EdiExternalStatus | undefined) ?? 'delivered';
        return { externalId, status, occurredAt: nowIso(), payload };
    }
}

export const mockEdiProvider = new MockEdiProvider();
