// ============================================================
// EDI / ЭДО — state-machine + webhook-normaliser tests.
// Pure helpers — no DB / Redis / BullMQ touched.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    checkManualTransition,
    expectedStageSource,
    targetForStage,
    normalizeWebhookEvent,
    validateTitleSequence,
} from './helpers.js';

describe('checkManualTransition (mirrors service.ts::progressEdiManually)', () => {
    it('rejects progressing a not_sent document', () => {
        expect(checkManualTransition('not_sent', 'signed_by_carrier'))
            .toEqual({ ok: false, error: 'Документ ещё не отправлен в EDI' });
    });

    it('rejects progressing a null status (same as not_sent)', () => {
        expect(checkManualTransition(null, 'signed_by_carrier'))
            .toEqual({ ok: false, error: 'Документ ещё не отправлен в EDI' });
    });

    it('rejects progressing a rejected document anywhere', () => {
        expect(checkManualTransition('rejected', 'signed_by_carrier'))
            .toEqual({ ok: false, error: 'Документ уже отклонён в EDI' });
        expect(checkManualTransition('rejected', 'rejected'))
            .toEqual({ ok: false, error: 'Документ уже отклонён в EDI' });
    });

    it('rejects progressing signed_by_client to anything except rejected', () => {
        expect(checkManualTransition('signed_by_client', 'signed_by_carrier').ok).toBe(false);
        expect(checkManualTransition('signed_by_client', 'signed_by_client').ok).toBe(false);
    });

    it('allows signed_by_client → rejected (client recalled)', () => {
        expect(checkManualTransition('signed_by_client', 'rejected')).toEqual({ ok: true });
    });

    it('allows valid forward transitions', () => {
        expect(checkManualTransition('sent', 'signed_by_carrier')).toEqual({ ok: true });
        expect(checkManualTransition('signed_by_carrier', 'signed_by_client')).toEqual({ ok: true });
        expect(checkManualTransition('sent', 'rejected')).toEqual({ ok: true });
    });
});

describe('expectedStageSource / targetForStage', () => {
    it('carrier stage moves sent → signed_by_carrier', () => {
        expect(expectedStageSource('carrier')).toBe('sent');
        expect(targetForStage('carrier')).toBe('signed_by_carrier');
    });

    it('client stage moves signed_by_carrier → signed_by_client', () => {
        expect(expectedStageSource('client')).toBe('signed_by_carrier');
        expect(targetForStage('client')).toBe('signed_by_client');
    });
});

describe('normalizeWebhookEvent', () => {
    it('maps provider-specific event names to internal types', () => {
        expect(normalizeWebhookEvent({ eventType: 'DELIVERED' })).toBe('sent');
        expect(normalizeWebhookEvent({ status: 'signed' })).toBe('signed');
        expect(normalizeWebhookEvent({ eventType: 'signed_by_carrier' })).toBe('signed');
        expect(normalizeWebhookEvent({ eventType: 'Refused' })).toBe('rejected');
    });

    it('returns null for unknown / empty events', () => {
        expect(normalizeWebhookEvent({ eventType: 'created' })).toBeNull();
        expect(normalizeWebhookEvent({})).toBeNull();
        expect(normalizeWebhookEvent({ eventType: null, status: null })).toBeNull();
    });

    it('prefers eventType over status when both present', () => {
        expect(normalizeWebhookEvent({ eventType: 'signed', status: 'sent' })).toBe('signed');
    });
});

describe('validateTitleSequence (titles 01-08)', () => {
    it('accepts the full 01-08 set', () => {
        const out = validateTitleSequence(['01', '02', '03', '04', '05', '06', '07', '08']);
        expect(out).toEqual({ ok: true, missing: [], unknown: [] });
    });

    it('flags missing codes', () => {
        const out = validateTitleSequence(['01', '02', '03']);
        expect(out.ok).toBe(false);
        expect(out.missing).toEqual(['04', '05', '06', '07', '08']);
    });

    it('flags unknown codes', () => {
        const out = validateTitleSequence([
            '01', '02', '03', '04', '05', '06', '07', '08', '09',
        ]);
        expect(out.ok).toBe(false);
        expect(out.unknown).toEqual(['09']);
    });
});
