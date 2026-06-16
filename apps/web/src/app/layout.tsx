import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LayoutShell } from '@/components/layout-shell';
import { CookieConsent } from '@/components/CookieConsent';
import { UserProvider } from '@/lib/user-context';

export const metadata: Metadata = {
    title: 'ТрансПульт — Управление транспортом',
    description: 'Операционная платформа управления транспортной компанией',
};

// Design-plan Блок 4.2 — явный viewport + бренд-themeColor (navy) для таб-бара
// мобильного браузера. Раньше Next отдавал дефолт без themeColor.
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: '#111827',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ru">
            <body className="min-h-screen bg-neutral-50">
                <UserProvider>
                    <LayoutShell>
                        {children}
                    </LayoutShell>
                    <CookieConsent />
                </UserProvider>
            </body>
        </html>
    );
}
