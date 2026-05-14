'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, User, Building, Briefcase, Factory, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OnboardingScenario } from '@tms/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface Scenario {
    id: OnboardingScenario;
    title: string;
    description: string;
    badge: string;
    icon: LucideIcon;
    features: string[];
}

const SCENARIOS: Scenario[] = [
    {
        id: 'small',
        title: 'Малый ИП',
        description: 'До 5 машин, без ЭДО',
        badge: 'Минимум',
        icon: User,
        features: ['Ручные путевые', 'Базовый биллинг', 'Без интеграций'],
    },
    {
        id: 'medium_kontur',
        title: 'Средний — Контур',
        description: 'ЭДО через Контур.Диадок',
        badge: 'Популярный',
        icon: Building,
        features: ['Контур.Диадок', 'Контур.Подпись', 'ОСАГО-мониторинг'],
    },
    {
        id: 'medium_sbis',
        title: 'Средний — СБИС',
        description: 'ЭДО через СБИС',
        badge: 'Альтернатива',
        icon: Briefcase,
        features: ['СБИС.Документы', 'СБИС.Подпись', 'Та же логика, другой оператор'],
    },
    {
        id: 'enterprise',
        title: 'Крупный',
        description: 'Полный стек интеграций',
        badge: 'Максимум',
        icon: Factory,
        features: ['Wialon live', 'Тахограф DDD', 'Маркировка + ГИС'],
    },
];

interface Props {
    onNext: () => void;
    onBack: () => void;
}

export function StepScenario({ onNext, onBack }: Props) {
    const [selected, setSelected] = useState<OnboardingScenario | null>(null);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    const submit = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const res = await api.post<{ success: boolean; error?: string }>('/onboarding/select-scenario', {
                scenario: selected,
            });
            if (!res.success) {
                toast({
                    variant: 'error',
                    title: 'Не удалось сохранить',
                    description: res.error ?? 'Попробуйте ещё раз.',
                });
                return;
            }
            toast({ variant: 'success', title: 'Сценарий выбран' });
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
                Подберём набор интеграций под ваш масштаб. Можно изменить позже в админке.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SCENARIOS.map((s) => {
                    const Icon = s.icon;
                    const isActive = selected === s.id;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelected(s.id)}
                            className={`relative text-left p-5 rounded-2xl border-2 transition-all ${
                                isActive
                                    ? 'border-brand-500 bg-brand-50/50 shadow-md'
                                    : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                            }`}
                        >
                            {isActive && (
                                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center">
                                    <Check className="w-3.5 h-3.5" />
                                </div>
                            )}
                            <div className="flex items-center gap-3 mb-3">
                                <div
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                        isActive ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-600'
                                    }`}
                                >
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                                        {s.badge}
                                    </div>
                                    <div className="text-base font-semibold text-neutral-900">{s.title}</div>
                                </div>
                            </div>
                            <p className="text-xs text-neutral-600 mb-3">{s.description}</p>
                            <ul className="space-y-1">
                                {s.features.map((f) => (
                                    <li key={f} className="text-xs text-neutral-600 flex items-center gap-1.5">
                                        <Check className="w-3 h-3 text-success-600 shrink-0" /> {f}
                                    </li>
                                ))}
                            </ul>
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                <Button variant="ghost" onClick={onBack} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                    Назад
                </Button>
                <Button
                    variant="brand"
                    onClick={submit}
                    isLoading={saving}
                    disabled={!selected || saving}
                    rightIcon={!saving ? <ArrowRight className="w-4 h-4" /> : undefined}
                    title={!selected ? 'Выберите сценарий перевозок выше, чтобы продолжить' : undefined}
                >
                    Далее
                </Button>
            </div>
        </div>
    );
}
