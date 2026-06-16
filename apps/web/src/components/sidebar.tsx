'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Truck, ClipboardList, Map, Wrench, HeartPulse,
    Settings, BarChart3, FileText, DollarSign, Users,
    Home, ChevronLeft, Menu, LogOut, LogIn, Building2,
    Activity, Upload, Siren, Clock, Inbox,
} from 'lucide-react';
import { useState } from 'react';
import { useUser } from '@/lib/user-context';

// ================================================================
// Navigation with role filtering (H-16)
// ================================================================
// Each item has `roles`: which roles can see it.
// Empty/undefined roles → visible to ALL logged-in users.
// 'admin' always sees everything.
// 'driver' sees nothing (mobile only).
const navigation = [
    { name: 'Главная', href: '/', icon: Home },
    // H5 — общая страница заявок (table view) для ролей с доступом к Order.
    // /logist остаётся как рабочий канбан логиста (см. BUG-DISP-001 и Desing-обсуждение
    // /orders A vs /logist B). Это две разные mental models: data view vs workflow board.
    { name: 'Заявки', href: '/orders', icon: ClipboardList, roles: ['logist', 'dispatcher', 'manager', 'accountant'] },
    { name: 'Канбан логиста', href: '/logist', icon: ClipboardList, roles: ['logist'] },
    { name: 'Диспетчерская', href: '/dispatcher', icon: Map, roles: ['dispatcher'] },
    { name: 'Рейсы', href: '/trips', icon: Map, roles: ['logist', 'dispatcher'] },
    { name: 'Техосмотр', href: '/mechanic', icon: Wrench, roles: ['mechanic'] },
    { name: 'Медосмотр', href: '/medic', icon: HeartPulse, roles: ['medic'] },
    { name: 'Путевые листы', href: '/waybills', icon: FileText, roles: ['dispatcher', 'logist', 'mechanic', 'medic'] },
    { name: 'Автопарк', href: '/fleet', icon: Truck, roles: ['mechanic', 'dispatcher', 'logist', 'manager'] },
    { name: 'Ремонты', href: '/repair', icon: Wrench, roles: ['repair_service', 'mechanic'] },
    { name: 'Контрагенты', href: '/contractors', icon: Building2, roles: ['accountant', 'logist'] },
    { name: 'Финансы', href: '/finance', icon: DollarSign, roles: ['accountant', 'manager'] },
    { name: 'СФ с просрочкой', href: '/finance/sf-overdue', icon: Clock, roles: ['accountant', 'manager'] },
    { name: 'KPI', href: '/kpi', icon: BarChart3, roles: ['manager'] },
    { name: 'Тарифы', href: '/tariffs', icon: FileText, roles: ['accountant', 'manager'] },
    { name: 'Водители', href: '/drivers', icon: Users, roles: ['mechanic', 'dispatcher', 'logist', 'manager'] },
    { name: 'Аналитика', href: '/analytics', icon: Activity, roles: ['manager', 'accountant'] },
    { name: 'Импорт', href: '/import', icon: Upload, roles: ['manager'] },
    { name: 'Инциденты', href: '/incidents', icon: Siren, roles: ['dispatcher', 'mechanic', 'manager', 'medic'] },
    { name: 'Претензии', href: '/claims', icon: FileText, roles: ['logist', 'dispatcher', 'accountant', 'manager', 'client'] },
    { name: 'Портал клиента', href: '/client', icon: Building2, roles: ['client'] },
    { name: 'Заявки с сайта', href: '/admin/contacts', icon: Inbox, roles: ['admin'] },
    { name: 'Админ-панель', href: '/admin/users', icon: Settings, roles: ['admin'] },
];

function getRoleName(roles: string[]): string {
    const map: Record<string, string> = {
        admin: 'Администратор',
        logist: 'Логист',
        dispatcher: 'Диспетчер',
        mechanic: 'Механик',
        medic: 'Медик',
        driver: 'Водитель',
        repair_service: 'Ремонтная служба',
        accountant: 'Бухгалтер',
        manager: 'Руководитель',
        client: 'Клиент',
    };
    return roles.map(r => map[r] || r).join(', ');
}

