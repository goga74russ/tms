'use client';

// ============================================================
// Admin — Машиночитаемые доверенности (МЧД)
// ------------------------------------------------------------
// Реестр МЧД организации: список, создание, отзыв, удаление.
// XML МЧД клиент получает в ФНС/УЦ — мы только храним и
// подбираем активную МЧД по ИНН физлица при ЭТрН-подписании.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FileSignature, Plus, Eye, Ban, Trash2, Download,
    CheckCircle2, Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill, type PillTone } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import type {
    Mchd, MchdCreate, MchdStatus, MchdWithXml,
} from '@tms/shared';

// ================================================================
// Helpers
// ================================================================
function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

/** Convert ISO datetime to value for `<input type="date">` (YYYY-MM-DD). */
function isoToDateInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Convert YYYY-MM-DD from <input type="date"> to ISO datetime. */
function dateInputToIso(value: string): string {
    if (!value) return '';
    // Treat as UTC midnight for stability across timezones.
    return new Date(`${value}T00:00:00.000Z`).toISOString();
}

const STATUS_LABEL: Record<MchdStatus, string> = {
    active: 'Действует',
    revoked: 'Отозвана',
    expired: 'Истекла',
};

const STATUS_TONE: Record<MchdStatus, PillTone> = {
    active: 'success',
    revoked: 'neutral',
    expired: 'warning',
};

// ================================================================
// Create modal
// ================================================================
interface CreateModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

