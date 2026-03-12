'use client';

import { useState, useCallback, useEffect } from 'react';
import { ClipboardList, Plus, Filter, RefreshCw, Loader2, AlertCircle, Truck } from 'lucide-react';
import { KanbanBoard } from './components/KanbanBoard';
import { OrderFilters } from './components/OrderFilters';
import { CreateOrderModal } from './components/CreateOrderModal';
import { CreateTripModal } from './components/CreateTripModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';

export type Order = {
    id: string;
    number: string;
    status: string;
    contractorId: string;
    contractorName: string;
    cargoDescription: string;
    cargoWeightKg: number;
    loadingAddress: string;
    unloadingAddress: string;
    loadingWindowStart?: string;
    loadingWindowEnd?: string;
    unloadingWindowStart?: string;
    unloadingWindowEnd?: string;
    createdAt: string;
};

const STATUS_COLUMNS = [
    { key: 'draft', label: 'Черновик', color: '#94a3b8' },
    { key: 'confirmed', label: 'В работе', color: '#3b82f6' },
    { key: 'assigned', label: 'Назначена', color: '#8b5cf6' },
    { key: 'in_transit', label: 'В пути', color: '#f59e0b' },
    { key: 'delivered', label: 'Доставлена', color: '#22c55e' },
];

export default function LogistPage() {
    const [ordersList, setOrdersList] = useState<Order[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showTripModal, setShowTripModal] = useState(false);
    const [filtersVisible, setFiltersVisible] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [activeFilters, setActiveFilters] = useState<{
        contractorId?: string;
        dateFrom?: string;
        dateTo?: string;
        search?: string;
    }>({});

    // Show toast notification
    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // Load orders from API — no fallback, show empty state on error
    const loadOrders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const json = await api.get('/orders?limit=100');
            if (json.success) {
                setOrdersList(json.data ?? []);
            } else {
                throw new Error(json.error || 'Unknown error');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить заявки');
            // Keep existing data if we already have some
            setOrdersList(prev => prev);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadOrders();
        const intervalId = setInterval(loadOrders, 30000);
        return () => clearInterval(intervalId);
    }, [loadOrders]);

    // Filter orders
    const filteredOrders = ordersList.filter(order => {
        if (activeFilters.contractorId && order.contractorId !== activeFilters.contractorId) return false;
        if (activeFilters.search) {
            const q = activeFilters.search.toLowerCase();
            const match = order.number.toLowerCase().includes(q)
                || order.cargoDescription.toLowerCase().includes(q)
                || order.loadingAddress.toLowerCase().includes(q)
                || order.unloadingAddress.toLowerCase().includes(q)
                || order.contractorName?.toLowerCase().includes(q);
            if (!match) return false;
        }
        return true;
    });

    // Handle drag-and-drop status change
    const handleStatusChange = useCallback(async (orderId: string, newStatus: string) => {
        const order = ordersList.find(o => o.id === orderId);
        if (!order) return;

        // Optimistic update
        setOrdersList(prev => prev.map(o =>
            o.id === orderId ? { ...o, status: newStatus } : o,
        ));

        try {
            let json;
            if (newStatus === 'confirmed') {
                json = await api.post(`/orders/${orderId}/confirm`, {});
            } else if (newStatus === 'cancelled') {
                json = await api.post(`/orders/${orderId}/cancel`, {});
            } else {
                // General status update via PUT
                json = await api.put(`/orders/${orderId}`, { status: newStatus });
            }
            if (!json.success) {
                throw new Error(json.error || 'API Error');
            }
            showToast(`Статус → ${newStatus}`);
        } catch (err) {
            console.error('Failed to update order status', err);
            showToast(err instanceof Error ? err.message : 'Не удалось обновить статус', 'error');
            loadOrders();
        }
    }, [ordersList, loadOrders, showToast]);

    // Handle new order creation
    const handleCreateOrder = useCallback((order: Order) => {
        setOrdersList(prev => [order, ...prev]);
        setShowCreateModal(false);
        showToast('Заявка создана');
        setTimeout(loadOrders, 500);
    }, [loadOrders, showToast]);

    // Handle transition rejection toast from KanbanBoard
    const handleTransitionReject = useCallback((message: string) => {
        showToast(message, 'error');
    }, [showToast]);

    // Summary stats
    const stats = STATUS_COLUMNS.map(col => ({
        ...col,
        count: filteredOrders.filter(o => o.status === col.key).length,
    }));

    // Unique contractors for filter dropdown
    const contractors = Array.from(
        new Map(ordersList.map(o => [o.contractorId, { id: o.contractorId, name: o.contractorName }])).values(),
    );

    return (
        <div className="space-y-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-top-2 duration-300 ${toast.type === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <ClipboardList className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Заявки</h1>
                        <p className="text-sm text-slate-500">Управление заявками на перевозку</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {loading && (
                        <div className="flex items-center gap-2 text-slate-400 text-sm mr-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Обновление...</span>
                        </div>
                    )}
                    <Button
                        variant={filtersVisible ? 'default' : 'outline'}
                        onClick={() => setFiltersVisible(!filtersVisible)}
                        className="gap-2"
                    >
                        <Filter className="w-4 h-4" />
                        Фильтры
                    </Button>
                    <Button variant="outline" className="gap-2 px-3" onClick={loadOrders}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setShowTripModal(true)}
                        className="gap-2"
                    >
                        <Truck className="w-4 h-4" />
                        Новый рейс
                    </Button>
                    <Button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Новая заявка
                    </Button>
                </div>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-5 gap-3">
                {stats.map(s => (
                    <Card key={s.key} className="hover:border-slate-300 transition-colors">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <div
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: s.color }}
                                />
                                <span className="text-xs font-medium text-slate-500">{s.label}</span>
                            </div>
                            <span className="text-2xl font-bold text-slate-900">{s.count}</span>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Error state */}
            {error && ordersList.length === 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
                    <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-red-700 mb-1">{error}</p>
                    <p className="text-xs text-red-500 mb-4">Проверьте подключение к серверу</p>
                    <Button variant="outline" onClick={loadOrders} className="gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Повторить
                    </Button>
                </div>
            )}

            {/* Filters */}
            {filtersVisible && (
                <OrderFilters
                    filters={activeFilters}
                    onFiltersChange={setActiveFilters}
                    contractors={contractors}
                />
            )}

            {/* Kanban Board */}
            {(ordersList.length > 0 || !error) && (
                <KanbanBoard
                    orders={filteredOrders}
                    columns={STATUS_COLUMNS}
                    onStatusChange={handleStatusChange}
                    onTransitionReject={handleTransitionReject}
                />
            )}

            {/* Create Order Modal */}
            {showCreateModal && (
                <CreateOrderModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={handleCreateOrder}
                />
            )}

            {/* Create Trip Modal */}
            {showTripModal && (
                <CreateTripModal
                    onClose={() => setShowTripModal(false)}
                    onCreated={() => {
                        setShowTripModal(false);
                        showToast('Рейс создан');
                        loadOrders();
                    }}
                />
            )}
        </div>
    );
}
