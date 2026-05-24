'use client';

// ============================================================
// DPA Step Modal — шаг-1 перед CredentialModal.
//
// Поток:
//   1. GET /dpa/:providerId        → текст + version + hash
//   2. Если requires_acceptance=false → info-banner, кнопка «Продолжить»
//      просто закрывает шаг (без POST /accept).
//   3. Иначе → markdown рендер + чекбокс «ознакомлен» + кнопка
//      «Подтвердить и продолжить» → POST /accept → переход на шаг-2.
//
// Каллер передаёт onAccepted(); страница интеграций после получения
// колбэка открывает существующий CredentialModal.
// ============================================================
import { useEffect, useState } from 'react';
import { Loader2, Lock, Building2, AlertTriangle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

interface DpaDocument {
    providerId: string;
    providerLabel: string;
    category: string;
    owner: 'client' | 'vendor';
    version: string;
    effectiveFrom: string;
    requiresAcceptance: boolean;
    contentHash: string;
    content: string;
}

interface Props {
    providerId: string;
    onAccepted: () => void;
    onClose: () => void;
}

export function DpaStepModal({ providerId, onAccepted, onClose }: Props) {
    const [dpa, setDpa] = useState<DpaDocument | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [agreed, setAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await api.get<{ success: boolean; data: DpaDocument }>(
                    `/dpa/${encodeURIComponent(providerId)}`,
                );
                if (!cancelled) {
                    if (res.success) setDpa(res.data);
                    else setError('Не удалось загрузить текст согласия');
                }
            } catch (err: any) {
                if (!cancelled) setError(err?.message || 'Не удалось загрузить текст согласия');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [providerId]);

    async function handleAccept() {
        if (!dpa) return;
        setSubmitting(true);
        setError(null);
        try {
            // requires_acceptance=false — просто пропускаем дальше без записи.
            if (!dpa.requiresAcceptance) {
                onAccepted();
                return;
            }
            const res = await api.post<{ success: boolean; error?: string }>(
                `/dpa/${encodeURIComponent(providerId)}/accept`,
                { version: dpa.version, contentHash: dpa.contentHash },
            );
            if (!res.success) {
                setError(res.error || 'Не удалось записать согласие');
                return;
            }
            onAccepted();
        } catch (err: any) {
            setError(err?.message || 'Не удалось записать согласие');
        } finally {
            setSubmitting(false);
        }
    }

    const isVendorInfra = dpa?.owner === 'vendor' && dpa?.requiresAcceptance === false;
    const title = isVendorInfra
        ? `Использование сервисов TMS: ${dpa?.providerLabel ?? providerId}`
        : `Подключение к ${dpa?.providerLabel ?? providerId}`;

    return (
        <Dialog open onClose={onClose} title={title} size="xl">
            {loading ? (
                <div className="py-8 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
            ) : error || !dpa ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <div className="font-semibold mb-1">Не удалось загрузить согласие</div>
                        <div>{error || 'Документ не найден'}</div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Header strip */}
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 flex items-start gap-2">
                        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <div className="space-y-0.5">
                            <div>Версия документа: <strong>{dpa.version}</strong> (действует с {dpa.effectiveFrom})</div>
                            <div>SHA-256 контента: <code className="text-[10px]">{dpa.contentHash.slice(0, 16)}…</code></div>
                            {dpa.owner === 'vendor' && (
                                <div className="text-sky-700 font-medium mt-1 inline-flex items-center gap-1">
                                    <Building2 className="w-3 h-3" /> Сервис подключен TMS как vendor
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Content — markdown rendered */}
                    <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-4">
                        <MarkdownView source={dpa.content} />
                    </div>

                    {/* Accept block */}
                    {dpa.requiresAcceptance ? (
                        <div className="space-y-3">
                            <label className="flex items-start gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={(e) => setAgreed(e.target.checked)}
                                    disabled={submitting}
                                    className="mt-0.5 w-4 h-4 accent-brand-600"
                                />
                                <span className="text-sm text-neutral-800">
                                    Я ознакомлен(а) с текстом выше и даю согласие на обработку и передачу
                                    указанных данных провайдеру <strong>{dpa.providerLabel}</strong> в соответствии с условиями.
                                </span>
                            </label>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={onClose} disabled={submitting}>
                                    Отмена
                                </Button>
                                <Button onClick={handleAccept} disabled={!agreed || submitting}>
                                    {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                                    Подтвердить и продолжить
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                                Это уведомление в информационных целях. Согласие не требуется —
                                использование данного сервиса предусмотрено офертой TMS.
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button variant="outline" onClick={onClose} disabled={submitting}>
                                    <X className="w-3.5 h-3.5 mr-1" /> Закрыть
                                </Button>
                                <Button onClick={handleAccept} disabled={submitting}>
                                    Продолжить
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Dialog>
    );
}

// ============================================================
// Lightweight markdown renderer для DPA-текстов.
// Поддерживает: H1-H4, нумерованные/маркированные списки, **bold**,
// `inline code`, [text](url), > blockquote, --- horizontal rule.
// Без внешних deps. Если DPA-формат усложнится — заменить на react-markdown.
// ============================================================
function MarkdownView({ source }: { source: string }) {
    const blocks = parseMarkdownBlocks(source);
    return (
        <div className="prose prose-sm max-w-none text-neutral-800 leading-relaxed space-y-3">
            {blocks.map((b, i) => renderBlock(b, i))}
        </div>
    );
}

type Block =
    | { kind: 'h'; level: 1 | 2 | 3 | 4; text: string }
    | { kind: 'p'; text: string }
    | { kind: 'ul'; items: string[] }
    | { kind: 'ol'; items: string[] }
    | { kind: 'blockquote'; text: string }
    | { kind: 'hr' };

function parseMarkdownBlocks(src: string): Block[] {
    const lines = src.split(/\r?\n/);
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i] ?? '';
        if (line.trim() === '') { i++; continue; }
        if (line.trim() === '---') { blocks.push({ kind: 'hr' }); i++; continue; }
        const h = line.match(/^(#{1,4})\s+(.+)$/);
        if (h) {
            blocks.push({ kind: 'h', level: h[1]!.length as 1 | 2 | 3 | 4, text: h[2]! });
            i++; continue;
        }
        if (line.startsWith('> ') || line.startsWith('>')) {
            const acc: string[] = [];
            while (i < lines.length && (lines[i]!.startsWith('>') || lines[i]!.trim() === '')) {
                if (lines[i]!.trim() === '') break;
                acc.push(lines[i]!.replace(/^>\s?/, ''));
                i++;
            }
            blocks.push({ kind: 'blockquote', text: acc.join(' ') });
            continue;
        }
        // unordered list
        if (line.match(/^[-*]\s+/)) {
            const items: string[] = [];
            while (i < lines.length && lines[i]!.match(/^[-*]\s+/)) {
                items.push(lines[i]!.replace(/^[-*]\s+/, ''));
                i++;
            }
            blocks.push({ kind: 'ul', items });
            continue;
        }
        // ordered list
        if (line.match(/^\d+\.\s+/)) {
            const items: string[] = [];
            while (i < lines.length && lines[i]!.match(/^\d+\.\s+/)) {
                items.push(lines[i]!.replace(/^\d+\.\s+/, ''));
                i++;
            }
            blocks.push({ kind: 'ol', items });
            continue;
        }
        // paragraph (multi-line, до пустой строки)
        const para: string[] = [];
        while (i < lines.length && lines[i]!.trim() !== '' && !lines[i]!.match(/^(#{1,4}|[-*]\s|>\s|\d+\.\s|---$)/)) {
            para.push(lines[i]!);
            i++;
        }
        blocks.push({ kind: 'p', text: para.join(' ') });
    }
    return blocks;
}

function renderBlock(b: Block, key: number) {
    switch (b.kind) {
        case 'h':
            if (b.level === 1) return <h1 key={key} className="text-xl font-bold text-neutral-900 mt-4 mb-2">{renderInline(b.text)}</h1>;
            if (b.level === 2) return <h2 key={key} className="text-base font-semibold text-neutral-900 mt-4 mb-1.5">{renderInline(b.text)}</h2>;
            if (b.level === 3) return <h3 key={key} className="text-sm font-semibold text-neutral-800 mt-3 mb-1">{renderInline(b.text)}</h3>;
            return <h4 key={key} className="text-xs font-semibold uppercase tracking-wide text-neutral-600 mt-2 mb-1">{renderInline(b.text)}</h4>;
        case 'p':
            return <p key={key} className="text-sm">{renderInline(b.text)}</p>;
        case 'ul':
            return <ul key={key} className="list-disc list-outside pl-5 text-sm space-y-1">{b.items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}</ul>;
        case 'ol':
            return <ol key={key} className="list-decimal list-outside pl-5 text-sm space-y-1">{b.items.map((it, k) => <li key={k}>{renderInline(it)}</li>)}</ol>;
        case 'blockquote':
            return <blockquote key={key} className="border-l-2 border-amber-300 bg-amber-50/40 pl-3 py-2 text-sm text-amber-900 italic">{renderInline(b.text)}</blockquote>;
        case 'hr':
            return <hr key={key} className="border-neutral-200" />;
    }
}

/**
 * Inline-разметка: **bold**, `inline code`, [text](url).
 * Простой токенайзер. Регулярки match-as-go, без backtracking.
 */
function renderInline(text: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let rest = text;
    let key = 0;
    while (rest.length > 0) {
        const bold = rest.match(/^\*\*(.+?)\*\*/);
        if (bold) {
            out.push(<strong key={key++} className="font-semibold text-neutral-900">{bold[1]}</strong>);
            rest = rest.slice(bold[0].length);
            continue;
        }
        const code = rest.match(/^`([^`]+)`/);
        if (code) {
            out.push(<code key={key++} className="bg-neutral-100 text-neutral-800 px-1 rounded text-[12px] font-mono">{code[1]}</code>);
            rest = rest.slice(code[0].length);
            continue;
        }
        const link = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
        if (link) {
            out.push(<a key={key++} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">{link[1]}</a>);
            rest = rest.slice(link[0].length);
            continue;
        }
        // Plain text — берём до следующего markup-токена.
        const next = rest.search(/(\*\*|`|\[)/);
        if (next === -1) {
            out.push(<span key={key++}>{rest}</span>);
            rest = '';
        } else if (next === 0) {
            // Markup-токен не распознался (e.g. unmatched **) — съедаем символ.
            out.push(<span key={key++}>{rest[0]}</span>);
            rest = rest.slice(1);
        } else {
            out.push(<span key={key++}>{rest.slice(0, next)}</span>);
            rest = rest.slice(next);
        }
    }
    return out;
}
