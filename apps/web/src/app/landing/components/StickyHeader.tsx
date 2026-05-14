'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Truck, Menu, X } from 'lucide-react';

const NAV_LINKS = [
    { href: '#features', label: 'Возможности' },
    { href: '#how', label: 'Как это работает' },
    { href: '#pricing', label: 'Тарифы' },
    { href: '#faq', label: 'FAQ' },
];

export function StickyHeader() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header
            className={`fixed top-0 inset-x-0 z-50 transition-all duration-200 ${
                scrolled
                    ? 'bg-white/85 backdrop-blur-md border-b border-neutral-200 shadow-sm'
                    : 'bg-transparent'
            }`}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                <Link href="/landing" className="flex items-center gap-2 group">
                    <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                            scrolled
                                ? 'bg-brand-600 text-white'
                                : 'bg-white/15 backdrop-blur-sm border border-white/30 text-white'
                        }`}
                    >
                        <Truck className="w-5 h-5" />
                    </div>
                    <span className={`font-bold tracking-tight ${scrolled ? 'text-neutral-900' : 'text-white'}`}>
                        ТрансПульт
                    </span>
                </Link>

                <nav className="hidden md:flex items-center gap-7 text-sm">
                    {NAV_LINKS.map((l) => (
                        <a
                            key={l.href}
                            href={l.href}
                            className={`font-medium transition-colors ${
                                scrolled ? 'text-neutral-600 hover:text-neutral-900' : 'text-white/80 hover:text-white'
                            }`}
                        >
                            {l.label}
                        </a>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <Link
                        href="/login"
                        className={`hidden sm:inline-flex h-9 items-center px-3 text-sm font-medium rounded-lg transition-colors ${
                            scrolled ? 'text-neutral-700 hover:bg-neutral-100' : 'text-white hover:bg-white/15'
                        }`}
                    >
                        Войти
                    </Link>
                    <Link
                        href="/signup"
                        className={`inline-flex h-9 items-center px-4 text-sm font-semibold rounded-lg transition-all ${
                            scrolled
                                ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm'
                                : 'bg-white text-brand-700 hover:bg-brand-50 shadow-md'
                        }`}
                    >
                        Начать бесплатно
                    </Link>
                    <button
                        type="button"
                        aria-label="Меню"
                        onClick={() => setMobileOpen((v) => !v)}
                        className={`md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                            scrolled ? 'text-neutral-700 hover:bg-neutral-100' : 'text-white hover:bg-white/15'
                        }`}
                    >
                        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {mobileOpen && (
                <div className="md:hidden border-t border-neutral-200 bg-white">
                    <nav className="px-4 py-3 flex flex-col gap-1">
                        {NAV_LINKS.map((l) => (
                            <a
                                key={l.href}
                                href={l.href}
                                onClick={() => setMobileOpen(false)}
                                className="px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 rounded-lg"
                            >
                                {l.label}
                            </a>
                        ))}
                        <Link
                            href="/login"
                            className="px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 rounded-lg"
                        >
                            Войти
                        </Link>
                    </nav>
                </div>
            )}
        </header>
    );
}
