const STEPS = [
    {
        num: '1',
        title: 'Регистрируешься',
        desc: 'Email, ИНН, организация. Онбординг 5 минут — мастер из 6 шагов.',
    },
    {
        num: '2',
        title: 'Подключаешь интеграции',
        desc: 'ЭДО, GPS, электронная подпись — по необходимости. Можно работать и без них (бесплатный режим).',
    },
    {
        num: '3',
        title: 'Создаёшь заказы и рейсы',
        desc: 'Логист принимает заявку. Диспетчер формирует рейс, назначает водителя и ТС. Документы создаются автоматически.',
    },
    {
        num: '4',
        title: 'Получаешь счета и аналитику',
        desc: 'Биллинг по тарифам, акты, КС-2/КС-3 (если стройка), 1С-выгрузка, KPI-дашборды — без ручного труда.',
    },
];

export function HowItWorks() {
    return (
        <section className="bg-slate-50 border-y border-slate-200">
            <div className="max-w-6xl mx-auto px-6 py-20">
                <h2 className="text-3xl font-bold text-slate-900 mb-2">Как это работает</h2>
                <p className="text-slate-500 mb-12">От регистрации до первого счёта — за один рабочий день.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {STEPS.map((s) => (
                        <div key={s.num} className="bg-white rounded-2xl border border-slate-200 p-6">
                            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center mb-4">
                                {s.num}
                            </div>
                            <h3 className="font-semibold text-slate-900 mb-2">{s.title}</h3>
                            <p className="text-sm text-slate-600 leading-relaxed">{s.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
