'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { ToastProvider } from './ui/toast';

// Pages that should render without the sidebar (full-screen)
const NO_SIDEBAR_ROUTES = ['/login'];

export function LayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const hideSidebar = NO_SIDEBAR_ROUTES.includes(pathname);

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
