"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { api } from "@/lib/api";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Stat } from "@/components/ui/stat";
import { SkeletonRow } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { AlertOctagon, FileText, Search, ShieldAlert, Plus, CheckCircle2, FilePlus2 } from "lucide-react";

// ——— Types ———
interface Claim {
    id: string;
    tripId: string | null;
    orderId: string | null;
    contractorId: string | null;
    type: 'damage' | 'delay' | 'loss' | 'other';
    status: 'open' | 'investigating' | 'resolved' | 'rejected';
    amount: string | null;
    reserveAmount?: string | number | null;
    estimatedAmount?: string | number | null;
    resolvedAmount: string | null;
    effectiveExposureAmount?: string | number | null;
    exposureBasis?: 'amount' | 'reserve' | 'estimated' | 'none';
    cause?: string | null;
    settlementNote?: string | null;
    exposure?: {
        claimedAmount?: number | null;
        reserveAmount?: number | null;
        estimatedAmount?: number | null;
        resolvedAmount?: number | null;
        effectiveExposureAmount?: number | null;
        exposureBasis?: 'amount' | 'reserve' | 'estimated' | 'none';
        cause?: string | null;
        settlementNote?: string | null;
    };
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

type EvidenceItem = {
    label: string;
    value: string;
};

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

const EXPOSURE_BASIS_LABELS: Record<string, string> = {
    amount: 'Claimed',
    reserve: 'Reserve',
    estimated: 'Estimated',
    none: 'No exposure',
};

const CAUSE_LABELS: Record<string, string> = {
    shortage: 'Shortage',
    damage: 'Damage',
    delay: 'Delay',
    downtime: 'Downtime',
    refusal: 'Refusal',
    overage: 'Overage',
    wrong_docs: 'Wrong docs',
    other: 'Other',
};

function toMoneyNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const normalized = typeof value === 'string' ? value.replace(/\s/g, '').replace(',', '.') : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown) {
    const parsed = toMoneyNumber(value);
    return parsed === null
        ? '—'
        : parsed.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
}

function claimAmount(claim: Claim, key: 'amount' | 'reserveAmount' | 'estimatedAmount' | 'resolvedAmount' | 'effectiveExposureAmount') {
    if (key === 'amount') return toMoneyNumber(claim.amount ?? claim.exposure?.claimedAmount);
    if (key === 'resolvedAmount') return toMoneyNumber(claim.resolvedAmount ?? claim.exposure?.resolvedAmount);
    return toMoneyNumber(claim[key] ?? claim.exposure?.[key]);
}

function claimExposureBasis(claim: Claim) {
    return claim.exposureBasis ?? claim.exposure?.exposureBasis ?? 'none';
}

function claimSettlementNote(claim: Claim) {
    return claim.settlementNote ?? claim.exposure?.settlementNote ?? null;
}

function evidenceValue(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.length ? `${value.length} item(s)` : null;
    if (typeof value === 'object') return 'provided';
    return null;
}

