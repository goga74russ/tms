'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/lib/user-context';
import { Users, FileText, ClipboardCheck, ShieldCheck, ChevronLeft } from 'lucide-react';

const adminNav = [
    { name: 'Пользователи', href: '/admin/users', icon: Users },
    { name: 'Тарифы', href: '/admin/tariffs', icon: FileText },
    { name: 'Шаблоны ЧЛ', href: '/admin/checklists', icon: ClipboardCheck },
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
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (!user || !user.roles.includes('admin')) return null;

    return (
        <div className="flex gap-6 -m-6">
            {/* Admin sidebar */}
            <div className="w-56 min-h-screen bg-white border-r border-slate-200 p-4 space-y-1">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                    <ShieldCheck className="w-5 h-5 text-indigo-600" />
                    <h2 className="font-bold text-slate-900">Админ</h2>
                </div>

                <Link
                    href="/"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 mb-2"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Назад
                </Link>

                {adminNav.map(item => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${isActive
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                        >
                            <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-indigo-600' : ''}`} />
                            {item.name}
                        </Link>
                    );
                })}
            </div>

            {/* Content */}
            <div className="flex-1 p-6">
                {children}
            </div>
        </div>
    );
}
