import Link from 'next/link';
import { Truck, ArrowRight } from 'lucide-react';

export function Hero() {
    return (
        <section className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 text-white">
            <div className="max-w-6xl mx-auto px-6 py-20">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/30">
                        <Truck className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">TMS</span>
                </div>

                <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
                    TMS для российских<br />транспортных компаний
                </h1>
                <p className="text-lg text-indigo-100 max-w-2xl mb-10 leading-relaxed">
                    Заказы, рейсы, путевые листы, осмотры, ЭТрН, биллинг — всё в одном кабинете.
                    Бесплатный коробочный режим. ИИ-копилот диспетчера в платном тарифе.
                </p>

                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/signup"
                        className="inline-flex items-center gap-2 bg-white text-indigo-700 font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl hover:bg-indigo-50 transition-all"
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

                <div id="demo" className="mt-16 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm aspect-video flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-indigo-100 text-sm">[ Скриншот рабочего кабинета ]</div>
                        <div className="text-xs text-indigo-200 mt-2">Список рейсов · Карта Wialon · Документы ЭТрН</div>
                    </div>
                </div>
            </div>
        </section>
    );
}
