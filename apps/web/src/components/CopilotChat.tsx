'use client';

// ============================================================
// AI Co-pilot chat panel — floating right dock, collapsible.
// Phase 7 (Round 1A).
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, ChevronRight, ChevronLeft, Loader2, History, ChevronDown, Wrench, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { CopilotConversationSummary, CopilotStreamEvent, CopilotMessage } from '@tms/shared';

interface ToolCallDisplay {
    toolUseId: string;
    name: string;
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    open: boolean;
}

interface ProposedAction {
    actionId: string;
    title: string;
    summary: string;
    payload: Record<string, unknown>;
}

interface ChatTurn {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    toolCalls: ToolCallDisplay[];
    proposed: ProposedAction[];
}

function genId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CopilotChat() {
    const [expanded, setExpanded] = useState(false);
    const [turns, setTurns] = useState<ChatTurn[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [history, setHistory] = useState<CopilotConversationSummary[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const refreshHistory = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data: CopilotConversationSummary[] }>('/copilot/conversations');
            if (res.success) setHistory(res.data ?? []);
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        if (expanded) {
            void refreshHistory();
        }
    }, [expanded, refreshHistory]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [turns]);

    const loadConversation = useCallback(async (id: string) => {
        try {
            const res = await api.get<{ success: boolean; data: CopilotMessage[] }>(`/copilot/conversations/${id}/messages`);
            if (!res.success || !Array.isArray(res.data)) return;
            const rebuilt: ChatTurn[] = [];
            let pendingTools: ToolCallDisplay[] = [];
            for (const msg of res.data) {
                if (msg.role === 'user') {
                    rebuilt.push({ id: msg.id, role: 'user', text: msg.content, toolCalls: [], proposed: [] });
                } else if (msg.role === 'tool' && msg.toolName) {
                    pendingTools.push({
                        toolUseId: msg.id,
                        name: msg.toolName,
                        input: (msg.toolInput as Record<string, unknown>) ?? {},
                        output: (msg.toolOutput as Record<string, unknown>) ?? undefined,
                        open: false,
                    });
                } else if (msg.role === 'assistant') {
                    rebuilt.push({
                        id: msg.id,
                        role: 'assistant',
                        text: msg.content,
                        toolCalls: pendingTools,
                        proposed: [],
                    });
                    pendingTools = [];
                }
            }
            setTurns(rebuilt);
            setConversationId(id);
            setHistoryOpen(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить диалог');
        }
    }, []);

    const startNew = useCallback(() => {
        setTurns([]);
        setConversationId(null);
        setHistoryOpen(false);
        setError(null);
    }, []);

    const send = useCallback(async (messageText: string) => {
        const trimmed = messageText.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        setError(null);

        const userTurn: ChatTurn = {
            id: genId(), role: 'user', text: trimmed, toolCalls: [], proposed: [],
        };
        const assistantTurn: ChatTurn = {
            id: genId(), role: 'assistant', text: '', toolCalls: [], proposed: [],
        };
        setTurns((prev) => [...prev, userTurn, assistantTurn]);
        const assistantId = assistantTurn.id;

        try {
            const stream = api.streamSSE('/copilot/chat', {
                conversationId,
                message: trimmed,
            });
            for await (const ev of stream) {
                const event = ev.data as CopilotStreamEvent;
                if (event.type === 'conversation') {
                    setConversationId(event.conversationId);
                } else if (event.type === 'text_delta') {
                    setTurns((prev) => prev.map((t) => t.id === assistantId
                        ? { ...t, text: t.text + event.delta }
                        : t));
                } else if (event.type === 'tool_call') {
                    setTurns((prev) => prev.map((t) => t.id === assistantId
                        ? {
                            ...t,
                            toolCalls: [...t.toolCalls, {
                                toolUseId: event.toolUseId,
                                name: event.name,
                                input: event.input,
                                open: false,
                            }],
                        }
                        : t));
                } else if (event.type === 'tool_result') {
                    setTurns((prev) => prev.map((t) => t.id === assistantId
                        ? {
                            ...t,
                            toolCalls: t.toolCalls.map((tc) => tc.toolUseId === event.toolUseId
                                ? { ...tc, output: event.output }
                                : tc),
                        }
                        : t));
                } else if (event.type === 'proposed_action') {
                    setTurns((prev) => prev.map((t) => t.id === assistantId
                        ? {
                            ...t,
                            proposed: [...t.proposed, {
                                actionId: event.actionId,
                                title: event.title,
                                summary: event.summary,
                                payload: event.payload,
                            }],
                        }
                        : t));
                } else if (event.type === 'error') {
                    setError(event.error);
                }
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Ошибка соединения');
        } finally {
            setBusy(false);
        }
    }, [busy, conversationId]);

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        const text = input;
        setInput('');
        void send(text);
    }, [input, send]);

    const toggleToolCall = useCallback((turnId: string, toolUseId: string) => {
        setTurns((prev) => prev.map((t) => t.id === turnId
            ? { ...t, toolCalls: t.toolCalls.map((tc) => tc.toolUseId === toolUseId ? { ...tc, open: !tc.open } : tc) }
            : t));
    }, []);

    const confirmAction = useCallback((proposed: ProposedAction) => {
        const followUp = `Подтверждаю предложенное действие: ${proposed.title}. ID: ${proposed.actionId}.`;
        void send(followUp);
    }, [send]);

    const widthClass = expanded ? 'w-[480px]' : 'w-[250px]';

    return (
        <div className={`fixed right-4 bottom-4 z-40 ${widthClass} bg-white border border-neutral-200 rounded-xl shadow-2xl flex flex-col`}
             style={{ maxHeight: 'calc(100vh - 2rem)' }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-neutral-900 truncate">AI Со-пилот</p>
                    <p className="text-[10px] text-neutral-400 truncate">Диспетчерский ассистент</p>
                </div>
                <button
                    type="button"
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500"
                    title="История"
                >
                    <History className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500"
                    title={expanded ? 'Свернуть' : 'Развернуть'}
                >
                    {expanded ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>

            {/* History dropdown */}
            {historyOpen && (
                <div className="border-b border-neutral-100 max-h-48 overflow-y-auto bg-neutral-50">
                    <button
                        type="button"
                        onClick={startNew}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                        + Новый диалог
                    </button>
                    {history.length === 0 && (
                        <p className="px-3 py-2 text-xs text-neutral-400">История пуста</p>
                    )}
                    {history.map((conv) => (
                        <button
                            key={conv.id}
                            type="button"
                            onClick={() => void loadConversation(conv.id)}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-neutral-100 border-t border-neutral-100 ${
                                conversationId === conv.id ? 'bg-indigo-50' : ''
                            }`}
                        >
                            <p className="font-medium text-neutral-700 truncate">{conv.title || 'Без темы'}</p>
                            <p className="text-[10px] text-neutral-400">
                                {new Date(conv.lastActivityAt).toLocaleString('ru-RU')} · {conv.messageCount} сообщ.
                            </p>
                        </button>
                    ))}
                </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-[200px]" style={{ maxHeight: '50vh' }}>
                {turns.length === 0 && (
                    <div className="text-center text-xs text-neutral-400 py-8">
                        Спросите про активные рейсы, риски опоздания, маржу за месяц, нарушения температуры.
                    </div>
                )}
                {turns.map((turn) => (
                    <div key={turn.id} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                        <div className={`max-w-[90%] rounded-lg px-3 py-2 text-xs ${
                            turn.role === 'user'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-neutral-100 text-neutral-800'
                        }`}>
                            {turn.toolCalls.length > 0 && (
                                <div className="space-y-1 mb-2">
                                    {turn.toolCalls.map((tc) => (
                                        <div key={tc.toolUseId} className="rounded-md border border-neutral-200 bg-white">
                                            <button
                                                type="button"
                                                onClick={() => toggleToolCall(turn.id, tc.toolUseId)}
                                                className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono text-neutral-700 hover:bg-neutral-50"
                                            >
                                                <Wrench className="w-3 h-3 text-neutral-500" />
                                                <span className="truncate flex-1 text-left">{tc.name}</span>
                                                {tc.output ? (
                                                    <span className="text-emerald-600">●</span>
                                                ) : (
                                                    <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />
                                                )}
                                                <ChevronDown className={`w-3 h-3 transition-transform ${tc.open ? 'rotate-180' : ''}`} />
                                            </button>
                                            {tc.open && (
                                                <div className="px-2 pb-2 text-[10px] font-mono text-neutral-600 space-y-1">
                                                    <div>
                                                        <span className="text-neutral-400">input:</span>
                                                        <pre className="whitespace-pre-wrap break-all">{JSON.stringify(tc.input, null, 2)}</pre>
                                                    </div>
                                                    {tc.output && (
                                                        <div>
                                                            <span className="text-neutral-400">output:</span>
                                                            <pre className="whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{JSON.stringify(tc.output, null, 2)}</pre>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {turn.text && (
                                <p className="whitespace-pre-wrap leading-relaxed">{turn.text}</p>
                            )}
                            {turn.proposed.map((p) => (
                                <div key={p.actionId} className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
                                    <p className="text-[11px] font-bold">{p.title}</p>
                                    <p className="text-[10px] mt-0.5">{p.summary}</p>
                                    <button
                                        type="button"
                                        onClick={() => confirmAction(p)}
                                        className="mt-1.5 px-2 py-1 rounded bg-amber-600 text-white text-[10px] font-semibold hover:bg-amber-700"
                                    >
                                        Подтвердить
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                {busy && turns.length > 0 && turns[turns.length - 1].role === 'assistant' && !turns[turns.length - 1].text && (
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Думаю...</span>
                    </div>
                )}
            </div>

            {error && (
                <div className="px-3 py-2 border-t border-rose-100 bg-rose-50 flex items-start gap-2 text-[11px] text-rose-700">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="border-t border-neutral-100 p-2 flex items-end gap-2">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                    }}
                    rows={2}
                    placeholder="Спросите ассистента..."
                    disabled={busy}
                    className="flex-1 resize-none text-xs px-2 py-1.5 border border-neutral-200 rounded-md bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
                />
                <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="p-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Отправить"
                >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
            </form>
        </div>
    );
}

