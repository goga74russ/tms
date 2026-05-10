'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Loader2, Plus, RefreshCcw } from 'lucide-react';
import { useUser } from '@/lib/user-context';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ALLOWED_ROLES = ['dispatcher', 'logist', 'manager', 'admin', 'accountant'];

const DOCUMENT_TYPES: Array<{ value: string; label: string }> = [
    { value: 'ttn', label: 'ТТН' },
    { value: 'upd', label: 'УПД' },
    { value: 'act', label: 'Акт' },
    { value: 'other', label: 'Прочее' },
];

const STATUSES: Array<{ value: 'pending' | 'received' | 'lost' | 'overdue'; label: string; tone: string }> = [
    { value: 'pending', label: 'Ожидается', tone: 'bg-amber-100 text-amber-700 border-amber-200' },
    { value: 'received', label: 'Получено', tone: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { value: 'lost', label: 'Утерян', tone: 'bg-rose-100 text-rose-700 border-rose-200' },
    { value: 'overdue', label: 'Просрочен', tone: 'bg-orange-100 text-orange-700 border-orange-200' },
];

interface DocumentReturnRow {
    id: string;
    tripId?: string;
    documentType?: string;
    docType?: string;
    expectedDate?: string | null;
    receivedDate?: string | null;
    receivedAt?: string | null;
    status: string;
    notes?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

function formatDate(value?: string | null) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getStatusBadge(status: string) {
    const found = STATUSES.find((s) => s.value === status);
    const tone = found?.tone || 'bg-slate-100 text-slate-600 border-slate-200';
    const label = found?.label || status;
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${tone}`}>
            {label}
        </span>
    );
}

function getDocTypeLabel(value?: string | null) {
    if (!value) return '—';
    return DOCUMENT_TYPES.find((t) => t.value === value)?.label || value;
}

export default function TripDocumentReturnsPage() {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const tripId = params?.id;

    const [rows, setRows] = useState<DocumentReturnRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [tripNumber, setTripNumber] = useState<string | null>(null);
    const [error, setError] = useState('');

    const [createOpen, setCreateOpen] = useState(false);
    const [createDocType, setCreateDocType] = useState<string>('ttn');
    const [createExpectedDate, setCreateExpectedDate] = useState('');
    const [createNotes, setCreateNotes] = useState('');
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [createError, setCreateError] = useState('');

    const [updateRow, setUpdateRow] = useState<DocumentReturnRow | null>(null);
    const [updateStatus, setUpdateStatus] = useState<'received' | 'lost'>('received');
    const [updateReceivedDate, setUpdateReceivedDate] = useState('');
    const [updateNotes, setUpdateNotes] = useState('');
    const [updateSubmitting, setUpdateSubmitting] = useState(false);
    const [updateError, setUpdateError] = useState('');

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        if (!userLoading && (!user || !user.roles.some((r: string) => ALLOWED_ROLES.includes(r)))) {
            router.push('/');
        }
    }, [user, userLoading, router]);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const loadData = useCallback(async () => {
        if (!tripId) return;
        try {
            setLoading(true);
            setError('');
            const [tripRes, returnsRes] = await Promise.all([
                api.get<any>(`/trips/${tripId}`).catch(() => null),
                api.get<{ success: boolean; data: DocumentReturnRow[] }>(`/trips/${tripId}/document-returns`).catch((err: any) => {
                    throw err;
                }),
            ]);
            if (tripRes?.success && tripRes.data) {
                setTripNumber(tripRes.data.number || null);
            }
            setRows(returnsRes?.success ? returnsRes.data : []);
        } catch (err: any) {
            setError(err?.message || 'Не удалось загрузить данные');
        } finally {
            setLoading(false);
        }
    }, [tripId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const openCreate = () => {
        setCreateDocType('ttn');
        setCreateExpectedDate('');
        setCreateNotes('');
        setCreateError('');
        setCreateOpen(true);
    };

    const submitCreate = async () => {
        if (!tripId) return;
        try {
            setCreateSubmitting(true);
            setCreateError('');
            await api.post(`/trips/${tripId}/document-returns`, {
                documentType: createDocType,
                expectedDate: createExpectedDate || undefined,
                notes: createNotes.trim() || undefined,
            });
            setToast({ message: 'Запись создана', type: 'success' });
            setCreateOpen(false);
            await loadData();
        } catch (err: any) {
            setCreateError(err?.message || 'Не удалось создать запись');
        } finally {
            setCreateSubmitting(false);
        }
    };

    const openUpdate = (row: DocumentReturnRow, presetStatus: 'received' | 'lost') => {
        setUpdateRow(row);
        setUpdateStatus(presetStatus);
        const today = new Date().toISOString().slice(0, 10);
        setUpdateReceivedDate(presetStatus === 'received' ? today : '');
        setUpdateNotes(row.notes || '');
        setUpdateError('');
    };

    const submitUpdate = async () => {
        if (!updateRow) return;
        try {
            setUpdateSubmitting(true);
            setUpdateError('');
            await api.put(`/document-returns/${updateRow.id}`, {
                status: updateStatus,
                receivedDate: updateStatus === 'received' && updateReceivedDate ? updateReceivedDate : undefined,
                notes: updateNotes.trim() || undefined,
            });
            setToast({ message: 'Статус обновлён', type: 'success' });
            setUpdateRow(null);
            await loadData();
        } catch (err: any) {
            setUpdateError(err?.message || 'Не удалось обновить статус');
        } finally {
            setUpdateSubmitting(false);
        }
    };

    const sortedRows = useMemo(() => {
        return [...rows].sort((a, b) => {
            const ta = (a.documentType || a.docType || '').localeCompare(b.documentType || b.docType || '');
            return ta;
        });
    }, [rows]);

    if (!tripId) {
        return null;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => router.push('/trips')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        К рейсам
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Возврат оригиналов</h1>
                        <p className="text-sm text-slate-500">
                            Рейс {tripNumber || tripId.slice(0, 8) + '...'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                        <RefreshCcw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                        Обновить
                    </Button>
                    <Button size="sm" onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-1.5" />
                        Добавить
                    </Button>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-[60] px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </div>
            )}

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                        </div>
                    ) : sortedRows.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">
                            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                            <p className="text-sm">Нет записей. Нажмите «Добавить», чтобы зафиксировать ожидаемый документ.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Документ</TableHead>
                                    <TableHead>Ожидается</TableHead>
                                    <TableHead>Статус</TableHead>
                                    <TableHead>Получено</TableHead>
                                    <TableHead>Комментарий</TableHead>
                                    <TableHead className="text-right">Действия</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedRows.map((row) => {
                                    const docType = row.documentType || row.docType;
                                    const expected = row.expectedDate;
                                    const received = row.receivedDate || row.receivedAt;
                                    const isClosed = row.status === 'received' || row.status === 'lost';
                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell className="font-medium text-slate-900">
                                                {getDocTypeLabel(docType)}
                                            </TableCell>
                                            <TableCell className="text-slate-600">{formatDate(expected)}</TableCell>
                                            <TableCell>{getStatusBadge(row.status)}</TableCell>
                                            <TableCell className="text-slate-600">{formatDate(received)}</TableCell>
                                            <TableCell className="text-slate-500 text-xs max-w-[260px] truncate" title={row.notes || ''}>
                                                {row.notes || '—'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1.5">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openUpdate(row, 'received')}
                                                        disabled={isClosed}
                                                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                                    >
                                                        Получено
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openUpdate(row, 'lost')}
                                                        disabled={isClosed}
                                                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                                                    >
                                                        Утерян
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Create modal */}
            <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Добавить ожидаемый документ">
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Тип документа <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={createDocType}
                            onChange={(e) => setCreateDocType(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        >
                            {DOCUMENT_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Ожидается до</label>
                        <input
                            type="date"
                            value={createExpectedDate}
                            onChange={(e) => setCreateExpectedDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Комментарий</label>
                        <textarea
                            value={createNotes}
                            onChange={(e) => setCreateNotes(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="Опционально"
                        />
                    </div>
                    {createError && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {createError}
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)} disabled={createSubmitting}>
                            Отмена
                        </Button>
                        <Button size="sm" onClick={submitCreate} disabled={createSubmitting}>
                            {createSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                            Добавить
                        </Button>
                    </div>
                </div>
            </Dialog>

            {/* Update status modal */}
            <Dialog
                open={!!updateRow}
                onClose={() => setUpdateRow(null)}
                title={updateStatus === 'received' ? 'Отметить как полученный' : 'Отметить как утерянный'}
            >
                <div className="space-y-4">
                    {updateRow && (
                        <p className="text-sm text-slate-500">
                            Документ: <span className="font-semibold text-slate-700">{getDocTypeLabel(updateRow.documentType || updateRow.docType)}</span>
                        </p>
                    )}
                    {updateStatus === 'received' && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Дата получения</label>
                            <input
                                type="date"
                                value={updateReceivedDate}
                                onChange={(e) => setUpdateReceivedDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">Комментарий</label>
                        <textarea
                            value={updateNotes}
                            onChange={(e) => setUpdateNotes(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="Опционально"
                        />
                    </div>
                    {updateError && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {updateError}
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => setUpdateRow(null)} disabled={updateSubmitting}>
                            Отмена
                        </Button>
                        <Button
                            size="sm"
                            onClick={submitUpdate}
                            disabled={updateSubmitting}
                            variant={updateStatus === 'lost' ? 'destructive' : 'default'}
                        >
                            {updateSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                            {updateStatus === 'received' ? 'Отметить полученным' : 'Отметить утерянным'}
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
