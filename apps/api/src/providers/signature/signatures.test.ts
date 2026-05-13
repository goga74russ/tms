// ============================================================
// Signatures — provider-level smoke tests.
//
// There is no standalone `apps/api/src/modules/signatures/`
// module: signature handling is split across
//   • providers/signature/* — adapters (Госключ, СБИС, Контур, mock)
//   • modules/trips/transport-documents-store — DB-coupled state
//     transitions stored inside `metadata.signatureState`
// So instead of testing a state-machine that doesn't exist as a
// pure helper, we lock the public contract of two pieces:
//   1. GosklyuchSignatureProvider.sign() — pure deeplink builder
//      that powers the mobile redirect flow. The externalId/deeplink
//      pair is the only side-effect-free output worth regression-
//      protecting in this adapter today.
//   2. MockSignatureProvider — used as the safety net when no real
//      adapter is configured. healthCheck() must always report ok
//      so dev/sandbox flows aren't blocked.
// Anything more requires integration testing (gosuslugi sandbox
// + a real DB), which is out of scope here.
// ============================================================
import { describe, it, expect, vi } from 'vitest';

// providers/base.ts pulls in db/connection.ts which throws on missing env.
vi.hoisted(() => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
});
vi.mock('../../db/connection.js', () => ({
    db: {},
    sql: () => 'SQL',
}));

import { GosklyuchSignatureProvider } from './gosklyuch.js';
import { MockSignatureProvider } from './mock.js';

describe('GosklyuchSignatureProvider.sign — deeplink builder', () => {
    const provider = new GosklyuchSignatureProvider({
        clientId: 'test',
        clientSecret: 'secret',
        organizationOgrn: '1234567890123',
    });

    it('returns a pending result with a gosuslugiv:// deeplink and externalId', async () => {
        const out = await provider.sign('doc-abc12345-xyz', '<xml/>', 'user-1');
        expect(out.pending).toBe(true);
        expect(out.externalId).toMatch(/^gk-doc-abc1-\d+$/);
        expect(out.deeplink).toBeDefined();
        expect(out.deeplink!.startsWith('gosuslugiv://signature?')).toBe(true);
        expect(out.deeplink!).toContain('docId=doc-abc12345-xyz');
        expect(out.deeplink!).toContain(`extId=${encodeURIComponent(out.externalId!)}`);
        expect(out.signedXml).toBe('');
    });

    it('URL-encodes the callback URL in the deeplink when provided', async () => {
        const out = await provider.sign('d1', '<x/>', 'u', 'https://example.com/cb?id=1&t=2');
        // Both & and = inside the callback must be encoded inside the deeplink
        // value to avoid breaking the outer query string.
        expect(out.deeplink).toContain('callback=https%3A%2F%2Fexample.com%2Fcb%3Fid%3D1%26t%3D2');
    });

    it('omits the callback parameter when none is given', async () => {
        const out = await provider.sign('d1', '<x/>', 'u');
        expect(out.deeplink).toBeDefined();
        expect(out.deeplink!).not.toContain('callback=');
    });
});

describe('GosklyuchSignatureProvider.healthCheck', () => {
    it('reports ok when credentials are present, not-ok when missing', async () => {
        const okProv = new GosklyuchSignatureProvider({
            clientId: 'c', clientSecret: 's', organizationOgrn: 'o',
        });
        const okHealth = await okProv.healthCheck();
        expect(okHealth.ok).toBe(true);
        expect(okHealth.mode).toBe('production');

        const missingProv = new GosklyuchSignatureProvider({
            clientId: '', clientSecret: '', organizationOgrn: '',
        });
        const missingHealth = await missingProv.healthCheck();
        expect(missingHealth.ok).toBe(false);
        expect(missingHealth.detail).toMatch(/missing/i);
    });
});

describe('MockSignatureProvider — always-healthy fallback', () => {
    it('reports ok in mock mode (used for dev/sandbox)', async () => {
        const mock = new MockSignatureProvider();
        const h = await mock.healthCheck();
        expect(h.ok).toBe(true);
        expect(h.mode).toBe('mock');
    });

    it('verify() returns true for its own mock-sha256 signed XML, false otherwise', async () => {
        const mock = new MockSignatureProvider();
        const signed = await mock.sign('doc-1', '<x/>', 'u-1');
        expect(await mock.verify(signed.signedXml)).toBe(true);
        // Foreign / unsigned XML must not validate.
        expect(await mock.verify('<plain-xml/>')).toBe(false);
    });

    it('sign() produces a deterministic signature for the same (docId, payload)', async () => {
        const mock = new MockSignatureProvider();
        const a = await mock.sign('doc-1', '<x/>', 'u-1');
        const b = await mock.sign('doc-1', '<x/>', 'u-2');
        // Extract the <Signature ...>HEX</Signature> hex digest.
        const re = /<Signature [^>]+>([0-9a-f]+)<\/Signature>/;
        const sigA = a.signedXml.match(re)?.[1];
        const sigB = b.signedXml.match(re)?.[1];
        expect(sigA).toBeDefined();
        expect(sigA).toBe(sigB);
    });
});
