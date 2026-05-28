"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { api } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { DataTable, type Column, type RowAction, Pill, type PillTone } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";
import { saveBlob } from "@/lib/download";
import { AlertOctagon, ShieldAlert, Plus, CheckCircle2, FilePlus2, FileText, PlayCircle, XCircle, AlertCircle, Clock, FileSpreadsheet } from "lucide-react";

// B4.4 — защита от CSV formula-injection: ячейки, начинающиеся с = + - @ или
// управляющих символов, экранируем ведущим апострофом; всё оборачиваем в кавычки.
function csvCell(value: unknown): string {
    let s = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
}

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

const STATUS_LABELS: Record<string, string> = {
    open: 'Открыта',
    investigating: 'В работе',
    resolved: 'Решена',
    rejected: 'Отклонена',
};

const STATUS_TONES: Record<string, PillTone> = {
    open: 'info',
    investigating: 'warning',
    resolved: 'success',
    rejected: 'danger',
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
    open: AlertCircle,
    investigating: Clock,
    resolved: CheckCircle2,
    rejected: XCircle,
};

const EXPOSURE_BASIS_LABELS: Record<string, string> = {
    amount: 'Заявлено',
    reserve: 'Резерв',
    estimated: 'Оценка',
    none: 'Нет потерь',
};

const CAUSE_LABELS: Record<string, string> = {
    shortage: 'Недостача',
    damage: 'Повреждение',
    delay: 'Задержка',
    downtime: 'Простой',
    refusal: 'Отказ',
    overage: 'Излишек',
    wrong_docs: 'Ошибки в документах',
    other: 'Прочее',
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
    if (Array.isArray(value)) {
        if (!value.length) return null;
        const n = value.length;
        const word = n % 10 === 1 && n % 100 !== 11 ? 'элемент' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'элемента' : 'элементов';
        return `${n} ${word}`;
    }
    if (typeof value === 'object') return 'есть';
    return null;
}

function collectEvidence(claim: Claim): EvidenceItem[] {
    const rows: EvidenceItem[] = [];
    if (!Array.isArray(claim.attachments)) return rows;

    claim.attachments.forEach((attachment, index) => {
        if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
            if (attachment) rows.push({ label: `Вложение ${index + 1}`, value: evidenceValue(attachment) ?? 'есть' });
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

        const label = typeof record.name === 'string' ? record.name : typeof record.type === 'string' ? record.type : `Вложение ${index + 1}`;
        rows.push({ label, value: evidenceValue(record.url ?? record.fileName ?? record.status ?? record.note ?? record) ?? 'есть' });
    });

    return rows.slice(0, 4);
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
        if (!value) return null;
        if (!UUID_RE.test(value)) return `${label}: неверный формат UUID`;
        return null;
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.description.trim()) {
            setError('Описание обязательно');
            return;
        }
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
        <Dialog open={true} onClose={onClose} title="Новая претензия" size="md">
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
                            <label className="text-xs text-gray-500 block mb-1">Резерв, ₽</label>
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
                            <label className="text-xs text-gray-500 block mb-1">Оценка, ₽</label>
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
                        <label className="text-xs text-gray-500 block mb-1">Заметка по урегулированию</label>
                        <textarea
                            className="w-full border rounded px-2 py-1.5 text-sm min-h-[60px]"
                            placeholder="Обоснование резерва, ссылки на доказательства, контекст переговоров..."
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
        </Dialog>
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
        <Dialog open={true} onClose={onClose} title="Закрыть претензию" description={claim.description} size="md">
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
                        <label className="text-xs text-gray-500 block mb-1">Заметка по урегулированию</label>
                        <textarea
                            className="w-full border rounded px-2 py-1.5 text-sm min-h-[60px]"
                            placeholder="Урегулирование, удержания, возврат..."
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
        </Dialog>
    );
}

