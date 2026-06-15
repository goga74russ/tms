// ============================================================
// Mock signature provider — deterministic, demo-grade.
// ============================================================
import crypto from 'node:crypto';
import { nowIso, type ProviderHealth } from '../base.js';
import type { SignatureCertInfo, SignatureInput, SignatureProvider, SignatureResult } from './interface.js';

const MOCK_CERT: SignatureCertInfo = {
    subject: 'CN=ООО ТМС Демо, O=ТМС, C=RU',
    issuer: 'CN=Тестовый УЦ ТМС, O=ТМС, C=RU',
    serial: '01ABCDEF',
    validFrom: '2025-01-01T00:00:00Z',
    validTo: '2027-01-01T00:00:00Z',
};

function deterministicSig(documentId: string, payload: string): string {
    return crypto.createHash('sha256').update(`${documentId}|${payload}`).digest('hex');
}

export class MockSignatureProvider implements SignatureProvider {
    readonly name = 'mock';
    readonly providerType = 'signature' as const;
    readonly mode = 'mock' as const;

    async healthCheck(): Promise<ProviderHealth> {
        return { ok: true, mode: 'mock', detail: 'mock signature provider', checkedAt: nowIso() };
    }

    async execute(input: SignatureInput): Promise<SignatureResult> {
        return this.sign(input.documentId, input.payload, input.userId, input.callbackUrl);
    }

    async sign(documentId: string, payload: string, userId: string, _callbackUrl?: string): Promise<SignatureResult> {
        const sig = deterministicSig(documentId, payload);
        // P3 (код-аудит 2026-06-14): экранируем documentId/userId перед вставкой в XML —
        // спецсимволы (< > &) ломали/подделывали конверт mock-подписи.
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const signedXml = `<SignedDocument xmlns="urn:tms:mock-sig">
  <DocumentId>${esc(documentId)}</DocumentId>
  <SignedBy>${esc(userId)}</SignedBy>
  <SignedAt>${nowIso()}</SignedAt>
  <Signature algorithm="mock-sha256">${sig}</Signature>
  <Payload encoding="base64">${Buffer.from(payload).toString('base64')}</Payload>
</SignedDocument>`;
        return { signedXml, certInfo: MOCK_CERT };
    }

    async verify(signedXml: string): Promise<boolean> {
        return signedXml.includes('<Signature') && signedXml.includes('mock-sha256');
    }
}

export const mockSignatureProvider = new MockSignatureProvider();
