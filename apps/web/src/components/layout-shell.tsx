'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';

// Pages that should render without the sidebar (full-screen)
const NO_SIDEBAR_ROUTES = ['/login'];

export function LayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const hideSidebar = NO_SIDEBAR_ROUTES.includes(pathname);

    if (hideSidebar) {
        return <>{children}</>;
    }

    return (
        <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto">
                <div className="p-6">
                    {children}
                </div>
            </main>
        </div>
    );
}
