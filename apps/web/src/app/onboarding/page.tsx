'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { OnboardingStatus } from '@tms/shared';
import { StepInn } from './components/StepInn';
import { StepProfile } from './components/StepProfile';
import { StepScenario } from './components/StepScenario';
import { StepEdi } from './components/StepEdi';
import { StepSignature } from './components/StepSignature';
import { StepTeam } from './components/StepTeam';

const STEP_LABELS = ['ИНН', 'Реквизиты', 'Сценарий', 'ЭДО', 'Подпись', 'Команда'];

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

    // Resume from server-side state on mount.
    useEffect(() => {
        api.get<{ success: boolean; data?: OnboardingStatus }>('/onboarding/status').then((res) => {
            if (res.success && res.data) {
                if (res.data.completed) {
                    setDone(true);
                    return;
                }
                const serverStep = res.data.step;
                if (serverStep > 0) setStep(Math.min(6, serverStep + 1));
            }
        }).catch(() => { /* user might be unauthenticated, fall through */ });
    }, []);

    const goNext = () => setStep((s) => Math.min(6, s + 1));
    const goBack = () => setStep((s) => Math.max(1, s - 1));

    if (done) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="max-w-md text-center bg-white rounded-2xl shadow-xl p-8">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-slate-900">Онбординг завершён</h1>
                    <p className="text-slate-500 mt-2">Добро пожаловать в TMS.</p>
                    <button
                        onClick={() => router.push('/admin/users')}
                        className="mt-6 bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700"
                    >
                        Перейти в админку →
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
                {/* Progress bar */}
                <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
                    <div className="flex justify-between mb-2">
                        {STEP_LABELS.map((label, i) => (
                            <div key={i} className="flex-1 text-center">
                                <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                                    i + 1 < step ? 'bg-green-500 text-white' :
                                    i + 1 === step ? 'bg-indigo-600 text-white' :
                                    'bg-slate-200 text-slate-500'
                                }`}>
                                    {i + 1 < step ? '✓' : i + 1}
                                </div>
                                <div className="text-xs mt-1 text-slate-600 hidden md:block">{label}</div>
                            </div>
                        ))}
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                        <div
                            className="h-full bg-indigo-600 transition-all duration-300"
                            style={{ width: `${(step / 6) * 100}%` }}
                        />
                    </div>
                </div>

                {/* Step content */}
                <div className="bg-white rounded-2xl shadow-sm p-8">
                    {step === 1 && <StepInn onNext={(r) => { setInnResult(r); goNext(); }} />}
                    {step === 2 && <StepProfile initial={innResult} onNext={goNext} onBack={goBack} />}
                    {step === 3 && <StepScenario onNext={goNext} onBack={goBack} />}
                    {step === 4 && <StepEdi onNext={goNext} onBack={goBack} />}
                    {step === 5 && <StepSignature onNext={goNext} onBack={goBack} />}
                    {step === 6 && <StepTeam onComplete={() => setDone(true)} onBack={goBack} />}
                </div>
            </div>
        </div>
    );
}
