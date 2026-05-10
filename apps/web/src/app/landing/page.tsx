import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { Pricing } from './components/Pricing';
import { FAQ } from './components/FAQ';
import { Footer } from './components/Footer';

export const metadata = {
    title: 'TMS — транспортная управляющая система для российских перевозчиков',
    description:
        'Заказы, рейсы, путевые листы, осмотры, ЭТрН, биллинг — в одном кабинете. Бесплатный коробочный режим. ИИ-копилот в платных тарифах.',
};

export default function LandingRootPage() {
    return (
        <div className="min-h-screen bg-white">
            <Hero />
            <Features />
            <HowItWorks />
            <Pricing />
            <FAQ />
            <Footer />
        </div>
    );
}
