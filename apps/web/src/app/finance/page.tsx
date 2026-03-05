"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { api } from "@/lib/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";

// ——— Types ———
interface Invoice {
    id: string;
    number: string;
    contractorId: string;
    type: string;
    status: string;
    subtotal: number;
    vatAmount: number;
    total: number;
    periodStart: string;
    periodEnd: string;
    createdAt: string;
    tripIds?: string[];
}

type ApiResponse<T> = { success: boolean; data: T };

// ——— Status helpers ———
const STATUS_OPTIONS = [
    { value: '', label: 'Все статусы' },
    { value: 'draft', label: 'Черновик' },
    { value: 'sent', label: 'Отправлен' },
    { value: 'paid', label: 'Оплачен' },
    { value: 'overdue', label: 'Просрочен' },
    { value: 'cancelled', label: 'Отменён' },
];

const getStatusColor = (status: string) => {
    switch (status) {
        case 'paid': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'sent': return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'overdue': return 'bg-red-50 text-red-700 border-red-200';
        case 'cancelled': return 'bg-slate-100 text-slate-500 border-slate-200';
        default: return 'bg-amber-50 text-amber-700 border-amber-200';
    }
};

const getStatusText = (status: string) => {
    switch (status) {
        case 'paid': return 'Оплачен';
        case 'sent': return 'Отправлен';
        case 'overdue': return 'Просрочен';
        case 'cancelled': return 'Отменён';
        default: return 'Черновик';
    }
};

const fmtMoney = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ₽';

