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
        'Заказы, рейсы, путевые листы, осмотры, ЭТрН, биллинг — в одном кабинете. Бесплатный коробочный режим, серверы в РФ. ИИ-копилот (Beta) — появится в платных тарифах.',
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
