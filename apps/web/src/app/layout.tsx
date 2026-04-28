import type { Metadata } from 'next';
import './globals.css';
import { LayoutShell } from '@/components/layout-shell';
import { UserProvider } from '@/lib/user-context';

export const metadata: Metadata = {
    title: 'TMS — Управление транспортом',
    description: 'Операционная платформа управления транспортной компанией',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ru">
            <body className="min-h-screen bg-slate-50">
                <UserProvider>
                    <LayoutShell>
                        {children}
                    </LayoutShell>
                </UserProvider>
            </body>
        </html>
    );
}