export function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { user, loading, logout } = useUser();

    // Driver role — no sidebar (mobile only)
    if (user && user.roles.includes('driver') && user.roles.length === 1) {
        return null;
    }

    // Filter navigation based on user roles
    const filteredNav = navigation.filter(item => {
        if (!user) return !item.roles; // no user = show only items without roles
        if (user.roles.includes('admin')) return true; // admin sees all
        if (!item.roles) return true; // no roles restriction = visible to all
        return item.roles.some(role => user.roles.includes(role));
    });

    return (
        <aside
            className={`
                hidden md:flex flex-col bg-white border-r border-neutral-200 shadow-soft
                transition-[width] duration-300 ease-in-out shrink-0
                ${collapsed ? 'w-16' : 'w-64'}
            `}
            aria-label="Главное меню"
        >
            {/* Logo */}
            <div className="flex items-center h-16 px-4 border-b border-neutral-200">
                <Link href="/" className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-90">
                    {/* Design Блок 4 — фирменный знак ТрансПульт (navy для светлой шапки). */}
                    <img src="/logo-mark.svg" alt="ТрансПульт" className="w-9 h-9 shrink-0" />
                    {!collapsed && (
                        <div className="min-w-0 flex-1">
                            <div className="font-bold text-lg text-neutral-900 leading-none truncate">ТрансПульт</div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider mt-0.5 truncate">Управление</div>
                        </div>
                    )}
                </Link>
                <button
                    type="button"
                    onClick={() => setCollapsed(!collapsed)}
                    className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600"
                    aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
                >
                    {collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto" aria-label="Навигация">
                {loading ? (
                    <div className="px-3 py-8 flex justify-center">
                        <div className="w-5 h-5 border-2 border-neutral-200 border-t-brand-600 rounded-full animate-spin" aria-label="Загрузка..." />
                    </div>
                ) : (
                    filteredNav.map((item) => {
                        const isActive = pathname === item.href ||
                            (item.href !== '/' && pathname.startsWith(item.href));
                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`
                                    relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                                    transition-all duration-150
                                    ${isActive
                                        ? 'bg-brand-50 text-brand-700 shadow-sm'
                                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                                    }
                                `}
                                title={collapsed ? item.name : undefined}
                                aria-label={collapsed ? item.name : undefined}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {isActive && (
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-accent-500" aria-hidden="true" />
                                )}
                                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-accent-600' : ''}`} />
                                {!collapsed && <span className="truncate">{item.name}</span>}
                            </Link>
                        );
                    })
                )}
            </nav>

            {/* User section or Login component */}
            {!collapsed && (
                <div className="p-3 border-t border-neutral-200">
                    {user ? (
                        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-50">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-success-500 to-success-700 flex items-center justify-center text-white text-sm font-bold shadow-soft shrink-0">
                                {user.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-neutral-900 truncate">{user.fullName}</p>
                                <p className="text-xs text-neutral-500 truncate">{getRoleName(user.roles)}</p>
                            </div>
                            <button
                                type="button"
                                onClick={logout}
                                className="p-1.5 rounded-lg hover:bg-danger-50 text-neutral-400 hover:text-danger-600 transition shrink-0"
                                title="Выйти"
                                aria-label="Выйти"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-brand-50 text-brand-700 hover:bg-brand-100 hover:text-brand-800 rounded-xl text-sm font-semibold transition shadow-sm"
                        >
                            <LogIn className="w-4 h-4" />
                            Войти в систему
                        </Link>
                    )}
                </div>
            )}

            {/* Collapsed user avatar */}
            {collapsed && user && (
                <div className="p-2 border-t border-neutral-200 flex flex-col items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-success-500 to-success-700 flex items-center justify-center text-white text-sm font-bold shadow-soft" title={user.fullName}>
                        {user.fullName.charAt(0).toUpperCase()}
                    </div>
                    <button
                        type="button"
                        onClick={logout}
                        className="p-1.5 rounded-lg hover:bg-danger-50 text-neutral-400 hover:text-danger-600"
                        title="Выйти"
                        aria-label="Выйти"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            )}
        </aside>
    );
}
