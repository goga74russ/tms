import Link from 'next/link';
import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50">
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link href="/landing" className="font-bold text-slate-900">TMS</Link>
                    <nav className="flex gap-4 text-sm text-slate-600">
                        <Link href="/legal/privacy" className="hover:text-slate-900">Конфиденциальность</Link>
                        <Link href="/legal/terms" className="hover:text-slate-900">Условия</Link>
                        <Link href="/legal/personal-data" className="hover:text-slate-900">Согласие 152-ФЗ</Link>
                    </nav>
                </div>
            </header>
            <main className="max-w-3xl mx-auto px-6 py-10">
                <article className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 prose prose-slate max-w-none [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_p]:text-slate-700 [&_p]:leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_li]:text-slate-700 [&_li]:mb-1 [&_li]:leading-relaxed">
                    {children}
                </article>
            </main>
        </div>
    );
}
