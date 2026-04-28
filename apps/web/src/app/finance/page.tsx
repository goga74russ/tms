"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import type { Invoice as SharedInvoice } from '@tms/shared';
import { api } from "@/lib/api";
import { downloadFromApi } from '@/lib/download';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { FileDown, Printer } from "lucide-react";

async function downloadPdfAuth(apiPath: string, filename: string) {
    const res = await fetch(apiPath, {
        credentials: 'include', // httpOnly cookie sent automatically
    });
    if (!res.ok) throw new Error('Ошибка загрузки PDF');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ——— Types ———
type Invoice = SharedInvoice;

interface ContractorOption {
    id: string;
    name: string;
    inn: string;
}

interface DocReturn {
    id: string;
    tripId: string;
    docType: 'ttn' | 'upd' | 'act' | 'other';
    status: 'pending' | 'received' | 'overdue';
    receivedAt: string | null;
    notes: string | null;
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

const fmtMoney = (n: number | string) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';

const invoiceTypeLabels: Record<Invoice['type'], string> = {
    invoice: 'Счет',
    act: 'Акт',
    upd: 'УПД',
};

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
    const [docReturns, setDocReturns] = useState<DocReturn[]>([]);
    const [docReturnsLoading, setDocReturnsLoading] = useState(false);
    const [markingReceived, setMarkingReceived] = useState<string | null>(null);

    // Generate invoice form
    const [generating, setGenerating] = useState(false);
    const [contractors, setContractors] = useState<ContractorOption[]>([]);
    const [selectedContractorId, setSelectedContractorId] = useState('');

    // ——— Load invoices ———
    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<ApiResponse<Invoice[]>>('/finance/invoices');
            setInvoices(res.data || []);
        } catch (err: any) {
            setError(err.message || 'Не удалось загрузить счета');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchContractors = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data: ContractorOption[] }>('/fleet/contractors?limit=200');
            setContractors(res.data || []);
        } catch (err) {
            console.error('Failed to load contractors', err);
        }
    }, []);

    useEffect(() => {
        fetchInvoices();
        fetchContractors();
    }, [fetchInvoices, fetchContractors]);

    // Load document returns when invoice modal opens
    useEffect(() => {
        if (!selectedInvoice || !selectedInvoice.tripIds?.length) {
            setDocReturns([]);
            return;
        }
        setDocReturnsLoading(true);
        Promise.all(
            selectedInvoice.tripIds.map(tid =>
                api.get<{ success: boolean; data: DocReturn[] }>(`/trips/${tid}/document-returns`)
                    .then(r => r.data)
                    .catch(() => [] as DocReturn[])
            )
        ).then(results => {
            setDocReturns(results.flat());
        }).finally(() => setDocReturnsLoading(false));
    }, [selectedInvoice]);

    // ——— Derived summary ———
    const summary = useMemo(() => {
        const pending = invoices.filter(i => i.status === 'sent' || i.status === 'draft')
            .reduce((sum, i) => sum + Number(i.total), 0);
        const overdue = invoices.filter(i => i.status === 'overdue')
            .reduce((sum, i) => sum + Number(i.total), 0);
        const totalPaid = invoices.filter(i => i.status === 'paid')
            .reduce((sum, i) => sum + Number(i.total), 0);
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
        if (!selectedContractorId) {
            setError('Выберите контрагента для генерации счета.');
            return;
        }

        setGenerating(true);
        try {
            setError(null);
            await api.post('/finance/invoices', {
                contractorId: selectedContractorId,
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
            await downloadFromApi('/api/finance/export/1c', `1c_export_${format(new Date(), 'yyyy-MM-dd')}.xml`);
        } catch (err: any) {
            setError('Ошибка экспорта: ' + err.message);
        }
    };

    const handleMarkDocReceived = async (docType: 'ttn' | 'upd' | 'act') => {
        if (!selectedInvoice?.tripIds?.length) return;
        setMarkingReceived(docType);
        try {
            await Promise.all(
                selectedInvoice.tripIds.map(tid =>
                    api.post(`/trips/${tid}/document-returns`, {
                        docType,
                        status: 'received',
                        receivedAt: new Date().toISOString(),
                    })
                )
            );
            // Reload doc returns
            const results = await Promise.all(
                selectedInvoice.tripIds.map(tid =>
                    api.get<{ success: boolean; data: DocReturn[] }>(`/trips/${tid}/document-returns`)
                        .then(r => r.data).catch(() => [] as DocReturn[])
                )
            );
            setDocReturns(results.flat());
        } catch (err: any) {
            setError(err.message);
        } finally {
            setMarkingReceived(null);
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
                <div className="flex items-center gap-3">
                    <Select
                        value={selectedContractorId}
                        onChange={(e) => setSelectedContractorId(e.target.value)}
                        options={contractors.map((contractor) => ({
                            value: contractor.id,
                            label: contractor.name + ' (' + contractor.inn + ')',
                        }))}
                        placeholder="Выберите контрагента"
                        className="w-72"
                    />
                    <Button onClick={handleGenerateInvoice} disabled={generating || !selectedContractorId} className="bg-blue-600 hover:bg-blue-700 text-white">
                        {generating ? 'Генерация...' : '+ Создать счет по рейсам'}
                    </Button>
                </div>
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
                                            <TableCell className="text-slate-500">{invoiceTypeLabels[inv.type] || inv.type}</TableCell>
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
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); void downloadFromApi(`/api/finance/invoices/${inv.id}/pdf`, `${inv.type}_${inv.number}.pdf`); }}
                                                        className="p-1 rounded hover:bg-red-100 transition-colors" title="Скачать PDF"
                                                    >
                                                        <FileDown className="w-4 h-4 text-red-500" />
                                                    </button>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); window.open(`/print/${inv.type === 'invoice' ? 'invoice' : 'act'}/${inv.id}`, '_blank'); }}
                                                        className="p-1 rounded hover:bg-purple-100 transition-colors" title="Печать"
                                                    >
                                                        <Printer className="w-4 h-4 text-purple-500" />
                                                    </button>
                                                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setSelectedInvoice(inv); }}>
                                                        ⋮
                                                    </Button>
                                                </div>
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
                            <div><span className="text-slate-500">Тип:</span> <span className="font-medium">{invoiceTypeLabels[selectedInvoice.type] || selectedInvoice.type}</span></div>
                            <div><span className="text-slate-500">Статус:</span> <Badge variant="outline" className={getStatusColor(selectedInvoice.status)}>{getStatusText(selectedInvoice.status)}</Badge></div>
                            <div><span className="text-slate-500">Подитог:</span> <span className="font-medium">{fmtMoney(selectedInvoice.subtotal)}</span></div>
                            <div><span className="text-slate-500">НДС:</span> <span className="font-medium">{fmtMoney(selectedInvoice.vatAmount)}</span></div>
                            <div className="col-span-2"><span className="text-slate-500">Итого:</span> <span className="text-2xl font-bold">{fmtMoney(selectedInvoice.total)}</span></div>
                            <div><span className="text-slate-500">Период:</span> {selectedInvoice.periodStart && format(new Date(selectedInvoice.periodStart), 'dd.MM.yyyy')} — {selectedInvoice.periodEnd && format(new Date(selectedInvoice.periodEnd), 'dd.MM.yyyy')}</div>
                            <div><span className="text-slate-500">Создан:</span> {selectedInvoice.createdAt && format(new Date(selectedInvoice.createdAt), 'd MMM yyyy, HH:mm', { locale: ru })}</div>
                            {selectedInvoice.tripIds && selectedInvoice.tripIds.length > 0 && (
                                <div className="col-span-2"><span className="text-slate-500">Рейсов:</span> <span className="font-medium">{selectedInvoice.tripIds.length}</span></div>
                            )}
                        </div>

                        {/* Document returns section */}
                        {selectedInvoice.tripIds && selectedInvoice.tripIds.length > 0 && (
                            <div className="border-t border-slate-200 pt-4">
                                <p className="text-sm font-medium text-slate-700 mb-3">Оригиналы документов:</p>
                                {docReturnsLoading ? (
                                    <p className="text-xs text-slate-400">Загрузка...</p>
                                ) : (
                                    <div className="flex flex-wrap gap-3">
                                        {(['ttn', 'upd', 'act'] as const).map(dt => {
                                            const rows = docReturns.filter(r => r.docType === dt);
                                            const allReceived = rows.length > 0 && rows.every(r => r.status === 'received');
                                            const anyOverdue = rows.some(r => r.status === 'overdue');
                                            const label = dt === 'ttn' ? 'ТТН' : dt === 'upd' ? 'УПД' : 'Акт';
                                            const color = allReceived
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : anyOverdue
                                                    ? 'bg-red-50 text-red-700 border-red-200'
                                                    : 'bg-slate-100 text-slate-500 border-slate-200';
                                            return (
                                                <div key={dt} className="flex items-center gap-2">
                                                    <Badge variant="outline" className={color + ' px-3 py-1'}>
                                                        {allReceived ? '✓ ' : anyOverdue ? '⚠ ' : '○ '}{label}
                                                    </Badge>
                                                    {!allReceived && (
                                                        <button
                                                            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                                                            disabled={markingReceived === dt}
                                                            onClick={() => handleMarkDocReceived(dt)}
                                                        >
                                                            {markingReceived === dt ? '...' : 'Получен'}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

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