// ================================================================
export default function FinanceDashboard() {
    // State
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [filterStatus, setFilterStatus] = useState('');
    const [filterSearch, setFilterSearch] = useState('');

    // Invoice modal
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [statusChanging, setStatusChanging] = useState(false);

    // Generate invoice form
    const [generating, setGenerating] = useState(false);

    // ——— Load invoices ———
    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<ApiResponse<Invoice[]>>('/finance/invoices');
            setInvoices(res.data || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load invoices');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

    // ——— Derived summary ———
    const summary = useMemo(() => {
        const pending = invoices.filter(i => i.status === 'sent' || i.status === 'draft')
            .reduce((sum, i) => sum + i.total, 0);
        const overdue = invoices.filter(i => i.status === 'overdue')
            .reduce((sum, i) => sum + i.total, 0);
        const totalPaid = invoices.filter(i => i.status === 'paid')
            .reduce((sum, i) => sum + i.total, 0);
        return { pending, overdue, totalPaid };
    }, [invoices]);

    // ——— Filtered list ———
    const filteredInvoices = useMemo(() => {
        return invoices.filter(inv => {
            if (filterStatus && inv.status !== filterStatus) return false;
            if (filterSearch && !inv.number.toLowerCase().includes(filterSearch.toLowerCase())) return false;
            return true;
        });
    }, [invoices, filterStatus, filterSearch]);

    // ——— Actions ———
    const handleGenerateInvoice = async () => {
        setGenerating(true);
        try {
            // In a full flow, a modal would collect contractorId and period
            await api.post('/finance/invoices', {
                contractorId: '00000000-0000-0000-0000-000000000000', // placeholder
                periodStart: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString(),
                periodEnd: new Date().toISOString(),
                type: 'invoice',
            });
            await fetchInvoices();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setGenerating(false);
        }
    };

    const handleExport1C = async () => {
        try {
            // M-2 FIX: Use credentials:'include' instead of broken api.getToken()
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/finance/export/1c`,
                { credentials: 'include' }
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const xml = await res.text();
            const blob = new Blob([xml], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `1c_export_${format(new Date(), 'yyyy-MM-dd')}.xml`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError('Ошибка экспорта: ' + err.message);
        }
    };

    const handleStatusChange = async (invoiceId: string, newStatus: string) => {
        setStatusChanging(true);
        try {
            await api.put(`/finance/invoices/${invoiceId}/status`, { status: newStatus });
            await fetchInvoices();
            setSelectedInvoice(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setStatusChanging(false);
        }
    };

    // ================================================================
    return (
        <div className="p-8 space-y-8 bg-slate-50 min-h-screen text-slate-900">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Финансы и Бухгалтерия</h1>
                    <p className="text-slate-500">Управление счетами, актами и тарификацией рейсов.</p>
                </div>
                <Button onClick={handleGenerateInvoice} disabled={generating} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {generating ? 'Генерация...' : '+ Выставить счёт за период'}
                </Button>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700">&times;</button>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Ожидают оплаты</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-slate-900">{fmtMoney(summary.pending)}</p>
                        <p className="text-xs text-blue-600 mt-2">{invoices.filter(i => i.status === 'sent' || i.status === 'draft').length} счетов</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Просрочено (Дебиторка)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-3xl font-bold ${summary.overdue > 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmtMoney(summary.overdue)}</p>
                        <p className="text-xs text-red-500 mt-2">{summary.overdue > 0 ? 'Требует внимания' : 'Нет просроченных'}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Оплачено</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-emerald-600">{fmtMoney(summary.totalPaid)}</p>
                        <p className="text-xs text-emerald-500 mt-2">{invoices.filter(i => i.status === 'paid').length} счетов</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters + Table */}
            <Card>
                <div className="p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <h2 className="text-xl font-semibold text-slate-900">Реестр счетов</h2>
                        <div className="flex flex-wrap gap-3 items-center">
                            <Input
                                placeholder="Поиск по номеру..."
                                value={filterSearch}
                                onChange={e => setFilterSearch(e.target.value)}
                                className="w-48"
                            />
                            <Select
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value)}
                                options={STATUS_OPTIONS}
                                className="w-44"
                            />
                            <Button variant="outline" onClick={handleExport1C}>Экспорт 1С (XML)</Button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-12 text-slate-400">Загрузка счетов...</div>
                    ) : filteredInvoices.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">Нет счетов{filterStatus || filterSearch ? ' по выбранным фильтрам' : ''}.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Номер</TableHead>
                                        <TableHead>Тип</TableHead>
                                        <TableHead>Период</TableHead>
                                        <TableHead>Сумма</TableHead>
                                        <TableHead>НДС</TableHead>
                                        <TableHead>Итого</TableHead>
                                        <TableHead>Статус</TableHead>
                                        <TableHead className="text-right">Действия</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredInvoices.map(inv => (
                                        <TableRow key={inv.id} className="cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                                            <TableCell className="font-medium text-blue-600">{inv.number}</TableCell>
                                            <TableCell className="text-slate-500 capitalize">{inv.type}</TableCell>
                                            <TableCell className="text-slate-500">
                                                {inv.periodStart && format(new Date(inv.periodStart), 'dd.MM', { locale: ru })}
                                                {' — '}
                                                {inv.periodEnd && format(new Date(inv.periodEnd), 'dd.MM.yy', { locale: ru })}
                                            </TableCell>
                                            <TableCell>{fmtMoney(inv.subtotal)}</TableCell>
                                            <TableCell className="text-slate-400">{fmtMoney(inv.vatAmount)}</TableCell>
                                            <TableCell className="font-semibold">{fmtMoney(inv.total)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={getStatusColor(inv.status)}>
                                                    {getStatusText(inv.status)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setSelectedInvoice(inv); }}>
                                                    ⋮
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </Card>

            {/* Invoice Detail Modal */}
            <Dialog
                open={!!selectedInvoice}
                onClose={() => setSelectedInvoice(null)}
                title={selectedInvoice ? `Счёт ${selectedInvoice.number}` : ''}
            >
                {selectedInvoice && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div><span className="text-slate-500">Тип:</span> <span className="font-medium capitalize">{selectedInvoice.type}</span></div>
                            <div><span className="text-slate-500">Статус:</span> <Badge variant="outline" className={getStatusColor(selectedInvoice.status)}>{getStatusText(selectedInvoice.status)}</Badge></div>
                            <div><span className="text-slate-500">Subtotal:</span> <span className="font-medium">{fmtMoney(selectedInvoice.subtotal)}</span></div>
                            <div><span className="text-slate-500">НДС:</span> <span className="font-medium">{fmtMoney(selectedInvoice.vatAmount)}</span></div>
                            <div className="col-span-2"><span className="text-slate-500">Итого:</span> <span className="text-2xl font-bold">{fmtMoney(selectedInvoice.total)}</span></div>
                            <div><span className="text-slate-500">Период:</span> {selectedInvoice.periodStart && format(new Date(selectedInvoice.periodStart), 'dd.MM.yyyy')} — {selectedInvoice.periodEnd && format(new Date(selectedInvoice.periodEnd), 'dd.MM.yyyy')}</div>
                            <div><span className="text-slate-500">Создан:</span> {selectedInvoice.createdAt && format(new Date(selectedInvoice.createdAt), 'd MMM yyyy, HH:mm', { locale: ru })}</div>
                            {selectedInvoice.tripIds && selectedInvoice.tripIds.length > 0 && (
                                <div className="col-span-2"><span className="text-slate-500">Рейсов:</span> <span className="font-medium">{selectedInvoice.tripIds.length}</span></div>
                            )}
                        </div>

                        <div className="border-t border-slate-200 pt-4">
                            <p className="text-sm font-medium text-slate-700 mb-3">Сменить статус:</p>
                            <div className="flex flex-wrap gap-2">
                                {['draft', 'sent', 'paid', 'overdue', 'cancelled'].filter(s => s !== selectedInvoice.status).map(s => (
                                    <Button
                                        key={s}
                                        variant="outline"
                                        size="sm"
                                        disabled={statusChanging}
                                        onClick={() => handleStatusChange(selectedInvoice.id, s)}
                                        className={getStatusColor(s)}
                                    >
                                        → {getStatusText(s)}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    );
}
