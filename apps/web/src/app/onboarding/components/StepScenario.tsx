'use client';

import { useState } from 'react';
import type { OnboardingScenario } from '@tms/shared';
import { api } from '@/lib/api';

const SCENARIOS: Array<{
    id: OnboardingScenario;
    title: string;
    description: string;
    badge: string;
}> = [
    { id: 'small', title: 'Малый ИП', description: 'До 5 машин, без ЭДО, ручные путевые', badge: 'Минимум' },
    { id: 'medium_kontur', title: 'Средний — Контур', description: 'ЭДО через Контур.Диадок, Контур.Подпись', badge: 'Популярный' },
    { id: 'medium_sbis', title: 'Средний — СБИС', description: 'ЭДО через СБИС, СБИС.Подпись', badge: 'Альтернатива' },
    { id: 'enterprise', title: 'Крупный', description: 'Полный стек: ЭДО + телематика + ГИС + платежи', badge: 'Максимум' },
];

interface Props {
    onNext: () => void;
    onBack: () => void;
}

export function StepScenario({ onNext, onBack }: Props) {
    const [selected, setSelected] = useState<OnboardingScenario | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        if (!selected) return;
        setError(null);
        setSaving(true);
        try {
            const res = await api.post<{ success: boolean; error?: string }>('/onboarding/select-scenario', { scenario: selected });
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
                <h2 className="text-xl font-semibold text-slate-900">Шаг 3: Выберите сценарий</h2>
                <p className="text-sm text-slate-500 mt-1">Подберём набор интеграций под ваш масштаб. Можно изменить позже.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {SCENARIOS.map((s) => (
                    <button
                        key={s.id}
                        onClick={() => setSelected(s.id)}
                        className={`text-left p-4 rounded-xl border-2 transition-all ${
                            selected === s.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                    >
                        <div className="text-xs font-semibold text-indigo-600 mb-1">{s.badge}</div>
                        <div className="text-base font-semibold text-slate-900">{s.title}</div>
                        <div className="text-xs text-slate-500 mt-2">{s.description}</div>
                    </button>
                ))}
            </div>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">{error}</div>}

            <div className="flex justify-between">
                <button onClick={onBack} className="text-sm text-slate-600 hover:underline">← Назад</button>
                <button
                    onClick={submit}
                    disabled={saving || !selected}
                    className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                    {saving ? 'Сохраняем...' : 'Далее →'}
                </button>
            </div>
        </div>
    );
}
