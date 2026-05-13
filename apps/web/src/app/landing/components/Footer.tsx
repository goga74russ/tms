import Link from 'next/link';
import { Truck, Mail, Phone, Send } from 'lucide-react';

const COLUMNS = [
    {
        title: 'Продукт',
        links: [
            { href: '#features', label: 'Возможности' },
            { href: '#pricing', label: 'Тарифы' },
            { href: '#demo', label: 'Демо' },
            { href: '/signup', label: 'Начать бесплатно' },
        ],
    },
    {
        title: 'Компания',
        links: [
            { href: '#', label: 'О нас', muted: true },
            { href: '#', label: 'Команда', muted: true },
            { href: '#', label: 'Блог', muted: true },
            { href: 'mailto:sales@transpult.ru', label: 'Партнёрам' },
        ],
    },
    {
        title: 'Поддержка',
        links: [
            { href: '#', label: 'Документация', muted: true },
            { href: 'mailto:support@transpult.ru', label: 'Связаться' },
            { href: '#', label: 'Статус системы', muted: true },
            { href: '#faq', label: 'FAQ' },
        ],
    },
    {
        title: 'Юридическое',
        links: [
            { href: '/legal/privacy', label: 'Конфиденциальность' },
            { href: '/legal/terms', label: 'Условия использования' },
            { href: '/legal/personal-data', label: 'Согласие на обработку ПД' },
        ],
    },
];

export function Footer() {
    return (
        <footer className="bg-neutral-900 text-neutral-300">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-8">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-10">
                    <div className="col-span-2 md:col-span-3 lg:col-span-1">
                        <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
                                <Truck className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-bold text-white">TMS</span>
                        </div>
                        <p className="mt-4 text-sm text-neutral-400 leading-relaxed max-w-xs">
                            Транспортная управляющая система для российских перевозчиков и логистических операторов.
                        </p>
                        <div className="mt-5 space-y-2 text-sm">
                            <a
                                href="mailto:support@transpult.ru"
                                className="inline-flex items-center gap-2 text-neutral-400 hover:text-white"
                            >
                                <Mail className="w-3.5 h-3.5" /> support@transpult.ru
                            </a>
                            <a
                                href="tel:+78001000000"
                                className="flex items-center gap-2 text-neutral-400 hover:text-white"
                            >
                                <Phone className="w-3.5 h-3.5" /> 8 800 100-00-00
                            </a>
                            <a
                                href="https://t.me/tms_prod"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-neutral-400 hover:text-white"
                            >
                                <Send className="w-3.5 h-3.5" /> Telegram
                            </a>
                        </div>
                    </div>

                    {COLUMNS.map((col) => (
                        <div key={col.title}>
                            <div className="text-sm font-semibold text-white mb-3">{col.title}</div>
                            <ul className="space-y-2 text-sm">
                                {col.links.map((l) => {
                                    const isInternal = l.href.startsWith('/');
                                    const isAnchor = l.href.startsWith('#');
                                    const className = `transition-colors ${
                                        'muted' in l && l.muted
                                            ? 'text-neutral-500 cursor-not-allowed'
                                            : 'text-neutral-400 hover:text-white'
                                    }`;
                                    if (isInternal) {
                                        return (
                                            <li key={l.label}>
                                                <Link href={l.href} className={className}>
                                                    {l.label}
                                                </Link>
                                            </li>
                                        );
                                    }
                                    if (isAnchor) {
                                        return (
                                            <li key={l.label}>
                                                <a href={`/landing${l.href}`} className={className}>
                                                    {l.label}
                                                </a>
                                            </li>
                                        );
                                    }
                                    return (
                                        <li key={l.label}>
                                            <a href={l.href} className={className}>
                                                {l.label}
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="mt-12 pt-6 border-t border-neutral-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-neutral-500">
                    <div>© {new Date().getFullYear()} TMS-prod. Все права защищены.</div>
                    <div className="flex flex-wrap items-center gap-4">
                        <span>ИНН 0000000000 · ОГРН 0000000000000</span>
                        <span>Сделано в России 🇷🇺 · Серверы в РФ · 152-ФЗ</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
