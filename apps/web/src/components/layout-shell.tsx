'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { ToastProvider } from './ui/toast';

// Pages that should render without the sidebar (full-screen)
const NO_SIDEBAR_ROUTES = ['/login'];

// Public path prefixes — render without the main app shell (no sidebar, no padding).
// '/print' — печатные формы имеют собственный root-layout (print/layout.tsx с
// чистым <html>/<body> под A4). Без этого исключения dashboard-shell оборачивает
// print-страницу, вложенный <html> схлопывается браузером → пустой <main> (BUG-1
// integration-pass-2026-06-11: /print/invoice рендерился пустым при soft-nav).
const PUBLIC_PATH_PREFIXES = ['/landing', '/signup', '/onboarding', '/legal', '/login', '/forgot-password', '/reset-password', '/print'];

export function LayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const hideSidebar =
        NO_SIDEBAR_ROUTES.includes(pathname) ||
        PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));

    if (hideSidebar) {
        return <ToastProvider>{children}</ToastProvider>;
    }

    return (
        <ToastProvider>
            <div className="flex h-screen">
                <Sidebar />
                <main className="flex-1 overflow-auto">
                    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
                        {children}
                    </div>
                </main>
            </div>
        </ToastProvider>
    );
}
