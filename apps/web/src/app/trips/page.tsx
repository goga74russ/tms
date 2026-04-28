'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { api } from '@/lib/api';
import { Search, Map, Truck, User, ArrowRight, FileText, X, Loader2, MapPin, AlertTriangle, Clock3, History, RefreshCcw } from 'lucide-react';
import { getVehicleProfile, getVehicleWaybillCue, getVehicleWaybillReadiness } from '../fleet/components/vehicleProfile';

interface Trip {
    id: string;
    number: string;
    status: string;
    vehicleId?: string;
    driverId?: string;
    plannedDistanceKm?: number;
    actualDistanceKm?: number;
    plannedDepartureAt?: string;
    actualDepartureAt?: string;
    actualCompletionAt?: string;
    notes?: string;
    createdAt: string;
}

interface VehicleInfo {
    id: string;
    plateNumber: string;
    make?: string;
    model?: string;
    bodyType?: string;
}

interface TrailerInfo {
    id: string;
    plateNumber: string;
    currentVehicleId?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
    planning: 'Планирование',
    assigned: 'Назначен',
    waybill_draft: 'ПЛ черновик',
    inspection: 'Осмотр',
    waybill_issued: 'ПЛ выдан',
    loading: 'Погрузка',
    in_transit: 'В пути',
    completed: 'Р—авершён',
    billed: 'Оплачен',
    cancelled: 'Отменён',
};

const STATUS_COLORS: Record<string, string> = {
    planning: 'bg-slate-100 text-slate-700',
    assigned: 'bg-blue-100 text-blue-700',
    waybill_draft: 'bg-indigo-100 text-indigo-700',
    inspection: 'bg-cyan-100 text-cyan-700',
    waybill_issued: 'bg-violet-100 text-violet-700',
    loading: 'bg-orange-100 text-orange-700',
    in_transit: 'bg-amber-100 text-amber-800',
    completed: 'bg-emerald-100 text-emerald-700',
    billed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-700',
};

