'use client';

// ============================================================================
// SignTitleButton — ЭТрН XML title signing UI (T01/T02/T05/T06).
//
// Backend contract (to be finalised by the API team — see report):
//   POST /api/transport-documents/:id/sign
//     body:  { provider: 'gosklyuch' | 'kontur-sign' | 'sbis-sign' | 'cadesplugin' | 'mock', titleType: string }
//     resp:  { success: true, data: { externalId: string, deeplink?: string } }
//   Госключ async completion arrives via:
//     POST /api/signatures/gosklyuch/callback   (already implemented server-side)
//   We poll GET /api/transport-documents/:id and look at
//     metadata.signatureState and metadata.signatures[] to detect completion.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

export type TitleType = 'T01' | 'T02' | 'T05' | 'T06';

export type SignatureProviderId =
    | 'gosklyuch'
    | 'kontur-sign'
    | 'sbis-sign'
    | 'cadesplugin'
    | 'mock';

interface SignTitleButtonProps {
    transportDocumentId: string;
    titleType: TitleType;
    /** Текущее состояние подписи: 'signed' / 'awaiting' / 'pending' / ... */
    currentState?: string;
    onSigned?: () => void;
    /** Visual size for the trigger button. */
    size?: 'sm' | 'default';
}

const PROVIDERS: Array<{ id: SignatureProviderId; label: string; hint: string }> = [
    { id: 'gosklyuch', label: 'Госключ', hint: 'Подпись через мобильное приложение (физлица, ИП)' },
    { id: 'kontur-sign', label: 'Контур.Подпись', hint: 'Плагин Контура в браузере' },
    { id: 'sbis-sign', label: 'СБИС подпись', hint: 'Плагин СБИС в браузере' },
    { id: 'cadesplugin', label: 'КриптоПро CADES', hint: 'Локальная установка плагина' },
    { id: 'mock', label: 'Mock (dev)', hint: 'Только для отладки' },
];

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

type SignState =
    | { kind: 'idle' }
    | { kind: 'requesting' }
    | { kind: 'awaiting'; provider: SignatureProviderId; deeplink?: string; externalId?: string }
    | { kind: 'success' }
    | { kind: 'timeout' }
    | { kind: 'error'; message: string };

function isSignedState(state?: string): boolean {
    if (!state) return false;
    const v = state.toLowerCase();
    return v === 'signed' || v === 'completed' || v === 'accepted';
}

