import { UserPlus, Plug, ClipboardList, Receipt } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Step {
    num: number;
    icon: LucideIcon;
    title: string;
    desc: string;
}

const STEPS: Step[] = [
    {
        num: 1,
        icon: UserPlus,
        title: 'Регистрация',
        desc: 'Email, ИНН, организация. Онбординг — мастер из 6 шагов и автозаполнение из DaData.',
    },
    {
        num: 2,
        icon: Plug,
        title: 'Подключение интеграций',
        desc: 'ЭДО, GPS, ЭП — по необходимости. Можно работать и без них в бесплатном тарифе.',
    },
    {
        num: 3,
        icon: ClipboardList,
        title: 'Заказы и рейсы',
        desc: 'Логист принимает заявку. Диспетчер формирует рейс, назначает водителя и ТС. Документы создаются автоматически.',
    },
    {
        num: 4,
        icon: Receipt,
        title: 'Счета и аналитика',
        desc: 'Биллинг по тарифам, акты, КС-2 / КС-3, 1С-выгрузка, KPI-дашборды — без ручного труда.',
    },
];

export function HowItWorks() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="max-w-2xl mb-12">
                <div className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-2">Как это работает</div>
                <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight mb-3">
                    От регистрации до первого счёта — за один день
                </h2>
                <p className="text-neutral-600 leading-relaxed">
                    Без проектного внедрения и интеграторов. Запускаемся за минуты, окупаемся за месяц.
                </p>
            </div>

            <div className="relative">
                {/* Connecting line on desktop */}
                <div
                    aria-hidden
                    className="hidden lg:block absolute top-7 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-brand-200 via-brand-300 to-brand-200"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4 relative">
                    {STEPS.map((s) => {
                        const Icon = s.icon;
                        return (
                            <div key={s.num} className="text-center lg:px-2">
                                <div className="relative inline-flex">
                                    <div className="w-14 h-14 rounded-full bg-brand-600 text-white font-bold text-lg flex items-center justify-center shadow-lg ring-4 ring-white">
                                        {s.num}
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-neutral-200 flex items-center justify-center">
                                        <Icon className="w-3.5 h-3.5 text-brand-600" />
                                    </div>
                                </div>
                                <h3 className="mt-5 font-semibold text-neutral-900">{s.title}</h3>
                                <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{s.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
