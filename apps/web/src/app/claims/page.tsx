"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { api } from "@/lib/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// ——— Types ———
interface Claim {
    id: string;
    tripId: string | null;
    orderId: string | null;
    contractorId: string | null;
    type: 'damage' | 'delay' | 'loss' | 'other';
    status: 'open' | 'investigating' | 'resolved' | 'rejected';
    amount: string | null;
    resolvedAmount: string | null;
    description: string;
    resolution: string | null;
    attachments: unknown[];
    createdBy: string | null;
    resolvedBy: string | null;
    createdAt: string;
    resolvedAt: string | null;
    updatedAt: string;
}

type ApiResponse<T> = { success: boolean; data: T };

// ——— Helpers ———
const TYPE_LABELS: Record<string, string> = {
    damage: 'Повреждение',
    delay: 'Просрочка',
    loss: 'Утрата',
    other: 'Прочее',
};

const STATUS_OPTIONS = [
    { value: '', label: 'Все статусы' },
    { value: 'open', label: 'Открыта' },
    { value: 'investigating', label: 'Расследование' },
    { value: 'resolved', label: 'Урегулирована' },
    { value: 'rejected', label: 'Отклонена' },
];

function statusBadge(status: string) {
    const variants: Record<string, string> = {
        open: 'bg-blue-100 text-blue-800',
        investigating: 'bg-yellow-100 text-yellow-800',
        resolved: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
        open: 'Открыта',
        investigating: 'Расследование',
        resolved: 'Урегулирована',
        rejected: 'Отклонена',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[status] ?? 'bg-gray-100 text-gray-700'}`}>
            {labels[status] ?? status}
        </span>
    );
}

// ——— Create Modal ———
interface CreateModalProps {
    onClose: () => void;
    onCreated: () => void;
}

function CreateClaimModal({ onClose, onCreated }: CreateModalProps) {
    const [form, setForm] = useState({
        tripId: '',
        orderId: '',
        contractorId: '',
        type: 'damage' as const,
        amount: '',
        description: '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    function validateUuid(value: string, label: string): string | null {
        if (!value) return null; // пустое = необязательное
        if (!UUID_RE.test(value)) return `${label}: неверный формат UUID`;
        return null;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.description.trim()) {
            setError('Описание обязательно');
            return;
        }
        // Валидация UUID полей на фронте
        const uuidErrors = [
            validateUuid(form.tripId, 'ID рейса'),
            validateUuid(form.orderId, 'ID заказа'),
            validateUuid(form.contractorId, 'ID контрагента'),
        ].filter(Boolean);
        if (uuidErrors.length > 0) {
            setError(uuidErrors.join('; '));
            return;
        }
        setSaving(true);
        try {
            await api.post('/claims', {
                tripId: form.tripId || null,
                orderId: form.orderId || null,
                contractorId: form.contractorId || null,
                type: form.type,
                amount: form.amount ? parseFloat(form.amount) : null,
                description: form.description,
            });
            onCreated();
        } catch (err: any) {
            setError(err.message ?? 'Ошибка создания претензии');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
                <h2 className="text-lg font-semibold mb-4">Новая претензия</h2>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Тип</label>
                            <select
                                className="w-full border rounded px-2 py-1.5 text-sm"
                                value={form.type}
                                onChange={e => setForm(f => ({ ...f, type: e.target.value as typeof form.type }))}
                            >
                                <option value="damage">Повреждение</option>
                                <option value="delay">Просрочка</option>
                                <option value="loss">Утрата</option>
                                <option value="other">Прочее</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Сумма претензии, ₽</label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={form.amount}
                                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">ID рейса (необяз.)</label>
                        <Input
                            placeholder="UUID рейса"
                            value={form.tripId}
                            onChange={e => setForm(f => ({ ...f, tripId: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">ID заказа (необяз.)</label>
                        <Input
                            placeholder="UUID заказа"
                            value={form.orderId}
                            onChange={e => setForm(f => ({ ...f, orderId: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">ID контрагента (необяз.)</label>
                        <Input
                            placeholder="UUID контрагента"
                            value={form.contractorId}
                            onChange={e => setForm(f => ({ ...f, contractorId: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Описание *</label>
                        <textarea
                            className="w-full border rounded px-2 py-1.5 text-sm min-h-[80px]"
                            placeholder="Опишите суть претензии..."
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            required
                        />
                    </div>
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Сохранение...' : 'Создать'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ——— Resolve Modal ———
interface ResolveModalProps {
    claim: Claim;
    onClose: () => void;
    onResolved: () => void;
}

function ResolveClaimModal({ claim, onClose, onResolved }: ResolveModalProps) {
    const [form, setForm] = useState({
        status: 'resolved' as 'resolved' | 'rejected',
        resolvedAmount: '',
        resolution: '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.resolution.trim()) {
            setError('Резолюция обязательна');
            return;
        }
        setSaving(true);
        try {
            await api.post(`/claims/${claim.id}/resolve`, {
                status: form.status,
                resolvedAmount: form.resolvedAmount ? parseFloat(form.resolvedAmount) : null,
                resolution: form.resolution,
            });
            onResolved();
        } catch (err: any) {
            setError(err.message ?? 'Ошибка');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
                <h2 className="text-lg font-semibold mb-1">Закрыть претензию</h2>
                <p className="text-sm text-gray-500 mb-4 truncate">{claim.description}</p>
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Решение</label>
                            <select
                                className="w-full border rounded px-2 py-1.5 text-sm"
                                value={form.status}
                                onChange={e => setForm(f => ({ ...f, status: e.target.value as typeof form.status }))}
                            >
                                <option value="resolved">Урегулирована</option>
                                <option value="rejected">Отклонена</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Выплата, ₽</label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={form.resolvedAmount}
                                onChange={e => setForm(f => ({ ...f, resolvedAmount: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Резолюция *</label>
                        <textarea
                            className="w-full border rounded px-2 py-1.5 text-sm min-h-[80px]"
                            placeholder="Итог рассмотрения претензии..."
                            value={form.resolution}
                            onChange={e => setForm(f => ({ ...f, resolution: e.target.value }))}
                            required
                        />
                    </div>
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Сохранение...' : 'Закрыть претензию'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ——— Main Page ———
export default function ClaimsPage() {
    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [resolvingClaim, setResolvingClaim] = useState<Claim | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const loadClaims = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            const res = await api.get<ApiResponse<Claim[]>>(`/claims${params.toString() ? '?' + params : ''}`);
            setClaims(res.data ?? []);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { loadClaims(); }, [loadClaims]);

    async function handleStartInvestigation(claim: Claim) {
        setTogglingId(claim.id);
        try {
            await api.patch(`/claims/${claim.id}/status`, { status: 'investigating' });
            await loadClaims();
        } finally {
            setTogglingId(null);
        }
    }

    const filtered = claims.filter(c => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            c.description.toLowerCase().includes(q) ||
            (c.tripId ?? '').includes(q) ||
            (c.contractorId ?? '').includes(q)
        );
    });

    const stats = {
        open: claims.filter(c => c.status === 'open').length,
        investigating: claims.filter(c => c.status === 'investigating').length,
        resolved: claims.filter(c => c.status === 'resolved').length,
        totalAmount: claims
            .filter(c => c.status !== 'rejected')
            .reduce((s, c) => s + (parseFloat(c.amount ?? '0') || 0), 0),
        resolvedAmount: claims
            .filter(c => c.status === 'resolved')
            .reduce((s, c) => s + (parseFloat(c.resolvedAmount ?? '0') || 0), 0),
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Претензии</h1>
                <Button onClick={() => setShowCreate(true)}>+ Новая претензия</Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-blue-600">{stats.open}</div>
                        <div className="text-xs text-gray-500">Открыто</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-yellow-600">{stats.investigating}</div>
                        <div className="text-xs text-gray-500">На рассмотрении</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
                        <div className="text-xs text-gray-500">Урегулировано</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold">
                            {stats.totalAmount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽
                        </div>
                        <div className="text-xs text-gray-500">Заявлено</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-green-700">
                            {stats.resolvedAmount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽
                        </div>
                        <div className="text-xs text-gray-500">Выплачено</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-4">
                    <div className="flex gap-3 flex-wrap">
                        <Input
                            placeholder="Поиск по описанию, рейсу, контрагенту..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-72"
                        />
                        <select
                            className="border rounded px-2 py-1.5 text-sm"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            {STATUS_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Тип</TableHead>
                                <TableHead>Статус</TableHead>
                                <TableHead>Описание</TableHead>
                                <TableHead>Рейс</TableHead>
                                <TableHead>Сумма</TableHead>
                                <TableHead>Выплата</TableHead>
                                <TableHead>Создана</TableHead>
                                <TableHead>Действия</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-gray-400">
                                        Загрузка...
                                    </TableCell>
                                </TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-gray-400">
                                        Претензий не найдено
                                    </TableCell>
                                </TableRow>
                            ) : filtered.map(claim => (
                                <TableRow key={claim.id} className="hover:bg-gray-50">
                                    <TableCell className="font-medium">
                                        {TYPE_LABELS[claim.type] ?? claim.type}
                                    </TableCell>
                                    <TableCell>{statusBadge(claim.status)}</TableCell>
                                    <TableCell className="max-w-xs">
                                        <span className="block truncate text-sm" title={claim.description}>
                                            {claim.description}
                                        </span>
                                        {claim.resolution && (
                                            <span className="block truncate text-xs text-gray-400 mt-0.5" title={claim.resolution}>
                                                → {claim.resolution}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {claim.tripId ? claim.tripId.slice(0, 8) + '...' : '—'}
                                    </TableCell>
                                    <TableCell>
                                        {claim.amount
                                            ? parseFloat(claim.amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽'
                                            : '—'
                                        }
                                    </TableCell>
                                    <TableCell>
                                        {claim.resolvedAmount
                                            ? parseFloat(claim.resolvedAmount).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽'
                                            : '—'
                                        }
                                    </TableCell>
                                    <TableCell className="text-xs text-gray-500">
                                        {format(new Date(claim.createdAt), 'dd.MM.yy', { locale: ru })}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-1">
                                            {claim.status === 'open' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={togglingId === claim.id}
                                                    onClick={() => handleStartInvestigation(claim)}
                                                >
                                                    В работу
                                                </Button>
                                            )}
                                            {(claim.status === 'open' || claim.status === 'investigating') && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => setResolvingClaim(claim)}
                                                >
                                                    Закрыть
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {showCreate && (
                <CreateClaimModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); loadClaims(); }}
                />
            )}

            {resolvingClaim && (
                <ResolveClaimModal
                    claim={resolvingClaim}
                    onClose={() => setResolvingClaim(null)}
                    onResolved={() => { setResolvingClaim(null); loadClaims(); }}
                />
            )}
        </div>
    );
}
