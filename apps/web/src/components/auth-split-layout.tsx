'use client';

import * as React from 'react';
import Link from 'next/link';
import { Truck } from 'lucide-react';

export interface AuthSplitLayoutProps {
    /** Title shown at the top of the left form column. */
    title: string;
    /** Subtitle shown below the title. Plain string or any node. */
    subtitle?: React.ReactNode;
    /** Form children rendered inside the left column. */
    children: React.ReactNode;
    /** Optional right-side panel (product showcase / illustration). Hidden below lg. */
    rightPanel?: React.ReactNode;
    /** Optional link rendered in the top-right of the left column (e.g. "Create account"). */
    topRightLink?: { href: string; label: string };
    /** Whether to show the bottom footer (copyright + privacy link). Default true. */
    showFooter?: boolean;
}

/**
 * Two-column auth layout primitive used by /login, /signup and /signup/verify.
 *
 * - lg+: split grid (form left, decorative/illustration right)
 * - <lg: single column, right panel hidden
 *
 * The right panel sits on a brand gradient with a soft organic SVG behind it.
 * Children are passed as the form/content block and rendered inside a max-w-md card.
 */
export function AuthSplitLayout({
    title,
    subtitle,
    children,
    rightPanel,
    topRightLink,
    showFooter = true,
}: AuthSplitLayoutProps) {
    return (
        <div className="min-h-screen grid lg:grid-cols-[1fr_1.1fr] bg-white">
            {/* Left column: form */}
            <div className="relative flex flex-col min-h-screen px-6 sm:px-10 lg:px-14 py-6">
                {/* Top bar: logo + optional right link */}
                <header className="flex items-center justify-between gap-4">
                    <Link
                        href="/landing"
                        className="inline-flex items-center gap-2 group"
                        aria-label="TMS — на главную"
                    >
                        <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-sm transition-transform group-hover:scale-105">
                            <Truck className="w-[18px] h-[18px]" />
                        </div>
                        <span className="font-bold text-neutral-900 tracking-tight">TMS</span>
                    </Link>
                    {topRightLink ? (
                        <Link
                            href={topRightLink.href}
                            className="text-sm font-medium text-neutral-600 hover:text-brand-700 transition-colors"
                        >
                            {topRightLink.label}
                        </Link>
                    ) : null}
                </header>

                {/* Center: title + slot */}
                <main className="flex-1 flex items-center justify-center py-10">
                    <div className="w-full max-w-md">
                        <div className="mb-7">
                            <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                                {title}
                            </h1>
                            {subtitle ? (
                                <p className="mt-2 text-neutral-500 text-base leading-relaxed">
                                    {subtitle}
                                </p>
                            ) : null}
                        </div>
                        {children}
                    </div>
                </main>

                {showFooter ? (
                    <footer className="mt-auto pt-4 text-xs text-neutral-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>&copy; {new Date().getFullYear()} TMS</span>
                        <Link
                            href="/legal/privacy"
                            className="underline hover:text-neutral-600"
                        >
                            Политика конфиденциальности
                        </Link>
                    </footer>
                ) : null}
            </div>

            {/* Right column: brand-gradient decorative panel */}
            <aside
                aria-hidden="true"
                className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-brand-50 via-brand-100 to-brand-200 items-center justify-center px-10 py-12"
            >
                {/* Soft organic blob behind */}
                <svg
                    aria-hidden="true"
                    viewBox="0 0 600 600"
                    className="absolute inset-0 w-full h-full opacity-50"
                    preserveAspectRatio="xMidYMid slice"
                >
                    <defs>
                        <radialGradient id="auth-blob-a" cx="30%" cy="30%" r="60%">
                            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                        </radialGradient>
                        <radialGradient id="auth-blob-b" cx="80%" cy="80%" r="55%">
                            <stop offset="0%" stopColor="rgba(99,102,241,0.35)" />
                            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
                        </radialGradient>
                    </defs>
                    <circle cx="180" cy="170" r="220" fill="url(#auth-blob-a)" />
                    <circle cx="470" cy="470" r="260" fill="url(#auth-blob-b)" />
                </svg>

                <div className="relative w-full max-w-lg">
                    {rightPanel}
                </div>
            </aside>
        </div>
    );
}

export default AuthSplitLayout;
