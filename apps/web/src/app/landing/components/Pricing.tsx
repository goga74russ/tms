import Link from 'next/link';
import { Check } from 'lucide-react';

const PLANS = [
    {
        name: 'Бесплатный',
        price: '0 ₽',
        period: 'навсегда',
        features: [
            'До 5 машин',
            'До 50 заказов в месяц',
            'Ручной ввод данных',
            'Путевые листы и осмотры',
            'Базовый биллинг',
            'Сообщество и e-mail-поддержка',
        ],
        cta: 'Начать',
        href: '/signup',
        accent: false,
    },
    {
        name: 'Pro',
        price: '4 990 ₽',
        period: 'в месяц',
        features: [
            'До 30 машин',
            'Безлимит заказов',
            'ИИ-копилот: 500 запросов/день',
            'ЭДО (Диадок, СБИС, Калуга, Такском)',
            'Маркировка «Честный знак»',
            'ОСАГО-мониторинг',
            'Приоритетная поддержка',
        ],
        cta: 'Попробовать Pro',
        href: '/signup?plan=pro',
        accent: true,
    },
    {
        name: 'Business',
        price: '14 990 ₽',
        period: 'в месяц',
        features: [
            'До 100 машин',
            'Безлимит заказов',
            'ИИ-копилот: 2000 запросов/день',
            'Все интеграции (Wialon live, тахограф DDD)',
            'KS-2 / KS-3 (стройка)',
            'Cold chain SLA',
            'Выделенный аккаунт-менеджер',
        ],
        cta: 'Перейти на Business',
        href: '/signup?plan=business',
        accent: false,
    },
];

export function Pricing() {
    return (
        <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Тарифы</h2>
            <p className="text-slate-500 mb-12">Старт без оплаты, оплата только за реально нужные функции.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {PLANS.map((p) => (
                    <div
                        key={p.name}
                        className={`rounded-2xl border p-7 flex flex-col ${
                            p.accent
                                ? 'bg-indigo-600 border-indigo-700 text-white shadow-xl scale-[1.02]'
                                : 'bg-white border-slate-200'
                        }`}
                    >
                        <h3 className={`text-lg font-semibold mb-2 ${p.accent ? 'text-white' : 'text-slate-900'}`}>{p.name}</h3>
                        <div className="flex items-baseline gap-2 mb-6">
                            <span className={`text-3xl font-bold ${p.accent ? 'text-white' : 'text-slate-900'}`}>{p.price}</span>
                            <span className={`text-sm ${p.accent ? 'text-indigo-200' : 'text-slate-500'}`}>{p.period}</span>
                        </div>

                        <ul className="space-y-2.5 mb-8 flex-1">
                            {p.features.map((f) => (
                                <li key={f} className="flex items-start gap-2 text-sm">
                                    <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${p.accent ? 'text-indigo-200' : 'text-indigo-600'}`} />
                                    <span className={p.accent ? 'text-indigo-50' : 'text-slate-700'}>{f}</span>
                                </li>
                            ))}
                        </ul>

                        <Link
                            href={p.href}
                            className={`block w-full text-center font-semibold px-4 py-3 rounded-xl transition-colors ${
                                p.accent
                                    ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                                    : 'bg-slate-900 text-white hover:bg-slate-700'
                            }`}
                        >
                            {p.cta}
                        </Link>
                    </div>
                ))}
            </div>

            <div className="mt-10 text-center">
                <p className="text-sm text-slate-500">
                    Нужно больше? <a href="mailto:sales@tms-prod.ru" className="text-indigo-600 font-semibold underline">Enterprise — индивидуально</a>
                </p>
            </div>
        </section>
    );
}
