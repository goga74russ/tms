'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Truck, Package, ClipboardCheck, Activity } from 'lucide-react';

interface DashboardStats {
    activeTrips: number;
    pendingOrders: number;
    vehiclesOnLine: number;
    awaitingInspection: number;
}

export default function HomePage() {
    const [stats, setStats] = useState<DashboardStats>({
        activeTrips: 0, pendingOrders: 0, vehiclesOnLine: 0, awaitingInspection: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadStats() {
            try {
                // Try to load stats from API endpoints
                const [tripsRes, ordersRes, vehiclesRes] = await Promise.allSettled([
                    api.get<any>('/trips?status=in_transit&limit=1'),
                    api.get<any>('/orders?status=confirmed&limit=1'),
                    api.get<any>('/fleet/vehicles?status=in_trip&limit=1'),
                ]);

                setStats({
                    activeTrips: tripsRes.status === 'fulfilled' ? (tripsRes.value?.pagination?.total ?? 0) : 0,
                    pendingOrders: ordersRes.status === 'fulfilled' ? (ordersRes.value?.pagination?.total ?? 0) : 0,
                    vehiclesOnLine: vehiclesRes.status === 'fulfilled' ? (vehiclesRes.value?.pagination?.total ?? 0) : 0,
                    awaitingInspection: 0, // Inspection queue endpoint
                });
            } catch {
                // Dashboard graceful degradation — show zeros
            } finally {
                setLoading(false);
            }
        }
        loadStats();
    }, []);

    const cards = [
        { label: 'Активные рейсы', value: stats.activeTrips, color: 'from-blue-500 to-blue-600', icon: Activity },
        { label: 'Заявки в работе', value: stats.pendingOrders, color: 'from-indigo-500 to-purple-600', icon: Package },
        { label: 'ТС на линии', value: stats.vehiclesOnLine, color: 'from-green-500 to-emerald-600', icon: Truck },
        { label: 'Ожидают осмотра', value: stats.awaitingInspection, color: 'from-amber-500 to-orange-600', icon: ClipboardCheck },
    ];

    return (
        <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-6">
                Панель управления
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {cards.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <div
                            key={stat.label}
                            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm text-slate-500">{stat.label}</p>
                                <Icon className="w-5 h-5 text-slate-400" />
                            </div>
                            <p className="text-3xl font-bold text-slate-900">
                                {loading ? '...' : stat.value}
                            </p>
                            <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${stat.color} mt-3`} />
                        </div>
                    );
                })}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    🚛 TMS — Система управления транспортом
                </h2>
                <p className="text-slate-600 leading-relaxed">
                    Система управления грузоперевозками. Модули: заявки, рейсы,
                    автопарк, осмотры, путевые листы, финансы, KPI.
                </p>
            </div>
        </div>
    );
}