// ——— Main Page ———
export default function ClaimsPage() {
    const { toast } = useToast();
    const [claims, setClaims] = useState<Claim[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [resolvingClaim, setResolvingClaim] = useState<Claim | null>(null);
    // Bulk selection state (for floating BulkActionsBar)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);

    const toggleRowSelected = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

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
        try {
            await api.patch(`/claims/${claim.id}/status`, { status: 'investigating' });
            toast({ variant: 'success', title: 'В работу', description: 'Претензия переведена в расследование' });
            await loadClaims();
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err?.message });
        }
    }

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

    // Filter visible claims for the "select-all-visible" header checkbox.
    const visibleClaims = statusFilter ? claims.filter(c => c.status === statusFilter) : claims;
    const allVisibleSelected =
        visibleClaims.length > 0 && visibleClaims.every(c => selectedIds.has(c.id));
    const someVisibleSelected =
        visibleClaims.some(c => selectedIds.has(c.id)) && !allVisibleSelected;
    const toggleAllVisible = () => {
        const visibleIds = visibleClaims.map(c => c.id);
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                visibleIds.forEach(id => next.delete(id));
            } else {
                visibleIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    async function handleBulkClose() {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        setBulkBusy(true);
        try {
            // No bulk endpoint exists — per-id loop via existing /resolve endpoint.
            const results = await Promise.allSettled(
                ids.map(id =>
                    api.post(`/claims/${id}/resolve`, {
                        status: 'resolved',
                        resolution: 'Массовое закрытие',
                        resolvedAmount: null,
                    }),
                ),
            );
            const ok = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.length - ok;
            await loadClaims();
            setSelectedIds(new Set());
            toast({
                variant: failed === 0 ? 'success' : 'warning',
                title: 'Претензии закрыты',
                description: failed === 0 ? `Закрыто: ${ok}` : `Закрыто: ${ok}, ошибок: ${failed}`,
            });
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err?.message });
        } finally {
            setBulkBusy(false);
        }
    }

    function handleBulkExportExcel() {
        const rows = claims.filter((c) => selectedIds.has(c.id));
        if (rows.length === 0) return;
        const headers = ['ID', 'Тип', 'Статус', 'Сумма', 'Возмещение', 'Описание', 'Создана'];
        const lines = [
            headers.map(csvCell).join(','),
            ...rows.map((c) => [
                c.id,
                TYPE_LABELS[c.type] ?? c.type,
                STATUS_LABELS[c.status] ?? c.status,
                c.amount ?? '',
                c.resolvedAmount ?? '',
                c.description ?? '',
                c.createdAt ? format(new Date(c.createdAt), 'dd.MM.yyyy', { locale: ru }) : '',
            ].map(csvCell).join(',')),
        ];
        // BOM — чтобы Excel корректно распознал UTF-8 (кириллица).
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        saveBlob(blob, `claims-${new Date().toISOString().slice(0, 10)}.csv`);
        toast({ variant: 'success', title: 'Экспортировано', description: `Претензий: ${rows.length}` });
    }

    const columns: Column<Claim>[] = [
        {
            id: '_select',
            header: (
                <input
                    type="checkbox"
                    aria-label="Выделить все"
                    checked={allVisibleSelected}
                    ref={(el: HTMLInputElement | null) => { if (el) el.indeterminate = someVisibleSelected; }}
                    onChange={toggleAllVisible}
                    onClick={e => e.stopPropagation()}
                    className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
            ),
            cell: (r) => (
                <input
                    type="checkbox"
                    aria-label={`Выделить претензию ${r.id.slice(0, 8)}`}
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggleRowSelected(r.id)}
                    onClick={e => e.stopPropagation()}
                    className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
            ),
            width: '40px',
            excludeFromSearch: true,
            alwaysVisible: true,
        },
        {
            id: 'description',
            header: 'Описание',
            accessor: (r) => r.description,
            cell: (r) => (
                <div className="max-w-xs">
                    <span className="block truncate text-sm font-medium text-neutral-900" title={r.description}>
                        {r.description}
                    </span>
                    {r.resolution && (
                        <span className="block truncate text-xs text-neutral-400 mt-0.5" title={r.resolution}>
                            → {r.resolution}
                        </span>
                    )}
                    {claimSettlementNote(r) && (
                        <span className="block truncate text-xs text-indigo-600 mt-0.5" title={claimSettlementNote(r) ?? undefined}>
                            Урегулир.: {claimSettlementNote(r)}
                        </span>
                    )}
                    {collectEvidence(r).length > 0 && (
                        <span className="block truncate text-xs text-neutral-500 mt-0.5" title={collectEvidence(r).map(e => `${e.label}: ${e.value}`).join('; ')}>
                            Доказательства: {collectEvidence(r).map(e => e.label).join(', ')}
                        </span>
                    )}
                </div>
            ),
            sticky: 'left',
            minWidth: '260px',
        },
        {
            id: 'type',
            header: 'Тип',
            accessor: (r) => TYPE_LABELS[r.type] ?? r.type,
            width: '120px',
        },
        {
            id: 'status',
            header: 'Статус',
            accessor: (r) => STATUS_LABELS[r.status] ?? r.status,
            cell: (r) => (
                <Pill tone={STATUS_TONES[r.status] ?? 'neutral'} icon={STATUS_ICONS[r.status]}>
                    {STATUS_LABELS[r.status] ?? r.status}
                </Pill>
            ),
            width: '120px',
        },
        {
            id: 'tripId',
            header: 'Рейс',
            accessor: (r) => r.tripId ?? '',
            cell: (r) => r.tripId
                ? <span className="font-mono text-xs">{r.tripId.slice(0, 8)}…</span>
                : <span className="text-neutral-400">—</span>,
            width: '110px',
        },
        {
            id: 'amount',
            header: 'Сумма',
            accessor: (r) => claimAmount(r, 'amount') ?? 0,
            cell: (r) => (
                <div className="space-y-1 text-xs">
                    <div className="font-medium text-sm text-neutral-900">{money(claimAmount(r, 'amount'))}</div>
                    <div className="text-neutral-500">Резерв: {money(claimAmount(r, 'reserveAmount'))}</div>
                    <div className="text-neutral-500">Оценка: {money(claimAmount(r, 'estimatedAmount'))}</div>
                    <div className="text-orange-700">
                        Эффект.: {money(claimAmount(r, 'effectiveExposureAmount'))}
                        {claimExposureBasis(r) !== 'none' && (
                            <span className="ml-1 text-neutral-400">({EXPOSURE_BASIS_LABELS[claimExposureBasis(r)] ?? claimExposureBasis(r)})</span>
                        )}
                    </div>
                </div>
            ),
            sortable: true,
            minWidth: '180px',
        },
        {
            id: 'resolvedAmount',
            header: 'Выплата',
            accessor: (r) => claimAmount(r, 'resolvedAmount') ?? 0,
            cell: (r) => (
                <div className="space-y-1 text-xs">
                    <div className="font-medium text-sm text-neutral-900">{money(claimAmount(r, 'resolvedAmount'))}</div>
                    <div className="text-neutral-500">
                        {r.resolvedAt ? format(new Date(r.resolvedAt), 'dd.MM.yy', { locale: ru }) : 'Не урегулирована'}
                    </div>
                    <div className="text-neutral-500">
                        Причина: {CAUSE_LABELS[r.cause ?? r.exposure?.cause ?? ''] ?? r.cause ?? r.exposure?.cause ?? '—'}
                    </div>
                </div>
            ),
            minWidth: '160px',
            hiddenByDefault: false,
        },
        {
            id: 'createdAt',
            header: 'Создана',
            accessor: (r) => r.createdAt,
            cell: (r) => (
                <span className="text-xs text-neutral-500">
                    {format(new Date(r.createdAt), 'dd.MM.yy', { locale: ru })}
                </span>
            ),
            sortable: true,
            width: '110px',
        },
    ];

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <AlertOctagon className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-neutral-900">Претензии</h1>
                        <p className="text-sm text-neutral-500 mt-0.5">Реестр претензий, расследование и урегулирование</p>
                    </div>
                </div>
                <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
                    Новая претензия
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-4">
                <Stat label="Открыто" value={stats.open} icon={AlertOctagon} tone="info" />
                <Stat label="В расслед." value={stats.investigating} icon={ShieldAlert} tone="warning" />
                <Stat label="Урегулир." value={stats.resolved} icon={CheckCircle2} tone="success" />
                <Stat label="Заявлено" value={money(stats.totalAmount)} tone="neutral" />
                <Stat label="Выплачено" value={money(stats.resolvedAmount)} tone="success" />
                <Stat label="Резерв" value={money(stats.reserveAmount)} tone="warning" />
                <Stat label="Возможные потери" value={money(stats.effectiveExposure)} tone="danger" hint="открытые + расследуются" />
            </div>

            <DataTable<Claim>
                tableId="claims"
                data={claims}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по описанию, рейсу, контрагенту…"
                searchPredicate={(r, q) => (
                    r.description.toLowerCase().includes(q) ||
                    (r.tripId ?? '').toLowerCase().includes(q) ||
                    (r.contractorId ?? '').toLowerCase().includes(q) ||
                    (r.resolution ?? '').toLowerCase().includes(q)
                )}
                filters={[
                    {
                        id: 'status',
                        label: 'Статус',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: [
                            { value: 'open', label: 'Открыта' },
                            { value: 'investigating', label: 'В работе' },
                            { value: 'resolved', label: 'Решена' },
                            { value: 'rejected', label: 'Отклонена' },
                        ],
                    },
                ]}
                rowActions={(row) => {
                    const actions: RowAction<Claim>[] = [
                        {
                            id: 'act',
                            label: 'Открыть акт',
                            icon: <FileText className="w-4 h-4" />,
                            onClick: () => { window.open(`/print/claim-act/${row.id}`, '_blank', 'noopener,noreferrer'); },
                        },
                    ];
                    if (row.status === 'open') {
                        actions.push({
                            id: 'investigate',
                            label: 'В работу',
                            icon: <PlayCircle className="w-4 h-4" />,
                            onClick: () => { void handleStartInvestigation(row); },
                        });
                    }
                    if (row.status === 'open' || row.status === 'investigating') {
                        actions.push({
                            id: 'resolve',
                            label: 'Закрыть',
                            icon: <XCircle className="w-4 h-4" />,
                            onClick: () => setResolvingClaim(row),
                        });
                    }
                    return actions;
                }}
                defaultSort={{ columnId: 'createdAt', direction: 'desc' }}
                emptyState={
                    <EmptyState
                        icon={statusFilter ? FilePlus2 : FilePlus2}
                        title={statusFilter ? 'Претензий не найдено' : 'Пока нет претензий'}
                        description={statusFilter ? 'Попробуйте сбросить фильтр.' : 'Создайте первую претензию, чтобы начать.'}
                        tone="brand"
                        action={!statusFilter ? (
                            <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
                                Новая претензия
                            </Button>
                        ) : undefined}
                    />
                }
                pageSize={50}
            />

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

            <BulkActionsBar
                selectedCount={selectedIds.size}
                onClear={() => setSelectedIds(new Set())}
                actions={[
                    {
                        label: 'Закрыть выбранные',
                        onClick: handleBulkClose,
                        icon: CheckCircle2,
                        variant: 'primary',
                        confirm: true,
                        disabled: bulkBusy,
                    },
                    {
                        label: 'Экспорт в Excel',
                        onClick: handleBulkExportExcel,
                        icon: FileSpreadsheet,
                        disabled: bulkBusy,
                    },
                ]}
            />
        </div>
    );
}
