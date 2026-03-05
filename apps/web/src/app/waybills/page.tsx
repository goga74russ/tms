'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    FileText, Search, Filter, X, Eye, Lock, CheckCircle2,
    Clock, RotateCcw, ChevronDown, Truck, User, Download,
} from 'lucide-react';

// ================================================================
// Types
// ================================================================
interface Waybill {
    id: string;
    number: string;
    tripId: string;
    vehicleId: string;
    driverId: string;
    techInspectionId: string;
    medInspectionId: string;
    status: string;
    odometerOut: number;
    odometerIn: number | null;
    fuelIn: number | null;
    departureAt: string | null;
    returnAt: string | null;
    issuedAt: string;
    closedAt: string | null;
    mechanicSignature: string | null;
    medicSignature: string | null;
}

interface WaybillDetail extends Waybill {
    vehicle?: { plateNumber: string; make: string; model: string };
    driver?: { fullName: string; licenseNumber: string };
    trip?: { number: string; status: string };
}

// ================================================================
// Status badge component
// ================================================================
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
        formed: {
            color: 'bg-slate-100 text-slate-600 border-slate-200',
            label: 'Сформирован',
            icon: <Clock className="w-3.5 h-3.5" />,
        },
        issued: {
            color: 'bg-blue-100 text-blue-700 border-blue-200',
            label: 'Выдан',
            icon: <FileText className="w-3.5 h-3.5" />,
        },
        closed: {
            color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
            label: 'Закрыт',
            icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        },
    };

    const c = config[status] || config.formed;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.color}`}>
            {c.icon}
            {c.label}
        </span>
    );
}

// ================================================================
// Close Waybill Modal
// ================================================================
function CloseWaybillModal({
    waybill,
    onClose,
    onSuccess,
}: {
    waybill: WaybillDetail;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [odometerIn, setOdometerIn] = useState('');
    const [fuelIn, setFuelIn] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!odometerIn) {
            setError('Укажите показания одометра');
            return;
        }

        const odoValue = parseInt(odometerIn);
        if (odoValue < waybill.odometerOut) {
            setError(`Одометр возврата (${odoValue}) не может быть меньше одометра выезда (${waybill.odometerOut})`);
            return;
        }

        try {
            setSubmitting(true);
            setError('');
            await api.post(`/waybills/${waybill.id}/close`, {
                odometerIn: odoValue,
                fuelIn: fuelIn ? parseFloat(fuelIn) : undefined,
            });
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Ошибка при закрытии');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Card className="w-full max-w-md mx-4 shadow-xl">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5 text-emerald-600" />
                            Закрытие путевого листа
                        </CardTitle>
                        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                        {waybill.number} • {waybill.vehicle?.plateNumber}
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                        Одометр при выезде: <strong>{waybill.odometerOut.toLocaleString()} км</strong>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700">
                            Одометр при возврате (км) *
                        </label>
                        <input
                            type="number"
                            placeholder="Пробег при возврате"
                            value={odometerIn}
                            onChange={e => setOdometerIn(e.target.value)}
                            className="w-full px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                            min={waybill.odometerOut}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700">
                            Остаток топлива (л)
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            placeholder="Необязательное поле"
                            value={fuelIn}
                            onChange={e => setFuelIn(e.target.value)}
                            className="w-full px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1" onClick={onClose}>
                            Отмена
                        </Button>
                        <Button
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting ? 'Закрываю...' : 'Закрыть ПЛ'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ================================================================
// Detail Modal
// ================================================================
function DetailModal({
    waybill,
    onClose,
    onCloseWaybill,
}: {
    waybill: WaybillDetail;
    onClose: () => void;
    onCloseWaybill: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Card className="w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Путевой лист {waybill.number}
                        </CardTitle>
                        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                    <StatusBadge status={waybill.status} />
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Vehicle */}
                    {waybill.vehicle && (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                            <Truck className="w-5 h-5 text-slate-500" />
                            <div>
                                <p className="text-sm font-semibold text-slate-800">{waybill.vehicle.plateNumber}</p>
                                <p className="text-xs text-slate-500">{waybill.vehicle.make} {waybill.vehicle.model}</p>
                            </div>
                        </div>
                    )}

                    {/* Driver */}
                    {waybill.driver && (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                            <User className="w-5 h-5 text-slate-500" />
                            <div>
                                <p className="text-sm font-semibold text-slate-800">{waybill.driver.fullName}</p>
                                <p className="text-xs text-slate-500">ВУ: {waybill.driver.licenseNumber}</p>
                            </div>
                        </div>
                    )}

                    {/* Trip */}
                    {waybill.trip && (
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <p className="text-sm text-slate-600">
                                Рейс: <strong>{waybill.trip.number}</strong>
                                <span className="ml-2 text-xs text-slate-400">({waybill.trip.status})</span>
                            </p>
                        </div>
                    )}

                    {/* Data grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-blue-50 rounded-xl">
                            <p className="text-xs text-blue-500 mb-1">Одометр выезда</p>
                            <p className="text-lg font-bold text-blue-700">{waybill.odometerOut.toLocaleString()} км</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl">
                            <p className="text-xs text-emerald-500 mb-1">Одометр возврата</p>
                            <p className="text-lg font-bold text-emerald-700">
                                {waybill.odometerIn ? `${waybill.odometerIn.toLocaleString()} км` : '—'}
                            </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <p className="text-xs text-slate-400 mb-1">Выезд</p>
                            <p className="text-sm font-medium text-slate-700">
                                {waybill.departureAt ? new Date(waybill.departureAt).toLocaleString('ru-RU') : '—'}
                            </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <p className="text-xs text-slate-400 mb-1">Возврат</p>
                            <p className="text-sm font-medium text-slate-700">
                                {waybill.returnAt ? new Date(waybill.returnAt).toLocaleString('ru-RU') : '—'}
                            </p>
                        </div>
                    </div>

                    {waybill.fuelIn !== null && waybill.fuelIn !== undefined && (
                        <div className="p-3 bg-amber-50 rounded-xl">
                            <p className="text-xs text-amber-500 mb-1">Остаток топлива</p>
                            <p className="text-lg font-bold text-amber-700">{waybill.fuelIn} л</p>
                        </div>
                    )}

                    {/* Signatures */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-orange-50 rounded-xl">
                            <p className="text-xs text-orange-500 mb-1">Подпись механика</p>
                            <p className="text-sm font-medium text-orange-700">
                                {waybill.mechanicSignature ? '✓ ПЭП' : '—'}
                            </p>
                        </div>
                        <div className="p-3 bg-rose-50 rounded-xl">
                            <p className="text-xs text-rose-500 mb-1">Подпись медика</p>
                            <p className="text-sm font-medium text-rose-700">
                                {waybill.medicSignature ? '✓ ПЭП' : '—'}
                            </p>
                        </div>
                    </div>

                    <div className="text-xs text-slate-400 pt-2">
                        Выдан: {new Date(waybill.issuedAt).toLocaleString('ru-RU')}
                        {waybill.closedAt && ` • Закрыт: ${new Date(waybill.closedAt).toLocaleString('ru-RU')}`}
                    </div>

                    {/* Close button if not yet closed */}
                    {waybill.status !== 'closed' && (
                        <Button
                            className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            size="lg"
                            onClick={onCloseWaybill}
                        >
                            <Lock className="w-4 h-4 mr-2" />
                            Закрыть путевой лист
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ================================================================
// Main Page
// ================================================================
export default function WaybillsPage() {
    const [waybills, setWaybills] = useState<Waybill[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 20;

    // Filters
    const [statusFilter, setStatusFilter] = useState('');
    const [searchFilter, setSearchFilter] = useState('');

    // Modals
    const [detailWaybill, setDetailWaybill] = useState<WaybillDetail | null>(null);
    const [closeWaybill, setCloseWaybill] = useState<WaybillDetail | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const loadWaybills = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{
                success: boolean;
                data: Waybill[];
                total: number;
                page: number;
            }>(`/waybills?page=${page}&limit=${limit}`);

            if (result.success) {
                setWaybills(result.data);
                setTotal(result.total);
            }
        } catch (err) {
            console.error('Failed to load waybills:', err);
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        loadWaybills();
    }, [loadWaybills]);

    const openDetail = async (waybillId: string) => {
        try {
            const result = await api.get<{ success: boolean; data: WaybillDetail }>(`/waybills/${waybillId}`);
            if (result.success) {
                setDetailWaybill(result.data);
            }
        } catch (err) {
            console.error('Failed to load waybill detail:', err);
        }
    };

    const handleCloseSuccess = () => {
        setCloseWaybill(null);
        setDetailWaybill(null);
        setToast({ message: '✅ Путевой лист закрыт', type: 'success' });
        loadWaybills();
    };

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Client-side filtering (API handles pagination, we filter on current page)
    const filteredWaybills = waybills.filter(wb => {
        if (statusFilter && wb.status !== statusFilter) return false;
        if (searchFilter && !wb.number.toLowerCase().includes(searchFilter.toLowerCase())) return false;
        return true;
    });

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-6 py-4 -m-6 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Путевые листы</h1>
                            <p className="text-sm text-slate-500">Управление путевыми листами</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadWaybills}>
                        <RotateCcw className="w-4 h-4 mr-1.5" />
                        Обновить
                    </Button>
                </div>
            </header>

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Поиск по номеру (WB-...)"
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                    />
                </div>

                {/* Status filter */}
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="appearance-none pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 cursor-pointer"
                    >
                        <option value="">Все статусы</option>
                        <option value="formed">Сформирован</option>
                        <option value="issued">Выдан</option>
                        <option value="closed">Закрыт</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                {(statusFilter || searchFilter) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setStatusFilter(''); setSearchFilter(''); }}
                        className="text-slate-500"
                    >
                        <X className="w-4 h-4 mr-1" />
                        Сбросить
                    </Button>
                )}
            </div>

            {/* Table */}
            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Номер</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Статус</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">ТС</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Водитель</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Выезд</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Одометр</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Дата выдачи</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-16">
                                        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredWaybills.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-16 text-slate-400">
                                        {waybills.length === 0 ? 'Нет путевых листов' : 'Ничего не найдено'}
                                    </td>
                                </tr>
                            ) : (
                                filteredWaybills.map((wb) => (
                                    <tr
                                        key={wb.id}
                                        onClick={() => openDetail(wb.id)}
                                        className="border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer transition"
                                    >
                                        <td className="px-4 py-3">
                                            <span className="font-mono font-semibold text-blue-700">{wb.number}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={wb.status} />
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 font-mono text-xs">{(wb as any).vehiclePlate || wb.vehicleId.substring(0, 8)}</td>
                                        <td className="px-4 py-3 text-slate-700 text-xs">{(wb as any).driverName || wb.driverId.substring(0, 8)}</td>
                                        <td className="px-4 py-3 text-slate-600 text-xs">
                                            {wb.departureAt ? new Date(wb.departureAt).toLocaleString('ru-RU', {
                                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                                            }) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 text-xs">
                                            {wb.odometerOut.toLocaleString()} →{' '}
                                            {wb.odometerIn ? wb.odometerIn.toLocaleString() : '...'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">
                                            {new Date(wb.issuedAt).toLocaleDateString('ru-RU')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); openDetail(wb.id); }}
                                                    className="p-1 rounded hover:bg-blue-100 transition-colors" title="Подробности"
                                                >
                                                    <Eye className="w-4 h-4 text-slate-400" />
                                                </button>
                                                <a
                                                    href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/waybills/${wb.id}/etrn`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="p-1 rounded hover:bg-emerald-100 transition-colors" title="Скачать ЭТрН XML"
                                                >
                                                    <Download className="w-4 h-4 text-emerald-600" />
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                        <p className="text-xs text-slate-500">
                            Показано {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} из {total}
                        </p>
                        <div className="flex gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                ← Назад
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Вперёд →
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Detail Modal */}
            {detailWaybill && !closeWaybill && (
                <DetailModal
                    waybill={detailWaybill}
                    onClose={() => setDetailWaybill(null)}
                    onCloseWaybill={() => {
                        setCloseWaybill(detailWaybill);
                    }}
                />
            )}

            {/* Close Waybill Modal */}
            {closeWaybill && (
                <CloseWaybillModal
                    waybill={closeWaybill}
                    onClose={() => setCloseWaybill(null)}
                    onSuccess={handleCloseSuccess}
                />
            )}
        </div>
    );
}
