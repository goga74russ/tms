'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, FileText, Info } from 'lucide-react';
import type { ProviderName } from '@tms/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

interface EdiOption {
    id: ProviderName;
    title: string;
    description: string;
    badge?: string;
}

const EDI_OPTIONS: EdiOption[] = [
    { id: 'diadoc', title: 'Контур.Диадок', description: 'Самый популярный ЭДО — ТТН, СФ, акты', badge: 'Популярный' },
    { id: 'sbis', title: 'СБИС', description: 'Альтернатива Диадоку, тот же функционал' },
    { id: 'kaluga_astral', title: 'Калуга Астрал', description: 'Бюджетный вариант для малого бизнеса' },
    { id: 'taxcom', title: 'Такском', description: 'Старейший оператор ЭДО в РФ' },
];

interface Props {
    onNext: () => void;
    onBack: () => void;
}

export function StepEdi({ onNext, onBack }: Props) {
    const [choice, setChoice] = useState<ProviderName | null>(null);
    const [defer, setDefer] = useState(false);
    const [login, setLogin] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    const submit = async () => {
        if (!choice && !defer) return;
        setSaving(true);
        try {
            const res = await api.post<{ success: boolean; error?: string }>(
                '/onboarding/save-integration-choice',
                {
                    providerType: 'edi',
                    providerName: choice ?? 'mock',
                    defer,
                    credentials: choice && !defer && (login || apiKey) ? { login, apiKey } : undefined,
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
                title: defer ? 'Решение отложено' : 'ЭДО подключён',
                description: defer ? 'Настроите позже в админке.' : 'Готов к выпуску ЭТрН.',
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
                С каким оператором ЭДО вы работаете? Ключи API можно ввести сейчас или позже.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EDI_OPTIONS.map((opt) => {
                    const isActive = choice === opt.id && !defer;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                                setChoice(opt.id);
                                setDefer(false);
                            }}
                            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                                isActive
                                    ? 'border-brand-500 bg-brand-50/50 shadow-md'
                                    : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                            }`}
                        >
                            {isActive && (
                                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center">
                                    <Check className="w-3 h-3" />
                                </div>
                            )}
                            <div className="flex items-center gap-2.5 mb-1">
                                <div
                                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                        isActive ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-600'
                                    }`}
                                >
                                    <FileText className="w-4 h-4" />
                                </div>
                                <div className="font-semibold text-neutral-900 text-sm">{opt.title}</div>
                                {opt.badge && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-success-700 bg-success-50 border border-success-100 px-1.5 py-0.5 rounded-full">
                                        {opt.badge}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-neutral-500 pl-11.5">{opt.description}</p>
                        </button>
                    );
                })}

                <button
                    type="button"
                    onClick={() => {
                        setChoice(null);
                        setDefer(true);
                    }}
                    className={`sm:col-span-2 relative text-left p-4 rounded-xl border-2 transition-all ${
                        defer
                            ? 'border-neutral-400 bg-neutral-50'
                            : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                >
                    {defer && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-neutral-600 text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                        </div>
                    )}
                    <div className="flex items-center gap-2.5">
                        <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                defer ? 'bg-neutral-600 text-white' : 'bg-neutral-100 text-neutral-500'
                            }`}
                        >
                            <Clock className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="font-semibold text-neutral-700 text-sm">Подключу позже</div>
                            <p className="text-xs text-neutral-500">
                                Можно настроить в админке /admin/integrations
                            </p>
                        </div>
                    </div>
                </button>
            </div>

            {choice && !defer && (
                <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="flex items-start gap-2 text-xs text-brand-700">
                        <Info className="w-3.5 h-3.5 mt-0.5" />
                        <span>
                            Введите учётные данные API. Поля необязательные — можно заполнить позже в админке.
                        </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input label="Логин / Box ID" value={login} onChange={(e) => setLogin(e.target.value)} />
                        <Input
                            label="API-ключ"
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                        />
                    </div>
                </div>
            )}

            {defer && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 leading-relaxed">
                    Без ЭДО можно работать в бесплатном режиме — путевые листы и осмотры формируются локально.
                    ЭТрН и обмен с контрагентами доступны на тарифах Pro и Business после подключения оператора.
                </div>
            )}

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
