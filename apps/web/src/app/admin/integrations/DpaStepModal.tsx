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
import { MarkdownView } from '@/components/MarkdownView';

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

// MarkdownView extracted to apps/web/src/components/MarkdownView.tsx
// (W2 — shared between DpaStepModal, /legal/privacy, /legal/terms).
