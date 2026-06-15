// ============================================================
// AI Co-pilot — chat orchestrator
// Phase 7 (Round 1A). Streams text + tool calls via SSE, persists
// conversation state, falls back to a deterministic mock when
// ANTHROPIC_API_KEY is not configured (so dev / CI works offline).
// ============================================================
import { db } from '../../db/connection.js';
import { copilotConversations, copilotMessages, users, organizations } from '../../db/schema.js';
import { and, eq, desc, gte, sql, asc, inArray } from 'drizzle-orm';
import { ALL_TOOLS, runTool, type CopilotToolContext } from './tools/index.js';
import { buildSystemPrompt } from './prompt.js';
import { safeClientError } from '../../utils/safe-error.js';

// P2 (код-аудит 2026-06-14): tool_result отдаётся в контекст модели через
// JSON.stringify(result) — сырые внутренние поля/ошибки могли утекать в LLM.
// Санитизируем: вырезаем чувствительные ключи + ограничиваем размер.
const TOOL_RESULT_SENSITIVE_KEYS = new Set([
    'stack', 'rawError', 'sql', 'query', 'password', 'passwordHash',
    'token', 'secret', 'encryptedCredentials', 'apiKey',
]);
function sanitizeToolResultForModel(result: unknown): string {
    const json = JSON.stringify(result, (key, value) =>
        TOOL_RESULT_SENSITIVE_KEYS.has(key) ? undefined : value);
    const MAX = 8000;
    if (!json) return 'null';
    return json.length > MAX ? `${json.slice(0, MAX)}…(truncated)` : json;
}
import type { CopilotStreamEvent, CopilotMessageRole } from '@tms/shared';

const MAX_HISTORY_TURNS = 30;
const DEFAULT_DAILY_LIMIT = Number.parseInt(process.env.COPILOT_DAILY_LIMIT ?? '500', 10) || 500;
const ANTHROPIC_MODEL = process.env.COPILOT_MODEL ?? 'claude-sonnet-4-5';

export type StreamEmitter = (event: CopilotStreamEvent) => void;

interface AnthropicSdkLike {
    messages: {
        stream: (params: Record<string, unknown>) => AsyncIterable<unknown> & { finalMessage: () => Promise<unknown> };
    };
}

let cachedClient: AnthropicSdkLike | null | undefined;

async function getAnthropicClient(): Promise<AnthropicSdkLike | null> {
    if (cachedClient !== undefined) return cachedClient;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        cachedClient = null;
        return null;
    }
    try {
        const mod: unknown = await import('@anthropic-ai/sdk');
        const ctor = (mod as { default?: new (opts: { apiKey: string }) => AnthropicSdkLike }).default
            ?? (mod as { Anthropic?: new (opts: { apiKey: string }) => AnthropicSdkLike }).Anthropic;
        if (!ctor) {
            cachedClient = null;
            return null;
        }
        cachedClient = new ctor({ apiKey });
        return cachedClient;
    } catch {
        cachedClient = null;
        return null;
    }
}

export interface ChatOptions {
    conversationId?: string | null;
    message: string;
    user: { userId: string; roles: string[]; organizationId?: string | null };
}

export class CopilotRateLimitError extends Error {
    constructor(public readonly remaining: number) {
        super('Copilot daily message limit reached');
    }
}

async function ensureUnderRateLimit(organizationId: string | null | undefined) {
    if (!organizationId) return;
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [row] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(copilotMessages)
        .innerJoin(copilotConversations, eq(copilotMessages.conversationId, copilotConversations.id))
        .where(and(
            eq(copilotConversations.organizationId, organizationId),
            eq(copilotMessages.role, 'user'),
            gte(copilotMessages.createdAt, since),
        ));
    const count = Number(row?.c ?? 0);
    if (count >= DEFAULT_DAILY_LIMIT) {
        throw new CopilotRateLimitError(0);
    }
}

async function ensureConversation(opts: ChatOptions): Promise<string> {
    if (opts.conversationId) {
        const [existing] = await db
            .select({ id: copilotConversations.id })
            .from(copilotConversations)
            .where(and(
                eq(copilotConversations.id, opts.conversationId),
                eq(copilotConversations.userId, opts.user.userId),
            ))
            .limit(1);
        if (existing) return existing.id;
    }
    const [created] = await db.insert(copilotConversations).values({
        userId: opts.user.userId,
        organizationId: opts.user.organizationId ?? null,
    }).returning({ id: copilotConversations.id });
    return created.id;
}

async function persistMessage(params: {
    conversationId: string;
    role: CopilotMessageRole;
    content: string;
    toolName?: string | null;
    toolInput?: Record<string, unknown> | null;
    toolOutput?: Record<string, unknown> | null;
}): Promise<void> {
    await db.insert(copilotMessages).values({
        conversationId: params.conversationId,
        role: params.role,
        content: params.content ?? '',
        toolName: params.toolName ?? null,
        toolInput: params.toolInput ?? null,
        toolOutput: params.toolOutput ?? null,
    });
    await db.update(copilotConversations)
        .set({
            messageCount: sql`${copilotConversations.messageCount} + 1`,
            lastActivityAt: new Date(),
        })
        .where(eq(copilotConversations.id, params.conversationId));
}

