// ============================================================
// Notification worker — processor + priority helper.
// Locks the event → Telegram dispatch contract and the subscription
// filtering rules. db / telegram.service are stubbed.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface Capture {
    subs: any[];
    sentTo: Array<{ chatId: string; text: string }>;
}
let capture: Capture;

// sendMessage mock: outcome controlled per test.
let sendMessageBehavior: (chatId: string | number, text: string) => Promise<any> = async () => ({ ok: true });

vi.mock('../telegram.service.js', () => ({
    sendMessage: vi.fn(async (chatId: any, text: string) => {
        capture.sentTo.push({ chatId: String(chatId), text });
        return sendMessageBehavior(chatId, text);
    }),
    formatEventMessage: vi.fn(
        (eventType: string, _entityType: string, entityId: string) => `MSG:${eventType}:${entityId}`,
    ),
    isNotifiableEvent: (eventType: string) => eventType !== 'mystery.unknown',
}));

function makeSelectChain() {
    const chain: any = {
        from: () => chain,
        where: () => Promise.resolve(capture.subs),
        then: (resolve: any) => resolve(capture.subs),
    };
    return chain;
}

vi.mock('../../db/connection.js', () => ({
    db: {
        select: () => makeSelectChain(),
    },
    sql: () => 'SQL',
}));

// BullMQ Queue construction must not actually connect.
vi.mock('bullmq', () => ({
    Queue: class { add() {} },
    Worker: class {
        on() {}
        async close() {}
    },
}));

import { processNotification, getEventPriority } from './notification.worker.js';

function fakeJob(data: any) {
    return { id: 'job', data, log: vi.fn() } as any;
}

beforeEach(() => {
    capture = { subs: [], sentTo: [] };
    sendMessageBehavior = async () => ({ ok: true });
});

// =================================================================
// getEventPriority — pure
// =================================================================
describe('getEventPriority (pure)', () => {
    it('gives trip.cancelled the highest priority', () => {
        expect(getEventPriority('trip.cancelled')).toBe(1);
    });
    it('gives repair.created priority 2', () => {
        expect(getEventPriority('repair.created')).toBe(2);
    });
    it('gives generic trip.* priority 3', () => {
        expect(getEventPriority('trip.created')).toBe(3);
    });
    it('gives invoice.* priority 4', () => {
        expect(getEventPriority('invoice.paid')).toBe(4);
    });
    it('falls back to 5 for unknown event prefixes', () => {
        expect(getEventPriority('vehicle.status_changed')).toBe(5);
        expect(getEventPriority('mystery')).toBe(5);
    });
});

// =================================================================
// processNotification
// =================================================================
describe('processNotification', () => {
    it('skips non-notifiable events without touching subscriptions', async () => {
        const result = await processNotification(fakeJob({
            eventType: 'mystery.unknown',
            entityType: 'thing',
            entityId: 'id-1',
            data: {},
            authorId: 'u',
            authorRole: 'admin',
            organizationId: 'org-1',
        }));
        expect(result).toEqual({ skipped: true, reason: 'not_notifiable' });
        expect(capture.sentTo).toHaveLength(0);
    });

    it('P0-S2: skips when event has no organizationId (no cross-tenant broadcast)', async () => {
        capture.subs = [{ id: 's1', telegramChatId: 'chat-1', eventTypes: ['*'], isActive: true }];
        const result = await processNotification(fakeJob({
            eventType: 'trip.created', entityType: 'trip', entityId: 't-1',
            data: {}, authorId: 'u', authorRole: 'admin', organizationId: null,
        }));
        expect(result).toEqual({ skipped: true, reason: 'no_organization_scope' });
        expect(capture.sentTo).toHaveLength(0);
    });

    it('sends to every active subscriber whose eventTypes include the event', async () => {
        capture.subs = [
            { id: 's1', telegramChatId: 'chat-1', eventTypes: ['trip.created'], isActive: true },
            { id: 's2', telegramChatId: 'chat-2', eventTypes: ['*'], isActive: true },
        ];
        const result = await processNotification(fakeJob({
            eventType: 'trip.created',
            entityType: 'trip',
            entityId: 't-1',
            data: {},
            authorId: 'u',
            authorRole: 'admin',
            organizationId: 'org-1',
        }));
        expect(result).toEqual({ sent: 2, failed: 0, eventType: 'trip.created' });
        expect(capture.sentTo.map((s) => s.chatId)).toEqual(['chat-1', 'chat-2']);
    });

    it('skips subscribers whose eventTypes do not include the event', async () => {
        capture.subs = [
            { id: 's1', telegramChatId: 'chat-1', eventTypes: ['repair.created'], isActive: true },
            { id: 's2', telegramChatId: 'chat-2', eventTypes: ['trip.created'], isActive: true },
        ];
        const result = await processNotification(fakeJob({
            eventType: 'trip.created',
            entityType: 'trip',
            entityId: 't-1',
            data: {},
            authorId: 'u',
            authorRole: 'admin',
            organizationId: 'org-1',
        }));
        expect(result.sent).toBe(1);
        expect(capture.sentTo).toHaveLength(1);
        expect(capture.sentTo[0].chatId).toBe('chat-2');
    });

    it('counts Telegram API failures (ok:false) without throwing', async () => {
        capture.subs = [
            { id: 's1', telegramChatId: 'chat-1', eventTypes: ['*'], isActive: true },
        ];
        sendMessageBehavior = async () => ({ ok: false, description: 'Bad Request' });
        const result = await processNotification(fakeJob({
            eventType: 'trip.created',
            entityType: 'trip',
            entityId: 't-1',
            data: {},
            authorId: 'u',
            authorRole: 'admin',
            organizationId: 'org-1',
        }));
        expect(result).toEqual({ sent: 0, failed: 1, eventType: 'trip.created' });
    });

    it('catches send exceptions and increments failed counter', async () => {
        capture.subs = [
            { id: 's1', telegramChatId: 'chat-1', eventTypes: ['*'], isActive: true },
            { id: 's2', telegramChatId: 'chat-2', eventTypes: ['*'], isActive: true },
        ];
        let count = 0;
        sendMessageBehavior = async () => {
            count++;
            if (count === 1) throw new Error('Network error');
            return { ok: true };
        };
        const result = await processNotification(fakeJob({
            eventType: 'trip.created',
            entityType: 'trip',
            entityId: 't-1',
            data: {},
            authorId: 'u',
            authorRole: 'admin',
            organizationId: 'org-1',
        }));
        expect(result.sent).toBe(1);
        expect(result.failed).toBe(1);
    });
});
