import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/sidebar';
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
                    <div className="flex h-screen">
                        <Sidebar />
                        <main className="flex-1 overflow-auto">
                            <div className="p-6">
                                {children}
                            </div>
                        </main>
                    </div>
                </UserProvider>
            </body>
        </html>
    );
}
