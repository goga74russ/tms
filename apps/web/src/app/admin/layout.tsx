'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/lib/user-context';
import {
    Users,
    FileText,
    ClipboardCheck,
    ShieldCheck,
    ChevronLeft,
    Truck,
    CreditCard,
    Plug,
    Sparkles,
    Settings,
    ScrollText,
    FileSignature,
} from 'lucide-react';
import { OrganizationSetupBanner } from './components/OrganizationSetupBanner';
import { TaxRegimeBanner } from './components/TaxRegimeBanner';

type AdminNavItem =
    | { kind: 'link'; name: string; href: string; icon: typeof Users; superAdminOnly?: boolean }
    | { kind: 'divider'; label: string };

const adminNav: AdminNavItem[] = [
    { kind: 'divider', label: 'Справочники' },
    { kind: 'link', name: 'Пользователи', href: '/admin/users', icon: Users },
    { kind: 'link', name: 'Перевозчики', href: '/admin/carriers', icon: Truck },
    { kind: 'link', name: 'Шаблоны ЧЛ', href: '/admin/checklists', icon: ClipboardCheck },
    { kind: 'link', name: 'Тарифы', href: '/admin/tariffs', icon: FileText },
    { kind: 'link', name: 'МЧД', href: '/admin/mchd', icon: FileSignature },

    { kind: 'divider', label: 'Эксплуатация' },
    // Platform-wide cross-tenant views — hidden from tenant admins.
    { kind: 'link', name: 'Биллинг', href: '/admin/billing', icon: CreditCard, superAdminOnly: true },
    { kind: 'link', name: 'Контроль соответствия', href: '/admin/compliance', icon: ShieldCheck },
    { kind: 'link', name: 'Журнал событий', href: '/admin/audit-log', icon: ScrollText },
    { kind: 'link', name: 'Интеграции', href: '/admin/integrations', icon: Plug },
    { kind: 'link', name: 'Демо-данные', href: '/admin/demo', icon: Sparkles, superAdminOnly: true },
    { kind: 'link', name: 'Настройки', href: '/admin/settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useUser();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!loading && (!user || !user.roles.includes('admin'))) {
            router.push('/');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (!user || !user.roles.includes('admin')) return null;

    return (
        <div className="flex gap-0 -m-6 min-h-screen">
            {/* Admin sidebar — sticky vertical rail */}
            <aside className="w-60 shrink-0 bg-white border-r border-neutral-200 sticky top-0 self-start h-screen overflow-y-auto">
                <div className="px-4 py-4 border-b border-neutral-100">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                            <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-neutral-900 leading-tight">Админка</div>
                            <div className="text-[11px] text-neutral-500 truncate">
                                {user.email ?? 'admin'}
                            </div>
                        </div>
                    </div>
                </div>

                <nav className="px-3 py-3 space-y-0.5">
                    <Link
                        href="/"
                        className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700 mb-2 transition-colors"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        К рабочему кабинету
                    </Link>

                    {adminNav.filter((item) => {
                        if (item.kind !== 'link') return true;
                        if (item.superAdminOnly && !user.isSuperAdmin) return false;
                        return true;
                    }).map((item, idx) => {
                        if (item.kind === 'divider') {
                            return (
                                <div
                                    key={`divider-${idx}-${item.label}`}
                                    className="px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400"
                                >
                                    {item.label}
                                </div>
                            );
                        }
                        const isActive = pathname === item.href;
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                    ? 'bg-brand-50 text-brand-700'
                                    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                                    }`}
                            >
                                {isActive && (
                                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-600" />
                                )}
                                <Icon className={`w-4 h-4 ${isActive ? 'text-brand-600' : 'text-neutral-400'}`} />
                                <span className="truncate">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="px-4 py-3 mt-4 border-t border-neutral-100 text-[10px] text-neutral-400">
                    ТрансПульт · Admin
                </div>
            </aside>

            {/* Content */}
            <main className="flex-1 p-6 min-w-0">
                {/* Глобальный баннер: создание/детач организации для admin-пользователей.
                    Сам компонент решает показываться или нет — рендерит null если
                    у пользователя есть org и нет роли admin. */}
                <div className="mb-4 space-y-3">
                    <OrganizationSetupBanner />
                    <TaxRegimeBanner />
                </div>
                {children}
            </main>
        </div>
    );
}

