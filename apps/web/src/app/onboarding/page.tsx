'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    CheckCircle2,
    Check,
    Truck,
    LogOut,
    Building2,
    ClipboardList,
    Layers,
    FileText,
    PenLine,
    Users,
    ArrowRight,
    Info,
    Lightbulb,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import type { OnboardingStatus } from '@tms/shared';
import { Button } from '@/components/ui/button';
import { StepInn } from './components/StepInn';
import { StepProfile } from './components/StepProfile';
import { StepScenario } from './components/StepScenario';
import { StepEdi } from './components/StepEdi';
import { StepSignature } from './components/StepSignature';
import { StepTeam } from './components/StepTeam';

interface StepMeta {
    key: string;
    label: string;
    title: string;
    subtitle: string;
    icon: LucideIcon;
    optional?: boolean;
}

const STEPS: StepMeta[] = [
    { key: 'inn', label: 'ИНН', title: 'Найдите вашу компанию', subtitle: 'Поиск по реестру', icon: Building2 },
    { key: 'profile', label: 'Реквизиты', title: 'Реквизиты компании', subtitle: 'Подтвердите данные', icon: ClipboardList },
    { key: 'scenario', label: 'Сценарий', title: 'Выберите сценарий', subtitle: 'Что подключаем', icon: Layers },
    { key: 'edi', label: 'ЭДО', title: 'Электронный документооборот', subtitle: 'Опционально', icon: FileText, optional: true },
    { key: 'signature', label: 'Подпись', title: 'Электронная подпись', subtitle: 'Госключ или КЭП', icon: PenLine, optional: true },
    { key: 'team', label: 'Команда', title: 'Пригласите команду', subtitle: 'Опционально', icon: Users, optional: true },
];

const STEP_HELP: Record<string, { title: string; bullets: string[]; skipHint?: string }> = {
    inn: {
        title: 'Зачем это нужно',
        bullets: [
            'ИНН подтянет название, КПП, ОГРН и адрес автоматически из госреестра.',
            'Если вы ИП — введите ИНН физлица (12 цифр).',
            'Данные можно отредактировать вручную на следующем шаге.',
        ],
    },
    profile: {
        title: 'Реквизиты',
        bullets: [
            'Подтвердите данные, которые подтянулись из госреестра.',
            'КПП и ОГРН можно отредактировать, если изменились.',
            'Эти данные используются для счетов и закрывающих документов.',
        ],
    },
    scenario: {
        title: 'Сценарий работы',
        bullets: [
            'Сценарий определяет, какие интеграции подключать на следующих шагах.',
            'Изменить сценарий можно позже в настройках.',
            'Если не уверены — выберите «Базовый», подключим остальное по запросу.',
        ],
    },
    edi: {
        title: 'ЭДО — зачем',
        bullets: [
            'Без ЭДО можно работать в free-box режиме (закрывающие документы — на бумаге).',
            'Подключить ЭДО можно позже через /admin/integrations.',
            'Поддерживаем Контур.Диадок, СБИС, Тензор.',
        ],
        skipHint: 'Этот шаг можно пропустить — настроите позже.',
    },
    signature: {
        title: 'Электронная подпись',
        bullets: [
            'Госключ — бесплатный мобильный сервис ФНС для ИП и физлиц.',
            'Для ООО потребуется КЭП от удостоверяющего центра.',
            'Без ЭП работать тоже можно, но подписание документов будет недоступно.',
        ],
        skipHint: 'Можно подключить позже из профиля.',
    },
    team: {
        title: 'Команда',
        bullets: [
            'Пригласите коллег по email — они получат magic-link.',
            'Роли (диспетчер, логист, бухгалтер...) можно назначить сразу.',
            'Если работаете один — пропустите шаг и пригласите команду позже.',
        ],
        skipHint: 'Пригласить можно в любой момент из /admin/users.',
    },
};

interface DaDataResult {
    inn: string;
    name: string;
    fullName: string;
    kpp: string;
    ogrn: string;
    legalAddress: string;
    actualAddress: string;
    managementName: string;
}

