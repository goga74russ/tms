import { Sparkles } from 'lucide-react';
import { StickyHeader } from './components/StickyHeader';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { Pricing } from './components/Pricing';
import { FAQ } from './components/FAQ';
import { Footer } from './components/Footer';

export const metadata = {
    title: 'ТрансПульт — транспортная управляющая система для российских перевозчиков',
    description:
        'Заказы, рейсы, путевые листы, осмотры, ЭТрН, биллинг — в одном кабинете. Бесплатный коробочный режим. ИИ-копилот в платных тарифах.',
};

export default function LandingRootPage() {
    return (
        <div className="min-h-screen bg-white">
            <StickyHeader />
            <main>
                <Hero />
                <section id="features" className="bg-white">
                    <Features />
                </section>
                <section id="how" className="bg-neutral-50">
                    <HowItWorks />
                </section>
                <section id="ai" className="bg-neutral-50 py-12 border-t border-neutral-200">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6">
                        <div className="max-w-3xl">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-xs font-medium text-brand-700 mb-4">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Beta</span>
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 mb-3">
                                Бонус: ИИ-копилот диспетчера (beta)
                            </h2>
                            <p className="text-base text-neutral-600 leading-relaxed mb-6">
                                Подсказывает оптимальные маршруты, предупреждает о просрочках по SLA и
                                автоматически разбирает входящие заказы. Доступен в платных тарифах как
                                бета-функция — основные процессы работают и без него.
                            </p>
                            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-neutral-700">
                                <li className="flex items-start gap-2">
                                    <span className="text-brand-600 mt-0.5">•</span>
                                    Разбор email-заказов в структурированные рейсы
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-brand-600 mt-0.5">•</span>
                                    Подсказки по подбору транспорта под груз
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-brand-600 mt-0.5">•</span>
                                    Раннее предупреждение о рисках срыва SLA
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-brand-600 mt-0.5">•</span>
                                    Ассистент для диспетчера в чате
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>
                <section id="pricing" className="bg-white">
                    <Pricing />
                </section>
                <section id="faq" className="bg-neutral-50">
                    <FAQ />
                </section>
            </main>
            <Footer />
        </div>
    );
}
