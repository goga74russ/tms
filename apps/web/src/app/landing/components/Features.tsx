import { Package, ShieldCheck, Sparkles, Smartphone, Thermometer, Plug } from 'lucide-react';

const FEATURES = [
    {
        icon: Package,
        title: 'Полная цепочка',
        desc: 'Заказ → рейс → путевой лист → осмотр → доставка → акт → счёт. Всё связано, без двойного ввода.',
    },
    {
        icon: ShieldCheck,
        title: 'Compliance-first',
        desc: 'ЭТрН (Минтранс №2200), путевые листы, тех- и медосмотры, журналы 152-ФЗ — из коробки.',
    },
    {
        icon: Sparkles,
        title: 'ИИ-копилот диспетчера',
        desc: 'Назначай рейсы и формируй документы голосом и текстом. Phase 7.',
        badge: 'Скоро',
    },
    {
        icon: Smartphone,
        title: 'Mobile-приложение водителя',
        desc: 'Offline-режим (WatermelonDB), осмотры, чекпоинты, фотофиксация, электронная подпись.',
    },
    {
        icon: Thermometer,
        title: 'Cold chain',
        desc: 'Контроль температуры в пути с алертами по SLA. Логирование с мобильного и телематики.',
    },
    {
        icon: Plug,
        title: 'Интеграции',
        desc: '1С-выгрузка, маркировка «Честный знак», ОСАГО мониторинг, ЭДО (Диадок, СБИС, Калуга, Такском).',
    },
];

export function Features() {
    return (
        <section className="max-w-6xl mx-auto px-6 py-20">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Что внутри</h2>
            <p className="text-slate-500 mb-12 max-w-2xl">
                Закрываем операционный, документальный и финансовый блок автотранспортной компании.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {FEATURES.map((f) => {
                    const Icon = f.icon;
                    return (
                        <div key={f.title} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center">
                                    <Icon className="w-5 h-5 text-indigo-600" />
                                </div>
                                {f.badge && (
                                    <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                        {f.badge}
                                    </span>
                                )}
                            </div>
                            <h3 className="font-semibold text-slate-900 mb-1">{f.title}</h3>
                            <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
