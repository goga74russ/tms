'use client';

import { useState } from 'react';
import type { ProviderName } from '@tms/shared';
import { api } from '@/lib/api';

const SIG_OPTIONS: Array<{ id: ProviderName; title: string; description: string }> = [
    { id: 'gosklyuch', title: 'Госключ', description: 'ЭП от Минцифры — бесплатно для физлиц' },
    { id: 'kontur_sign', title: 'Контур.Подпись', description: 'УКЭП от УЦ Контура' },
    { id: 'sbis_sign', title: 'СБИС.Подпись', description: 'УКЭП от УЦ Тензор' },
    { id: 'cadesplugin', title: 'КриптоПро', description: 'Локальный токен через CADES плагин' },
];

interface Props {
    onNext: () => void;
    onBack: () => void;
}

export function StepSignature({ onNext, onBack }: Props) {
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
                providerType: 'signature',
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
                <h2 className="text-xl font-semibold text-slate-900">Шаг 5: Электронная подпись</h2>
                <p className="text-sm text-slate-500 mt-1">Чем будете подписывать документы? Большинство выбирают Госключ.</p>
            </div>

            <div className="space-y-2">
                {SIG_OPTIONS.map((opt) => (
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