function CreateMchdModal({ open, onClose, onSuccess }: CreateModalProps) {
    const { toast } = useToast();
    const [form, setForm] = useState<{
        mchdNumber: string;
        granterInn: string;
        granterName: string;
        granterOgrn: string;
        granteeFullName: string;
        granteeInn: string;
        granteePassport: string;
        scope: string;
        issuedAt: string;
        expiresAt: string;
        certificateXml: string;
        notes: string;
    }>({
        mchdNumber: '',
        granterInn: '',
        granterName: '',
        granterOgrn: '',
        granteeFullName: '',
        granteeInn: '',
        granteePassport: '',
        scope: '',
        issuedAt: '',
        expiresAt: '',
        certificateXml: '',
        notes: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Reset when modal closes
    useEffect(() => {
        if (!open) {
            setForm({
                mchdNumber: '', granterInn: '', granterName: '', granterOgrn: '',
                granteeFullName: '', granteeInn: '', granteePassport: '',
                scope: '', issuedAt: '', expiresAt: '', certificateXml: '', notes: '',
            });
            setError('');
            setSubmitting(false);
        }
    }, [open]);

    const handleSubmit = async () => {
        // Frontline checks before sending — server has authoritative validation.
        if (!form.mchdNumber || !form.granterInn || !form.granterName
            || !form.granteeFullName || !form.granteeInn || !form.scope
            || !form.issuedAt || !form.expiresAt || !form.certificateXml) {
            setError('Заполните все обязательные поля');
            return;
        }
        if (!form.certificateXml.trimStart().startsWith('<?xml')) {
            setError('XML должен начинаться с <?xml');
            return;
        }
        if (new Date(form.expiresAt).getTime() <= new Date(form.issuedAt).getTime()) {
            setError('Срок окончания должен быть позже даты выдачи');
            return;
        }

        const payload: MchdCreate = {
            mchdNumber: form.mchdNumber.trim(),
            granterInn: form.granterInn.trim(),
            granterName: form.granterName.trim(),
            granterOgrn: form.granterOgrn.trim() || undefined,
            granteeFullName: form.granteeFullName.trim(),
            granteeInn: form.granteeInn.trim(),
            granteePassport: form.granteePassport.trim() || undefined,
            scope: form.scope.trim(),
            issuedAt: dateInputToIso(form.issuedAt),
            expiresAt: dateInputToIso(form.expiresAt),
            certificateXml: form.certificateXml,
            notes: form.notes.trim() || undefined,
        };

        try {
            setSubmitting(true);
            setError('');
            await api.post('/mchd', payload);
            onSuccess();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Ошибка';
            setError(msg);
            toast({ variant: 'error', title: 'Не удалось создать МЧД', description: msg });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title="Новая МЧД"
            description="Загрузка машиночитаемой доверенности от ФНС в реестр организации."
            size="xl"
        >
            <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                        type="text"
                        label="Номер МЧД"
                        required
                        value={form.mchdNumber}
                        onChange={(e) => setForm((p) => ({ ...p, mchdNumber: e.target.value }))}
                        placeholder="МЧД-2026-000001"
                    />
                    <div /> {/* spacer to keep grid alignment */}
                </div>

                {/* Доверитель */}
                <fieldset className="space-y-4 rounded-lg border border-neutral-200 p-4">
                    <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Доверитель (юр. лицо)
                    </legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            type="text"
                            label="Наименование"
                            required
                            value={form.granterName}
                            onChange={(e) => setForm((p) => ({ ...p, granterName: e.target.value }))}
                            placeholder="ООО «Ромашка»"
                        />
                        <FormField
                            format="inn"
                            label="ИНН доверителя"
                            required
                            value={form.granterInn}
                            onChange={(e) => setForm((p) => ({ ...p, granterInn: e.target.value }))}
                        />
                        <FormField
                            format="ogrn"
                            label="ОГРН"
                            value={form.granterOgrn}
                            onChange={(e) => setForm((p) => ({ ...p, granterOgrn: e.target.value }))}
                        />
                        <div />
                    </div>
                </fieldset>

                {/* Поверенный */}
                <fieldset className="space-y-4 rounded-lg border border-neutral-200 p-4">
                    <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Поверенный (физ. лицо)
                    </legend>
                    {/* T-13 (W3): подсказка про КЭП-связку per Jurist J-1. */}
                    <p className="text-xs text-neutral-500 leading-relaxed">
                        ИНН и СНИЛС поверенного должны совпадать с теми, что в его{' '}
                        <strong>личной КЭП физлица</strong> (выдана коммерческим УЦ).
                        Только в этой паре МЧД подписывает документы от имени организации.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            type="text"
                            label="ФИО"
                            required
                            value={form.granteeFullName}
                            onChange={(e) => setForm((p) => ({ ...p, granteeFullName: e.target.value }))}
                            placeholder="Иванов Иван Иванович"
                        />
                        <FormField
                            format="inn"
                            label="ИНН поверенного"
                            required
                            value={form.granteeInn}
                            onChange={(e) => setForm((p) => ({ ...p, granteeInn: e.target.value }))}
                        />
                        <Input
                            type="text"
                            label="Паспорт"
                            value={form.granteePassport}
                            onChange={(e) => setForm((p) => ({ ...p, granteePassport: e.target.value }))}
                            placeholder="4509 123456"
                        />
                        <div />
                    </div>
                </fieldset>

                {/* Срок действия + полномочия */}
                <fieldset className="space-y-4 rounded-lg border border-neutral-200 p-4">
                    <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Полномочия и срок
                    </legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            type="date"
                            label="Дата выдачи"
                            required
                            value={form.issuedAt}
                            onChange={(e) => setForm((p) => ({ ...p, issuedAt: e.target.value }))}
                        />
                        <Input
                            type="date"
                            label="Действует до"
                            required
                            value={form.expiresAt}
                            onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-neutral-700">
                            Объём полномочий <span className="text-red-600">*</span>
                        </label>
                        <textarea
                            rows={3}
                            value={form.scope}
                            onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value }))}
                            placeholder="Подписание ЭТрН, ПУД и иных перевозочных документов от имени организации"
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                        />
                    </div>
                </fieldset>

                {/* XML */}
                <div className="space-y-1">
                    <label className="block text-sm font-medium text-neutral-700">
                        XML МЧД (от ФНС) <span className="text-red-600">*</span>
                    </label>
                    <textarea
                        rows={6}
                        value={form.certificateXml}
                        onChange={(e) => setForm((p) => ({ ...p, certificateXml: e.target.value }))}
                        placeholder='<?xml version="1.0" encoding="UTF-8"?>'
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 font-mono text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                    <p className="text-xs text-neutral-500">
                        Вставьте полный XML-документ доверенности, полученный в ФНС/УЦ.
                    </p>
                </div>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-neutral-700">Примечания</label>
                    <textarea
                        rows={2}
                        value={form.notes}
                        onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

                <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
                    <Button
                        variant="brand"
                        className="flex-1"
                        isLoading={submitting}
                        onClick={handleSubmit}
                    >
                        Зарегистрировать МЧД
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}

