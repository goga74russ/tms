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
    icon: LucideIcon;
}

const STEPS: StepMeta[] = [
    { key: 'inn', label: 'ИНН', title: 'Найдите вашу компанию', icon: Building2 },
    { key: 'profile', label: 'Реквизиты', title: 'Реквизиты компании', icon: ClipboardList },
    { key: 'scenario', label: 'Сценарий', title: 'Выберите сценарий', icon: Layers },
    { key: 'edi', label: 'ЭДО', title: 'Электронный документооборот', icon: FileText },
    { key: 'signature', label: 'Подпись', title: 'Электронная подпись', icon: PenLine },
    { key: 'team', label: 'Команда', title: 'Пригласите команду', icon: Users },
];

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
                    if (serverStep > 0) setStep(Math.min(STEPS.length, serverStep + 1));
                }
            })
            .catch(() => {
                /* user might be unauthenticated, fall through */
            })
            .finally(() => setLoadingStatus(false));
    }, []);

    const goNext = () => setStep((s) => Math.min(STEPS.length, s + 1));
    const goBack = () => setStep((s) => Math.max(1, s - 1));

    if (done) {
        return (
            <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-xl border border-neutral-200 p-10">
                    <div className="w-16 h-16 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-success-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Онбординг завершён</h1>
                    <p className="text-neutral-600 mt-2">
                        Всё готово к работе. Добро пожаловать в TMS!
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

    return (
        <div className="min-h-screen bg-neutral-50">
            <header className="bg-white border-b border-neutral-200">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
                    <Link href="/landing" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
                            <Truck className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-neutral-900">TMS</span>
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

            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
                {/* Progress */}
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5 sm:p-6 mb-6">
                    <div className="flex justify-between items-center relative">
                        <div
                            aria-hidden
                            className="absolute top-4 left-4 right-4 h-0.5 bg-neutral-200 -z-0"
                        />
                        <div
                            aria-hidden
                            className="absolute top-4 left-4 h-0.5 bg-success-500 -z-0 transition-all duration-300"
                            style={{
                                width: `calc((100% - 2rem) * ${(step - 1) / (STEPS.length - 1)})`,
                            }}
                        />
                        {STEPS.map((s, i) => {
                            const stepNum = i + 1;
                            const done = stepNum < step;
                            const active = stepNum === step;
                            return (
                                <div key={s.key} className="relative flex flex-col items-center z-10">
                                    <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ring-4 ring-white ${
                                            done
                                                ? 'bg-success-500 text-white'
                                                : active
                                                  ? 'bg-brand-600 text-white scale-110 shadow-md'
                                                  : 'bg-neutral-100 text-neutral-500'
                                        }`}
                                    >
                                        {done ? <Check className="w-4 h-4" /> : stepNum}
                                    </div>
                                    <div
                                        className={`hidden sm:block mt-2 text-[11px] font-medium ${
                                            active ? 'text-brand-700' : done ? 'text-neutral-700' : 'text-neutral-400'
                                        }`}
                                    >
                                        {s.label}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Title */}
                <div className="mb-5">
                    <div className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-1">
                        Шаг {step} из {STEPS.length}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight flex items-center gap-3">
                        {currentMeta && (
                            <span className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
                                <currentMeta.icon className="w-5 h-5 text-brand-600" />
                            </span>
                        )}
                        {currentMeta?.title}
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
        </div>
    );
}
