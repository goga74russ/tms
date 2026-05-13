'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, KeyRound, Sparkles } from 'lucide-react';
import type { ProviderName } from '@tms/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface SigOption {
    id: ProviderName;
    title: string;
    description: string;
    recommended?: boolean;
    free?: boolean;
}

const SIG_OPTIONS: SigOption[] = [
    {
        id: 'gosklyuch',
        title: 'Госключ',
        description: 'ЭП от Минцифры — бесплатно для физлиц и ИП',
        recommended: true,
        free: true,
    },
    { id: 'kontur_sign', title: 'Контур.Подпись', description: 'УКЭП от УЦ Контура' },
    { id: 'sbis_sign', title: 'СБИС.Подпись', description: 'УКЭП от УЦ Тензор' },
    { id: 'cadesplugin', title: 'КриптоПро', description: 'Локальный токен через CADES-плагин' },
];

interface Props {
    onNext: () => void;
    onBack: () => void;
}

export function StepSignature({ onNext, onBack }: Props) {
    const [choice, setChoice] = useState<ProviderName | null>(null);
    const [defer, setDefer] = useState(false);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    const submit = async () => {
        if (!choice && !defer) return;
        setSaving(true);
        try {
            const res = await api.post<{ success: boolean; error?: string }>(
                '/onboarding/save-integration-choice',
                {
                    providerType: 'signature',
                    providerName: choice ?? 'mock',
                    defer,
                },
            );
            if (!res.success) {
                toast({
                    variant: 'error',
                    title: 'Не удалось сохранить',
                    description: res.error ?? 'Попробуйте ещё раз.',
                });
                return;
            }
            toast({
                variant: 'success',
                title: defer ? 'Решение отложено' : 'Подпись подключена',
            });
            onNext();
        } catch (err: unknown) {
            toast({
                variant: 'error',
                title: 'Ошибка',
                description: (err as Error).message ?? 'Попробуйте ещё раз',
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <p className="text-sm text-neutral-600">
                Чем будете подписывать документы? Большинство ИП выбирают Госключ — это бесплатно.
            </p>

            <div className="space-y-2">
                {SIG_OPTIONS.map((opt) => {
                    const isActive = choice === opt.id && !defer;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                                setChoice(opt.id);
                                setDefer(false);
                            }}
                            className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                                isActive
                                    ? 'border-brand-500 bg-brand-50/50 shadow-md'
                                    : opt.recommended
                                      ? 'border-success-200 bg-success-50/30 hover:border-success-300'
                                      : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                            }`}
                        >
                            <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    isActive
                                        ? 'bg-brand-600 text-white'
                                        : opt.recommended
                                          ? 'bg-success-100 text-success-700'
                                          : 'bg-neutral-100 text-neutral-600'
                                }`}
                            >
                                <KeyRound className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-neutral-900 text-sm">{opt.title}</span>
                                    {opt.recommended && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-success-700 bg-success-50 border border-success-200 px-1.5 py-0.5 rounded-full">
                                            <Sparkles className="w-2.5 h-2.5" /> Рекомендуется для ИП
                                        </span>
                                    )}
                                    {opt.free && (
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 bg-brand-50 border border-brand-100 px-1.5 py-0.5 rounded-full">
                                            Бесплатно
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-neutral-600 mt-0.5">{opt.description}</p>
                            </div>
                            {isActive && (
                                <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center shrink-0">
                                    <Check className="w-3.5 h-3.5" />
                                </div>
                            )}
                        </button>
                    );
                })}

                <button
                    type="button"
                    onClick={() => {
                        setChoice(null);
                        setDefer(true);
                    }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${
                        defer
                            ? 'border-neutral-400 bg-neutral-50'
                            : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                >
                    <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            defer ? 'bg-neutral-600 text-white' : 'bg-neutral-100 text-neutral-500'
                        }`}
                    >
                        <Clock className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <div className="font-semibold text-neutral-700 text-sm">Подключу позже</div>
                        <p className="text-xs text-neutral-500">Можно настроить в /admin/integrations</p>
                    </div>
                    {defer && (
                        <div className="w-6 h-6 rounded-full bg-neutral-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5" />
                        </div>
                    )}
                </button>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                <Button variant="ghost" onClick={onBack} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                    Назад
                </Button>
                <Button
                    variant="brand"
                    onClick={submit}
                    isLoading={saving}
                    disabled={(!choice && !defer) || saving}
                    rightIcon={!saving ? <ArrowRight className="w-4 h-4" /> : undefined}
                >
                    Далее
                </Button>
            </div>
        </div>
    );
}