// ================================================================
// View modal
// ================================================================
interface ViewModalProps {
    mchdId: string | null;
    onClose: () => void;
}

function ViewMchdModal({ mchdId, onClose }: ViewModalProps) {
    const { toast } = useToast();
    const [record, setRecord] = useState<MchdWithXml | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!mchdId) {
            setRecord(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const res = await api.get<{ success: boolean; data: MchdWithXml }>(`/mchd/${mchdId}`);
                if (!cancelled && res.success) setRecord(res.data);
            } catch (err) {
                if (!cancelled) {
                    toast({
                        variant: 'error',
                        title: 'Не удалось загрузить МЧД',
                        description: err instanceof Error ? err.message : undefined,
                    });
                    onClose();
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [mchdId, toast, onClose]);

    const downloadXml = () => {
        if (!record) return;
        const blob = new Blob([record.certificateXml], { type: 'application/xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mchd-${record.mchdNumber}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <Dialog
            open={!!mchdId}
            onClose={onClose}
            title={record ? `МЧД ${record.mchdNumber}` : 'Загрузка...'}
            size="xl"
        >
            {loading || !record ? (
                <div className="py-12 text-center text-sm text-neutral-500">Загрузка...</div>
            ) : (
                <div className="space-y-5">
                    <div className="flex items-center gap-2">
                        <Pill tone={STATUS_TONE[record.status]}>{STATUS_LABEL[record.status]}</Pill>
                        <span className="text-xs text-neutral-500">
                            Зарегистрирована {formatDate(record.createdAt)}
                        </span>
                    </div>

                    <DetailGrid
                        rows={[
                            ['Номер МЧД', record.mchdNumber],
                            ['Доверитель', `${record.granterName} (ИНН ${record.granterInn})`],
                            ['ОГРН доверителя', record.granterOgrn || '—'],
                            ['Поверенный', `${record.granteeFullName} (ИНН ${record.granteeInn})`],
                            ['Паспорт поверенного', record.granteePassport || '—'],
                            ['Действует с', formatDate(record.issuedAt)],
                            ['Действует по', formatDate(record.expiresAt)],
                        ]}
                    />

                    <div>
                        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                            Объём полномочий
                        </div>
                        <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700 whitespace-pre-wrap">
                            {record.scope}
                        </p>
                    </div>

                    {record.status === 'revoked' && (
                        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                                Отзыв
                            </div>
                            <div className="text-sm text-neutral-700">
                                {formatDate(record.revokedAt)} — {record.revocationReason || '—'}
                            </div>
                        </div>
                    )}

                    {record.notes && (
                        <div>
                            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                                Примечания
                            </div>
                            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{record.notes}</p>
                        </div>
                    )}

                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                            SHA-256 XML
                        </div>
                        <code className="text-[11px] font-mono text-neutral-600 break-all">
                            {record.certificateXmlHash}
                        </code>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" onClick={onClose}>Закрыть</Button>
                        <Button
                            variant="brand"
                            leftIcon={<Download className="w-4 h-4" />}
                            onClick={downloadXml}
                        >
                            Скачать XML
                        </Button>
                    </div>
                </div>
            )}
        </Dialog>
    );
}

function DetailGrid({ rows }: { rows: Array<[string, string]> }) {
    return (
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {rows.map(([label, value]) => (
                <div key={label} className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                        {label}
                    </dt>
                    <dd className="mt-0.5 text-neutral-900 break-words">{value}</dd>
                </div>
            ))}
        </dl>
    );
}

// ================================================================
// Revoke modal
// ================================================================
interface RevokeModalProps {
    mchd: Mchd | null;
    onClose: () => void;
    onSuccess: () => void;
}

function RevokeMchdModal({ mchd, onClose, onSuccess }: RevokeModalProps) {
    const { toast } = useToast();
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!mchd) {
            setReason('');
            setError('');
            setSubmitting(false);
        }
    }, [mchd]);

    const handleSubmit = async () => {
        if (!mchd) return;
        if (!reason.trim()) {
            setError('Укажите причину отзыва');
            return;
        }
        try {
            setSubmitting(true);
            setError('');
            await api.patch(`/mchd/${mchd.id}/revoke`, { revocationReason: reason.trim() });
            onSuccess();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Ошибка';
            setError(msg);
            toast({ variant: 'error', title: 'Не удалось отозвать МЧД', description: msg });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={!!mchd}
            onClose={onClose}
            title="Отзыв МЧД"
            description={mchd ? `${mchd.mchdNumber} — ${mchd.granteeFullName}` : undefined}
            size="md"
        >
            <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <Ban className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                        Отзыв необратим. После отзыва МЧД не будет использоваться при
                        подписании ЭТрН/ПУД от имени организации.
                    </span>
                </div>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-neutral-700">
                        Причина отзыва <span className="text-red-600">*</span>
                    </label>
                    <textarea
                        rows={4}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Например: увольнение поверенного, изменение полномочий..."
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

                <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
                    <Button
                        variant="destructive"
                        className="flex-1"
                        isLoading={submitting}
                        onClick={handleSubmit}
                    >
                        Отозвать
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}

// ================================================================
// Main page
// ================================================================
export default function AdminMchdPage() {
    const { toast } = useToast();
    const [items, setItems] = useState<Mchd[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [viewId, setViewId] = useState<string | null>(null);
    const [revokeTarget, setRevokeTarget] = useState<Mchd | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Mchd | null>(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{ success: boolean; data: Mchd[] }>('/mchd');
            if (result.success) setItems(result.data);
        } catch (err) {
            toast({
                variant: 'error',
                title: 'Не удалось загрузить реестр МЧД',
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        return items.filter((m) => {
            if (statusFilter && m.status !== statusFilter) return false;
            return true;
        });
    }, [items, statusFilter]);

    const activeCount = items.filter((m) => m.status === 'active').length;
    const revokedCount = items.filter((m) => m.status === 'revoked').length;
    const expiredCount = items.filter((m) => m.status === 'expired').length;

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            setDeleting(true);
            await api.delete(`/mchd/${deleteTarget.id}`);
            toast({ variant: 'success', title: 'МЧД удалена' });
            setDeleteTarget(null);
            load();
        } catch (err) {
            toast({
                variant: 'error',
                title: 'Не удалось удалить МЧД',
                description: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setDeleting(false);
        }
    };

    const columns: Column<Mchd>[] = [
        {
            id: 'mchdNumber',
            header: '№ МЧД',
            accessor: (r) => r.mchdNumber,
            cell: (r) => <span className="font-medium text-neutral-900">{r.mchdNumber}</span>,
            sortable: true,
            sticky: 'left',
            minWidth: '160px',
        },
        {
            id: 'granter',
            header: 'Доверитель',
            accessor: (r) => `${r.granterName} ${r.granterInn}`,
            cell: (r) => (
                <div className="min-w-0">
                    <div className="truncate font-medium text-neutral-800">{r.granterName}</div>
                    <div className="text-xs text-neutral-500">ИНН {r.granterInn}</div>
                </div>
            ),
            sortable: true,
            minWidth: '220px',
        },
        {
            id: 'grantee',
            header: 'Поверенный',
            accessor: (r) => `${r.granteeFullName} ${r.granteeInn}`,
            cell: (r) => (
                <div className="min-w-0">
                    <div className="truncate text-neutral-800">{r.granteeFullName}</div>
                    <div className="text-xs text-neutral-500">ИНН {r.granteeInn}</div>
                </div>
            ),
            sortable: true,
            minWidth: '220px',
        },
        {
            id: 'period',
            header: 'Действует',
            accessor: (r) => r.issuedAt,
            cell: (r) => (
                <div className="text-xs text-neutral-600">
                    <div>{formatDate(r.issuedAt)}</div>
                    <div className="text-neutral-400">по {formatDate(r.expiresAt)}</div>
                </div>
            ),
            sortable: true,
            minWidth: '140px',
        },
        {
            id: 'status',
            header: 'Статус',
            accessor: (r) => r.status,
            cell: (r) => <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>,
            sortable: true,
            width: '130px',
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                icon={FileSignature}
                iconTone="brand"
                title="Машиночитаемые доверенности (МЧД)"
                description="Реестр МЧД от ФНС для подписания ЭТрН и ПУД физлицами от имени организации."
                actions={
                    <Button
                        variant="brand"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setCreateOpen(true)}
                    >
                        Добавить МЧД
                    </Button>
                }
            />

            {/* T-13 (W3): юр-пояснение модели КЭП per Jurist J-1 (docs/legal/etrn/08).
                С 01.09.2023 (ФЗ-476) «КЭП сотрудника организации» больше не выпускаются.
                Сотрудник подписывает личной КЭП физлица + МЧД от организации. ЕИО (ИП,
                директор) — КЭП юрлица напрямую, без МЧД. */}
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 leading-relaxed">
                <p>
                    <strong>Как работает МЧД:</strong> доверенность дополняет{' '}
                    <strong>личную КЭП физлица</strong> сотрудника — без действующей КЭП
                    МЧД не подписывает ничего. Сотрудник получает КЭП в коммерческом
                    удостоверяющем центре (Контур, СберКорус, Тензор и др.), организация
                    выдаёт МЧД через nalog.gov.ru.
                </p>
                <p className="mt-2">
                    <strong>Руководителю (ЕИО) МЧД не нужна</strong> — он подписывает
                    напрямую КЭП юрлица (бесплатно через УЦ ФНС). Это применимо к ИП
                    и генеральному директору ООО.
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Всего" value={items.length} icon={FileSignature} tone="neutral" />
                <Stat label="Действующие" value={activeCount} icon={CheckCircle2} tone="success" />
                <Stat label="Отозванные" value={revokedCount} icon={Ban} tone="neutral" />
                <Stat label="Истёкшие" value={expiredCount} icon={Clock} tone="warning" />
            </div>

            <DataTable<Mchd>
                tableId="admin-mchd"
                data={filtered}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по ИНН или ФИО..."
                searchKeys={['mchdNumber', 'granterInn', 'granterName', 'granteeFullName', 'granteeInn']}
                filters={[
                    {
                        id: 'status',
                        label: 'Статус',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: [
                            { value: 'active', label: 'Действующие' },
                            { value: 'revoked', label: 'Отозванные' },
                            { value: 'expired', label: 'Истёкшие' },
                        ],
                    },
                ]}
                rowActions={(row) => {
                    const actions = [
                        {
                            id: 'view',
                            label: 'Открыть',
                            icon: <Eye className="w-4 h-4" />,
                            onClick: (r: Mchd) => setViewId(r.id),
                        },
                    ];
                    if (row.status === 'active') {
                        actions.push({
                            id: 'revoke',
                            label: 'Отозвать',
                            icon: <Ban className="w-4 h-4" />,
                            onClick: (r: Mchd) => setRevokeTarget(r),
                        });
                    }
                    actions.push({
                        id: 'delete',
                        label: 'Удалить',
                        icon: <Trash2 className="w-4 h-4" />,
                        onClick: (r: Mchd) => setDeleteTarget(r),
                    });
                    return actions.map((a) => ({
                        ...a,
                        tone: a.id === 'delete' || a.id === 'revoke' ? 'danger' as const : 'default' as const,
                    }));
                }}
                onRowClick={(row) => setViewId(row.id)}
                emptyState={
                    <EmptyState
                        icon={FileSignature}
                        title="Реестр МЧД пуст"
                        description="Загрузите первую машиночитаемую доверенность, полученную в ФНС."
                        tone="brand"
                        action={
                            <Button
                                variant="brand"
                                leftIcon={<Plus className="w-4 h-4" />}
                                onClick={() => setCreateOpen(true)}
                            >
                                Добавить МЧД
                            </Button>
                        }
                    />
                }
                pageSize={50}
            />

            <CreateMchdModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onSuccess={() => {
                    setCreateOpen(false);
                    toast({ variant: 'success', title: 'МЧД зарегистрирована' });
                    load();
                }}
            />

            <ViewMchdModal
                mchdId={viewId}
                onClose={() => setViewId(null)}
            />

            <RevokeMchdModal
                mchd={revokeTarget}
                onClose={() => setRevokeTarget(null)}
                onSuccess={() => {
                    setRevokeTarget(null);
                    toast({ variant: 'success', title: 'МЧД отозвана' });
                    load();
                }}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Удалить МЧД?"
                description={deleteTarget
                    ? `МЧД ${deleteTarget.mchdNumber} (${deleteTarget.granteeFullName}) будет помечена как отозванная и скрыта из активного реестра.`
                    : undefined}
                destructive
                loading={deleting}
                confirmLabel="Удалить"
            />
        </div>
    );
}
