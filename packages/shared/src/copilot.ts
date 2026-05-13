// ============================================================
// AI Co-pilot — shared types
// Phase 7: dispatcher chat panel (Round 1A)
// ============================================================

export type CopilotMessageRole = 'user' | 'assistant' | 'tool' | 'system';

export interface CopilotConversationSummary {
    id: string;
    startedAt: string;
    lastActivityAt: string;
    messageCount: number;
    /** First user message excerpt (max ~80 chars) for the history dropdown. */
    title?: string | null;
}

export interface CopilotMessage {
    id: string;
    conversationId: string;
    role: CopilotMessageRole;
    content: string;
    toolName?: string | null;
    toolInput?: Record<string, unknown> | null;
    toolOutput?: Record<string, unknown> | null;
    createdAt: string;
}

/**
 * Server-Sent Event payloads pushed by /api/copilot/chat.
 * The client switches on `type` to render text deltas, tool calls, or proposed
 * actions awaiting confirmation.
 */
export type CopilotStreamEvent =
    | { type: 'conversation'; conversationId: string }
    | { type: 'text_delta'; delta: string }
    | { type: 'tool_call'; toolUseId: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; toolUseId: string; name: string; output: Record<string, unknown> }
    | {
        type: 'proposed_action';
        actionId: string;
        title: string;
        summary: string;
        /** Free-form payload the UI can echo back when confirming. */
        payload: Record<string, unknown>;
    }
    | { type: 'error'; error: string }
    | { type: 'done' };

export interface CopilotChatRequest {
    conversationId?: string | null;
    message: string;
}

export interface CopilotToolDescriptor {
    name: string;
    description: string;
    /** JSON Schema (subset) matching Anthropic tool input_schema format. */
    input_schema: Record<string, unknown>;
}

/**
 * The dispatcher / logist / admin / manager roles can use the co-pilot.
 * Drivers and clients are excluded by default.
 */
export const COPILOT_ALLOWED_ROLES: ReadonlyArray<string> = [
    'dispatcher',
    'logist',
    'admin',
    'manager',
];

export function userCanUseCopilot(roles: ReadonlyArray<string> | undefined | null): boolean {
    if (!roles || roles.length === 0) return false;
    return roles.some((r) => COPILOT_ALLOWED_ROLES.includes(r));
}