function collectEvidence(claim: Claim): EvidenceItem[] {
    const rows: EvidenceItem[] = [];
    if (!Array.isArray(claim.attachments)) return rows;

    claim.attachments.forEach((attachment, index) => {
        if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
            if (attachment) rows.push({ label: `Attachment ${index + 1}`, value: evidenceValue(attachment) ?? 'provided' });
            return;
        }

        const record = attachment as Record<string, unknown>;
        if (record.kind === 'claim_policy_metadata' || record.kind === 'claim_metadata') {
            const nested = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
                ? record.metadata as Record<string, unknown>
                : {};
            Object.entries({ ...record, ...nested }).forEach(([key, value]) => {
                if (['kind', 'version', 'metadata', 'reserveAmount', 'estimatedAmount', 'settlementNote', 'cause'].includes(key)) return;
                const formatted = evidenceValue(value);
                if (formatted) rows.push({ label: key, value: formatted });
            });
            return;
        }

        const label = typeof record.name === 'string' ? record.name : typeof record.type === 'string' ? record.type : `Attachment ${index + 1}`;
        rows.push({ label, value: evidenceValue(record.url ?? record.fileName ?? record.status ?? record.note ?? record) ?? 'provided' });
    });

    return rows.slice(0, 4);
}

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
    const { toast } = useToast();
    const [form, setForm] = useState({
        tripId: '',
        orderId: '',
        contractorId: '',
        type: 'damage' as const,
        amount: '',
        reserveAmount: '',
        estimatedAmount: '',
        description: '',
        settlementNote: '',
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
                reserveAmount: form.reserveAmount ? parseFloat(form.reserveAmount) : null,
                estimatedAmount: form.estimatedAmount ? parseFloat(form.estimatedAmount) : null,
                description: form.description,
                settlementNote: form.settlementNote || null,
            });
            toast({ variant: 'success', title: 'Готово', description: 'Претензия создана' });
            onCreated();
        } catch (err: any) {
            const msg = err.message ?? 'Ошибка создания претензии';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
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
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Reserve, RUB</label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={form.reserveAmount}
                                onChange={e => setForm(f => ({ ...f, reserveAmount: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Estimated, RUB</label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={form.estimatedAmount}
                                onChange={e => setForm(f => ({ ...f, estimatedAmount: e.target.value }))}
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
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Settlement note</label>
                        <textarea
                            className="w-full border rounded px-2 py-1.5 text-sm min-h-[60px]"
                            placeholder="Reserve rationale, evidence notes, negotiation context..."
                            value={form.settlementNote}
                            onChange={e => setForm(f => ({ ...f, settlementNote: e.target.value }))}
                        />
                    </div>
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
                        <Button type="submit" variant="brand" isLoading={saving}>
                            Создать
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
    const { toast } = useToast();
    const [form, setForm] = useState({
        status: 'resolved' as 'resolved' | 'rejected',
        resolvedAmount: '',
        resolution: '',
        settlementNote: claimSettlementNote(claim) ?? '',
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
                settlementNote: form.settlementNote || null,
            });
            toast({
                variant: form.status === 'resolved' ? 'success' : 'info',
                title: form.status === 'resolved' ? 'Претензия урегулирована' : 'Претензия отклонена',
            });
            onResolved();
        } catch (err: any) {
            const msg = err.message ?? 'Ошибка';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
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
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Settlement note</label>
                        <textarea
                            className="w-full border rounded px-2 py-1.5 text-sm min-h-[60px]"
                            placeholder="Settlement, deductions, recovery notes..."
                            value={form.settlementNote}
                            onChange={e => setForm(f => ({ ...f, settlementNote: e.target.value }))}
                        />
                    </div>
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
                        <Button type="submit" variant="brand" isLoading={saving}>
                            Закрыть претензию
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ——— Main Page ———
export default function ClaimsPage() {
    const { toast } = useToast();
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
        } catch (err: any) {
            toast({ variant: 'error', title: 'Не удалось загрузить претензии', description: err?.message });
        } finally {
            setLoading(false);
        }
    }, [statusFilter, toast]);

    useEffect(() => { loadClaims(); }, [loadClaims]);

    async function handleStartInvestigation(claim: Claim) {
        setTogglingId(claim.id);
        try {
            await api.patch(`/claims/${claim.id}/status`, { status: 'investigating' });
            toast({ variant: 'success', title: 'В работу', description: 'Претензия переведена в расследование' });
            await loadClaims();
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err?.message });
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
            .reduce((s, c) => s + (claimAmount(c, 'amount') ?? 0), 0),
        reserveAmount: claims
            .filter(c => c.status === 'open' || c.status === 'investigating')
            .reduce((s, c) => s + (claimAmount(c, 'reserveAmount') ?? 0), 0),
        estimatedAmount: claims
            .filter(c => c.status === 'open' || c.status === 'investigating')
            .reduce((s, c) => s + (claimAmount(c, 'estimatedAmount') ?? 0), 0),
        effectiveExposure: claims
            .filter(c => c.status === 'open' || c.status === 'investigating')
            .reduce((s, c) => s + (claimAmount(c, 'effectiveExposureAmount') ?? 0), 0),
        resolvedAmount: claims
            .filter(c => c.status === 'resolved')
            .reduce((s, c) => s + (claimAmount(c, 'resolvedAmount') ?? 0), 0),
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <AlertOctagon className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Претензии</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Реестр претензий, расследование и урегулирование</p>
                    </div>
                </div>
                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
                    Новая претензия
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-4">
                <Stat label="Открыто" value={stats.open} icon={AlertOctagon} tone="info" />
                <Stat label="Расследование" value={stats.investigating} icon={ShieldAlert} tone="warning" />
                <Stat label="Урегулировано" value={stats.resolved} icon={CheckCircle2} tone="success" />
                <Stat label="Заявлено" value={money(stats.totalAmount)} tone="neutral" />
                <Stat label="Выплачено" value={money(stats.resolvedAmount)} tone="success" />
                <Stat label="Reserve" value={money(stats.reserveAmount)} tone="warning" />
                <Stat label="Effective exposure" value={money(stats.effectiveExposure)} tone="danger" hint="open + investigating" />
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-4">
                    <div className="flex gap-3 flex-wrap">
                        <Input
                            placeholder="Поиск по описанию, рейсу, контрагенту..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            leftAddon={<Search className="h-4 w-4" />}
                            className="w-72"
                        />
                        <select
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm h-10"
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
                    {!loading && filtered.length === 0 ? (
                        <div className="p-6">
                            <EmptyState
                                icon={search || statusFilter ? Search : FilePlus2}
                                title={search || statusFilter ? 'Претензий не найдено' : 'Пока нет претензий'}
                                description={search || statusFilter ? 'Попробуйте сбросить фильтры.' : 'Создайте первую претензию, чтобы начать.'}
                                tone="brand"
                                action={!search && !statusFilter ? (
                                    <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
                                        Новая претензия
                                    </Button>
                                ) : undefined}
                            />
                        </div>
                    ) : (
                    <div className="overflow-x-auto">
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
                                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} columns={8} />)
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
                                        {claimSettlementNote(claim) && (
                                            <span className="block truncate text-xs text-indigo-600 mt-0.5" title={claimSettlementNote(claim) ?? undefined}>
                                                Settlement: {claimSettlementNote(claim)}
                                            </span>
                                        )}
                                        {collectEvidence(claim).length > 0 && (
                                            <span className="block truncate text-xs text-gray-500 mt-0.5" title={collectEvidence(claim).map(e => `${e.label}: ${e.value}`).join('; ')}>
                                                Evidence: {collectEvidence(claim).map(e => e.label).join(', ')}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {claim.tripId ? claim.tripId.slice(0, 8) + '...' : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1 text-xs">
                                            <div className="font-medium text-sm">{money(claimAmount(claim, 'amount'))}</div>
                                            <div className="text-gray-500">Reserve: {money(claimAmount(claim, 'reserveAmount'))}</div>
                                            <div className="text-gray-500">Estimated: {money(claimAmount(claim, 'estimatedAmount'))}</div>
                                            <div className="text-orange-700">
                                                Effective: {money(claimAmount(claim, 'effectiveExposureAmount'))}
                                                {claimExposureBasis(claim) !== 'none' && (
                                                    <span className="ml-1 text-gray-400">({EXPOSURE_BASIS_LABELS[claimExposureBasis(claim)] ?? claimExposureBasis(claim)})</span>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1 text-xs">
                                            <div className="font-medium text-sm">{money(claimAmount(claim, 'resolvedAmount'))}</div>
                                            <div className="text-gray-500">
                                                {claim.resolvedAt ? format(new Date(claim.resolvedAt), 'dd.MM.yy', { locale: ru }) : 'Not settled'}
                                            </div>
                                            <div className="text-gray-500">
                                                Cause: {CAUSE_LABELS[claim.cause ?? claim.exposure?.cause ?? ''] ?? claim.cause ?? claim.exposure?.cause ?? '—'}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-gray-500">
                                        {format(new Date(claim.createdAt), 'dd.MM.yy', { locale: ru })}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-1">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => window.open(`/print/claim-act/${claim.id}`, '_blank', 'noopener,noreferrer')}
                                            >
                                                Акт
                                            </Button>
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
                    </div>
                    )}
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
