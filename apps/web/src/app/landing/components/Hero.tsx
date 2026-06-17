import Link from 'next/link';
import { ArrowRight, ShieldCheck, Truck, MapPin, FileText, Activity } from 'lucide-react';

const STATS = [
    { value: '0 ₽', label: 'Бесплатно до 5 машин' },
    { value: 'ЭДО', label: 'Оператор Диадок (на подключении)' },
    { value: 'РФ', label: 'Серверы и данные в России' },
];

export function Hero() {
    return (
        <section className="relative overflow-hidden bg-brand-800 text-white pt-24 pb-20 sm:pt-32 sm:pb-28">
            {/* navy → teal перетекание справа за mockup + бирюзовое свечение (landing-polish §4) */}
            <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-l from-accent-500/30 via-accent-700/10 to-transparent" />
                <div className="absolute -top-1/4 -right-1/4 w-[700px] h-[700px] rounded-full bg-accent-500/20 blur-[140px]" />
            </div>
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
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-500/10 backdrop-blur-sm border border-accent-500/30 text-xs font-medium text-brand-50 mb-6">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" aria-hidden />
                            <span>Пилот-фаза · ранние пользователи</span>
                        </div>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight mb-5">
                            ТрансПульт, в котором<br className="hidden sm:block" /> логистика работает{' '}
                            <span className="bg-gradient-to-r from-white to-brand-200 bg-clip-text text-transparent">
                                сама
                            </span>
                        </h1>
                        <p className="text-base sm:text-lg text-brand-100/90 max-w-xl mb-8 leading-relaxed">
                            Заказы, рейсы, ЭТрН и биллинг в одном кабинете. Готов к работе с 1 сентября 2026.
                        </p>
                        <div className="flex flex-wrap gap-3 mb-10">
                            <Link
                                href="/signup"
                                className="inline-flex items-center gap-2 bg-accent-500 text-white font-semibold px-6 py-3 rounded-xl shadow-lg shadow-accent-500/25 hover:shadow-xl hover:bg-accent-600 transition-all"
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
                                <ShieldCheck className="w-4 h-4 text-accent-400" />
                                <span>Серверы в РФ</span>
                            </div>
                            <div className="inline-flex items-center gap-1.5">
                                <Activity className="w-4 h-4 text-accent-400" />
                                <span>Бэкапы и аудит-лог из коробки</span>
                            </div>
                            <div className="inline-flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-accent-400" />
                                <span>Минтранс №2200</span>
                            </div>
                        </div>
                    </div>

                    {/* Mockup */}
                    <div id="demo" className="relative">
                        <div
                            aria-hidden
                            className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-brand-300/30 to-accent-400/30 blur-2xl"
                        />
                        <div className="relative rounded-2xl bg-white/95 shadow-2xl border border-white/40 overflow-hidden backdrop-blur-sm">
                            {/* fake browser chrome */}
                            <div className="flex items-center gap-1.5 px-4 h-9 bg-neutral-100 border-b border-neutral-200">
                                <div className="w-2.5 h-2.5 rounded-full bg-danger-400" />
                                <div className="w-2.5 h-2.5 rounded-full bg-warning-400" />
                                <div className="w-2.5 h-2.5 rounded-full bg-success-400" />
                                <div className="ml-3 px-3 h-5 flex items-center bg-white rounded text-[10px] text-neutral-500 border border-neutral-200">
                                    transpult.ru/dispatcher
                                </div>
                            </div>
                            <div className="p-4 sm:p-5 bg-neutral-50">
                                {/* stat row */}
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {[
                                        { l: 'В пути', v: '24', tone: 'text-brand-600' },
                                        { l: 'SLA OK', v: '92%', tone: 'text-success-600' },
                                        { l: 'Алерты', v: '3', tone: 'text-warning-600' },
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
                                        { id: 'R-1042', route: 'СПб → Москва', state: 'в пути', color: 'bg-success-100 text-success-700' },
                                        { id: 'R-1043', route: 'Москва → Казань', state: 'погрузка', color: 'bg-info-100 text-info-700' },
                                        { id: 'R-1044', route: 'Тверь → Сочи', state: 'задержка', color: 'bg-warning-100 text-warning-700' },
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
                            <div className={`text-3xl sm:text-4xl font-bold tracking-tight ${s.value === '0 ₽' ? 'text-accent-300' : ''}`}>{s.value}</div>
                            <div className="text-sm text-brand-100/80 mt-1">{s.label}</div>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-brand-100/60 mt-4">
                    Пилот-фаза. Текущий статус системы — на странице{' '}
                    <Link href="/status" className="underline">статус</Link>.
                </p>
            </div>
        </section>
    );
}
