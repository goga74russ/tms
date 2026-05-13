'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, FileText } from 'lucide-react';

export interface TocItem {
    id: string;
    label: string;
}

interface Props {
    title: string;
    dateline?: string;
    toc: TocItem[];
    /** "ПРОЕКТ" warning banner above the title. */
    draft?: boolean;
    children: React.ReactNode;
}

export function LegalPageShell({ title, dateline, toc, draft = true, children }: Props) {
    const [activeId, setActiveId] = useState<string>(toc[0]?.id ?? '');

    useEffect(() => {
        if (typeof window === 'undefined' || toc.length === 0) return;
        const headings = toc
            .map((t) => document.getElementById(t.id))
            .filter((el): el is HTMLElement => el !== null);
        if (headings.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting);
                if (visible.length > 0) {
                    // Pick the topmost visible
                    const top = visible.reduce((a, b) =>
                        a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
                    );
                    setActiveId(top.target.id);
                }
            },
            { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
        );
        headings.forEach((h) => observer.observe(h));
        return () => observer.disconnect();
    }, [toc]);

    return (
        <div className="grid lg:grid-cols-[1fr_220px] gap-10">
            <article
                className={`prose prose-neutral max-w-none ${'[&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:tracking-tight'} [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:text-neutral-700 [&_p]:leading-relaxed [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_li]:text-neutral-700 [&_li]:mb-1 [&_li]:leading-relaxed [&_a]:text-brand-600 [&_a]:underline hover:[&_a]:text-brand-700`}
            >
                {draft && (
                    <div className="not-prose flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 p-4 mb-7">
                        <AlertTriangle className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <div className="font-semibold text-warning-700">Проект документа</div>
                            <div className="text-warning-700/90 mt-0.5">
                                Требуется юридическая ревизия перед публикацией. Поля с пометкой
                                «подлежит уточнению» будут заполнены после регистрации юрлица.
                            </div>
                        </div>
                    </div>
                )}

                <div className="not-prose flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <FileText className="w-3.5 h-3.5" />
                        {dateline ?? 'Последнее обновление: 12 мая 2026 года (пилотная редакция)'}
                    </div>
                    <button
                        type="button"
                        title="Скачать PDF (в разработке)"
                        disabled
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:cursor-not-allowed"
                    >
                        <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                </div>

                <h1 className="not-prose text-3xl font-bold tracking-tight text-neutral-900 mb-6">
                    {title}
                </h1>

                {children}
            </article>

            {toc.length > 0 && (
                <aside className="hidden lg:block">
                    <div className="sticky top-24">
                        <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
                            Содержание
                        </div>
                        <nav>
                            <ul className="space-y-1.5 text-sm border-l border-neutral-200">
                                {toc.map((t) => {
                                    const active = activeId === t.id;
                                    return (
                                        <li key={t.id}>
                                            <a
                                                href={`#${t.id}`}
                                                className={`block pl-4 -ml-px py-1 border-l-2 transition-colors ${
                                                    active
                                                        ? 'border-brand-600 text-brand-700 font-medium'
                                                        : 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-400'
                                                }`}
                                            >
                                                {t.label}
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>
                    </div>
                </aside>
            )}
        </div>
    );
}
