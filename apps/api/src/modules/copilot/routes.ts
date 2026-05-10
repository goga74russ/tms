// ============================================================
// AI Co-pilot — HTTP routes
// Phase 7 (Round 1A). SSE chat + conversation history.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { userCanUseCopilot, type CopilotStreamEvent } from '@tms/shared';
import { chat, listConversations, getConversationMessages, CopilotRateLimitError } from './service.js';

const ChatBodySchema = z.object({
    conversationId: z.string().uuid().optional().nullable(),
    message: z.string().min(1).max(8000),
});

function ssePayload(event: CopilotStreamEvent): string {
    return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

const copilotRoutes: FastifyPluginAsync = async (app) => {
    // POST /api/copilot/chat — SSE stream
    app.post('/copilot/chat', {
        schema: {
            tags: ['AI Co-pilot'],
            summary: 'Stream chat reply (SSE)',
            description: 'Server-Sent Events stream of co-pilot reply (text deltas, tool calls, results).',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        if (!userCanUseCopilot(user.roles)) {
            return reply.status(403).send({ success: false, error: 'Forbidden: copilot is not available for your role' });
        }
        const parsed = ChatBodySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: parsed.error.message });
        }

        reply.raw.setHeader('Content-Type', 'text/event-stream');
        reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');
        reply.raw.flushHeaders?.();

        const emit = (event: CopilotStreamEvent) => {
            try {
                reply.raw.write(ssePayload(event));
            } catch {
                // client disconnected; ignore
            }
        };

        try {
            await chat({
                conversationId: parsed.data.conversationId ?? null,
                message: parsed.data.message,
                user: {
                    userId: user.userId,
                    roles: user.roles,
                    organizationId: user.organizationId ?? null,
                },
            }, emit);
        } catch (err: unknown) {
            if (err instanceof CopilotRateLimitError) {
                emit({ type: 'error', error: 'Достигнут дневной лимит сообщений (500/день).' });
            } else {
                const msg = err instanceof Error ? err.message : 'Internal error';
                emit({ type: 'error', error: msg });
            }
            emit({ type: 'done' });
        }
        reply.raw.end();
    });

    // GET /api/copilot/conversations
    app.get('/copilot/conversations', {
        schema: {
            tags: ['AI Co-pilot'],
            summary: "List user's conversations",
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[] };
        if (!userCanUseCopilot(user.roles)) {
            return reply.status(403).send({ success: false, error: 'Forbidden' });
        }
        const data = await listConversations(user.userId);
        return { success: true, data };
    });

    // GET /api/copilot/conversations/:id/messages
    app.get('/copilot/conversations/:id/messages', {
        schema: {
            tags: ['AI Co-pilot'],
            summary: 'Replay conversation messages',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[] };
        if (!userCanUseCopilot(user.roles)) {
            return reply.status(403).send({ success: false, error: 'Forbidden' });
        }
        const params = request.params as { id: string };
        const data = await getConversationMessages(params.id, user.userId);
        if (!data) return reply.status(404).send({ success: false, error: 'Conversation not found' });
        return { success: true, data };
    });
};

export default copilotRoutes;
