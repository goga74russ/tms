'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { downloadFromApi } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import {
    FileText, Eye, Lock, CheckCircle2,
    Clock, RotateCcw, Truck, User, Download, FileDown, Printer, Paperclip, Upload, Trash2, RefreshCcw,
} from 'lucide-react';
import { getVehicleProfile, getVehicleWaybillCue, getVehicleWaybillReadiness } from '../fleet/components/vehicleProfile';

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

async function downloadAttachmentAuth(apiPath: string, filename: string) {
    const res = await fetch(apiPath, {
        credentials: 'include',
    });
    if (!res.ok) throw new Error('Не удалось скачать файл');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

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

interface WaybillDriverLink {
    id: string;
    driverId: string;
    driverName: string;
    licenseNumber: string;
    shiftStart?: string | null;
    shiftEnd?: string | null;
    isPrimary: boolean;
}

interface WaybillExpense {
    id: string;
    category: string;
    description?: string | null;
    plannedAmount?: number | null;
    actualAmount?: number | null;
    receiptUrl?: string | null;
}

interface WaybillAttachment {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    createdAt: string;
}

interface VehicleInfo {
    id: string;
    plateNumber: string;
    make: string;
    model: string;
    bodyType?: string;
}

interface TrailerInfo {
    id: string;
    plateNumber: string;
    currentVehicleId?: string | null;
}

interface WaybillDetail extends Waybill {
    vehicle?: { plateNumber: string; make: string; model: string };
    driver?: { fullName: string; licenseNumber: string };
    trip?: { number: string; status: string };
    drivers?: WaybillDriverLink[];
    expenses?: WaybillExpense[];
    attachments?: WaybillAttachment[];
    dossier?: any;
}

// ================================================================
// Status badge component
// ================================================================
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
        draft: {
            color: 'bg-neutral-100 text-neutral-600 border-neutral-200',
            label: 'Черновик',
            icon: <Clock className="w-3.5 h-3.5" />,
        },
        medical_check: {
            color: 'bg-amber-100 text-amber-700 border-amber-200',
            label: 'Медосмотр',
            icon: <Clock className="w-3.5 h-3.5" />,
        },
        technical_check: {
            color: 'bg-orange-100 text-orange-700 border-orange-200',
            label: 'Техосмотр',
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
    const c = config[status] || config.draft;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.color}`}>
            {c.icon}
            {c.label}
        </span>
    );
}

function formatComplianceDate(value?: string | null) {
    if (!value) return '—';
    return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function transportDocLabel(type: string) {
    const labels: Record<string, string> = {
        waybill: 'Путевой лист',
        delivery_confirmation: 'Подтверждение доставки',
        document_return: 'Возврат оригиналов',
    };

    return labels[type] || type;
}

function etrnTitleTypeLabel(type: string) {
    const labels: Record<string, string> = {
        title_01: 'Титул 01',
        title_02: 'Титул 02',
        title_03: 'Титул 03',
        title_04: 'Титул 04',
        title_05: 'Титул 05',
        title_06: 'Титул 06',
        title_07: 'Титул 07',
        title_08: 'Титул 08',
    };

    return labels[type] || type;
}

function transportDocStatusLabel(status: string) {
    const labels: Record<string, string> = {
        draft: 'черновик',
        ready: 'готов',
        sent: 'отправлен',
        accepted: 'принят',
        rejected: 'отклонён',
        corrected: 'исправлен',
        completed: 'завершён',
        pending: 'ожидает',
        received: 'получен',
        overdue: 'просрочен',
        error: 'ошибка',
    };

    return labels[status] || status;
}

function etrnTitleStatusLabel(status: string) {
    const labels: Record<string, string> = {
        missing: 'нет',
        draft: 'черновик',
        ready: 'готов',
        sent: 'отправлен',
        accepted: 'принят',
        rejected: 'отклонён',
        corrected: 'исправлен',
        completed: 'завершён',
        blocked: 'заблокирован',
        not_applicable: 'не требуется',
    };

    return labels[status] || status;
}

function complianceStatusLabel(status: string) {
    return transportDocStatusLabel(status) !== status
        ? transportDocStatusLabel(status)
        : etrnTitleStatusLabel(status);
}

function transportTone(status: string) {
    if (status === 'error' || status === 'rejected' || status === 'blocked' || status === 'overdue') return 'critical';
    if (status === 'corrected' || status === 'accepted' || status === 'received') return 'warning';
    return 'info';
}

function toneClass(tone: 'info' | 'warning' | 'critical', variant: 'bg' | 'text' = 'bg') {
    if (variant === 'text') {
        return tone === 'critical' ? 'text-rose-700' : tone === 'warning' ? 'text-amber-700' : 'text-indigo-700';
    }
    return tone === 'critical' ? 'bg-rose-100 text-rose-700' : tone === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700';
}

function titleTone(status: string) {
    if (status === 'blocked' || status === 'rejected' || status === 'missing') return 'critical';
    if (status === 'corrected' || status === 'accepted' || status === 'sent') return 'warning';
    return 'info';
}

function RetryHint({ label = 'Требует проверки' }: { label?: string }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
            <RefreshCcw className="w-3 h-3" />
            {label}
        </span>
    );
}

function humanizeNextAction(action?: string | null) {
    const labels: Record<string, string> = {
        issue_waybill: 'выпустить ПЛ',
        capture_delivery_confirmation: 'зафиксировать подтверждение доставки',
        resolve_document_return: 'закрыть возврат оригиналов',
        close_dossier: 'закрыть досье',
        monitor: 'мониторинг',
    };

    if (!action) return 'мониторинг';
    return labels[action] || action;
}

function ComplianceTimeline({
    title,
    events,
    emptyLabel,
}: {
    title: string;
    events?: any[];
    emptyLabel: string;
}) {
    const items = (events || []).slice().reverse().slice(0, 6);

    return (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">{items.length}</span>
            </div>
            <div className="mt-3 space-y-2">
                {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
                        {emptyLabel}
                    </div>
                ) : items.map((event) => (
                    <div key={event.id} className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-neutral-900">{event.title}</p>
                                <p className="text-xs text-neutral-500">
                                    {(event.documentType ? transportDocLabel(event.documentType) : etrnTitleTypeLabel(event.titleType))} · {complianceStatusLabel(event.status)}
                                </p>
                            </div>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(event.severity, 'bg')}`}>
                                {event.isProblem ? 'problem' : event.severity}
                            </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-neutral-500">
                            <span>{event.message || 'Готово к следующему шагу'}</span>
                            <span>{formatComplianceDate(event.at)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PersistedTransportDocumentsBlock({ dossier }: { dossier?: any | null }) {
    const transportDocuments = dossier?.transportDocuments;
    const etrn = dossier?.etrn;

    if (!transportDocuments && !etrn) return null;

    const docs = (transportDocuments?.documents || []) as any[];
    const docProblems = (transportDocuments?.problems || []) as any[];
    const titles = (etrn?.titles || []) as any[];
    const etrnProblems = (etrn?.problems || []) as any[];
    const exchangeTotals = {
        providers: new Set(docs.map((doc: any) => doc.providerName || 'internal')).size,
        retries: docs.reduce((total: number, doc: any) => total + Number(doc.retryCount || 0), 0),
        receipts: docs.filter((doc: any) => Boolean(doc.providerDocumentId || doc.providerMessageId || doc.acceptedAt)).length,
        nextRetryAt: docs
            .map((doc: any) => doc.nextRetryAt)
            .filter(Boolean)
            .sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime())[0] || null,
        lastAttemptAt: docs
            .map((doc: any) => doc.lastAttemptAt || doc.lastRetryAt || doc.sentAt)
            .filter(Boolean)
            .sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime())
            .slice(-1)[0] || null,
    };

    return (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Persisted transport documents</p>
                    <p className="text-sm font-semibold text-neutral-900">
                        {transportDocuments?.lifecycle?.documentPhase || 'planning'} · {etrn?.status || 'draft'}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                        {transportDocuments?.summary?.nextAction ? `Next action: ${humanizeNextAction(transportDocuments.summary.nextAction)}` : 'Досье и ЭТРН доступны через dossier API'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {transportDocuments?.lifecycle?.hasBlockingProblems && (
                        <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">blocked</span>
                    )}
                    {transportDocuments?.lifecycle?.hasWarnings && (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">check</span>
                    )}
                    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-600 shadow-sm">
                        {transportDocuments?.summary?.problemCount ?? 0} issues
                    </span>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    Документов: {transportDocuments?.summary?.totalDocuments ?? 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    Готово: {transportDocuments?.summary?.completedDocuments ?? 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    Последняя активность: {formatComplianceDate(transportDocuments?.summary?.latestActivityAt)}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    ETRN: {etrn?.summary?.blockedTitles ?? 0} blocked
                </div>
            </div>

            <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Внешний обмен</p>
                        <p className="text-sm font-semibold text-neutral-900">Статус провайдера, попытки и квитанции</p>
                    </div>
                    <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
                        {exchangeTotals.providers} providers
                    </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                        Попытки: {exchangeTotals.retries}
                    </div>
                    <div className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                        Квитанции: {exchangeTotals.receipts}
                    </div>
                    <div className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                        Последняя попытка: {formatComplianceDate(exchangeTotals.lastAttemptAt)}
                    </div>
                    <div className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                        Следующий retry: {formatComplianceDate(exchangeTotals.nextRetryAt)}
                    </div>
                </div>
            </div>

            {(transportDocuments?.lifecycle?.missingDocumentTypes?.length || etrn?.summary?.blockingTitleTypes?.length) && (
                <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Missing transport docs</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {(transportDocuments?.lifecycle?.missingDocumentTypes || []).map((type: string) => (
                                <span key={type} className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                                    {transportDocLabel(type)}
                                </span>
                            ))}
                            {(transportDocuments?.lifecycle?.missingDocumentTypes || []).length === 0 && (
                                <span className="text-xs text-neutral-500">Нет критичных пробелов</span>
                            )}
                        </div>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">ETRN blockers</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {(etrn?.summary?.blockingTitleTypes || []).map((type: string) => (
                                <span key={type} className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                    {type}
                                </span>
                            ))}
                            {(etrn?.summary?.blockingTitleTypes || []).length === 0 && (
                                <span className="text-xs text-neutral-500">Блокирующих титулов нет</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {docProblems.length > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Ошибки и подсказки retry</p>
                            <p className="text-sm font-semibold text-neutral-900">Persisted document issues</p>
                        </div>
                        <RetryHint label="Исправить и повторить" />
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {docProblems.slice(0, 4).map((problem: any) => (
                            <div key={`${problem.code}-${problem.documentId || problem.at || problem.message}`} className="rounded-xl border border-white bg-white px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold text-rose-700">{problem.code}</p>
                                        <p className="text-sm text-neutral-900">{problem.message}</p>
                                    </div>
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(problem.severity, 'bg')}`}>
                                        {problem.severity}
                                    </span>
                                </div>
                                <p className="mt-1 text-[11px] text-neutral-500">
                                    {problem.documentType ? transportDocLabel(problem.documentType) : 'Документ'}{problem.at ? ` · ${formatComplianceDate(problem.at)}` : ''}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid gap-3 lg:grid-cols-3">
                {docs.slice(0, 3).map((doc: any) => (
                    <div key={doc.id} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{transportDocLabel(doc.type)}</p>
                                <p className="text-sm font-semibold text-neutral-900">{doc.externalId}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass(transportTone(doc.status), 'bg')}`}>
                                    {transportDocStatusLabel(doc.status)}
                                </span>
                                <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                                    {doc.providerStatus || doc.providerName || 'internal'}
                                </span>
                            </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-[11px] text-neutral-500">
                            <div>Создан: {formatComplianceDate(doc.createdAt)}</div>
                            <div>Обновлён: {formatComplianceDate(doc.updatedAt)}</div>
                            <div>Провайдер: {doc.providerName || 'internal'}</div>
                            <div>Статус провайдера: {doc.providerStatus || '—'}</div>
                            <div>Попытки: {doc.retryCount ?? 0}</div>
                            <div>Последний retry: {formatComplianceDate(doc.lastRetryAt)}</div>
                            <div>Следующий retry: {formatComplianceDate(doc.nextRetryAt)}</div>
                            <div>Квитанции: {(doc.providerDocumentId || doc.providerMessageId || doc.acceptedAt) ? 'да' : 'нет'}</div>
                            {doc.issuedAt && <div>Выпущен: {formatComplianceDate(doc.issuedAt)}</div>}
                            {doc.sentAt && <div>Отправлен: {formatComplianceDate(doc.sentAt)}</div>}
                            {doc.acceptedAt && <div>Принят: {formatComplianceDate(doc.acceptedAt)}</div>}
                            {doc.completedAt && <div>Завершён: {formatComplianceDate(doc.completedAt)}</div>}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {doc.providerDocumentId && (
                                <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                                    doc {doc.providerDocumentId}
                                </span>
                            )}
                            {doc.providerMessageId && (
                                <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                                    msg {doc.providerMessageId}
                                </span>
                            )}
                            {doc.lastSyncedAt && (
                                <span className="inline-flex rounded-full bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
                                    синхр. {formatComplianceDate(doc.lastSyncedAt)}
                                </span>
                            )}
                        </div>
                        <div className="mt-3 text-[11px] text-neutral-500">
                            {doc.nextRetryAt
                                ? `Ручное действие: повторить после ${formatComplianceDate(doc.nextRetryAt)}`
                                : doc.status === 'error' || doc.status === 'rejected'
                                    ? 'Ручное действие: исправить блокер и повторить'
                                    : doc.providerStatus === 'retry_requested'
                                        ? 'Ручное действие: запрошен retry'
                                        : 'Ручное действие: наблюдение'}
                        </div>
                        {(doc.error || doc.status === 'error' || doc.status === 'rejected') && (
                            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                {doc.error || 'Документ требует повторной проверки перед retry'}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <ComplianceTimeline
                    title="Transport documents timeline"
                    events={transportDocuments?.timeline || []}
                    emptyLabel="Пока нет событий по persisted transport documents"
                />

                <div className="space-y-4">
                    <ComplianceTimeline
                        title="ETRN workflow timeline"
                        events={etrn?.timeline || []}
                        emptyLabel="ETRN timeline пока пуст"
                    />
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">ETRN titles</p>
                                <p className="text-sm font-semibold text-neutral-900">
                                    {etrn?.summary?.completedTitles ?? 0}/{etrn?.summary?.totalTitles ?? 0} completed
                                </p>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass(titleTone(etrn?.status || 'draft'), 'bg')}`}>
                                {etrnTitleStatusLabel(etrn?.status || 'draft')}
                            </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {titles.slice(0, 6).map((title: any) => (
                                <div key={title.id} className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title.titleNumber}</p>
                                            <p className="text-sm font-semibold text-neutral-900">{title.titleLabel}</p>
                                        </div>
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(titleTone(title.status), 'bg')}`}>
                                            {etrnTitleStatusLabel(title.status)}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                                        <span>{title.isRequired ? 'обязат.' : 'опц.'}</span>
                                        <span>история {title.history?.length || 0}</span>
                                        {title.error && <RetryHint label="повторить после исправления" />}
                                    </div>
                                    {title.error && (
                                        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                                            {title.error}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    {(etrnProblems.length > 0 || etrn?.summary?.blockingTitleTypes?.length > 0) && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Проблемы ЭТРН</p>
                                    <p className="text-sm font-semibold text-neutral-900">Что мешает пройти по контуру</p>
                                </div>
                                <RetryHint label="Проверить блокеры" />
                            </div>
                            <div className="mt-3 space-y-2">
                                {(etrnProblems.slice(0, 4)).map((problem: any) => (
                                    <div key={`${problem.code}-${problem.documentId || problem.at || problem.message}`} className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-neutral-700">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-neutral-900">{problem.message}</p>
                                                <p className="text-[11px] text-neutral-500">
                                                    {problem.documentType ? transportDocLabel(problem.documentType) : 'ETRN'}{problem.at ? ` · ${formatComplianceDate(problem.at)}` : ''}
                                                </p>
                                            </div>
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(problem.severity, 'bg')}`}>
                                                {problem.severity}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
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
        <Dialog
            open={true}
            onClose={onClose}
            title="Закрытие путевого листа"
            description={`${waybill.number} • ${waybill.vehicle?.plateNumber ?? ''}`}
            size="md"
        >
            <div className="space-y-4">
                    <div className="p-3 bg-neutral-50 rounded-lg text-sm text-neutral-600">
                        Одометр при выезде: <strong>{waybill.odometerOut.toLocaleString()} км</strong>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-neutral-700">
                            Одометр при возврате (км) *
                        </label>
                        <input
                            type="number"
                            placeholder="Пробег при возврате"
                            value={odometerIn}
                            onChange={e => setOdometerIn(e.target.value)}
                            className="w-full px-4 py-3 text-base border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                            min={waybill.odometerOut}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-neutral-700">
                            Остаток топлива (л)
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            placeholder="Необязательное поле"
                            value={fuelIn}
                            onChange={e => setFuelIn(e.target.value)}
                            className="w-full px-4 py-3 text-base border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
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
            </div>
        </Dialog>
    );
}

// ================================================================
// Detail Modal
// ================================================================
function DetailModal({
    waybill,
    vehicleInfo,
    trailerInfo,
    dossier,
    onClose,
    onCloseWaybill,
    onSyncStatus,
    onUploadAttachment,
    onDeleteAttachment,
    onDownloadAttachment,
    uploadingAttachment,
}: {
    waybill: WaybillDetail;
    vehicleInfo?: VehicleInfo | null;
    trailerInfo?: TrailerInfo | null;
    dossier?: any | null;
    onClose: () => void;
    onCloseWaybill: () => void;
    onSyncStatus?: () => void | Promise<void>;
    onUploadAttachment: (file: File) => Promise<void>;
    onDeleteAttachment: (attachmentId: string) => Promise<void>;
    onDownloadAttachment: (attachment: WaybillAttachment) => Promise<void>;
    uploadingAttachment: boolean;
}) {
    const resolvedVehicleProfile = vehicleInfo ? getVehicleProfile(vehicleInfo.bodyType) : null;
    const waybillCue = getVehicleWaybillCue(vehicleInfo?.bodyType, undefined, {
        trailerPlate: trailerInfo?.plateNumber || null,
    });
    const readiness = getVehicleWaybillReadiness({
        bodyType: vehicleInfo?.bodyType,
        trailerPlate: trailerInfo?.plateNumber || null,
        isBlocked: false,
        hasDriver: Boolean(waybill.driver || (waybill.drivers && waybill.drivers.length > 0)),
        hasMechanicSignature: Boolean(waybill.mechanicSignature),
        hasMedicSignature: Boolean(waybill.medicSignature),
        hasWaybill: Boolean(waybill.number),
        hasDossier: Boolean(dossier),
        hasOrders: Boolean(dossier?.orders?.length),
    });

    return (
        <Dialog
            open={true}
            onClose={onClose}
            title={`Путевой лист ${waybill.number}`}
            size="md"
        >
            <div className="space-y-4">
                <StatusBadge status={waybill.status} />
                    {/* Vehicle */}
                    {(waybill.vehicle || vehicleInfo) && (
                        <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
                            <Truck className="w-5 h-5 text-neutral-500" />
                            <div>
                                <p className="text-sm font-semibold text-neutral-800">
                                    {waybill.vehicle?.plateNumber || vehicleInfo?.plateNumber}
                                </p>
                                <p className="text-xs text-neutral-500">
                                    {waybill.vehicle?.make || vehicleInfo?.make} {waybill.vehicle?.model || vehicleInfo?.model}
                                </p>
                                {resolvedVehicleProfile && (
                                    <div className="mt-1 inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                                        ПЛ: {resolvedVehicleProfile.displayLabel}
                                    </div>
                                )}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                        {waybillCue.modeLabel}
                                    </span>
                                    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 shadow-sm">
                                        {waybillCue.profileLabel}
                                    </span>
                                </div>
                                {vehicleInfo && !vehicleInfo.bodyType && (
                                    <div className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                        Тип ТС для ПЛ не задан
                                    </div>
                                )}
                                {trailerInfo && (
                                    <p className="text-xs text-neutral-400">
                                        Прицеп: {trailerInfo.plateNumber}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <div
                        className={`rounded-2xl border px-4 py-3 ${
                            waybillCue.tone === 'warning'
                                ? 'border-rose-200 bg-rose-50/80'
                                : waybillCue.tone === 'attention'
                                    ? 'border-amber-200 bg-amber-50/80'
                                    : 'border-emerald-100 bg-emerald-50/80'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className={`text-xs font-semibold uppercase tracking-wide ${
                                    waybillCue.tone === 'warning'
                                        ? 'text-rose-600'
                                        : waybillCue.tone === 'attention'
                                            ? 'text-amber-600'
                                            : 'text-emerald-600'
                                }`}>
                                    Профиль ПЛ
                                </p>
                                <p className="text-sm font-semibold text-neutral-900">{waybillCue.title}</p>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-600 shadow-sm">
                                {waybillCue.tone === 'ready' ? 'Готов' : 'Проверить'}
                            </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-neutral-600">{waybillCue.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {waybillCue.markers.map((marker) => (
                                <span
                                    key={marker}
                                    className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 shadow-sm"
                                >
                                    {marker}
                                </span>
                            ))}
                        </div>
                        <div className="mt-3 rounded-xl border border-white/70 bg-white/80 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Что влияет на ПЛ</p>
                            <p className="mt-1 text-xs leading-5 text-neutral-600">{waybillCue.impactLabel}</p>
                        </div>
                        <div className="mt-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Обязательные поля и проверки</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {waybillCue.requirements.map((requirement) => (
                                    <span
                                        key={requirement}
                                        className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700"
                                    >
                                        {requirement}
                                    </span>
                                ))}
                            </div>
                        </div>
                        {waybillCue.warnings.length > 0 && (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                <p className="font-semibold">Профильные предупреждения</p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                    {waybillCue.warnings.map((warning) => (
                                        <span
                                            key={warning}
                                            className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 shadow-sm"
                                        >
                                            {warning}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Driver */}
                    {waybill.driver && (
                        <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
                            <User className="w-5 h-5 text-neutral-500" />
                            <div>
                                <p className="text-sm font-semibold text-neutral-800">{waybill.driver.fullName}</p>
                                <p className="text-xs text-neutral-500">ВУ: {waybill.driver.licenseNumber}</p>
                            </div>
                        </div>
                    )}

                    {/* Trip */}
                    {waybill.trip && (
                        <div className="p-3 bg-neutral-50 rounded-xl">
                            <p className="text-sm text-neutral-600">
                                Рейс: <strong>{waybill.trip.number}</strong>
                                <span className="ml-2 text-xs text-neutral-400">({waybill.trip.status})</span>
                            </p>
                        </div>
                    )}

                    {dossier && (
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Сводка по compliance</p>
                                    <p className="text-sm font-semibold text-neutral-900">Досье рейса</p>
                                </div>
                                <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                                    {dossier.summary?.hasWaybill ? 'ПЛ есть' : 'ПЛ нет'}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-neutral-600">
                                <div className="rounded-xl bg-white px-3 py-2">Заявок: {dossier.summary?.orderCount ?? 0}</div>
                                <div className="rounded-xl bg-white px-3 py-2">ТС: {dossier.summary?.hasVehicle ? 'да' : 'нет'}</div>
                                <div className="rounded-xl bg-white px-3 py-2">Прицеп: {dossier.summary?.hasTrailer ? 'да' : 'нет'}</div>
                                <div className="rounded-xl bg-white px-3 py-2">ПЛ: {dossier.summary?.hasWaybill ? 'да' : 'нет'}</div>
                            </div>
                            <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-500">
                                {dossier.parties?.length || 0} участников • {dossier.orders?.length || 0} заявок в досье
                            </div>
                        </div>
                    )}

                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Готовность</p>
                                <p className="text-sm font-semibold text-neutral-900">
                                    {readiness.title} · {readiness.doneCount}/{readiness.totalCount}
                                </p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                readiness.tone === 'warning'
                                    ? 'bg-rose-100 text-rose-700'
                                    : readiness.tone === 'attention'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-emerald-100 text-emerald-700'
                            }`}>
                                {readiness.tone === 'ready' ? 'Готов' : readiness.tone === 'attention' ? 'Проверить' : 'Заблок.'}
                            </span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {readiness.items.map(item => (
                                <div key={item.key} className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs font-medium text-neutral-700">{item.label}</span>
                                        <span className={`text-[11px] font-semibold ${
                                            item.state === 'done'
                                                ? 'text-emerald-700'
                                                : item.state === 'warn'
                                                    ? 'text-amber-700'
                                                    : 'text-neutral-500'
                                        }`}>
                                            {item.state === 'done' ? 'OK' : item.state === 'warn' ? 'Проверить' : 'Опц.'}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[11px] leading-4 text-neutral-500">{item.hint}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <PersistedTransportDocumentsBlock dossier={dossier} />

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
                        <div className="p-3 bg-neutral-50 rounded-xl">
                            <p className="text-xs text-neutral-400 mb-1">Выезд</p>
                            <p className="text-sm font-medium text-neutral-700">
                                {waybill.departureAt ? new Date(waybill.departureAt).toLocaleString('ru-RU') : '—'}
                            </p>
                        </div>
                        <div className="p-3 bg-neutral-50 rounded-xl">
                            <p className="text-xs text-neutral-400 mb-1">Возврат</p>
                            <p className="text-sm font-medium text-neutral-700">
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

                    {waybill.drivers && waybill.drivers.length > 0 && (
                        <div className="p-3 bg-neutral-50 rounded-xl space-y-2">
                            <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wide">Водители на путевом</p>
                            <div className="space-y-2">
                                {waybill.drivers.map((link) => (
                                    <div key={link.id} className="flex items-center justify-between gap-3 text-sm">
                                        <div>
                                            <p className="font-medium text-neutral-800">{link.driverName}</p>
                                            <p className="text-xs text-neutral-500">ВУ: {link.licenseNumber}</p>
                                        </div>
                                        <div className="text-right text-xs text-neutral-500">
                                            {link.isPrimary && <p className="text-emerald-600 font-semibold">Основной</p>}
                                            {(link.shiftStart || link.shiftEnd) && (
                                                <p>
                                                    {link.shiftStart ? new Date(link.shiftStart).toLocaleString('ru-RU') : '—'}
                                                    {' в†’ '}
                                                    {link.shiftEnd ? new Date(link.shiftEnd).toLocaleString('ru-RU') : '—'}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {waybill.expenses && waybill.expenses.length > 0 && (
                        <div className="p-3 bg-neutral-50 rounded-xl space-y-2">
                            <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wide">Расходы по путевому</p>
                            <div className="space-y-2">
                                {waybill.expenses.map((expense) => (
                                    <div key={expense.id} className="flex items-center justify-between gap-3 text-sm border-b border-neutral-200 pb-2 last:border-b-0 last:pb-0">
                                        <div>
                                            <p className="font-medium text-neutral-800">{expense.category}</p>
                                            <p className="text-xs text-neutral-500">{expense.description || 'Без описания'}</p>
                                        </div>
                                        <div className="text-right text-xs text-neutral-600">
                                            <p>План: {expense.plannedAmount ?? 0} в‚Ѕ</p>
                                            <p>Факт: {expense.actualAmount ?? 0} в‚Ѕ</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="p-3 bg-neutral-50 rounded-xl space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs text-neutral-500 font-semibold uppercase tracking-wide">Вложения</p>
                                <p className="text-sm text-neutral-600">Файлы Рё сканы, прикреплённые к путевому листу.</p>
                            </div>
                            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-100 cursor-pointer">
                                <Upload className="w-4 h-4" />
                                {uploadingAttachment ? 'Загрузка...' : 'Загрузить'}
                                <input
                                    type="file"
                                    className="hidden"
                                    disabled={uploadingAttachment}
                                    onChange={async (event) => {
                                        const file = event.target.files?.[0];
                                        if (!file) return;
                                        await onUploadAttachment(file);
                                        event.target.value = '';
                                    }}
                                />
                            </label>
                        </div>
                        {waybill.attachments && waybill.attachments.length > 0 ? (
                            <div className="space-y-2">
                                {waybill.attachments.map((attachment) => (
                                    <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-neutral-200 px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-neutral-800 truncate">{attachment.originalName}</p>
                                            <p className="text-xs text-neutral-500">{Math.max(1, Math.round(attachment.fileSize / 1024))} KB</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => onDownloadAttachment(attachment)}
                                                className="p-2 rounded-lg hover:bg-emerald-100 transition-colors"
                                                title="Скачать"
                                            >
                                                <Download className="w-4 h-4 text-emerald-600" />
                                            </button>
                                            <button
                                                onClick={() => onDeleteAttachment(attachment.id)}
                                                className="p-2 rounded-lg hover:bg-red-100 transition-colors"
                                                title="Удалить"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-neutral-500">
                                <Paperclip className="w-4 h-4" />
                                Вложений пока нет
                            </div>
                        )}
                    </div>

                    <div className="text-xs text-neutral-400 pt-2">
                        Выдан: {new Date(waybill.issuedAt).toLocaleString('ru-RU')}
                        {waybill.closedAt && ' Закрыт: ' + new Date(waybill.closedAt).toLocaleString('ru-RU')}
                    </div>
                    {/* Sync status button */}
                    {onSyncStatus && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-2"
                            onClick={() => { void onSyncStatus(); }}
                        >
                            <RotateCcw className="w-4 h-4 mr-1.5" />
                            Пересчитать статус
                        </Button>
                    )}
                    {/* Close button if not yet closed */}
                    {waybill.status === 'issued' && (
                        <Button
                            className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            size="lg"
                            onClick={onCloseWaybill}
                        >
                            <Lock className="w-4 h-4 mr-2" />
                            Закрыть путевой лист
                        </Button>
                    )}
            </div>
        </Dialog>
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

    // Lookup maps for resolving UUIDs to names
    const [vehicleMap, setVehicleMap] = useState<Record<string, VehicleInfo>>({});
    const [trailerMap, setTrailerMap] = useState<Record<string, TrailerInfo>>({});
    const [driverMap, setDriverMap] = useState<Record<string, string>>({});

    // Filters
    const [statusFilter, setStatusFilter] = useState('');
    const [searchFilter, setSearchFilter] = useState('');

    // Modals
    const [detailWaybill, setDetailWaybill] = useState<WaybillDetail | null>(null);
    const [closeWaybill, setCloseWaybill] = useState<WaybillDetail | null>(null);
    const { toast: toastFn } = useToast();
    const setToast = useCallback((value: { message: string; type: 'success' | 'error' } | null) => {
        if (!value) return;
        toastFn({
            variant: value.type === 'error' ? 'error' : 'success',
            title: value.type === 'error' ? 'Ошибка' : 'Готово',
            description: value.message,
        });
    }, [toastFn]);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);

    const loadWaybills = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{
                success: boolean;
                data: Waybill[];
                total: number;
                page: number;
            }>(`/waybills?page=${page}&limit=${limit}${statusFilter ? `&status=${statusFilter}` : ''}${searchFilter ? `&search=${encodeURIComponent(searchFilter)}` : ''}`);

            if (result.success) {
                setWaybills(result.data);
                setTotal(result.total);
            }
        } catch (err) {
            console.error('Failed to load waybills:', err);
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter, searchFilter]);

    useEffect(() => {
        loadWaybills();
    }, [loadWaybills]);

    // Load vehicles & drivers once to resolve UUIDs
    useEffect(() => {
        (async () => {
            try {
                const [vRes, dRes, tRes] = await Promise.all([
                    api.get<any>('/fleet/vehicles?limit=200'),
                    api.get<any>('/fleet/drivers?limit=200'),
                    api.get<any>('/fleet/trailers?limit=200'),
                ]);
                const vm: Record<string, VehicleInfo> = {};
                for (const v of (vRes.data || [])) {
                    vm[v.id] = {
                        id: v.id,
                        plateNumber: v.plateNumber,
                        make: v.make,
                        model: v.model,
                        bodyType: v.bodyType,
                    };
                }
                setVehicleMap(vm);
                const dm: Record<string, string> = {};
                for (const d of (dRes.data || [])) dm[d.id] = d.fullName;
                setDriverMap(dm);
                const tm: Record<string, TrailerInfo> = {};
                for (const trailer of (tRes.data || [])) {
                    if (trailer.currentVehicleId) {
                        tm[trailer.currentVehicleId] = {
                            id: trailer.id,
                            plateNumber: trailer.plateNumber,
                            currentVehicleId: trailer.currentVehicleId,
                        };
                    }
                }
                setTrailerMap(tm);
            } catch { /* ignore */ }
        })();
    }, []);

    const openDetail = async (waybillId: string) => {
        try {
            const [detail, driversRes, expensesRes, attachmentsRes] = await Promise.all([
                api.get<{ success: boolean; data: WaybillDetail }>(`/waybills/${waybillId}`),
                api.get<{ success: boolean; data: WaybillDriverLink[] }>(`/waybills/${waybillId}/drivers`).catch(() => ({ success: false, data: [] })),
                api.get<{ success: boolean; data: WaybillExpense[] }>(`/waybills/${waybillId}/expenses`).catch(() => ({ success: false, data: [] })),
                api.get<{ success: boolean; data: WaybillAttachment[] }>(`/waybills/${waybillId}/attachments`).catch(() => ({ success: false, data: [] })),
            ]);
            if (detail.success) {
                const dossier = detail.data.tripId
                    ? await api.get<any>(`/trips/${detail.data.tripId}/dossier`).catch(() => null)
                    : null;
                setDetailWaybill({
                    ...detail.data,
                    drivers: driversRes.success ? driversRes.data : [],
                    expenses: expensesRes.success ? expensesRes.data : [],
                    attachments: attachmentsRes.success ? attachmentsRes.data : [],
                    dossier: dossier?.success ? dossier.data : null,
                });
            }
        } catch (err) {
            console.error('Failed to load waybill detail:', err);
        }
    };

    const handleUploadAttachment = async (file: File) => {
        if (!detailWaybill) return;

        try {
            setUploadingAttachment(true);
            const formData = new FormData();
            formData.append('file', file);
            await api.post(`/waybills/${detailWaybill.id}/attachments`, formData);
            await openDetail(detailWaybill.id);
            setToast({ message: 'Вложение загружено', type: 'success' });
        } catch (err: any) {
            setToast({ message: err.message || 'Не удалось загрузить вложение', type: 'error' });
        } finally {
            setUploadingAttachment(false);
        }
    };

    const handleDeleteAttachment = async (attachmentId: string) => {
        if (!detailWaybill) return;

        try {
            await api.delete(`/waybills/${detailWaybill.id}/attachments/${attachmentId}`);
            await openDetail(detailWaybill.id);
            setToast({ message: 'Вложение удалено', type: 'success' });
        } catch (err: any) {
            setToast({ message: err.message || 'Не удалось удалить вложение', type: 'error' });
        }
    };

    const handleDownloadAttachment = async (attachment: WaybillAttachment) => {
        if (!detailWaybill) return;

        try {
            await downloadFromApi(`/api/waybills/${detailWaybill.id}/attachments/${attachment.id}/download`, attachment.originalName);
        } catch (err: any) {
            setToast({ message: err.message || 'Не удалось скачать вложение', type: 'error' });
        }
    };

    const handleCloseSuccess = () => {
        setCloseWaybill(null);
        setDetailWaybill(null);
        setToast({ message: '✅ Путевой лист закрыт', type: 'success' });
        loadWaybills();
    };

    // Toast auto-dismiss handled by ToastProvider

    // Server-side filtering — API returns pre-filtered results
    const filteredWaybills = waybills;

    const totalPages = Math.ceil(total / limit);

    const waybillColumns: Column<Waybill>[] = [
        {
            id: 'number',
            header: 'Номер',
            accessor: (r) => r.number,
            cell: (r) => <span className="font-mono font-semibold text-brand-700">{r.number}</span>,
            sortable: true,
            sticky: 'left',
            minWidth: '120px',
        },
        {
            id: 'status',
            header: 'Статус',
            accessor: (r) => r.status,
            cell: (r) => <StatusBadge status={r.status} />,
            sortable: true,
            width: '130px',
        },
        {
            id: 'vehicle',
            header: 'ТС',
            cell: (r) => {
                const rowVehicle = vehicleMap[r.vehicleId];
                const rowTrailer = trailerMap[r.vehicleId];
                const rowCue = getVehicleWaybillCue(rowVehicle?.bodyType, undefined, {
                    trailerPlate: rowTrailer?.plateNumber || null,
                });
                const rowReadiness = getVehicleWaybillReadiness({
                    bodyType: rowVehicle?.bodyType,
                    trailerPlate: rowTrailer?.plateNumber || null,
                    isBlocked: false,
                    hasWaybill: true,
                    hasOrders: true,
                });
                return (
                    <div className="flex flex-col gap-0.5 text-xs">
                        <span className="font-medium text-neutral-700">
                            {vehicleMap[r.vehicleId]?.plateNumber || r.vehicleId.substring(0, 8)}
                        </span>
                        <span className="inline-flex w-fit rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                            {rowCue.profileLabel}
                        </span>
                        <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            rowCue.tone === 'warning'
                                ? 'bg-rose-100 text-rose-700'
                                : rowCue.tone === 'attention'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-emerald-100 text-emerald-700'
                        }`}>
                            {rowCue.tone === 'ready' ? 'ПЛ готов' : rowCue.tone === 'attention' ? 'Проверь ПЛ' : 'ПЛ заблокирован'}
                        </span>
                        <span className="inline-flex w-fit rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-500 shadow-sm">
                            {rowCue.modeLabel}
                        </span>
                        <span className="text-[11px] leading-4 text-neutral-500">
                            {rowCue.impactLabel}
                        </span>
                        {rowReadiness && (
                            <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                rowReadiness.tone === 'warning'
                                    ? 'bg-rose-100 text-rose-700'
                                    : rowReadiness.tone === 'attention'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-emerald-100 text-emerald-700'
                            }`}>
                                {rowReadiness.tone === 'ready' ? 'Готов' : rowReadiness.tone === 'attention' ? 'Проверить' : 'Заблок.'}
                            </span>
                        )}
                        {trailerMap[r.vehicleId] && (
                            <span className="text-[11px] text-neutral-400">
                                + прицеп {trailerMap[r.vehicleId].plateNumber}
                            </span>
                        )}
                    </div>
                );
            },
            minWidth: '220px',
        },
        {
            id: 'driver',
            header: 'Водитель',
            cell: (r) => <span className="text-neutral-700 text-xs">{driverMap[r.driverId] || r.driverId.substring(0, 8)}</span>,
            minWidth: '160px',
        },
        {
            id: 'departureAt',
            header: 'Выезд',
            accessor: (r) => r.departureAt,
            cell: (r) => (
                <span className="text-neutral-600 text-xs">
                    {r.departureAt ? new Date(r.departureAt).toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    }) : '—'}
                </span>
            ),
            sortable: true,
            width: '120px',
        },
        {
            id: 'odometer',
            header: 'Одометр (км)',
            cell: (r) => (
                <span className="text-neutral-600 text-xs font-mono whitespace-nowrap">
                    {r.odometerOut.toLocaleString('ru-RU')}
                    {' → '}
                    {r.odometerIn ? r.odometerIn.toLocaleString('ru-RU') : '…'}
                    {' км'}
                </span>
            ),
            align: 'right',
            width: '180px',
        },
        {
            id: 'issuedAt',
            header: 'Дата выдачи',
            accessor: (r) => r.issuedAt,
            cell: (r) => <span className="text-neutral-500 text-xs">{new Date(r.issuedAt).toLocaleDateString('ru-RU')}</span>,
            sortable: true,
            width: '120px',
            align: 'right',
            monospace: true,
        },
    ];

    return (
        <div className="min-h-screen bg-neutral-50">
            {/* Header */}
            <header className="bg-white border-b border-neutral-200 px-6 py-4 -m-6 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-neutral-900">Путевые листы</h1>
                            <p className="text-sm text-neutral-500">Управление путевыми листами</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadWaybills}>
                        <RotateCcw className="w-4 h-4 mr-1.5" />
                        Обновить
                    </Button>
                </div>
            </header>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Stat label="Всего" value={total} icon={FileText} tone="neutral" />
                <Stat label="Сформированы" value={waybills.filter(w => w.status === 'draft').length} icon={Clock} tone="info" />
                <Stat label="Выданы" value={waybills.filter(w => w.status === 'issued').length} icon={Truck} tone="warning" />
                <Stat label="Закрыты" value={waybills.filter(w => w.status === 'closed').length} icon={CheckCircle2} tone="success" />
            </div>

            {/* Search row (server-side filter) */}
            <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[220px] max-w-xs">
                    <input
                        type="text"
                        placeholder="Поиск по номеру (WB-...)"
                        value={searchFilter}
                        onChange={e => { setSearchFilter(e.target.value); setPage(1); }}
                        className="w-full h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                </div>
            </div>

            {/* Table */}
            <DataTable<Waybill>
                tableId="waybills"
                data={filteredWaybills}
                columns={waybillColumns}
                keyField="id"
                loading={loading}
                filters={[
                    {
                        id: 'status',
                        label: 'Статус',
                        value: statusFilter,
                        onChange: (v) => { setStatusFilter(v); setPage(1); },
                        options: [
                            { value: 'draft', label: 'Сформирован' },
                            { value: 'issued', label: 'Выдан' },
                            { value: 'closed', label: 'Закрыт' },
                        ],
                    },
                ]}
                onRowClick={(wb) => openDetail(wb.id)}
                rowActions={(wb) => [
                    { id: 'detail', label: 'Подробности', icon: <Eye className="w-4 h-4" />, onClick: () => openDetail(wb.id) },
                    {
                        id: 'sync', label: 'Пересчитать статус', icon: <RotateCcw className="w-4 h-4" />,
                        onClick: async () => {
                            try {
                                await api.post(`/waybills/${wb.id}/sync-status`);
                                setToast({ message: '✅ Статус ПЛ пересчитан', type: 'success' });
                                await loadWaybills();
                            } catch (err: any) {
                                setToast({ message: err?.message || 'Не удалось пересчитать статус', type: 'error' });
                            }
                        },
                    },
                    { id: 'etrn-xml', label: 'Скачать ЭТрН XML', icon: <Download className="w-4 h-4" />, onClick: () => { void downloadFromApi(`/api/waybills/${wb.id}/etrn`, `etrn_${wb.number}.xml`); } },
                    { id: 'pdf', label: 'Скачать PDF', icon: <FileDown className="w-4 h-4" />, onClick: () => { void downloadFromApi(`/api/waybills/${wb.id}/pdf`, `waybill_${wb.number}.pdf`); } },
                    { id: 'etrn-preview', label: 'Предпросмотр ЭТрН', icon: <FileText className="w-4 h-4" />, onClick: () => { window.open(`/print/etrn/${wb.id}`, '_blank'); } },
                    { id: 'print', label: 'Печать ПЛ', icon: <Printer className="w-4 h-4" />, onClick: () => { window.open(`/print/waybill/${wb.id}`, '_blank'); } },
                ]}
                emptyState={
                    <EmptyState
                        icon={FileText}
                        title={waybills.length === 0 ? 'Нет путевых листов' : 'Ничего не найдено'}
                        description={waybills.length === 0 ? 'Путевые листы появятся после оформления рейсов.' : 'Попробуйте сбросить фильтры.'}
                    />
                }
                pageSize={0}
            />
            {/* Server-side pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 -mt-3 bg-white border border-neutral-200 border-t-0 rounded-b-xl text-xs text-neutral-500">
                    <p>
                        Показано {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} из {total}
                    </p>
                    <div className="flex gap-1">
                        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Назад</Button>
                        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Вперёд →</Button>
                    </div>
                </div>
            )}
            {/* Detail Modal */}
            {detailWaybill && !closeWaybill && (
                <DetailModal
                    waybill={detailWaybill}
                    vehicleInfo={vehicleMap[detailWaybill.vehicleId] || null}
                    trailerInfo={trailerMap[detailWaybill.vehicleId] || null}
                    dossier={detailWaybill.dossier || null}
                    onClose={() => setDetailWaybill(null)}
                    onCloseWaybill={() => {
                        setCloseWaybill(detailWaybill);
                    }}
                    onSyncStatus={async () => {
                        try {
                            await api.post(`/waybills/${detailWaybill.id}/sync-status`);
                            setToast({ message: '✅ Статус ПЛ пересчитан', type: 'success' });
                            await openDetail(detailWaybill.id);
                            await loadWaybills();
                        } catch (err: any) {
                            setToast({ message: err?.message || 'Не удалось пересчитать статус', type: 'error' });
                        }
                    }}
                    onUploadAttachment={handleUploadAttachment}
                    onDeleteAttachment={handleDeleteAttachment}
                    onDownloadAttachment={handleDownloadAttachment}
                    uploadingAttachment={uploadingAttachment}
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



