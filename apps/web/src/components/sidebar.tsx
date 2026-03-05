'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Truck, ClipboardList, Map, Wrench, HeartPulse,
    Settings, BarChart3, FileText, DollarSign, Users,
    Home, ChevronLeft, Menu, LogOut, LogIn, Building2,
    Activity, Upload,
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
    { name: 'Заявки', href: '/logist', icon: ClipboardList, roles: ['logist', 'dispatcher'] },
    { name: 'Диспетчерская', href: '/dispatcher', icon: Map, roles: ['dispatcher'] },
    { name: 'Рейсы', href: '/trips', icon: Map, roles: ['logist', 'dispatcher'] },
    { name: 'Техосмотр', href: '/mechanic', icon: Wrench, roles: ['mechanic'] },
    { name: 'Медосмотр', href: '/medic', icon: HeartPulse, roles: ['medic'] },
    { name: 'Путевые листы', href: '/waybills', icon: FileText, roles: ['dispatcher', 'logist', 'mechanic', 'medic'] },
    { name: 'Автопарк', href: '/fleet', icon: Truck, roles: ['mechanic', 'dispatcher', 'logist', 'manager'] },
    { name: 'Ремонты', href: '/repair', icon: Wrench, roles: ['repair_service', 'mechanic'] },
    { name: 'Контрагенты', href: '/contractors', icon: Building2, roles: ['accountant', 'logist'] },
    { name: 'Финансы', href: '/finance', icon: DollarSign, roles: ['accountant', 'manager'] },
    { name: 'KPI', href: '/kpi', icon: BarChart3, roles: ['manager'] },
    { name: 'Тарифы', href: '/tariffs', icon: FileText, roles: ['accountant', 'manager'] },
    { name: 'Водители', href: '/drivers', icon: Users, roles: ['mechanic', 'dispatcher', 'logist', 'manager'] },
    { name: 'Аналитика', href: '/analytics', icon: Activity, roles: ['manager', 'accountant'] },
    { name: 'Импорт', href: '/import', icon: Upload, roles: ['manager'] },
    { name: 'Портал клиента', href: '/client', icon: Building2, roles: ['client'] },
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
        flex flex-col bg-white border-r border-slate-200
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-16' : 'w-64'}
      `}
        >
            {/* Logo */}
            <div className="flex items-center h-16 px-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <Truck className="w-5 h-5 text-white" />
                    </div>
                    {!collapsed && (
                        <span className="font-bold text-lg text-slate-900">TMS</span>
                    )}
                </div>
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                    {collapsed ? <Menu className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
                {loading ? (
                    <div className="px-3 py-8 flex justify-center">
                        <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
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
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150
                ${isActive
                                        ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }
              `}
                                title={collapsed ? item.name : undefined}
                            >
                                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-indigo-600' : ''}`} />
                                {!collapsed && <span>{item.name}</span>}
                            </Link>
                        );
                    })
                )}
            </nav>

            {/* User section or Login component */}
            {!collapsed && (
                <div className="p-4 border-t border-slate-200">
                    {user ? (
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                                {user.fullName.charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900 truncate">{user.fullName}</p>
                                <p className="text-xs text-slate-500">{getRoleName(user.roles)}</p>
                            </div>
                            <button
                                onClick={logout}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                                title="Выйти"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 rounded-xl text-sm font-semibold transition"
                        >
                            <LogIn className="w-4 h-4" />
                            Войти в систему
                        </Link>
                    )}
                </div>
            )}

            {/* Collapsed user avatar */}
            {collapsed && user && (
                <div className="p-2 border-t border-slate-200 flex justify-center">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold" title={user.fullName}>
                        {user.fullName.charAt(0)}
                    </div>
                </div>
            )}
        </aside>
    );
}