function formatDate(d?: string) {
    if (!d) return 'вЂ”';
    return new Date(d).toLocaleDateString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatTimelineDate(value?: string | null) {
    if (!value) return 'вЂ”';
    return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function transportDocumentLabel(type: string) {
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

function transportDocumentStatusLabel(status: string) {
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
    return transportDocumentStatusLabel(status) !== status
        ? transportDocumentStatusLabel(status)
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

function documentStatusTone(status: string) {
    if (status === 'error' || status === 'rejected') return 'critical';
    if (status === 'corrected' || status === 'accepted' || status === 'received') return 'warning';
    return 'info';
}

function titleStatusTone(status: string) {
    if (status === 'blocked' || status === 'rejected' || status === 'missing') return 'critical';
    if (status === 'corrected' || status === 'accepted' || status === 'sent') return 'warning';
    return 'info';
}

function docEventIcon(isProblem: boolean, severity: string) {
    if (isProblem || severity === 'critical') return <AlertTriangle className="w-4 h-4" />;
    if (severity === 'warning') return <Clock3 className="w-4 h-4" />;
    return <History className="w-4 h-4" />;
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

function TimelineCard({
    title,
    subtitle,
    events,
    emptyLabel,
}: {
    title: string;
    subtitle?: string;
    events?: any[];
    emptyLabel: string;
}) {
    const items = (events || []).slice().reverse().slice(0, 6);

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
                    {subtitle && <p className="mt-1 text-sm font-semibold text-slate-900">{subtitle}</p>}
                </div>
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {items.length}
                </span>
            </div>
            <div className="mt-3 space-y-2">
                {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                        {emptyLabel}
                    </div>
                ) : items.map((event) => (
                    <div key={event.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(event.severity, 'bg')}`}>
                                        {docEventIcon(event.isProblem, event.severity)}
                                    </span>
                                    <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                                </div>
                                <p className="text-xs text-slate-500">
                                    {(event.documentType ? transportDocumentLabel(event.documentType) : etrnTitleTypeLabel(event.titleType))} · {complianceStatusLabel(event.status)}
                                </p>
                            </div>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(event.severity, 'bg')}`}>
                                {event.isProblem ? 'problem' : event.severity}
                            </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                            <span>{event.message || 'Готово к следующему шагу'}</span>
                            <span>{formatTimelineDate(event.at)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TransportDocumentsBlock({ dossier }: { dossier: any }) {
    const transportDocuments = dossier?.transportDocuments;
    const etrn = dossier?.etrn;

    if (!transportDocuments && !etrn) return null;

    const docs = (transportDocuments?.documents || []) as any[];
    const docProblems = (transportDocuments?.problems || []) as any[];
    const etrnTitles = (etrn?.titles || []) as any[];
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
    const phaseLabelMap: Record<string, string> = {
        planning: 'планирование',
        preparation: 'подготовка',
        in_transit: 'в пути',
        closing: 'закрытие',
        closed: 'закрыт',
        blocked: 'блокирован',
    };
    const workflowLabelMap: Record<string, string> = {
        draft: 'черновик',
        partial: 'частично',
        in_progress: 'в работе',
        complete: 'завершён',
        blocked: 'заблокирован',
    };

    return (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Persisted transport documents</p>
                    <p className="text-sm font-semibold text-slate-900">
                        {phaseLabelMap[transportDocuments?.lifecycle?.documentPhase] || transportDocuments?.lifecycle?.documentPhase || 'сформирован'} · {workflowLabelMap[etrn?.status] || etrn?.status || 'draft'}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                        {transportDocuments?.summary?.nextAction ? `Next action: ${humanizeNextAction(transportDocuments.summary.nextAction)}` : 'Поток документов доступен через dossier API'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {transportDocuments?.lifecycle?.hasBlockingProblems && (
                        <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">blocked</span>
                    )}
                    {transportDocuments?.lifecycle?.hasWarnings && (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">check</span>
                    )}
                    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                        {transportDocuments?.summary?.problemCount ?? 0} issues
                    </span>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                    Документов: {transportDocuments?.summary?.totalDocuments ?? 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                    Готово: {transportDocuments?.summary?.completedDocuments ?? 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                    Последняя активность: {formatTimelineDate(transportDocuments?.summary?.latestActivityAt)}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
                    ETRN: {etrnTitles.filter((title) => title.status === 'blocked' || title.status === 'missing').length} blocked/missing
                </div>
            </div>

            <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Внешний обмен</p>
                        <p className="text-sm font-semibold text-slate-900">Статус провайдера, попытки и квитанции</p>
                    </div>
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {exchangeTotals.providers} providers
                    </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        Попытки: {exchangeTotals.retries}
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        Квитанции: {exchangeTotals.receipts}
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        Последняя попытка: {formatTimelineDate(exchangeTotals.lastAttemptAt)}
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        Следующий retry: {formatTimelineDate(exchangeTotals.nextRetryAt)}
                    </div>
                </div>
            </div>

            {(transportDocuments?.lifecycle?.missingDocumentTypes?.length || etrn?.summary?.blockingTitleTypes?.length) && (
                <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Missing transport docs</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {(transportDocuments?.lifecycle?.missingDocumentTypes || []).map((type: string) => (
                                <span key={type} className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                                    {transportDocumentLabel(type)}
                                </span>
                            ))}
                            {(transportDocuments?.lifecycle?.missingDocumentTypes || []).length === 0 && (
                                <span className="text-xs text-slate-500">Нет критичных пробелов</span>
                            )}
                        </div>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">ETRN blockers</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {(etrn?.summary?.blockingTitleTypes || []).map((type: string) => (
                                <span key={type} className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                    {type}
                                </span>
                            ))}
                            {(etrn?.summary?.blockingTitleTypes || []).length === 0 && (
                                <span className="text-xs text-slate-500">Блокирующих титулов нет</span>
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
                            <p className="text-sm font-semibold text-slate-900">Persisted document issues</p>
                        </div>
                        <RetryHint label="Исправить и повторить" />
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {docProblems.slice(0, 4).map((problem: any) => (
                            <div key={`${problem.code}-${problem.documentId || problem.at || problem.message}`} className="rounded-xl border border-white bg-white px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold text-rose-700">{problem.code}</p>
                                        <p className="text-sm text-slate-900">{problem.message}</p>
                                    </div>
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(problem.severity, 'bg')}`}>
                                        {problem.severity}
                                    </span>
                                </div>
                                <p className="mt-1 text-[11px] text-slate-500">
                                    {problem.documentType ? transportDocumentLabel(problem.documentType) : 'Документ'}{problem.at ? ` · ${formatTimelineDate(problem.at)}` : ''}
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
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{transportDocumentLabel(doc.type)}</p>
                                <p className="text-sm font-semibold text-slate-900">{doc.externalId}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass(documentStatusTone(doc.status), 'bg')}`}>
                                    {transportDocumentStatusLabel(doc.status)}
                                </span>
                                <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                    {doc.providerStatus || doc.providerName || 'internal'}
                                </span>
                            </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-[11px] text-slate-500">
                            <div>Создан: {formatTimelineDate(doc.createdAt)}</div>
                            <div>Обновлён: {formatTimelineDate(doc.updatedAt)}</div>
                            <div>Провайдер: {doc.providerName || 'internal'}</div>
                            <div>Статус провайдера: {doc.providerStatus || '—'}</div>
                            <div>Попытки: {doc.retryCount ?? 0}</div>
                            <div>Последний retry: {formatTimelineDate(doc.lastRetryAt)}</div>
                            <div>Следующий retry: {formatTimelineDate(doc.nextRetryAt)}</div>
                            <div>Квитанции: {(doc.providerDocumentId || doc.providerMessageId || doc.acceptedAt) ? 'да' : 'нет'}</div>
                            {doc.issuedAt && <div>Выпущен: {formatTimelineDate(doc.issuedAt)}</div>}
                            {doc.sentAt && <div>Отправлен: {formatTimelineDate(doc.sentAt)}</div>}
                            {doc.acceptedAt && <div>Принят: {formatTimelineDate(doc.acceptedAt)}</div>}
                            {doc.completedAt && <div>Завершён: {formatTimelineDate(doc.completedAt)}</div>}
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
                                <span className="inline-flex rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                    синхр. {formatTimelineDate(doc.lastSyncedAt)}
                                </span>
                            )}
                        </div>
                        <div className="mt-3 text-[11px] text-slate-500">
                            {doc.nextRetryAt
                                ? `Ручное действие: повторить после ${formatTimelineDate(doc.nextRetryAt)}`
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
                <TimelineCard
                    title="Transport documents timeline"
                    subtitle={`Latest activity: ${formatTimelineDate(transportDocuments?.summary?.latestActivityAt)}`}
                    events={transportDocuments?.timeline || []}
                    emptyLabel="Пока нет событий по persisted transport documents"
                />

                <div className="space-y-4">
                    <TimelineCard
                        title="ETRN workflow timeline"
                        subtitle={`Status: ${etrn?.status || 'draft'} · ${etrn?.summary?.nextAction || 'monitor'}`}
                        events={etrn?.timeline || []}
                        emptyLabel="ETRN timeline пока пуст"
                    />
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ETRN titles</p>
                                <p className="text-sm font-semibold text-slate-900">
                                    {etrn?.summary?.completedTitles ?? 0}/{etrn?.summary?.totalTitles ?? 0} completed
                                </p>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass(titleStatusTone(etrn?.status || 'draft'), 'bg')}`}>
                                {etrnTitleStatusLabel(etrn?.status || 'draft')}
                            </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {etrnTitles.slice(0, 6).map((title: any) => (
                                <div key={title.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title.titleNumber}</p>
                                            <p className="text-sm font-semibold text-slate-900">{title.titleLabel}</p>
                                        </div>
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(titleStatusTone(title.status), 'bg')}`}>
                                            {etrnTitleStatusLabel(title.status)}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                        <span>{title.isRequired ? 'required' : 'optional'}</span>
                                        <span>history {title.history?.length || 0}</span>
                                        {title.error && <RetryHint label="retry after fix" />}
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
                    {etrnProblems.length > 0 && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">ETRN issues</p>
                                    <p className="text-sm font-semibold text-slate-900">Что мешает пройти по контуру</p>
                                </div>
                                <RetryHint label="Check blockers" />
                            </div>
                            <div className="mt-3 space-y-2">
                                {etrnProblems.slice(0, 4).map((problem: any) => (
                                    <div key={`${problem.code}-${problem.documentId || problem.at || problem.message}`} className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-slate-700">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-slate-900">{problem.message}</p>
                                                <p className="text-[11px] text-slate-500">
                                                    {problem.documentType ? transportDocumentLabel(problem.documentType) : 'ETRN'}{problem.at ? ` · ${formatTimelineDate(problem.at)}` : ''}
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

const ALLOWED_ROLES = ['dispatcher', 'logist', 'manager', 'admin'];

export default function TripsPage() {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (!userLoading && (!user || !user.roles.some(r => ALLOWED_ROLES.includes(r)))) {
            router.push('/');
        }
    }, [user, userLoading, router]);

    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    const [vehicleMap, setVehicleMap] = useState<Record<string, VehicleInfo>>({});
    const [trailerMap, setTrailerMap] = useState<Record<string, TrailerInfo>>({});
    const [tripOrderNumbers, setTripOrderNumbers] = useState<Record<string, string[]>>({});
    const [dossierTripId, setDossierTripId] = useState<string | null>(null);
    const [dossierLoading, setDossierLoading] = useState(false);
    const [dossierError, setDossierError] = useState('');
    const [dossier, setDossier] = useState<any>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        loadTrips();
    }, [debouncedSearch, statusFilter]);

    useEffect(() => {
        if (trips.length === 0) {
            setTripOrderNumbers({});
            return;
        }

        let cancelled = false;

        (async () => {
            const results = await Promise.allSettled(trips.map(async (trip) => {
                const result = await api.get<{ success: boolean; data: { orders?: Array<{ number: string }> } }>(`/trips/${trip.id}`);
                return [
                    trip.id,
                    result.success ? (result.data.orders || []).map(order => order.number) : [],
                ] as const;
            }));

            if (cancelled) return;

            const next: Record<string, string[]> = {};
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const [tripId, orderNumbers] = result.value;
                    next[tripId] = orderNumbers;
                }
            }
            setTripOrderNumbers(next);
        })().catch(() => {
            if (!cancelled) setTripOrderNumbers({});
        });

        return () => {
            cancelled = true;
        };
    }, [trips]);

    // Load vehicles once to resolve IDs to plate numbers
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get<any>('/fleet/vehicles?limit=200');
                const map: Record<string, VehicleInfo> = {};
                for (const v of (res.data || [])) {
                    map[v.id] = { id: v.id, plateNumber: v.plateNumber, make: v.make, model: v.model, bodyType: v.bodyType };
                }
                setVehicleMap(map);
            } catch { /* ignore */ }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get<any>('/fleet/trailers?limit=200');
                const map: Record<string, TrailerInfo> = {};
                for (const trailer of (res.data || [])) {
                    if (trailer.currentVehicleId) {
                        map[trailer.currentVehicleId] = {
                            id: trailer.id,
                            plateNumber: trailer.plateNumber,
                            currentVehicleId: trailer.currentVehicleId,
                        };
                    }
                }
                setTrailerMap(map);
            } catch { /* ignore */ }
        })();
    }, []);

    async function loadTrips() {
        setLoading(true);
        try {
            let url = `/trips?limit=100`;
            if (statusFilter) url += `&status=${statusFilter}`;
            if (debouncedSearch) url += `&search=${debouncedSearch}`;
            const result = await api.get<any>(url);
            setTrips(result.data || []);
        } catch (err) {
            console.error('Failed to load trips:', err);
        } finally {
            setLoading(false);
        }
    }

    const openDossier = async (tripId: string) => {
        setDossierTripId(tripId);
        setDossierLoading(true);
        setDossierError('');
        setDossier(null);

        try {
            const result = await api.get<any>(`/trips/${tripId}/dossier`);
            setDossier(result.data || null);
        } catch (err: any) {
            setDossierError(err?.message || 'Не удалось загрузить досье рейса');
        } finally {
            setDossierLoading(false);
        }
    };

    const closeDossier = () => {
        setDossierTripId(null);
        setDossierLoading(false);
        setDossierError('');
        setDossier(null);
    };

    // Status counters
    const statusCounts = trips.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const multiOrderTripsCount = trips.filter(t => (tripOrderNumbers[t.id] || []).length > 1).length;
    const withVehicleCount = trips.filter(t => !!t.vehicleId).length;
    const withTrailerCount = trips.filter(t => !!t.vehicleId && !!trailerMap[t.vehicleId]).length;
    const selectedTripForDossier = dossierTripId ? trips.find(t => t.id === dossierTripId) || null : null;
    const selectedVehicleForDossier = selectedTripForDossier?.vehicleId ? vehicleMap[selectedTripForDossier.vehicleId] : null;
    const selectedTrailerForDossier = selectedTripForDossier?.vehicleId ? trailerMap[selectedTripForDossier.vehicleId] : null;
    const dossierReadiness = getVehicleWaybillReadiness({
        bodyType: selectedVehicleForDossier?.bodyType,
        trailerPlate: selectedTrailerForDossier?.plateNumber || null,
        isBlocked: false,
        hasDriver: Boolean(dossier?.driver || selectedTripForDossier?.driverId),
        hasMechanicSignature: Boolean(dossier?.waybill?.mechanicSignature),
        hasMedicSignature: Boolean(dossier?.waybill?.medicSignature),
        hasWaybill: Boolean(dossier?.waybill?.number),
        hasDossier: Boolean(dossier),
        hasOrders: Boolean(dossier?.orders?.length),
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Рейсы</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Все рейсы вЂў {trips.length} записей
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Всего рейсов</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{trips.length}</p>
                </div>
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">Сборных рейсов</p>
                    <p className="mt-2 text-2xl font-bold text-indigo-700">{multiOrderTripsCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">С ТС</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{withVehicleCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">С прицепом</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{withTrailerCount}</p>
                </div>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setStatusFilter('')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                        ${!statusFilter ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                    Все ({trips.length})
                </button>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setStatusFilter(key === statusFilter ? '' : key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                            ${statusFilter === key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        {label} ({statusCounts[key] || 0})
                    </button>
                ))}
            </div>

            {/* Content Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                {/* Search */}
                <div className="p-4 border-b border-slate-200">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Поиск по номеру рейса..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm
                                focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                ) : trips.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Map className="w-12 h-12 mb-3" />
                        <p className="text-sm">Рейсы не найдены</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-left">
                                    <th className="px-4 py-3 font-medium">в„– Рейса</th>
                                    <th className="px-4 py-3 font-medium">Статус</th>
                                    <th className="px-4 py-3 font-medium">ТС</th>
                                    <th className="px-4 py-3 font-medium">Р—аявки</th>
                                    <th className="px-4 py-3 font-medium">Дистанция</th>
                                    <th className="px-4 py-3 font-medium">Выезд (план)</th>
                                    <th className="px-4 py-3 font-medium">Выезд (факт)</th>
                                    <th className="px-4 py-3 font-medium">Р—авершён</th>
                                    <th className="px-4 py-3 font-medium">Создан</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {trips.map(t => (
                                    <tr
                                        key={t.id}
                                        className={`hover:bg-slate-50 transition-colors cursor-pointer ${(tripOrderNumbers[t.id] || []).length > 1 ? 'bg-indigo-50/40' : ''}`}
                                    >
                                        <td className="px-4 py-3 font-semibold text-indigo-600">{t.number}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-700'}`}>
                                                    {STATUS_LABELS[t.status] || t.status}
                                                </span>
                                                {(tripOrderNumbers[t.id] || []).length > 1 && (
                                                    <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-700">
                                                        Сборный рейс вЂў {(tripOrderNumbers[t.id] || []).length} заявок
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {t.vehicleId ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="flex items-center gap-1">
                                                        <Truck className="w-3.5 h-3.5" />
                                                        <span className="font-medium">
                                                            {vehicleMap[t.vehicleId]?.plateNumber || t.vehicleId.slice(0, 8) + '...'}
                                                        </span>
                                                    </span>
                                                    {vehicleMap[t.vehicleId]?.bodyType && (
                                                        <span className="inline-flex w-fit rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                                            ПЛ: {getVehicleProfile(vehicleMap[t.vehicleId].bodyType).displayLabel}
                                                        </span>
                                                    )}
                                                    {vehicleMap[t.vehicleId]?.bodyType && (
                                                        <span className="inline-flex w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                                            {getVehicleWaybillCue(vehicleMap[t.vehicleId].bodyType, undefined, {
                                                                trailerPlate: trailerMap[t.vehicleId]?.plateNumber || null,
                                                            }).tone === 'ready' ? 'ПЛ ready' : 'ПЛ check'}
                                                        </span>
                                                    )}
                                                    {vehicleMap[t.vehicleId]?.bodyType && (
                                                        <span className="inline-flex w-fit rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 shadow-sm">
                                                            {getVehicleWaybillCue(vehicleMap[t.vehicleId].bodyType, undefined, {
                                                                trailerPlate: trailerMap[t.vehicleId]?.plateNumber || null,
                                                            }).modeLabel}
                                                        </span>
                                                    )}
                                                    {!vehicleMap[t.vehicleId]?.bodyType && (
                                                        <span className="inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                                            Тип ТС для ПЛ не задан
                                                        </span>
                                                    )}
                                                    {trailerMap[t.vehicleId] && (
                                                        <span className="text-xs text-slate-400">
                                                            + прицеп {trailerMap[t.vehicleId].plateNumber}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : 'вЂ”'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {(tripOrderNumbers[t.id] || []).length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {(tripOrderNumbers[t.id] || []).slice(0, 2).map((orderNumber) => (
                                                        <span
                                                            key={orderNumber}
                                                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700"
                                                        >
                                                            {orderNumber}
                                                        </span>
                                                    ))}
                                                    {(tripOrderNumbers[t.id] || []).length > 2 && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                                                            +{(tripOrderNumbers[t.id] || []).length - 2}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : 'вЂ”'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {t.plannedDistanceKm ? `${t.plannedDistanceKm} км` : 'вЂ”'}
                                            {t.actualDistanceKm ? (
                                                <span className="text-emerald-600 ml-1">
                                                    <ArrowRight className="w-3 h-3 inline" />
                                                    {t.actualDistanceKm} км
                                                </span>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(t.plannedDepartureAt)}</td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(t.actualDepartureAt)}</td>
                                        <td className="px-4 py-3 text-slate-500">{formatDate(t.actualCompletionAt)}</td>
                                        <td className="px-4 py-3 text-slate-400 text-xs">
                                            <div className="flex flex-col items-end gap-2">
                                                <span>{formatDate(t.createdAt)}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => openDossier(t.id)}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                                                >
                                                    <FileText className="w-3.5 h-3.5" />
                                                    Досье
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {dossierTripId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDossier} />
                    <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200">
                        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Досье рейса</h2>
                                <p className="text-sm text-slate-500">{dossier?.trip?.number || dossierTripId}</p>
                            </div>
                            <button
                                onClick={closeDossier}
                                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6">
                            {dossierLoading ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                                </div>
                            ) : dossierError ? (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                    {dossierError}
                                </div>
                            ) : dossier ? (
                                <div className="space-y-6">
                                    <div className="grid gap-4 md:grid-cols-3">
                                        <div className="rounded-2xl border border-slate-200 p-4">
                                            <div className="text-xs uppercase tracking-wide text-slate-400">Рейс</div>
                                            <div className="mt-2 text-lg font-bold text-slate-900">{dossier.trip?.number}</div>
                                            <div className="mt-1 text-sm text-slate-500">{dossier.trip?.status}</div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 p-4">
                                            <div className="text-xs uppercase tracking-wide text-slate-400">ТС / прицеп</div>
                                            <div className="mt-2 text-sm font-medium text-slate-900">
                                                {dossier.vehicle?.plateNumber || 'Нет ТС'}
                                            </div>
                                            <div className="text-sm text-slate-500">
                                                {dossier.trailer?.plateNumber ? `Прицеп: ${dossier.trailer.plateNumber}` : 'Прицеп не назначен'}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 p-4">
                                            <div className="text-xs uppercase tracking-wide text-slate-400">ПЛ</div>
                                            <div className="mt-2 text-sm font-medium text-slate-900">
                                                {dossier.waybill?.number || 'Не оформлен'}
                                            </div>
                                            <div className="text-sm text-slate-500">
                                                {dossier.summary?.orderCount || 0} заявок в рейсе
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Readiness checklist</p>
                                                <p className="text-sm font-semibold text-slate-900">
                                                    {dossierReadiness.title} · {dossierReadiness.doneCount}/{dossierReadiness.totalCount}
                                                </p>
                                            </div>
                                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                                dossierReadiness.tone === 'warning'
                                                    ? 'bg-rose-100 text-rose-700'
                                                    : dossierReadiness.tone === 'attention'
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-emerald-100 text-emerald-700'
                                            }`}>
                                                {dossierReadiness.tone === 'ready' ? 'ready' : dossierReadiness.tone === 'attention' ? 'check' : 'block'}
                                            </span>
                                        </div>
                                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                                            {dossierReadiness.items.map(item => (
                                                <div key={item.key} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-xs font-medium text-slate-700">{item.label}</span>
                                                        <span className={`text-[11px] font-semibold ${
                                                            item.state === 'done'
                                                                ? 'text-emerald-700'
                                                                : item.state === 'warn'
                                                                    ? 'text-amber-700'
                                                                    : 'text-slate-500'
                                                        }`}>
                                                            {item.state === 'done' ? 'ok' : item.state === 'warn' ? 'check' : 'optional'}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-[11px] leading-4 text-slate-500">{item.hint}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <TransportDocumentsBlock dossier={dossier} />

                                    <div className="grid gap-6 lg:grid-cols-2">
                                        <div className="rounded-2xl border border-slate-200">
                                            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 font-semibold text-slate-900">
                                                Р—аявки
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {(dossier.orders || []).map((order: any) => (
                                                    <div key={order.id} className="p-4">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <div className="text-sm font-semibold text-slate-900">{order.number}</div>
                                                                <div className="text-xs text-slate-500">{order.cargoDescription || 'Без описания груза'}</div>
                                                                <div className="mt-2 text-xs text-slate-500">
                                                                    Контрагент: {order.contractor?.name || 'Не указан'}
                                                                </div>
                                                            </div>
                                                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                                                {order.status}
                                                            </span>
                                                        </div>
                                                        <div className="mt-3 grid gap-2 text-xs text-slate-500">
                                                            <div className="flex items-start gap-2">
                                                                <MapPin className="mt-0.5 w-3.5 h-3.5 text-slate-400" />
                                                                <span>Погрузка: {order.loadingAddress || 'вЂ”'}</span>
                                                            </div>
                                                            <div className="flex items-start gap-2">
                                                                <MapPin className="mt-0.5 w-3.5 h-3.5 text-slate-400" />
                                                                <span>Выгрузка: {order.unloadingAddress || 'вЂ”'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="rounded-2xl border border-slate-200">
                                                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 font-semibold text-slate-900">
                                                    Участники
                                                </div>
                                                <div className="divide-y divide-slate-100">
                                                    {(dossier.parties || []).map((party: any) => (
                                                        <div key={party.id} className="p-4">
                                                            <div className="text-sm font-medium text-slate-900">{party.name}</div>
                                                            <div className="text-xs text-slate-500">{party.inn}</div>
                                                            <div className="text-xs text-slate-500">{party.legalAddress}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-slate-200 p-4">
                                                <div className="text-sm font-semibold text-slate-900 mb-3">Сводка</div>
                                                <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                                                    <div>Р—аявок: {dossier.summary?.orderCount ?? 0}</div>
                                                    <div>ПЛ: {dossier.summary?.hasWaybill ? 'да' : 'нет'}</div>
                                                    <div>ТС: {dossier.summary?.hasVehicle ? 'да' : 'нет'}</div>
                                                    <div>Прицеп: {dossier.summary?.hasTrailer ? 'да' : 'нет'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}




