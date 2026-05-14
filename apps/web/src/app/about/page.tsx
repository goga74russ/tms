import Link from 'next/link';
import {
    ArrowRight, Truck, Users, MapPin, Heart, ShieldCheck, Zap, Send, Mail, ArrowLeft,
} from 'lucide-react';
import { StickyHeader } from '../landing/components/StickyHeader';
import { Footer } from '../landing/components/Footer';

export const metadata = {
    title: 'О нас — ТрансПульт',
    description:
        'ТрансПульт — российская транспортная управляющая система для перевозчиков и логистов. Кто за продуктом и почему мы это делаем.',
};

const VALUES = [
    {
        icon: ShieldCheck,
        title: 'Соответствие закону',
        text: 'Минтранс № 2200, медосмотры по приказу Минздрава, 152-ФЗ, ЭТрН. Не «что-то для галочки», а понятный путь, который выдержит проверку.',
    },
    {
        icon: Zap,
        title: 'Скорость и простота',
        text: 'Заявка → рейс → путевой лист → акт за минуты, не за полдня. Тяжёлые корпоративные TMS не для перевозчиков с 5–50 машинами.',
    },
    {
        icon: Heart,
        title: 'Партнёрство, не контракт',
        text: 'Пилот идёт лично — основатель доступен в Telegram. Чувствуем боль клиента до того, как она станет тикетом.',
    },
];

const FACTS = [
    { value: '2026', label: 'Старт пилота' },
    { value: 'РФ', label: 'География — вся страна' },
    { value: '152-ФЗ', label: 'Серверы в России' },
];

