'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Truck, Package, ClipboardCheck, FileText, BarChart3,
    Shield, Wrench, Users, ArrowRight, CheckCircle2, MapPin,
} from 'lucide-react';
import { useUser } from '@/lib/user-context';

const ROLE_ROUTES: Record<string, string> = {
    logist: '/logist',
    dispatcher: '/dispatcher',
    mechanic: '/mechanic',
    medic: '/medic',
    manager: '/kpi',
    accountant: '/finance',
    repair_service: '/repair',
    admin: '/admin/users',
    client: '/client',
    driver: '/trips',
};

const MODULES = [
    { icon: Package, title: 'Заявки', desc: 'Создание и управление заявками на перевозку грузов' },
    { icon: Truck, title: 'Рейсы', desc: 'Планирование и контроль рейсов с отслеживанием статусов' },
    { icon: ClipboardCheck, title: 'Осмотры', desc: 'Медицинские и технические осмотры водителей и транспорта' },
    { icon: FileText, title: 'Путевые листы', desc: 'Электронное оформление и контроль путевых листов' },
    { icon: Wrench, title: 'Ремонты', desc: 'Учёт технического обслуживания и ремонтов ТС' },
    { icon: BarChart3, title: 'Финансы и KPI', desc: 'Тарификация, счета, аналитика и ключевые показатели' },
    { icon: MapPin, title: 'Геолокация', desc: 'Интеграция с Wialon, мониторинг маршрутов в реальном времени' },
    { icon: Shield, title: '152-ФЗ', desc: 'Защита персональных данных, журнал событий, разграничение доступа' },
];

const ROLES = [
    { label: 'Логист', desc: 'Заявки, тарифы, контрагенты' },
    { label: 'Диспетчер', desc: 'Рейсы, путевые листы, карта' },
    { label: 'Механик', desc: 'ТО, ремонты, техосмотры' },
    { label: 'Медик', desc: 'Медосмотры водителей' },
    { label: 'Бухгалтер', desc: 'Счета, финансы, экспорт 1С' },
    { label: 'Руководитель', desc: 'KPI, аналитика, отчёты' },
    { label: 'Водитель', desc: 'Мобильное приложение, чекпоинты' },
    { label: 'Клиент', desc: 'Портал отслеживания заявок' },
];

export default function LandingPage() {
    const { user, loading } = useUser();
    const router = useRouter();

    // If authenticated — redirect to role-specific dashboard
    useEffect(() => {
        if (!loading && user) {
            const route = user.roles.reduce<string>(
                (acc, role) => acc || (ROLE_ROUTES[role] ?? ''), ''
            ) || '/logist';
            router.replace(route);
        }
    }, [user, loading, router]);

    // While checking auth — show nothing to avoid flash
    if (loading || user) return null;

    return (
        <div className="min-h-screen bg-white">
            {/* Hero */}
            <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 text-white">
                <div className="max-w-6xl mx-auto px-6 py-20">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/30">
                            <Truck className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight">TMS</span>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
                        Система управления<br />грузоперевозками
                    </h1>
                    <p className="text-lg text-indigo-100 max-w-xl mb-10 leading-relaxed">
                        Комплексная платформа для автотранспортных компаний — от оформления
                        заявки до выставления счёта, с полным соответствием 152-ФЗ и ЭДО.
                    </p>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            href="/login"
                            className="inline-flex items-center gap-2 bg-white text-indigo-700 font-semibold px-6 py-3 rounded-xl shadow-lg hover:shadow-xl hover:bg-indigo-50 transition-all"
                        >
                            Войти в систему
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>

                    {/* Stats strip */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16">
                        {[
                            { value: '10', label: 'Ролей пользователей' },
                            { value: '22', label: 'Таблиц в базе данных' },
                            { value: '100%', label: 'Тестов проходят' },
                            { value: '152-ФЗ', label: 'Персональные данные' },
                        ].map(s => (
                            <div key={s.label} className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/20">
                                <div className="text-2xl font-bold">{s.value}</div>
                                <div className="text-sm text-indigo-200 mt-1">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modules */}
            <div className="max-w-6xl mx-auto px-6 py-16">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Модули системы</h2>
                <p className="text-slate-500 mb-10">Полный цикл — от заявки до оплаты</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {MODULES.map(m => {
                        const Icon = m.icon;
                        return (
                            <div key={m.title} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center mb-3">
                                    <Icon className="w-5 h-5 text-indigo-600" />
                                </div>
                                <h3 className="font-semibold text-slate-900 mb-1">{m.title}</h3>
                                <p className="text-sm text-slate-500 leading-relaxed">{m.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Roles */}
            <div className="bg-slate-50 border-y border-slate-200">
                <div className="max-w-6xl mx-auto px-6 py-16">
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Роли пользователей</h2>
                    <p className="text-slate-500 mb-10">Каждая роль видит только свои данные и инструменты</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {ROLES.map(r => (
                            <div key={r.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
                                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-medium text-slate-900 text-sm">{r.label}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">{r.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* CTA */}
            <div className="max-w-6xl mx-auto px-6 py-16 text-center">
                <Users className="w-10 h-10 text-indigo-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-slate-900 mb-3">Готовы начать?</h2>
                <p className="text-slate-500 mb-8">Войдите в систему с вашими учётными данными</p>
                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-8 py-3.5 rounded-xl shadow-md hover:bg-indigo-700 hover:shadow-lg transition-all"
                >
                    Войти в систему
                    <ArrowRight className="w-4 h-4" />
                </Link>
            </div>

            <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-400">
                © {new Date().getFullYear()} TMS — Система управления транспортом. Все права защищены.
            </footer>
        </div>
    );
}