async function loadHistory(conversationId: string): Promise<Array<{ role: string; content: string }>> {
    const rows = await db
        .select({
            role: copilotMessages.role,
            content: copilotMessages.content,
        })
        .from(copilotMessages)
        // P2 (код-аудит 2026-06-14): берём только реальные ходы диалога (user/assistant),
        // исключая tool-строки (role='tool', content='') — иначе они съедали лимит
        // MAX_HISTORY_TURNS и реальный контекст сильно урезался.
        .where(and(
            eq(copilotMessages.conversationId, conversationId),
            inArray(copilotMessages.role, ['user', 'assistant']),
        ))
        .orderBy(desc(copilotMessages.createdAt))
        .limit(MAX_HISTORY_TURNS);
    return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}

async function loadUserCtx(userId: string): Promise<{ fullName: string; organizationName: string | null }> {
    const [row] = await db
        .select({
            fullName: users.fullName,
            organizationName: organizations.name,
        })
        .from(users)
        .leftJoin(organizations, eq(users.organizationId, organizations.id))
        .where(eq(users.id, userId))
        .limit(1);
    return {
        fullName: row?.fullName ?? '',
        organizationName: row?.organizationName ?? null,
    };
}

// ------------------------------------------------------------
// Mock fallback — deterministic so tests/dev work without API key.
// ------------------------------------------------------------
async function runMockChat(
    opts: ChatOptions,
    conversationId: string,
    emit: StreamEmitter,
): Promise<void> {
    const lower = opts.message.toLowerCase();
    let toolName: string | null = null;
    let toolInput: Record<string, unknown> = {};
    if (lower.includes('риск') || lower.includes('опазд') || lower.includes('просроч')) {
        toolName = 'list_trips_at_risk';
    } else if (lower.includes('счёт') || lower.includes('счет') || lower.includes('инвойс')) {
        toolName = 'list_pending_invoices';
    } else if (lower.includes('маржа') || lower.includes('прибыль')) {
        toolName = 'get_monthly_margin';
    } else if (lower.includes('темпер') || lower.includes('холод')) {
        toolName = 'get_temperature_breaches';
    } else {
        toolName = 'list_active_trips';
    }

    const ctx: CopilotToolContext = {
        userId: opts.user.userId,
        roles: opts.user.roles,
        organizationId: opts.user.organizationId ?? null,
    };
    const toolUseId = `mock_${Date.now()}`;
    emit({ type: 'tool_call', toolUseId, name: toolName, input: toolInput });
    const result = await runTool(toolName, toolInput, ctx);
    const output: Record<string, unknown> = {
        success: result.success,
        ...(result.data !== undefined ? { data: result.data } : {}),
        ...(result.error ? { error: result.error } : {}),
    };
    emit({ type: 'tool_result', toolUseId, name: toolName, output });
    await persistMessage({
        conversationId,
        role: 'tool',
        content: '',
        toolName,
        toolInput,
        toolOutput: output,
    });

    const summary = result.success
        ? `(mock) Запросил ${toolName}. Получено данных: см. блок выше. Это деморежим — настройте ANTHROPIC_API_KEY для полноценных ответов.`
        : `(mock) Tool ${toolName} вернул ошибку: ${result.error ?? 'unknown'}.`;
    for (const chunk of summary.match(/.{1,40}/g) ?? [summary]) {
        emit({ type: 'text_delta', delta: chunk });
    }
    await persistMessage({ conversationId, role: 'assistant', content: summary });
}

// ------------------------------------------------------------
// Anthropic streaming
// ------------------------------------------------------------
interface ContentBlock {
    type: string;
    text?: string;
    name?: string;
    id?: string;
    input?: Record<string, unknown>;
}

interface StreamMessage {
    content?: ContentBlock[];
    stop_reason?: string;
}

