'use client';

import { useState } from 'react';
import type { ProviderName } from '@tms/shared';
import { api } from '@/lib/api';

const EDI_OPTIONS: Array<{ id: ProviderName; title: string; description: string }> = [
    { id: 'diadoc', title: 'Контур.Диадок', description: 'Самый популярный ЭДО — ТТН, СФ, акты' },
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
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!choice && !defer) return;
        setError(null);
        setSaving(true);
        try {
            const res = await api.post<{ success: boolean; error?: string }>('/onboarding/save-integration-choice', {
                providerType: 'edi',
                providerName: choice ?? 'mock',
                defer,
            });
            if (!res.success) {
                setError(res.error ?? 'Ошибка');
                return;
            }
            onNext();
        } catch (err: unknown) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-xl font-semibold text-slate-900">Шаг 4: Электронный документооборот</h2>
                <p className="text-sm text-slate-500 mt-1">С каким оператором ЭДО вы работаете? Ключи API введёте позже в кабинете.</p>
            </div>

            <div className="space-y-2">
                {EDI_OPTIONS.map((opt) => (
                    <button
                        key={opt.id}
                        onClick={() => { setChoice(opt.id); setDefer(false); }}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                            choice === opt.id && !defer ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                    >
                        <div className="font-semibold text-slate-900">{opt.title}</div>
                        <div className="text-xs text-slate-500">{opt.description}</div>
                    </button>
                ))}
                <button
                    onClick={() => { setChoice(null); setDefer(true); }}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        defer ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                >
                    <div className="font-semibold text-slate-700">Подключу позже</div>
                    <div className="text-xs text-slate-500">Можно настроить в админке /admin/integrations</div>
                </button>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">{error}</div>}

            <div className="flex justify-between">
                <button onClick={onBack} className="text-sm text-slate-600 hover:underline">← Назад</button>
                <button
                    onClick={submit}
                    disabled={saving || (!choice && !defer)}
                    className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                    {saving ? 'Сохраняем...' : 'Далее →'}
                </button>
            </div>
        </div>
    );
}
