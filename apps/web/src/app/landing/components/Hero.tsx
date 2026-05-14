import Link from 'next/link';
import { ArrowRight, ShieldCheck, Sparkles, Truck, MapPin, FileText, Activity } from 'lucide-react';

const STATS = [
    { value: '5 000+*', label: 'Перевозчиков на платформе' },
    { value: '1 200 000*', label: 'Рейсов в год' },
    { value: '152-ФЗ', label: 'Соответствие законам РФ' },
];

export function Hero() {
    return (
        <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white pt-24 pb-20 sm:pt-32 sm:pb-28">
            {/* radial highlights */}
            <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        'radial-gradient(900px 500px at 90% -10%, rgba(165,180,252,0.35), transparent 60%), radial-gradient(700px 400px at 0% 110%, rgba(99,102,241,0.35), transparent 60%)',
                }}
            />
            {/* subtle grid */}
            <div
                aria-hidden
                className="absolute inset-0 opacity-[0.06] pointer-events-none"
                style={{
                    backgroundImage:
                        'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
                    backgroundSize: '32px 32px',
                }}
            />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
                <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-xs font-medium text-brand-50 mb-6">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Phase 7: ИИ-копилот диспетчера в бете</span>
                        </div>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight mb-5">
                            ТрансПульт, в котором<br className="hidden sm:block" /> логистика работает{' '}
                            <span className="bg-gradient-to-r from-white to-brand-200 bg-clip-text text-transparent">
                                сама
                            </span>
                        </h1>
                        <p className="text-base sm:text-lg text-brand-100/90 max-w-xl mb-8 leading-relaxed">
                            Заказы, рейсы, путевые листы, осмотры, ЭТрН и биллинг — в одном кабинете.
                            Бесплатный коробочный режим. ИИ-копилот диспетчера в платных тарифах.
                        </p>
                        <div className="flex flex-wrap gap-3 mb-10">
                            <Link
                                href="/signup"
                                className="inline-flex items-center gap-2 bg-white text-brand-700 font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl hover:bg-brand-50 transition-all"
                            >
                                Начать бесплатно
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <a
                                href="#demo"
                                className="inline-flex items-center gap-2 bg-white/10 border border-white/30 text-white font-semibold px-6 py-3 rounded-xl backdrop-blur-sm hover:bg-white/20 transition-all"
                            >
                                Посмотреть демо
                            </a>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-brand-100/80">
                            <div className="inline-flex items-center gap-1.5">
                                <ShieldCheck className="w-4 h-4" />
                                <span>Серверы в РФ</span>
                            </div>
                            <div className="inline-flex items-center gap-1.5">
                                <Activity className="w-4 h-4" />
                                <span>99,9% SLA на Business</span>
                            </div>
                            <div className="inline-flex items-center gap-1.5">
                                <FileText className="w-4 h-4" />
                                <span>Минтранс №2200</span>
                            </div>
                        </div>
                    </div>

                    {/* Mockup */}
                    <div id="demo" className="relative">
                        <div
                            aria-hidden
                            className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-brand-300/30 to-purple-400/30 blur-2xl"
                        />
                        <div className="relative rounded-2xl bg-white/95 shadow-2xl border border-white/40 overflow-hidden backdrop-blur-sm">
                            {/* fake browser chrome */}
                            <div className="flex items-center gap-1.5 px-4 h-9 bg-neutral-100 border-b border-neutral-200">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                                <div className="ml-3 px-3 h-5 flex items-center bg-white rounded text-[10px] text-neutral-500 border border-neutral-200">
                                    transpult.ru/dispatcher
                                </div>
                            </div>
                            <div className="p-4 sm:p-5 bg-neutral-50">
                                {/* stat row */}
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {[
                                        { l: 'В пути', v: '24', tone: 'text-brand-600' },
                                        { l: 'SLA OK', v: '92%', tone: 'text-emerald-600' },
                                        { l: 'Алерты', v: '3', tone: 'text-amber-600' },
                                    ].map((s) => (
                                        <div key={s.l} className="bg-white rounded-lg border border-neutral-200 p-2.5">
                                            <div className={`text-lg font-bold ${s.tone}`}>{s.v}</div>
                                            <div className="text-[10px] text-neutral-500 mt-0.5">{s.l}</div>
                                        </div>
                                    ))}
                                </div>
                                {/* fake trips list */}
                                <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
                                    {[
                                        { id: 'R-1042', route: 'СПб → Москва', state: 'в пути', color: 'bg-emerald-100 text-emerald-700' },
                                        { id: 'R-1043', route: 'Москва → Казань', state: 'погрузка', color: 'bg-blue-100 text-blue-700' },
                                        { id: 'R-1044', route: 'Тверь → Сочи', state: 'задержка', color: 'bg-amber-100 text-amber-700' },
                                    ].map((r) => (
                                        <div key={r.id} className="flex items-center gap-2 px-3 py-2.5">
                                            <div className="w-7 h-7 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                                                <Truck className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs font-semibold text-neutral-900">{r.id}</div>
                                                <div className="text-[11px] text-neutral-500 truncate flex items-center gap-1">
                                                    <MapPin className="w-2.5 h-2.5" /> {r.route}
                                                </div>
                                            </div>
                                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${r.color}`}>
                                                {r.state}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats row */}
                <div className="mt-16 sm:mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-white/15">
                    {STATS.map((s) => (
                        <div key={s.label}>
                            <div className="text-3xl sm:text-4xl font-bold tracking-tight">{s.value}</div>
                            <div className="text-sm text-brand-100/80 mt-1">{s.label}</div>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-brand-100/60 mt-4">
                    * Целевые показатели платформы. Текущие значения — на странице{' '}
                    <Link href="/landing#pricing" className="underline">статус</Link>.
                </p>
            </div>
        </section>
    );
}