async function runAnthropicChat(
    client: AnthropicSdkLike,
    opts: ChatOptions,
    conversationId: string,
    emit: StreamEmitter,
): Promise<void> {
    const userInfo = await loadUserCtx(opts.user.userId);
    const system = buildSystemPrompt({
        userRoles: opts.user.roles,
        userFullName: userInfo.fullName,
        organizationName: userInfo.organizationName,
    });
    const history = await loadHistory(conversationId);
    const tools = ALL_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
    }));
    const messages: Array<{ role: string; content: unknown }> = history
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));
    messages.push({ role: 'user', content: opts.message });

    const ctx: CopilotToolContext = {
        userId: opts.user.userId,
        roles: opts.user.roles,
        organizationId: opts.user.organizationId ?? null,
    };

    // Up to 4 tool-use rounds, then we stop.
    for (let round = 0; round < 4; round += 1) {
        const stream = client.messages.stream({
            model: ANTHROPIC_MODEL,
            max_tokens: 1024,
            system,
            tools,
            messages,
        });
        let textAccum = '';
        for await (const event of stream as AsyncIterable<unknown>) {
            const ev = event as { type: string; delta?: { type?: string; text?: string } };
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
                textAccum += ev.delta.text;
                emit({ type: 'text_delta', delta: ev.delta.text });
            }
        }
        const finalMsg = await stream.finalMessage() as StreamMessage;
        if (textAccum) {
            await persistMessage({ conversationId, role: 'assistant', content: textAccum });
        }
        const toolUses = (finalMsg.content ?? []).filter((b) => b.type === 'tool_use');
        if (toolUses.length === 0 || finalMsg.stop_reason !== 'tool_use') {
            return;
        }
        // Execute tool calls and feed back.
        const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
        for (const block of toolUses) {
            const name = block.name ?? '';
            const input = block.input ?? {};
            const id = block.id ?? '';
            emit({ type: 'tool_call', toolUseId: id, name, input });
            const result = await runTool(name, input, ctx);
            const resultRecord: Record<string, unknown> = {
                success: result.success,
                ...(result.data !== undefined ? { data: result.data } : {}),
                ...(result.error ? { error: result.error } : {}),
                ...(result.proposed ? { proposed: true } : {}),
            };
            emit({ type: 'tool_result', toolUseId: id, name, output: resultRecord });
            await persistMessage({
                conversationId,
                role: 'tool',
                content: '',
                toolName: name,
                toolInput: input,
                toolOutput: resultRecord,
            });
            toolResults.push({
                type: 'tool_result',
                tool_use_id: id,
                content: sanitizeToolResultForModel(result),
            });
            if (result.proposed) {
                emit({
                    type: 'proposed_action',
                    actionId: id,
                    title: `Предложено действие: ${name}`,
                    summary: 'Требуется подтверждение пользователя.',
                    payload: (result.data ?? {}) as Record<string, unknown>,
                });
            }
        }
        messages.push({ role: 'assistant', content: finalMsg.content ?? [] });
        messages.push({ role: 'user', content: toolResults });
    }
}

// ------------------------------------------------------------
// Public entry
// ------------------------------------------------------------
export async function chat(opts: ChatOptions, emit: StreamEmitter): Promise<{ conversationId: string }> {
    await ensureUnderRateLimit(opts.user.organizationId ?? null);
    const conversationId = await ensureConversation(opts);
    emit({ type: 'conversation', conversationId });
    await persistMessage({ conversationId, role: 'user', content: opts.message });

    try {
        const client = await getAnthropicClient();
        if (client) {
            await runAnthropicChat(client, opts, conversationId, emit);
        } else {
            await runMockChat(opts, conversationId, emit);
        }
    } catch (err: unknown) {
        emit({ type: 'error', error: safeClientError(err, 'Внутренняя ошибка') });
    }
    emit({ type: 'done' });
    return { conversationId };
}

export async function listConversations(userId: string): Promise<Array<{
    id: string;
    startedAt: string;
    lastActivityAt: string;
    messageCount: number;
    title: string | null;
}>> {
    const rows = await db
        .select({
            id: copilotConversations.id,
            startedAt: copilotConversations.startedAt,
            lastActivityAt: copilotConversations.lastActivityAt,
            messageCount: copilotConversations.messageCount,
        })
        .from(copilotConversations)
        .where(eq(copilotConversations.userId, userId))
        .orderBy(desc(copilotConversations.lastActivityAt))
        .limit(10);

    const result: Array<{
        id: string;
        startedAt: string;
        lastActivityAt: string;
        messageCount: number;
        title: string | null;
    }> = [];
    for (const r of rows) {
        const [first] = await db
            .select({ content: copilotMessages.content })
            .from(copilotMessages)
            .where(and(
                eq(copilotMessages.conversationId, r.id),
                eq(copilotMessages.role, 'user'),
            ))
            .orderBy(asc(copilotMessages.createdAt))
            .limit(1);
        const title = first?.content ? first.content.slice(0, 80) : null;
        result.push({
            id: r.id,
            startedAt: r.startedAt.toISOString(),
            lastActivityAt: r.lastActivityAt.toISOString(),
            messageCount: r.messageCount,
            title,
        });
    }
    return result;
}

export async function getConversationMessages(conversationId: string, userId: string) {
    const [conv] = await db
        .select({ id: copilotConversations.id })
        .from(copilotConversations)
        .where(and(
            eq(copilotConversations.id, conversationId),
            eq(copilotConversations.userId, userId),
        ))
        .limit(1);
    if (!conv) return null;
    const rows = await db
        .select({
            id: copilotMessages.id,
            conversationId: copilotMessages.conversationId,
            role: copilotMessages.role,
            content: copilotMessages.content,
            toolName: copilotMessages.toolName,
            toolInput: copilotMessages.toolInput,
            toolOutput: copilotMessages.toolOutput,
            createdAt: copilotMessages.createdAt,
        })
        .from(copilotMessages)
        .where(eq(copilotMessages.conversationId, conversationId))
        .orderBy(asc(copilotMessages.createdAt));
    return rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
    }));
}
