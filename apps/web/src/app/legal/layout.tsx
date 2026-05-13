import Link from 'next/link';
import { Truck, ArrowLeft, ShieldCheck, FileText, UserCheck } from 'lucide-react';
import type { ReactNode } from 'react';

const NAV = [
    { href: '/legal/privacy', label: 'Конфиденциальность', icon: ShieldCheck },
    { href: '/legal/terms', label: 'Условия', icon: FileText },
    { href: '/legal/personal-data', label: 'Согласие 152-ФЗ', icon: UserCheck },
];

export default function LegalLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-neutral-50">
            <header className="bg-white border-b border-neutral-200 sticky top-0 z-30 backdrop-blur-md bg-white/85">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/landing" className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
                                <Truck className="w-4 h-4" />
                            </div>
                            <span className="font-bold text-neutral-900">TMS</span>
                        </Link>
                        <Link
                            href="/landing"
                            className="hidden sm:inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"
                        >
                            <ArrowLeft className="w-3 h-3" /> На главную
                        </Link>
                    </div>
                    <nav className="flex gap-1 text-xs">
                        {NAV.map((l) => {
                            const Icon = l.icon;
                            return (
                                <Link
                                    key={l.href}
                                    href={l.href}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 font-medium"
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">{l.label}</span>
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-10 lg:p-12">
                    {children}
                </div>
                <footer className="mt-8 text-center text-xs text-neutral-500">
                    Другие документы:{' '}
                    {NAV.map((l, idx) => (
                        <span key={l.href}>
                            <Link href={l.href} className="text-brand-600 hover:underline">
                                {l.label}
                            </Link>
                            {idx < NAV.length - 1 && <span> · </span>}
                        </span>
                    ))}
                </footer>
            </main>
        </div>
    );
}