export default function AboutPage() {
    return (
        <div className="min-h-screen bg-white">
            <StickyHeader />

            {/* Hero */}
            <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white pt-24 pb-16 sm:pt-32 sm:pb-24">
                <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background:
                            'radial-gradient(900px 500px at 90% -10%, rgba(165,180,252,0.35), transparent 60%), radial-gradient(700px 400px at 0% 110%, rgba(99,102,241,0.35), transparent 60%)',
                    }}
                />
                <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
                    <Link
                        href="/landing"
                        className="inline-flex items-center gap-1.5 text-sm text-brand-100/80 hover:text-white mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        На главную
                    </Link>
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight mb-5">
                        Мы делаем транспорт <span className="bg-gradient-to-r from-white to-brand-200 bg-clip-text text-transparent">прозрачнее</span> и проще
                    </h1>
                    <p className="text-base sm:text-lg text-brand-100/90 max-w-2xl leading-relaxed">
                        ТрансПульт — российская транспортная управляющая система для перевозчиков и логистических операторов. Без «корпоративных» танцев, без 1С-многолетий, без бесконечных доработок. Со старта — работает.
                    </p>

                    <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-white/15">
                        {FACTS.map((f) => (
                            <div key={f.label}>
                                <div className="text-3xl sm:text-4xl font-bold tracking-tight">{f.value}</div>
                                <div className="text-sm text-brand-100/80 mt-1">{f.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Mission */}
            <section className="py-16 sm:py-20">
                <div className="max-w-3xl mx-auto px-4 sm:px-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-3">
                        Зачем мы существуем
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-6">
                        Большие TMS для холдингов. Маленьким — некуда идти.
                    </h2>
                    <div className="space-y-4 text-neutral-700 leading-relaxed">
                        <p>
                            Перевозчик с 10 машинами не может позволить себе SAP TM или 1С с командой консультантов. Excel — потолок, который трещит на каждом ЭТрН, на каждом приказе Минздрава, на каждом запросе ФНС.
                        </p>
                        <p>
                            <strong className="text-neutral-900">ТрансПульт закрывает эту дыру.</strong> Заявки, рейсы, путевые листы, осмотры, ЭДО, биллинг — в одном кабинете, по понятной цене, с поддержкой 152-ФЗ из коробки. Бесплатный коробочный режим — чтобы попробовать без риска. ИИ-копилот диспетчера на платных тарифах — чтобы рутина не съедала рабочий день.
                        </p>
                        <p>
                            Мы строим не «универсальный софт для всех» — а инструмент для перевозчиков, которые работают по РФ, обслуживают реальных клиентов и должны соответствовать реальному законодательству. Каждая фича прошла через вопрос: «А это правда нужно дальнобойщику в Челябинске или это красиво только в презентации?»
                        </p>
                    </div>
                </div>
            </section>

            {/* Founder */}
            <section className="py-16 sm:py-20 bg-neutral-50">
                <div className="max-w-3xl mx-auto px-4 sm:px-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-3">
                        Основатель
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-8">
                        Кто за продуктом
                    </h2>

                    <div className="grid sm:grid-cols-[140px_1fr] gap-6 items-start bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8">
                        <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-3xl font-bold shadow-soft mx-auto sm:mx-0">
                            БГ
                        </div>
                        <div>
                            <div className="text-xl font-bold text-neutral-900">Бардин Георгий Дмитриевич</div>
                            <div className="text-sm text-neutral-500 mt-0.5">Основатель и инженер · ИП Бардин Г.Д.</div>

                            <div className="mt-4 space-y-3 text-neutral-700 text-sm leading-relaxed">
                                <p>
                                    {/* TODO: подправь под себя — бэкграунд, опыт, что приводит тебя к транспорту */}
                                    Программист и предприниматель из Челябинской области. Несколько лет проработал в IT и собственном бизнесе — увидел изнутри, как малые перевозчики борются с документооборотом, контролем рейсов и отчётностью. Когда стало понятно, что «системы для маленьких» нет ни у кого — начал строить её сам.
                                </p>
                                <p>
                                    ТрансПульт — не побочный проект и не упражнение в коде. Это попытка сделать инструмент, который реально снимает рутину с перевозчиков по всей России — от Калининграда до Владивостока.
                                </p>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                <a
                                    href="https://t.me/BardinGD"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    Написать в Telegram
                                </a>
                                <a
                                    href="mailto:support@transpult.ru"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                                >
                                    <Mail className="w-3.5 h-3.5" />
                                    support@transpult.ru
                                </a>
                            </div>

                            <p className="text-xs text-neutral-500 mt-4 leading-relaxed">
                                В пилот-фазе все обращения идут лично через основателя. Когда команда вырастет — добавим страницу «Команда» сюда.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Values */}
            <section className="py-16 sm:py-20">
                <div className="max-w-5xl mx-auto px-4 sm:px-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-3 text-center">
                        Принципы
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-12 text-center">
                        Как мы работаем
                    </h2>
                    <div className="grid md:grid-cols-3 gap-5">
                        {VALUES.map((v) => (
                            <div key={v.title} className="rounded-2xl border border-neutral-200 bg-white p-6">
                                <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
                                    <v.icon className="w-5 h-5" />
                                </div>
                                <div className="font-bold text-neutral-900 mb-2">{v.title}</div>
                                <p className="text-sm text-neutral-600 leading-relaxed">{v.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Geography */}
            <section className="py-16 sm:py-20 bg-neutral-50">
                <div className="max-w-3xl mx-auto px-4 sm:px-6">
                    <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-3">
                        География
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-6">
                        Работаем по всей России
                    </h2>
                    <div className="space-y-4 text-neutral-700 leading-relaxed">
                        <p>
                            ТрансПульт — облачный сервис. Где бы ни был ваш автопарк — в Москве, Санкт-Петербурге, на Урале, в Сибири или на Дальнем Востоке — система работает одинаково. Серверы расположены в Российской Федерации (соответствие 152-ФЗ), интеграции — с операторами ЭДО, банками-эквайерами и системами телематики, работающими по всей стране.
                        </p>
                        <p>
                            <strong className="text-neutral-900">Своего автопарка у нас нет</strong> — мы не конкурент перевозчикам, а инструмент для них. Все доходы идут только от подписок на сервис.
                        </p>
                    </div>

                    <div className="mt-8 grid sm:grid-cols-3 gap-4">
                        {[
                            { icon: MapPin, label: 'Сервера в РФ', sub: 'Москва, Selectel' },
                            { icon: Users, label: 'Целевая аудитория', sub: 'Перевозчики 5–500 машин' },
                            { icon: Truck, label: 'Тип бизнеса', sub: 'SaaS, без своих машин' },
                        ].map((s) => (
                            <div key={s.label} className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                                    <s.icon className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-neutral-900 truncate">{s.label}</div>
                                    <div className="text-xs text-neutral-500 truncate">{s.sub}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-16 sm:py-20">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
                    <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-4">
                        Готовы попробовать?
                    </h2>
                    <p className="text-neutral-600 mb-7 max-w-xl mx-auto">
                        Бесплатный тариф — без банковской карты, без скрытых лимитов. Если что-то непонятно — пишите напрямую основателю в Telegram.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <Link
                            href="/signup"
                            className="inline-flex items-center gap-2 bg-brand-600 text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl hover:bg-brand-700 transition-all"
                        >
                            Начать бесплатно
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                        <Link
                            href="/landing#pricing"
                            className="inline-flex items-center gap-2 bg-white border border-neutral-300 text-neutral-700 font-semibold px-6 py-3 rounded-xl hover:bg-neutral-50 transition-all"
                        >
                            Тарифы
                        </Link>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
}