export default function OnboardingPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [maxReachedStep, setMaxReachedStep] = useState(1);
    const [innResult, setInnResult] = useState<DaDataResult | null>(null);
    const [done, setDone] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState(true);

    useEffect(() => {
        api.get<{ success: boolean; data?: OnboardingStatus }>('/onboarding/status')
            .then((res) => {
                if (res.success && res.data) {
                    if (res.data.completed) {
                        setDone(true);
                        return;
                    }
                    const serverStep = res.data.step;
                    if (serverStep > 0) {
                        const next = Math.min(STEPS.length, serverStep + 1);
                        setStep(next);
                        setMaxReachedStep(next);
                    }
                }
            })
            .catch(() => {
                /* user might be unauthenticated, fall through */
            })
            .finally(() => setLoadingStatus(false));
    }, []);

    const goNext = () => {
        setStep((s) => {
            const next = Math.min(STEPS.length, s + 1);
            setMaxReachedStep((m) => Math.max(m, next));
            return next;
        });
    };
    const goBack = () => setStep((s) => Math.max(1, s - 1));
    const jumpTo = (target: number) => {
        if (target <= maxReachedStep) setStep(target);
    };

    if (done) {
        return (
            <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-xl border border-neutral-200 p-10">
                    <div className="w-16 h-16 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-success-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Онбординг завершён</h1>
                    <p className="text-neutral-600 mt-2">
                        Всё готово к работе. Добро пожаловать в ТрансПульт!
                    </p>
                    <div className="mt-7 flex flex-col gap-2">
                        <Button
                            variant="brand"
                            size="lg"
                            fullWidth
                            onClick={() => router.push('/dispatcher')}
                            rightIcon={<ArrowRight className="w-4 h-4" />}
                        >
                            Перейти в диспетчерскую
                        </Button>
                        <Button
                            variant="ghost"
                            size="default"
                            fullWidth
                            onClick={() => router.push('/admin/users')}
                        >
                            Открыть админку
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const currentMeta = STEPS[step - 1];
    const currentHelp = currentMeta ? STEP_HELP[currentMeta.key] : null;
    const progressPct = Math.round(((step - 1) / (STEPS.length - 1)) * 100);

    return (
        <div className="min-h-screen bg-neutral-50">
            <header className="bg-white border-b border-neutral-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
                    <Link href="/landing" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
                            <Truck className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-neutral-900">ТрансПульт</span>
                    </Link>
                    <button
                        type="button"
                        onClick={() => router.push('/dispatcher')}
                        className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 font-medium"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Сохранить и выйти
                    </button>
                </div>
            </header>

            {/* Mobile progress bar (<lg) */}
            <div className="lg:hidden bg-white border-b border-neutral-200 px-4 py-3">
                <div className="flex items-center justify-between mb-2 text-xs">
                    <span className="font-semibold text-neutral-900">
                        Шаг {step} из {STEPS.length}
                        <span className="text-neutral-500 font-normal ml-2">{currentMeta?.label}</span>
                    </span>
                    <span className="text-neutral-500 tabular-nums">{progressPct}%</span>
                </div>
                <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-brand-600 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_280px] gap-6">
                {/* Vertical stepper (lg+) */}
                <aside className="hidden lg:block">
                    <nav className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 sticky top-6" aria-label="Шаги онбординга">
                        <div className="px-2 pb-3 mb-2 border-b border-neutral-100">
                            <div className="text-[11px] font-semibold text-brand-600 uppercase tracking-wider">Онбординг</div>
                            <div className="text-sm font-bold text-neutral-900 mt-0.5">
                                Шаг {step} из {STEPS.length}
                            </div>
                            <div className="mt-2 h-1 bg-neutral-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-brand-600 transition-all duration-300"
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                        </div>
                        <ol className="space-y-1">
                            {STEPS.map((s, i) => {
                                const stepNum = i + 1;
                                const isDone = stepNum < step;
                                const isActive = stepNum === step;
                                const isClickable = stepNum <= maxReachedStep && stepNum !== step;
                                const Icon = s.icon;
                                return (
                                    <li key={s.key}>
                                        <button
                                            type="button"
                                            onClick={() => jumpTo(stepNum)}
                                            disabled={!isClickable}
                                            aria-current={isActive ? 'step' : undefined}
                                            className={`w-full flex items-start gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                                                isActive
                                                    ? 'bg-brand-50'
                                                    : isClickable
                                                      ? 'hover:bg-neutral-50 cursor-pointer'
                                                      : 'cursor-default'
                                            }`}
                                        >
                                            <span
                                                className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all ${
                                                    isDone
                                                        ? 'bg-success-500 text-white'
                                                        : isActive
                                                          ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                                                          : 'bg-neutral-100 text-neutral-400 border border-neutral-200'
                                                }`}
                                            >
                                                {isDone ? <Check className="w-4 h-4" /> : stepNum}
                                            </span>
                                            <span className="flex-1 min-w-0">
                                                <span className={`flex items-center gap-1.5 text-sm font-semibold ${
                                                    isActive ? 'text-brand-700' : isDone ? 'text-neutral-900' : 'text-neutral-500'
                                                }`}>
                                                    <Icon className="w-3.5 h-3.5 opacity-70" />
                                                    {s.label}
                                                </span>
                                                <span className={`block text-[11px] mt-0.5 ${
                                                    isActive ? 'text-brand-600' : 'text-neutral-400'
                                                }`}>
                                                    {s.subtitle}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    </nav>
                </aside>

                {/* Main content */}
                <div className="min-w-0">
                    {/* Title */}
                    <div className="mb-5">
                        <div className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-1">
                            Шаг {step} из {STEPS.length}{currentMeta?.optional ? ' · опционально' : ''}
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight flex items-center gap-3">
                            {currentMeta && (
                                <span className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                                    <currentMeta.icon className="w-5 h-5 text-brand-600" />
                                </span>
                            )}
                            <span className="min-w-0">{currentMeta?.title}</span>
                        </h1>
                    </div>

                    {/* Step content */}
                    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8">
                        {loadingStatus ? (
                            <div className="space-y-4 animate-pulse">
                                <div className="h-4 bg-neutral-100 rounded w-1/2" />
                                <div className="h-10 bg-neutral-100 rounded" />
                                <div className="h-10 bg-neutral-100 rounded w-1/3" />
                            </div>
                        ) : (
                            <div key={step} className="animate-in fade-in duration-200">
                                {step === 1 && <StepInn onNext={(r) => { setInnResult(r); goNext(); }} />}
                                {step === 2 && <StepProfile initial={innResult} onNext={goNext} onBack={goBack} />}
                                {step === 3 && <StepScenario onNext={goNext} onBack={goBack} />}
                                {step === 4 && <StepEdi onNext={goNext} onBack={goBack} />}
                                {step === 5 && <StepSignature onNext={goNext} onBack={goBack} />}
                                {step === 6 && <StepTeam onComplete={() => setDone(true)} onBack={goBack} />}
                            </div>
                        )}
                    </div>
                </div>

                {/* Help panel (xl+) */}
                <aside className="hidden xl:block">
                    {currentHelp ? (
                        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 sticky top-6 space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                                    <Lightbulb className="w-4 h-4 text-amber-600" />
                                </span>
                                <h2 className="text-sm font-bold text-neutral-900">{currentHelp.title}</h2>
                            </div>
                            <ul className="space-y-2.5">
                                {currentHelp.bullets.map((b) => (
                                    <li key={b} className="flex gap-2 text-xs text-neutral-600 leading-relaxed">
                                        <span className="mt-1 w-1 h-1 rounded-full bg-brand-500 shrink-0" />
                                        <span>{b}</span>
                                    </li>
                                ))}
                            </ul>
                            {currentHelp.skipHint && currentMeta?.optional ? (
                                <div className="flex items-start gap-2 rounded-lg bg-neutral-50 border border-neutral-100 p-3 text-xs text-neutral-600">
                                    <Info className="w-3.5 h-3.5 text-neutral-400 mt-0.5 shrink-0" />
                                    <span>{currentHelp.skipHint}</span>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </aside>
            </div>
        </div>
    );
}
