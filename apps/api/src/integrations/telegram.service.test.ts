// ============================================================
// Notifications — Telegram event-to-message mapping.
// formatEventMessage / isNotifiableEvent are pure helpers powering
// the /telegram/webhook + notify-on-event side of Sprint 6. No DB,
// no fetch — we just lock the template contract.
// ============================================================
import { describe, it, expect } from 'vitest';

import { formatEventMessage, isNotifiableEvent } from './telegram.service.js';

describe('isNotifiableEvent — which events trigger a Telegram push', () => {
    it('returns true for known templated events', () => {
        expect(isNotifiableEvent('trip.created')).toBe(true);
        expect(isNotifiableEvent('trip.assigned')).toBe(true);
        expect(isNotifiableEvent('repair.created')).toBe(true);
        expect(isNotifiableEvent('invoice.paid')).toBe(true);
        expect(isNotifiableEvent('vehicle.status_changed')).toBe(true);
    });

    it('returns false for unknown event types', () => {
        expect(isNotifiableEvent('unknown.event')).toBe(false);
        expect(isNotifiableEvent('')).toBe(false);
        expect(isNotifiableEvent('trip.something_new')).toBe(false);
    });
});

describe('formatEventMessage — HTML-safe Telegram body', () => {
    it('uses the trip.assigned template with bold driver name and plate', () => {
        const msg = formatEventMessage(
            'trip.assigned',
            'trip',
            't-1',
            { driverName: 'Иванов И.И.', vehiclePlate: 'А123ВС77' },
        );
        expect(msg).toContain('✅');
        expect(msg).toContain('<b>Рейс назначен</b>');
        expect(msg).toContain('<b>Иванов И.И.</b>');
        expect(msg).toContain('А123ВС77');
    });

    it('formats invoice.created with a Russian-locale currency total', () => {
        const msg = formatEventMessage(
            'invoice.created',
            'invoice',
            'i-1',
            { number: 'INV-42', total: 1234567 },
        );
        expect(msg).toContain('<b>INV-42</b>');
        // ru-RU groups digits with NBSP / regular space — assert on the digits.
        expect(msg).toContain('1');
        expect(msg).toMatch(/234/);
        expect(msg).toMatch(/567/);
        expect(msg).toContain('₽');
    });

    it('falls back to a generic message for unknown event types', () => {
        const msg = formatEventMessage('mystery.event', 'thing', 'id-9', {});
        // Generic fallback shouldn't crash and must surface entity info.
        expect(msg).toContain('mystery.event');
        expect(msg).toContain('thing');
        expect(msg).toContain('id-9');
    });

    it('renders trip.cancelled with an optional reason suffix', () => {
        const withReason = formatEventMessage('trip.cancelled', 'trip', 't-2', { reason: 'no driver' });
        expect(withReason).toContain('Рейс отменён');
        expect(withReason).toContain('no driver');

        const noReason = formatEventMessage('trip.cancelled', 'trip', 't-2', {});
        expect(noReason).toContain('Рейс отменён');
        // No trailing ": <reason>"
        expect(noReason).not.toMatch(/Рейс отменён:/);
    });

    it('uses dash placeholders for missing fields in trip.created', () => {
        const msg = formatEventMessage('trip.created', 'trip', 't-3', {});
        expect(msg).toContain('<b>Новый рейс</b>');
        expect(msg).toContain('—');
    });
});