export function SignTitleButton({
    transportDocumentId,
    titleType,
    currentState,
    onSigned,
    size = 'sm',
}: SignTitleButtonProps) {
    const { toast } = useToast();

    const [open, setOpen] = useState(false);
    const [provider, setProvider] = useState<SignatureProviderId>('gosklyuch');
    const [state, setState] = useState<SignState>({ kind: 'idle' });
    const [copied, setCopied] = useState(false);

    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pollDeadlineRef = useRef<number>(0);

    const clearPoll = useCallback(() => {
        if (pollTimerRef.current) {
            clearTimeout(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    useEffect(() => () => clearPoll(), [clearPoll]);

    const alreadySigned = isSignedState(currentState);

    const resetAndClose = useCallback(() => {
        clearPoll();
        setOpen(false);
        // Defer reset so the dialog can finish its close animation.
        setTimeout(() => {
            setState({ kind: 'idle' });
            setCopied(false);
        }, 200);
    }, [clearPoll]);

    const poll = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data?: any }>(
                `/transport-documents/${transportDocumentId}`,
            );
            const doc = (res as any)?.data ?? res;
            const meta = doc?.metadata ?? {};
            // signatureState may be either a string ('signed') or an object
            // ({ status, lastSignerRole, lastSignedAt, titleType? }).
            const rawState = meta.signatureState ?? meta.signature?.state ?? meta.lastSignature?.state;
            const sigStateStr: string | undefined =
                typeof rawState === 'string'
                    ? rawState
                    : typeof rawState?.status === 'string'
                        ? rawState.status
                        : undefined;
            const stateTitle: string | undefined =
                typeof rawState === 'object' && typeof rawState?.titleType === 'string'
                    ? rawState.titleType
                    : undefined;
            const lastSig = Array.isArray(meta.signatures) && meta.signatures.length > 0
                ? meta.signatures[meta.signatures.length - 1]
                : null;

            const completedForThisTitle =
                (isSignedState(sigStateStr) && (!stateTitle || stateTitle === titleType))
                || (lastSig && isSignedState(lastSig.state) && (!lastSig.titleType || lastSig.titleType === titleType))
                || (doc?.status && isSignedState(doc.status));

            if (completedForThisTitle) {
                clearPoll();
                setState({ kind: 'success' });
                toast({
                    title: `Титул ${titleType} подписан`,
                    variant: 'success',
                });
                onSigned?.();
                setTimeout(() => resetAndClose(), 1200);
                return;
            }
        } catch {
            // swallow — keep polling until deadline
        }

        if (Date.now() >= pollDeadlineRef.current) {
            clearPoll();
            setState({ kind: 'timeout' });
            return;
        }
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    }, [transportDocumentId, titleType, toast, onSigned, clearPoll, resetAndClose]);

    const startPolling = useCallback(() => {
        clearPoll();
        pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    }, [clearPoll, poll]);

    const handleSubmit = useCallback(async () => {
        setState({ kind: 'requesting' });
        try {
            const res = await api.post<{
                success: boolean;
                data?: { externalId?: string; deeplink?: string };
            }>(`/transport-documents/${transportDocumentId}/sign`, {
                provider,
                titleType,
            });
            const data = (res as any)?.data ?? res ?? {};
            setState({
                kind: 'awaiting',
                provider,
                deeplink: data.deeplink,
                externalId: data.externalId,
            });
            startPolling();
        } catch (err: any) {
            setState({
                kind: 'error',
                message: err?.message || 'Не удалось запустить подписание',
            });
        }
    }, [transportDocumentId, provider, titleType, startPolling]);

    const handleCopy = useCallback(async () => {
        if (state.kind !== 'awaiting' || !state.deeplink) return;
        try {
            await navigator.clipboard.writeText(state.deeplink);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // ignore — user can still select-copy manually
        }
    }, [state]);

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size={size}
                disabled={alreadySigned}
                onClick={() => {
                    setState({ kind: 'idle' });
                    setOpen(true);
                }}
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                title={alreadySigned ? 'Титул уже подписан' : undefined}
            >
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                {alreadySigned ? `Титул ${titleType} подписан` : `Подписать титул ${titleType}`}
            </Button>

            <Dialog
                open={open}
                onClose={resetAndClose}
                title={`Подписание титула ${titleType}`}
                description="Выберите провайдера электронной подписи"
                size="md"
            >
                <div className="space-y-4">
                    {state.kind === 'idle' || state.kind === 'requesting' || state.kind === 'error' ? (
                        <>
                            <fieldset className="space-y-2" disabled={state.kind === 'requesting'}>
                                <legend className="text-xs font-semibold text-neutral-700 mb-2">
                                    Провайдер подписи
                                </legend>
                                {PROVIDERS.map((p) => (
                                    <label
                                        key={p.id}
                                        className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer transition ${provider === p.id
                                            ? 'border-emerald-300 bg-emerald-50/60'
                                            : 'border-neutral-200 hover:bg-neutral-50'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name={`sign-provider-${transportDocumentId}-${titleType}`}
                                            value={p.id}
                                            checked={provider === p.id}
                                            onChange={() => setProvider(p.id)}
                                            className="mt-0.5 h-4 w-4 accent-emerald-600"
                                        />
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-neutral-900">{p.label}</div>
                                            <div className="text-xs text-neutral-500">{p.hint}</div>
                                        </div>
                                    </label>
                                ))}
                            </fieldset>

                            {state.kind === 'error' && (
                                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                                    {state.message}
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={resetAndClose}
                                    disabled={state.kind === 'requesting'}
                                >
                                    Отмена
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleSubmit}
                                    disabled={state.kind === 'requesting'}
                                >
                                    {state.kind === 'requesting' && (
                                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                    )}
                                    Подписать
                                </Button>
                            </div>
                        </>
                    ) : null}

                    {state.kind === 'awaiting' && (
                        <div className="space-y-3">
                            {state.provider === 'gosklyuch' && state.deeplink ? (
                                <div className="space-y-3">
                                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-sm text-indigo-800">
                                        Откройте ссылку на мобильном устройстве с установленным приложением «Госключ» и подтвердите подпись.
                                    </div>
                                    <a
                                        href={state.deeplink}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        Открыть Госключ
                                    </a>
                                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <code className="text-[11px] text-neutral-700 break-all whitespace-pre-wrap">
                                                {state.deeplink}
                                            </code>
                                            <button
                                                type="button"
                                                onClick={handleCopy}
                                                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
                                            >
                                                <Copy className="w-3 h-3" />
                                                {copied ? 'Скопировано' : 'Скопировать'}
                                            </button>
                                        </div>
                                    </div>
                                    {state.externalId && (
                                        <div className="text-[11px] text-neutral-500">
                                            ID запроса: <code>{state.externalId}</code>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                    Подписание запущено. Статус: ожидает подтверждения.
                                    {state.externalId && (
                                        <div className="mt-1 text-[11px] text-amber-700">
                                            ID запроса: <code>{state.externalId}</code>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-xs text-neutral-500">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                                Ожидаем подтверждения. Проверяем каждые 5 секунд (до 5 минут).
                            </div>

                            <div className="flex justify-end pt-1">
                                <Button type="button" variant="outline" size="sm" onClick={resetAndClose}>
                                    Скрыть окно
                                </Button>
                            </div>
                        </div>
                    )}

                    {state.kind === 'success' && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                            Титул {titleType} подписан.
                        </div>
                    )}

                    {state.kind === 'timeout' && (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                                Подписание не завершено за 5 минут. Проверьте позже или повторите попытку.
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={resetAndClose}>
                                    Закрыть
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => setState({ kind: 'idle' })}
                                >
                                    Повторить
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </Dialog>
        </>
    );
}

export default SignTitleButton;
