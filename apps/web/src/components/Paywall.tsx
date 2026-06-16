// ============================================================
// Round 2B — Paywall modal.
// Drop-in for feature-gated screens: <Paywall open feature="ai_copilot" plan="free" onClose={...} />
// ============================================================
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Sparkles, X } from 'lucide-react';
import type { PlanId } from '@tms/shared';
import { PLAN_LABELS, AI_ASSISTANT_LABEL, label } from '@tms/shared';

const FEATURE_LABELS: Record<string, string> = {
    ai_copilot: AI_ASSISTANT_LABEL,
    edi: 'Электронный документооборот',
    marking: 'Честный знак',
    multi_tenant: 'Мульти-арендность',
    sso: 'Единый вход (SSO)',
    api_export: 'API экспорт',
    priority_support: 'Приоритетная поддержка',
    custom_integrations: 'Персональные интеграции',
};

export interface PaywallProps {
    open: boolean;
    feature?: string;
    /** Current plan (shown as "Ваш тариф: Бесплатный"). */
    currentPlan?: PlanId;
    /** Plan that unlocks the feature. Default 'pro'. */
    requiredPlan?: PlanId;
    /** Custom message — defaults to a feature-aware sentence. */
    message?: string;
    onClose: () => void;
}

export function Paywall({
    open,
    feature,
    currentPlan = 'free',
    requiredPlan = 'pro',
    message,
    onClose,
}: PaywallProps) {
    const router = useRouter();
    if (!open) return null;

    const featureLabel = feature ? FEATURE_LABELS[feature] ?? feature : 'эта функция';
    const text = message
        ?? `«${featureLabel}» доступна на тарифах ${label(PLAN_LABELS, requiredPlan)} и выше. Перейдите на платный тариф, чтобы продолжить.`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="paywall-title"
        >
            <div
                className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-700 p-1 rounded-lg hover:bg-neutral-100"
                    aria-label="Закрыть"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                        <Lock className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <h2 id="paywall-title" className="font-semibold text-neutral-900">Требуется тариф {label(PLAN_LABELS, requiredPlan)}</h2>
                        <p className="text-xs text-neutral-500">Ваш текущий тариф: {label(PLAN_LABELS, currentPlan)}</p>
                    </div>
                </div>

                <p className="text-sm text-neutral-700 leading-relaxed mb-6">{text}</p>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => router.push('/billing')}
                        className="flex-1 inline-flex items-center justify-center gap-2 bg-brand-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-brand-700 text-sm"
                    >
                        <Sparkles className="w-4 h-4" />
                        Перейти к тарифам
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
                    >
                        Не сейчас
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Paywall;
