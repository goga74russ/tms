'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Truck, Plus } from 'lucide-react';

// ============================================================
// Types
// ============================================================
interface CarrierContract {
    id: string;
    number: string;
    startDate: string;
    endDate?: string | null;
    defaultRatePerKm?: number | string | null;
    defaultRatePerTon?: number | string | null;
    isActive?: boolean;
}

interface Carrier {
    id: string;
    name: string;
    inn: string;
    isCarrier: boolean;
    activeContract?: CarrierContract | null;
}

interface ContractorOption {
    id: string;
    name: string;
    inn: string;
    isCarrier?: boolean;
}

// ============================================================
// Page
// ============================================================
export default function AdminCarriersPage() {
    const [carriers, setCarriers] = useState<Carrier[]>([]);
    const [contractors, setContractors] = useState<ContractorOption[]>([]);
    const [contractorsAvailable, setContractorsAvailable] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    // New contract dialog
    const [contractFor, setContractFor] = useState<Carrier | null>(null);
    const [contractForm, setContractForm] = useState({
        number: '',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: '',
        defaultRatePerKm: '',
        defaultRatePerTon: '',
    });
    const [contractSubmitting, setContractSubmitting] = useState(false);

    // Promote dialog
    const [promoteOpen, setPromoteOpen] = useState(false);
    const [promotingId, setPromotingId] = useState<string | null>(null);

    const fetchCarriers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<{ success: boolean; data: Carrier[] }>('/carriers');
            setCarriers(res.data || []);
        } catch (err: any) {
            setError(err?.message || 'Не удалось загрузить перевозчиков');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchContractors = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data: ContractorOption[] }>('/fleet/contractors?limit=500');
            setContractors(res.data || []);
            setContractorsAvailable(true);
        } catch {
            // Endpoint may not exist or fail — graceful degradation
            setContractors([]);
            setContractorsAvailable(false);
        }
    }, []);

    useEffect(() => {
        fetchCarriers();
        fetchContractors();
    }, [fetchCarriers, fetchContractors]);

    useEffect(() => {
        if (!toast) return;
        const id = setTimeout(() => setToast(null), 3500);
        return () => clearTimeout(id);
    }, [toast]);

    const openContractDialog = (carrier: Carrier) => {
        setContractFor(carrier);
        setContractForm({
            number: '',
            startDate: format(new Date(), 'yyyy-MM-dd'),
            endDate: '',
            defaultRatePerKm: '',
            defaultRatePerTon: '',
        });
    };

    const submitContract = async () => {
        if (!contractFor) return;
        if (!contractForm.number.trim()) {
            setError('Укажите номер договора');
            return;
        }
        setContractSubmitting(true);
        try {
            setError(null);
            const body: Record<string, any> = {
                contractorId: contractFor.id,
                number: contractForm.number.trim(),
                startDate: new Date(contractForm.startDate + 'T00:00:00').toISOString(),
            };
            if (contractForm.endDate) body.endDate = new Date(contractForm.endDate + 'T23:59:59').toISOString();
            if (contractForm.defaultRatePerKm) body.defaultRatePerKm = Number(contractForm.defaultRatePerKm.replace(',', '.'));
            if (contractForm.defaultRatePerTon) body.defaultRatePerTon = Number(contractForm.defaultRatePerTon.replace(',', '.'));
            await api.post('/carrier-contracts', body);
            setToast('Договор создан');
            setContractFor(null);
            await fetchCarriers();
        } catch (err: any) {
            setError(err?.message || 'Не удалось создать договор');
        } finally {
            setContractSubmitting(false);
        }
    };

    const handlePromote = async (contractorId: string) => {
        setPromotingId(contractorId);
        try {
            setError(null);
            await api.post(`/carriers/${contractorId}/promote`);
            setToast('Контрагент стал перевозчиком');
            setPromoteOpen(false);
            await Promise.all([fetchCarriers(), fetchContractors()]);
        } catch (err: any) {
            setError(err?.message || 'Не удалось назначить перевозчиком');
        } finally {
            setPromotingId(null);
        }
    };

    const nonCarrierContractors = contractors.filter(c => !c.isCarrier);

    const fmtMoney = (v: number | string | null | undefined) => {
        if (v === null || v === undefined || v === '') return '—';
        const n = Number(v);
        if (!Number.isFinite(n)) return '—';
        return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
    };

    return (
        <div className="space-y-6">
            {toast && (
                <div className="fixed top-4 right-4 z-[60] px-5 py-3 rounded-xl shadow-lg bg-emerald-600 text-white text-sm font-medium">
                    {toast}
                </div>
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1">Перевозчики</h1>
                    <p className="text-sm text-slate-500">Контрагенты с признаком перевозчика и их активные договоры</p>
                </div>
                {contractorsAvailable && (
                    <Button onClick={() => setPromoteOpen(true)}>
                        <Plus className="w-4 h-4 mr-1" /> Сделать перевозчиком
                    </Button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between items-center">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700">&times;</button>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Truck className="w-5 h-5 text-indigo-600" />
                        Перевозчики ({carriers.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-12 text-slate-400">Загрузка...</div>
                    ) : carriers.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">Перевозчики не найдены</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Название</TableHead>
                                    <TableHead>ИНН</TableHead>
                                    <TableHead>Активный договор</TableHead>
                                    <TableHead>Период</TableHead>
                                    <TableHead>Ставки</TableHead>
                                    <TableHead className="text-right">Действия</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {carriers.map(c => (
                                    <TableRow key={c.id}>
                                        <TableCell className="font-medium text-slate-900">{c.name}</TableCell>
                                        <TableCell className="text-slate-500">{c.inn}</TableCell>
                                        <TableCell>
                                            {c.activeContract ? (
                                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                                    № {c.activeContract.number}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                    нет
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-slate-500 text-xs">
                                            {c.activeContract ? (
                                                <>
                                                    {format(new Date(c.activeContract.startDate), 'dd.MM.yyyy')}
                                                    {c.activeContract.endDate
                                                        ? ' — ' + format(new Date(c.activeContract.endDate), 'dd.MM.yyyy')
                                                        : ' — бессрочно'}
                                                </>
                                            ) : '—'}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-600">
                                            {c.activeContract ? (
                                                <div className="space-y-0.5">
                                                    <div>за км: {fmtMoney(c.activeContract.defaultRatePerKm)}</div>
                                                    <div>за тонну: {fmtMoney(c.activeContract.defaultRatePerTon)}</div>
                                                </div>
                                            ) : '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" variant="outline" onClick={() => openContractDialog(c)}>
                                                Новый договор
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {!contractorsAvailable && (
                <p className="text-xs text-slate-400">
                    Список контрагентов недоступен — функция «Сделать перевозчиком» будет недоступна, пока не появится эндпоинт <code>/contractors</code>.
                </p>
            )}

            {/* Promote dialog */}
            <Dialog open={promoteOpen} onClose={() => setPromoteOpen(false)} title="Сделать перевозчиком">
                <div className="space-y-3">
                    <p className="text-sm text-slate-500">Выберите контрагента, чтобы пометить его как перевозчика.</p>
                    {nonCarrierContractors.length === 0 ? (
                        <p className="text-sm text-slate-400 py-4 text-center">Все контрагенты уже перевозчики или список пуст.</p>
                    ) : (
                        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                            {nonCarrierContractors.map(c => (
                                <div key={c.id} className="flex items-center justify-between px-3 py-2">
                                    <div>
                                        <div className="text-sm font-medium text-slate-900">{c.name}</div>
                                        <div className="text-xs text-slate-500">ИНН {c.inn}</div>
                                    </div>
                                    <Button
                                        size="sm"
                                        disabled={promotingId === c.id}
                                        onClick={() => handlePromote(c.id)}
                                    >
                                        {promotingId === c.id ? '...' : 'Сделать'}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Dialog>

            {/* New contract dialog */}
            <Dialog
                open={!!contractFor}
                onClose={() => setContractFor(null)}
                title={contractFor ? `Новый договор: ${contractFor.name}` : 'Новый договор'}
            >
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs text-slate-600 mb-1">Номер договора</label>
                        <Input
                            value={contractForm.number}
                            onChange={(e) => setContractForm({ ...contractForm, number: e.target.value })}
                            placeholder="например, ДП-2026/01"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-slate-600 mb-1">Дата начала</label>
                            <Input type="date" value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-600 mb-1">Дата окончания</label>
                            <Input type="date" value={contractForm.endDate} onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-slate-600 mb-1">Ставка за км</label>
                            <Input type="number" step="0.01" value={contractForm.defaultRatePerKm} onChange={(e) => setContractForm({ ...contractForm, defaultRatePerKm: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-600 mb-1">Ставка за тонну</label>
                            <Input type="number" step="0.01" value={contractForm.defaultRatePerTon} onChange={(e) => setContractForm({ ...contractForm, defaultRatePerTon: e.target.value })} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setContractFor(null)}>Отмена</Button>
                        <Button disabled={contractSubmitting} onClick={submitContract}>
                            {contractSubmitting ? 'Создание...' : 'Создать договор'}
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
