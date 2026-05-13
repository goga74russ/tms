'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';

type Billing = 'monthly' | 'yearly';

interface Plan {
    name: string;
    description: string;
    priceMonthly: number; // ₽ / month
    features: string[];
    cta: string;
    href: string;
    accent?: boolean;
}

const PLANS: Plan[] = [
    {
        name: 'Free',
        description: 'Для микропарка и тестирования',
        priceMonthly: 0,
        features: [
            'До 5 машин',
            'До 50 заказов в месяц',
            'Путевые листы и осмотры',
            'Базовый биллинг',
            'Сообщество и e-mail-поддержка',
        ],
        cta: 'Начать бесплатно',
        href: '/signup',
    },
    {
        name: 'Pro',
        description: 'Для растущих перевозчиков',
        priceMonthly: 4990,
        features: [
            'До 30 машин',
            'Безлимит заказов',
            'ИИ-копилот: 500 запросов/день',
            'ЭДО (Диадок, СБИС, Калуга, Такском)',
            'Маркировка «Честный знак»',
            'ОСАГО-мониторинг',
            'Приоритетная поддержка 4 часа',
        ],
        cta: 'Попробовать Pro',
        href: '/signup?plan=pro',
        accent: true,
    },
    {
        name: 'Business',
        description: 'Для крупных автопарков',
        priceMonthly: 14990,
        features: [
            'До 100 машин',
            'Безлимит заказов',
            'ИИ-копилот: 2 000 запросов/день',
            'Wialon live, тахограф DDD',
            'КС-2 / КС-3 для стройки',
            'Cold chain SLA',
            'Выделенный аккаунт-менеджер',
        ],
        cta: 'Перейти на Business',
        href: '/signup?plan=business',
    },
];

function formatPrice(n: number): string {
    if (n === 0) return '0 ₽';
    return `${n.toLocaleString('ru-RU')} ₽`;
}

export function Pricing() {
    const [billing, setBilling] = useState<Billing>('monthly');
    const discount = 0.8; // 20% off yearly

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="text-center max-w-2xl mx-auto mb-10">
                <div className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-2">Тарифы</div>
                <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight mb-3">
                    Старт без оплаты. Платите только за нужные функции.
                </h2>
                <p className="text-neutral-600 leading-relaxed">
                    Бесплатно навсегда для микропарка. Платные тарифы — с месячной или годовой оплатой.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 border border-neutral-200 text-xs text-neutral-700">
                    Enterprise — <span className="font-semibold text-neutral-900">по запросу</span>
                </div>
            </div>

            {/* Billing toggle */}
            <div className="flex justify-center mb-10">
                <div className="inline-flex items-center bg-neutral-100 rounded-xl p-1">
                    <button
                        type="button"
                        onClick={() => setBilling('monthly')}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                            billing === 'monthly'
                                ? 'bg-white text-neutral-900 shadow-sm'
                                : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                    >
                        Помесячно
                    </button>
                    <button
                        type="button"
                        onClick={() => setBilling('yearly')}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all inline-flex items-center gap-1.5 ${
                            billing === 'yearly'
                                ? 'bg-white text-neutral-900 shadow-sm'
                                : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                    >
                        Годовой
                        <span className="text-[10px] font-bold uppercase text-success-700 bg-success-50 border border-success-100 px-1.5 py-0.5 rounded-full">
                            −20%
                        </span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {PLANS.map((p) => {
                    const monthly =
                        billing === 'yearly' ? Math.round(p.priceMonthly * discount) : p.priceMonthly;
                    return (
                        <div
                            key={p.name}
                            className={`relative rounded-2xl border p-7 flex flex-col transition-shadow ${
                                p.accent
                                    ? 'bg-white border-brand-500 ring-2 ring-brand-500 shadow-xl lg:scale-[1.03]'
                                    : 'bg-white border-neutral-200 hover:shadow-md'
                            }`}
                        >
                            {p.accent && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-brand-600 text-white text-xs font-semibold shadow-md">
                                    <Sparkles className="w-3 h-3" /> Рекомендуется
                                </div>
                            )}

                            <div>
                                <h3 className="text-lg font-bold text-neutral-900">{p.name}</h3>
                                <p className="text-sm text-neutral-500 mt-1">{p.description}</p>
                            </div>

                            <div className="mt-6 flex items-baseline gap-1.5">
                                <span className="text-4xl font-bold text-neutral-900 tracking-tight">
                                    {formatPrice(monthly)}
                                </span>
                                <span className="text-sm text-neutral-500">
                                    {monthly === 0 ? 'навсегда' : '/ мес'}
                                </span>
                            </div>
                            {billing === 'yearly' && p.priceMonthly > 0 && (
                                <div className="mt-1 text-xs text-success-700 font-medium">
                                    Экономия {formatPrice((p.priceMonthly - monthly) * 12)} в год
                                </div>
                            )}

                            <ul className="mt-6 space-y-2.5 flex-1">
                                {p.features.map((f) => (
                                    <li key={f} className="flex items-start gap-2 text-sm">
                                        <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${p.accent ? 'text-brand-600' : 'text-success-600'}`} />
                                        <span className="text-neutral-700">{f}</span>
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={p.href}
                                className={`mt-7 block w-full text-center font-semibold px-4 py-2.5 rounded-xl transition-colors ${
                                    p.accent
                                        ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
                                        : 'bg-neutral-900 text-white hover:bg-neutral-800'
                                }`}
                            >
                                {p.cta}
                            </Link>
                        </div>
                    );
                })}
            </div>

            <p className="text-center text-xs text-neutral-500 mt-8 max-w-xl mx-auto">
                Цены указаны без НДС. Без долгосрочных обязательств — можно отменить или сменить тариф в любой момент.
                Нужно больше 100 машин или on-premise?{' '}
                <a href="mailto:sales@tms-prod.ru" className="text-brand-600 font-semibold underline">
                    Напишите в Enterprise-отдел
                </a>
                .
            </p>
        </div>
    );
}
