'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { api } from '@/lib/api';
import { Search, Map, Truck, User, ArrowRight, FileText, X, Loader2, MapPin, AlertTriangle, Clock3, History, RefreshCcw, Wrench, RotateCcw, CheckCircle2, Play, Flag, FolderOpen, Thermometer } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRow } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/components/ui/data-table';
import { getVehicleProfile, getVehicleWaybillCue, getVehicleWaybillReadiness } from '../fleet/components/vehicleProfile';
import { TemperaturePanel } from '@/components/TemperaturePanel';

interface ColdChainSummaryRow {
    coldChainRequired: boolean;
    breachCount: number;
    minC: number | null;
    maxC: number | null;
    slaMinC: number | null;
    slaMaxC: number | null;
}

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
    carrierContractorId?: string | null;
    carrierName?: string | null;
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

type CloseGateSeverity = 'blocking' | 'warning';

type CloseGateItem = {
    id: string;
    documentType: string;
    status: string;
    required: boolean;
    sourceDocumentId?: string | null;
    sourceDocumentKind?: string | null;
    blockedReason?: string | null;
    dueAt?: string | null;
    completedAt?: string | null;
    severity: CloseGateSeverity;
    reason: string;
};

type DossierCloseGate = {
    canClose: boolean;
    generatedAt?: string | null;
    blockingItems?: CloseGateItem[];
    warningItems?: CloseGateItem[];
    documentQueue?: Array<{
        id: string;
        documentType: string;
        status: string;
        bucket: 'missing' | 'overdue' | 'exceptioned';
        severity: CloseGateSeverity;
        dueAt?: string | null;
        responsibleRole: 'dispatcher' | 'driver' | 'accounting';
        action: string;
        printUrl?: string | null;
        printLabel?: string | null;
        reason: string;
    }>;
    etrn?: {
        required: boolean;
        present: boolean;
        missing: boolean;
        exceptioned: boolean;
        paperException: boolean;
    };
    summary?: {
        totalItems: number;
        requiredItems: number;
        completedItems: number;
        exceptionedItems: number;
        blockingItems: number;
        warningItems: number;
    };
};

type RoutePoint = {
    id: string;
    type?: string | null;
    address?: string | null;
    sequence?: number | null;
    sequenceNumber?: number | null;
    status?: string | null;
    plannedArrivalAt?: string | null;
    actualArrivalAt?: string | null;
    windowFrom?: string | null;
    windowTo?: string | null;
    lat?: number | null;
    lon?: number | null;
};

type TripLoadPlan = {
    summary?: {
        assignmentCount?: number;
        totalAssignedWeightKg?: number;
        totalAssignedVolumeM3?: number;
        payloadCapacityKg?: number | null;
        payloadVolumeM3?: number | null;
        overweight?: boolean;
        overVolume?: boolean;
    };
    assignments?: Array<{
        id: string;
        status?: string | null;
        assignedWeightKg?: number | string | null;
        assignedVolumeM3?: number | string | null;
        assignedPlaces?: number | string | null;
        orderId?: string | null;
        orderNumber?: string | null;
        shipmentLotId?: string | null;
        lotSequence?: number | string | null;
        lotStatus?: string | null;
        cargoDescription?: string | null;
        cargoType?: string | null;
        plannedWeightKg?: number | string | null;
        remainingWeightKg?: number | string | null;
        loadingRoutePointId?: string | null;
        unloadingRoutePointId?: string | null;
    }>;
    routePoints?: RoutePoint[];
};

type VehicleOption = {
    id: string;
    plateNumber?: string | null;
    make?: string | null;
    model?: string | null;
};

type DriverOption = {
    id: string;
    fullName?: string | null;
    phone?: string | null;
};

type TrailerOption = {
    id: string;
    plateNumber?: string | null;
    currentVehicleId?: string | null;
};

type OperationalAction = 'downtime' | 'readdress' | 'cancel' | 'breakdown' | 'return' | 'replace' | 'crew';

const STATUS_LABELS: Record<string, string> = {
    planning: 'Планирование',
    assigned: 'Назначен',
    waybill_draft: 'ПЛ черновик',
    inspection: 'Осмотр',
    waybill_issued: 'ПЛ выдан',
    loading: 'Погрузка',
    in_transit: 'В пути',
    completed: 'Завершён',
    billed: 'Оплачен',
    cancelled: 'Отменён',
};

const STATUS_COLORS: Record<string, string> = {
    planning: 'bg-neutral-100 text-neutral-700',
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

function formatEtaBadge(etaIso?: string | null, reason?: string): string {
    if (!etaIso) {
        if (reason && reason !== 'ok') return 'ETA: нет данных GPS';
        return 'ETA: нет данных GPS';
    }
    const eta = new Date(etaIso);
    if (Number.isNaN(eta.getTime())) return 'ETA: нет данных GPS';
    const hh = String(eta.getHours()).padStart(2, '0');
    const mm = String(eta.getMinutes()).padStart(2, '0');
    const diffMin = Math.max(0, Math.round((eta.getTime() - Date.now()) / 60000));
    return `ETA: ${hh}:${mm} (через ~${diffMin}мин)`;
}

function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatTimelineDate(value?: string | null) {
    if (!value) return '—';
    return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatWeightKg(value?: number | string | null) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return '—';
    return parsed >= 1000
        ? `${(parsed / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т`
        : `${parsed.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} кг`;
}

function formatVolumeM3(value?: number | string | null) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed <= 0) return '—';
    return `${parsed.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м³`;
}

function routePointOrder(point: RoutePoint, index = 0) {
    return point.sequenceNumber ?? point.sequence ?? index + 1;
}

function routePointTypeLabel(type?: string | null) {
    if (type === 'loading') return 'Погрузка';
    if (type === 'unloading') return 'Разгрузка';
    return type || 'Точка';
}

function transportDocumentLabel(type: string) {
    const labels: Record<string, string> = {
        waybill: 'Путевой лист',
        delivery_confirmation: 'Подтверждение доставки',
        document_return: 'Возврат оригиналов',
        etrn: 'ЭТРН',
        ttn: 'ТТН',
        upd: 'УПД',
        act: 'Акт',
        transport_document: 'Транспортный документ',
    };

    return labels[type] || type;
}

function dossierItemStatusLabel(status: string) {
    const labels: Record<string, string> = {
        missing: 'нет',
        draft: 'черновик',
        sent: 'отправлен',
        signed: 'подписан',
        received: 'получен',
        accepted: 'принят',
        rejected: 'отклонён',
        exceptioned: 'исключение',
    };

    return labels[status] || status;
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

function bucketLabel(bucket?: string | null) {
    const labels: Record<string, string> = {
        missing: 'нет',
        overdue: 'просрочен',
        exceptioned: 'исключение',
        ready: 'готов',
        pending: 'ожидает',
    };
    return bucket ? (labels[bucket] || bucket) : '';
}

function eventSeverityLabel(severity?: string | null) {
    if (severity === 'critical') return 'критично';
    if (severity === 'warning') return 'риск';
    if (severity === 'info') return 'инфо';
    return severity || 'инфо';
}

function readinessLabel(value?: string | null) {
    const labels: Record<string, string> = {
        ready: 'Готов',
        check: 'Проверить',
        block: 'Заблок.',
        ok: 'OK',
        optional: 'Опц.',
        required: 'Обязат.',
    };
    return value ? (labels[value] || value) : '';
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
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
                    {subtitle && <p className="mt-1 text-sm font-semibold text-neutral-900">{subtitle}</p>}
                </div>
                <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
                    {items.length}
                </span>
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
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(event.severity, 'bg')}`}>
                                        {docEventIcon(event.isProblem, event.severity)}
                                    </span>
                                    <p className="text-sm font-semibold text-neutral-900">{event.title}</p>
                                </div>
                                <p className="text-xs text-neutral-500">
                                    {(event.documentType ? transportDocumentLabel(event.documentType) : etrnTitleTypeLabel(event.titleType))} · {complianceStatusLabel(event.status)}
                                </p>
                            </div>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(event.severity, 'bg')}`}>
                                {event.isProblem ? 'проблема' : eventSeverityLabel(event.severity)}
                            </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-neutral-500">
                            <span>{event.message || 'Готово к следующему шагу'}</span>
                            <span>{formatTimelineDate(event.at)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CloseGateBlock({ closeGate }: { closeGate?: DossierCloseGate | null }) {
    if (!closeGate) return null;

    const blockingItems = closeGate.blockingItems || [];
    const warningItems = closeGate.warningItems || [];
    const documentQueue = closeGate.documentQueue || [];
    const allItems = [...blockingItems, ...warningItems];
    const hasItems = allItems.length > 0;
    const canClose = closeGate.canClose && blockingItems.length === 0;
    const bucketClass: Record<string, string> = {
        missing: 'bg-rose-100 text-rose-700',
        overdue: 'bg-red-100 text-red-700',
        exceptioned: 'bg-amber-100 text-amber-700',
    };
    const roleLabel: Record<string, string> = {
        dispatcher: 'диспетчер',
        driver: 'водитель',
        accounting: 'бухгалтерия',
    };

    const renderItem = (item: CloseGateItem) => (
        <div key={item.id} className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{transportDocumentLabel(item.documentType)}</p>
                    <p className="mt-1 text-xs leading-5 text-neutral-600">{item.reason || item.blockedReason || 'Требуется проверка документа'}</p>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    item.severity === 'blocking' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                }`}>
                    {item.severity === 'blocking' ? 'блокер' : 'риск'}
                </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                <span className="rounded-full bg-neutral-50 px-2 py-0.5">{dossierItemStatusLabel(item.status)}</span>
                <span className="rounded-full bg-neutral-50 px-2 py-0.5">{item.required ? 'обязательный' : 'необязательный'}</span>
                {item.sourceDocumentKind && (
                    <span className="rounded-full bg-neutral-50 px-2 py-0.5">{item.sourceDocumentKind}</span>
                )}
                {item.dueAt && (
                    <span className="rounded-full bg-neutral-50 px-2 py-0.5">срок: {formatTimelineDate(item.dueAt)}</span>
                )}
                {item.completedAt && (
                    <span className="rounded-full bg-neutral-50 px-2 py-0.5">закрыт: {formatTimelineDate(item.completedAt)}</span>
                )}
            </div>
        </div>
    );

    return (
        <div className={`rounded-2xl border p-4 ${
            canClose ? 'border-emerald-200 bg-emerald-50/70' : 'border-rose-200 bg-rose-50/70'
        }`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${canClose ? 'text-emerald-600' : 'text-rose-600'}`}>
                        Закрытие рейса
                    </p>
                    <p className="mt-1 text-base font-semibold text-neutral-900">
                        {canClose ? 'Рейс можно закрывать по досье' : 'Что мешает закрыть рейс'}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                        Проверка документов: {closeGate.summary?.completedItems ?? 0}/{closeGate.summary?.totalItems ?? 0} готово · обновлено {formatTimelineDate(closeGate.generatedAt)}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        canClose ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                        {canClose ? 'Можно закрыть' : 'Закрытие заблокировано'}
                    </span>
                    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 shadow-sm">
                        Блокеров: {blockingItems.length}
                    </span>
                    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700 shadow-sm">
                        Рисков: {warningItems.length}
                    </span>
                </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    Обязательных: {closeGate.summary?.requiredItems ?? 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    Исключений: {closeGate.summary?.exceptionedItems ?? 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    ЭТРН: {closeGate.etrn?.present ? 'есть' : closeGate.etrn?.missing ? 'нет' : 'проверить'}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    Бумажное исключение: {closeGate.etrn?.paperException ? 'да' : 'нет'}
                </div>
            </div>

            <div className="mt-4">
                {hasItems ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                        {blockingItems.map(renderItem)}
                        {warningItems.map(renderItem)}
                    </div>
                ) : (
                    <div className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-emerald-700 shadow-sm">
                        Блокирующих и предупреждающих пунктов нет.
                    </div>
                )}
            </div>

            {documentQueue.length > 0 && (
                <div id="document-queue" className="mt-4 rounded-2xl border border-white bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Очередь документов</p>
                            <p className="mt-1 text-sm font-semibold text-neutral-900">Отсутствующие, просроченные и исключения</p>
                        </div>
                        <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
                            {documentQueue.length} {documentQueue.length === 1 ? 'действие' : 'действий'}
                        </span>
                    </div>
                    <div className="mt-3 grid gap-2">
                        {documentQueue.map((item) => (
                            <div key={item.id} className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-neutral-900">{transportDocumentLabel(item.documentType)}</p>
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${bucketClass[item.bucket] || 'bg-neutral-100 text-neutral-600'}`}>
                                                {bucketLabel(item.bucket)}
                                            </span>
                                            <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                                                ответств.: {roleLabel[item.responsibleRole] || item.responsibleRole}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-neutral-600">{item.action}</p>
                                        <p className="mt-1 text-[11px] text-neutral-500">
                                            {dossierItemStatusLabel(item.status)}
                                            {item.dueAt ? ` · до ${formatTimelineDate(item.dueAt)}` : ''}
                                            {item.reason ? ` · ${item.reason}` : ''}
                                        </p>
                                    </div>
                                    {item.printUrl && (
                                        <button
                                            type="button"
                                            onClick={() => window.open(item.printUrl || '#', '_blank', 'noopener,noreferrer')}
                                            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                        >
                                            <FileText className="h-3.5 w-3.5" />
                                            {item.printLabel || 'Печать акта'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function DossierNextActions({
    dossier,
    onSelectAction,
}: {
    dossier: any;
    onSelectAction: (action: OperationalAction) => void;
}) {
    const trip = dossier?.trip || {};
    const closeGate = dossier?.closeGate as DossierCloseGate | undefined;
    const queueCount = closeGate?.documentQueue?.length ?? 0;
    const blockerCount = closeGate?.blockingItems?.length ?? 0;
    const warningCount = closeGate?.warningItems?.length ?? 0;
    const repairUrl = `/repair?action=create&tripId=${encodeURIComponent(trip.id || '')}&vehicleId=${encodeURIComponent(trip.vehicleId || '')}&source=mechanic`;

    return (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Дальнейшие действия</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">Ремонт, возврат, закрытие — быстрые ссылки</p>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    closeGate?.canClose ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                    {closeGate?.canClose ? 'Готов к закрытию' : 'Закрытие заблокировано'}
                </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <button
                    type="button"
                    onClick={() => window.open(repairUrl, '_blank', 'noopener,noreferrer')}
                    className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:border-indigo-200 hover:bg-indigo-50"
                >
                    <span className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                        <Wrench className="h-3.5 w-3.5" />
                        Заявка на ремонт
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-neutral-500">Открыть ремонт с контекстом этого ТС и рейса.</span>
                </button>
                <button
                    type="button"
                    onClick={() => onSelectAction('return')}
                    className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:border-indigo-200 hover:bg-indigo-50"
                >
                    <span className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Чек-лист возврата
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-neutral-500">Возврат после рейса: документы, одометр, топливо, осмотр.</span>
                </button>
                <button
                    type="button"
                    onClick={() => onSelectAction('breakdown')}
                    className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:border-indigo-200 hover:bg-indigo-50"
                >
                    <span className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Поломка в рейсе
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-neutral-500">Зафиксировать блокирующее событие и открыть ремонт/замену.</span>
                </button>
                <a
                    href="#document-queue"
                    className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:border-indigo-200 hover:bg-indigo-50"
                >
                    <span className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Закрытие рейса
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-neutral-500">
                        Блокеров: {blockerCount}, рисков: {warningCount}, документов в очереди: {queueCount}.
                    </span>
                </a>
            </div>
        </div>
    );
}

function formatWindow(from?: string | null, to?: string | null) {
    if (!from && !to) return null;
    const fmt = (v?: string | null) => {
        if (!v) return '—';
        try {
            const d = new Date(v);
            if (Number.isNaN(d.getTime())) return v;
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${dd}.${mm} ${hh}:${mi}`;
        } catch { return v; }
    };
    return `${fmt(from)} – ${fmt(to)}`;
}

function isWindowOverdue(point: RoutePoint, now = Date.now()): boolean {
    if (!point.windowTo) return false;
    if (point.status === 'completed') return false;
    const t = new Date(point.windowTo).getTime();
    if (Number.isNaN(t)) return false;
    return now > t;
}

function OperationalStructureBlock({
    dossier,
    loadPlan,
    routePoints,
    canSort,
    onSortRoute,
    sorting,
}: {
    dossier: any;
    loadPlan?: TripLoadPlan | null;
    routePoints: RoutePoint[];
    canSort?: boolean;
    onSortRoute?: () => void;
    sorting?: boolean;
}) {
    const orders = Array.isArray(dossier?.orders) ? dossier.orders : [];
    const assignments = Array.isArray(loadPlan?.assignments) ? loadPlan.assignments : [];
    const points = (Array.isArray(loadPlan?.routePoints) && loadPlan.routePoints.length > 0)
        ? loadPlan.routePoints
        : routePoints;
    const sortedPoints = points.slice().sort((a, b) => routePointOrder(a) - routePointOrder(b));
    const loadingCount = sortedPoints.filter(point => point.type === 'loading').length;
    const unloadingCount = sortedPoints.filter(point => point.type === 'unloading').length;
    const orderCount = orders.length || dossier?.summary?.orderCount || 0;
    const hasMultiOrder = orderCount > 1;
    const hasMultiStop = sortedPoints.length > 2;
    const summary = loadPlan?.summary;
    const assignmentsByOrder = assignments.reduce((acc, assignment) => {
        const key = assignment.orderNumber || assignment.orderId || 'Unlinked order';
        const current = acc.get(key) ?? [];
        current.push(assignment);
        acc.set(key, current);
        return acc;
    }, new globalThis.Map<string, typeof assignments>());

    const routePointById = new globalThis.Map(sortedPoints.map((point, index) => [point.id, `${routePointOrder(point, index)}. ${routePointTypeLabel(point.type)}`]));

    return (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Load structure</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">
                        Multi-order, lot assignments, and route stops
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${hasMultiOrder ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-600'}`}>
                        {orderCount} orders
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${assignments.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                        {assignments.length} lots
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${hasMultiStop ? 'bg-sky-100 text-sky-700' : 'bg-neutral-100 text-neutral-600'}`}>
                        {sortedPoints.length} stops
                    </span>
                </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{'One trip to many orders'}</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">{hasMultiOrder ? 'Consolidated trip' : 'Single-order trip'}</p>
                    <p className="mt-1 text-xs text-neutral-500">Grouped by linked orders from the dossier.</p>
                </div>
                <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Lot load plan</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">
                        {formatWeightKg(summary?.totalAssignedWeightKg)} / {formatWeightKg(summary?.payloadCapacityKg)}
                    </p>
                    <p className={`mt-1 text-xs ${summary?.overweight || summary?.overVolume ? 'text-rose-600' : 'text-neutral-500'}`}>
                        {summary?.overweight ? 'Over payload capacity' : summary?.overVolume ? 'Over volume capacity' : 'Capacity summary from load-plan.'}
                    </p>
                </div>
                <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Multi-stop route</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">{loadingCount} loading / {unloadingCount} unloading</p>
                    <p className="mt-1 text-xs text-neutral-500">Visual sequence only; no solver or VRP changes.</p>
                </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-neutral-200">
                    <div className="border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Lot assignments
                    </div>
                    <div className="divide-y divide-neutral-100">
                        {assignments.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-neutral-500">
                                No lot assignments returned yet. Split/assignment data will appear here when the load-plan API has it.
                            </div>
                        ) : assignments.slice(0, 6).map((assignment) => (
                            <div key={assignment.id} className="px-3 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-neutral-900">
                                            {assignment.orderNumber || 'Order'} / lot {assignment.lotSequence ?? '-'}
                                        </p>
                                        <p className="truncate text-xs text-neutral-500">{assignment.cargoDescription || assignment.cargoType || 'Cargo details not provided'}</p>
                                    </div>
                                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                                        {assignment.status || assignment.lotStatus || 'planned'}
                                    </span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                                    <span className="rounded-full bg-neutral-50 px-2 py-0.5">{formatWeightKg(assignment.assignedWeightKg || assignment.plannedWeightKg)}</span>
                                    <span className="rounded-full bg-neutral-50 px-2 py-0.5">{formatVolumeM3(assignment.assignedVolumeM3)}</span>
                                    {assignment.assignedPlaces != null && (
                                        <span className="rounded-full bg-neutral-50 px-2 py-0.5">{assignment.assignedPlaces} places</span>
                                    )}
                                </div>
                                <p className="mt-2 text-[11px] text-neutral-400">
                                    {`${routePointById.get(assignment.loadingRoutePointId || '') || 'Loading stop not linked'} to ${routePointById.get(assignment.unloadingRoutePointId || '') || 'Unloading stop not linked'}`}
                                </p>
                            </div>
                        ))}
                        {assignments.length > 6 && (
                            <div className="px-3 py-2 text-xs text-neutral-500">+{assignments.length - 6} more assignments</div>
                        )}
                    </div>
                </div>

                <div className="rounded-xl border border-neutral-200">
                    <div className="flex items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50 px-3 py-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Route sequence</span>
                        {canSort && (
                            <button
                                type="button"
                                onClick={onSortRoute}
                                disabled={sorting || sortedPoints.length === 0}
                                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {sorting && <Loader2 className="h-3 w-3 animate-spin" />}
                                Сортировать маршрут
                            </button>
                        )}
                    </div>
                    <div className="divide-y divide-neutral-100">
                        {sortedPoints.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-neutral-500">
                                No route points returned. The route timeline will appear after points are generated.
                            </div>
                        ) : sortedPoints.map((point, index) => {
                            const overdue = isWindowOverdue(point);
                            const window = formatWindow(point.windowFrom, point.windowTo);
                            return (
                                <div
                                    key={point.id}
                                    className={`flex gap-3 px-3 py-3 ${overdue ? 'bg-rose-50' : ''}`}
                                >
                                    <span className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${overdue ? 'bg-rose-200 text-rose-800' : 'bg-indigo-100 text-indigo-700'}`}>
                                        {routePointOrder(point, index)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-neutral-900">{routePointTypeLabel(point.type)}</p>
                                        <p className="truncate text-xs text-neutral-500">{point.address || 'Address not provided'}</p>
                                        <p className="mt-1 text-[11px] text-neutral-400">
                                            {point.status || 'planned'} | plan {formatTimelineDate(point.plannedArrivalAt)} | fact {formatTimelineDate(point.actualArrivalAt)}
                                        </p>
                                        {window && (
                                            <p className={`mt-1 text-[11px] font-medium ${overdue ? 'text-rose-700' : 'text-neutral-500'}`}>
                                                Окно: {window}
                                                {overdue && <span className="ml-1 font-semibold">· просрочено</span>}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-xl border border-neutral-200">
                    <div className="border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Order grouping
                    </div>
                    <div className="divide-y divide-neutral-100">
                        {orders.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-neutral-500">
                                No linked orders in dossier.
                            </div>
                        ) : orders.map((order: any) => {
                            const group = assignmentsByOrder.get(order.number) || assignmentsByOrder.get(order.id) || [];
                            return (
                                <div key={order.id || order.number} className="px-3 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-semibold text-neutral-900">{order.number || order.id}</p>
                                                {order.adrClass && (
                                                    <span
                                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold border border-red-200"
                                                        title={`ADR класс ${order.adrClass}${order.adrUnNumber ? ` · ${order.adrUnNumber}` : ''}`}
                                                    >
                                                        <AlertTriangle className="w-2.5 h-2.5" />
                                                        ADR-{order.adrClass}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="truncate text-xs text-neutral-500">{order.cargoDescription || 'Cargo details not provided'}</p>
                                        </div>
                                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                            {group.length} lots
                                        </span>
                                    </div>
                                    <p className="mt-2 text-[11px] text-neutral-400">
                                        {`${order.loadingAddress || 'Loading address not set'} to ${order.unloadingAddress || 'Unloading address not set'}`}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function OperationalActionsBlock({
    tripId,
    routePoints,
    initialAction,
    onDone,
}: {
    tripId: string;
    routePoints: RoutePoint[];
    initialAction?: OperationalAction | null;
    onDone: () => Promise<void>;
}) {
    const defaultShiftStart = () => new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 16);
    const defaultShiftEnd = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);

    const [activeAction, setActiveAction] = useState<OperationalAction>('downtime');
    const [routePointId, setRoutePointId] = useState(routePoints[0]?.id || '');
    const [reason, setReason] = useState('Операционное отклонение');
    const [notes, setNotes] = useState('');
    const [address, setAddress] = useState('');
    const [reserveAmount, setReserveAmount] = useState('');
    const [freeMinutes, setFreeMinutes] = useState('60');
    const [odometerEnd, setOdometerEnd] = useState('');
    const [fuelEnd, setFuelEnd] = useState('');
    const [cancelTrip, setCancelTrip] = useState(true);
    const [requiresReplacement, setRequiresReplacement] = useState(true);
    const [originalDocumentsReceived, setOriginalDocumentsReceived] = useState(false);
    const [postTripInspectionStatus, setPostTripInspectionStatus] = useState<'pending' | 'passed' | 'failed'>('pending');
    const [blockNextTrip, setBlockNextTrip] = useState(false);
    const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
    const [drivers, setDrivers] = useState<DriverOption[]>([]);
    const [trailers, setTrailers] = useState<TrailerOption[]>([]);
    const [replacementVehicleId, setReplacementVehicleId] = useState('');
    const [replacementDriverId, setReplacementDriverId] = useState('');
    const [replacementTrailerId, setReplacementTrailerId] = useState('');
    const [crewPrimaryDriverId, setCrewPrimaryDriverId] = useState('');
    const [crewSecondaryDriverId, setCrewSecondaryDriverId] = useState('');
    const [shiftStart, setShiftStart] = useState(defaultShiftStart);
    const [shiftEnd, setShiftEnd] = useState(defaultShiftEnd);
    const [maxShiftMinutes, setMaxShiftMinutes] = useState('540');
    const [loading, setLoading] = useState(false);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        if (initialAction) setActiveAction(initialAction);
    }, [initialAction]);

    useEffect(() => {
        if (activeAction === 'downtime' && !routePointId && routePoints[0]?.id) setRoutePointId(routePoints[0].id);
    }, [activeAction, routePointId, routePoints]);

    useEffect(() => {
        if (activeAction !== 'replace' && activeAction !== 'crew') return;

        let cancelled = false;
        setOptionsLoading(true);
        Promise.all([
            api.get<any>('/trips/available-vehicles').catch(() => ({ success: false, data: [] })),
            api.get<any>('/fleet/drivers?limit=200').catch(() => ({ success: false, data: [] })),
            api.get<any>('/fleet/trailers?limit=200').catch(() => ({ success: false, data: [] })),
        ]).then(([vehicleResult, driverResult, trailerResult]) => {
            if (cancelled) return;
            setVehicles(vehicleResult.success ? (vehicleResult.data || []) : []);
            setDrivers(driverResult.success ? (driverResult.data || []) : []);
            setTrailers(trailerResult.success ? (trailerResult.data || []) : []);
        }).finally(() => {
            if (!cancelled) setOptionsLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [activeAction]);

    const selectedPoint = routePoints.find(point => point.id === routePointId) || null;
    const hasRoutePoints = routePoints.length > 0;

    const numberOrUndefined = (value: string) => {
        if (value.trim() === '') return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    };

    const toIso = (value: string) => new Date(value).toISOString();

    const submit = async () => {
        setLoading(true);
        setResult(null);

        try {
            if (activeAction === 'downtime') {
                if (!routePointId) throw new Error('Выберите точку маршрута');
                await api.post(`/trips/${tripId}/route-points/${routePointId}/downtime`, {
                    vehicleArrivedAt: new Date().toISOString(),
                    waitingStartedAt: new Date().toISOString(),
                    reason,
                    notes: notes || null,
                    freeMinutes: numberOrUndefined(freeMinutes),
                    reserveAmount: numberOrUndefined(reserveAmount),
                });
                setResult({ tone: 'success', message: 'Простой зафиксирован. Cockpit и close-flow увидят событие.' });
            } else if (activeAction === 'readdress') {
                if (!address.trim()) throw new Error('Укажите новый адрес');
                await api.post(`/trips/${tripId}/route-changes/readdress`, {
                    routePointId: routePointId || null,
                    type: selectedPoint?.type === 'loading' ? 'loading' : 'unloading',
                    address,
                    reason,
                    notes: notes || null,
                });
                setResult({ tone: 'success', message: 'Переадресация записана в маршрутный журнал и ЭТРН metadata.' });
            } else if (activeAction === 'cancel') {
                await api.post(`/trips/${tripId}/cancel-after-arrival`, {
                    routePointId: routePointId || null,
                    vehicleArrivedAt: new Date().toISOString(),
                    reason,
                    notes: notes || null,
                    reserveAmount: numberOrUndefined(reserveAmount),
                    cancelTrip,
                });
                setResult({ tone: 'success', message: 'Отмена после подачи зафиксирована с резервом и следом в журнале.' });
            } else if (activeAction === 'breakdown') {
                await api.post(`/trips/${tripId}/breakdowns`, {
                    routePointId: routePointId || null,
                    reason,
                    notes: notes || null,
                    requiresReplacement,
                });
                setResult({ tone: 'success', message: 'Поломка записана как блокирующее событие.' });
            } else if (activeAction === 'return') {
                await api.post(`/trips/${tripId}/post-trip-return`, {
                    actualCompletionAt: new Date().toISOString(),
                    odometerEnd: numberOrUndefined(odometerEnd),
                    fuelEnd: numberOrUndefined(fuelEnd),
                    originalDocumentsReceived,
                    documentsReturned: originalDocumentsReceived,
                    postTripInspectionStatus,
                    blockNextTrip,
                    notes: notes || null,
                });
                setResult({ tone: 'success', message: 'Возврат ТС после рейса зафиксирован.' });
            } else if (activeAction === 'replace') {
                if (!replacementVehicleId && !replacementDriverId && !replacementTrailerId) {
                    throw new Error('Выберите ТС, водителя или прицеп для замены');
                }
                await api.post(`/trips/${tripId}/resource-replacements`, {
                    vehicleId: replacementVehicleId || undefined,
                    driverId: replacementDriverId || undefined,
                    trailerId: replacementTrailerId || undefined,
                    reason,
                    notes: notes || null,
                });
                setResult({ tone: 'success', message: 'Замена ресурса записана, compatibility и ЭТРН Title 04 будут пересчитаны.' });
            } else {
                if (!crewPrimaryDriverId) throw new Error('Выберите основного водителя');
                const crew = [{
                    driverId: crewPrimaryDriverId,
                    shiftStart: toIso(shiftStart),
                    shiftEnd: toIso(shiftEnd),
                    isPrimary: true,
                }];
                if (crewSecondaryDriverId && crewSecondaryDriverId !== crewPrimaryDriverId) {
                    crew.push({
                        driverId: crewSecondaryDriverId,
                        shiftStart: toIso(shiftStart),
                        shiftEnd: toIso(shiftEnd),
                        isPrimary: false,
                    });
                }
                await api.post(`/trips/${tripId}/crew-rest-plan`, {
                    crew,
                    maxShiftMinutes: numberOrUndefined(maxShiftMinutes),
                    notes: notes || null,
                });
                setResult({ tone: 'success', message: 'Экипаж и риск режима труда записаны в cockpit.' });
            }

            await onDone();
        } catch (err: any) {
            setResult({ tone: 'error', message: err?.message || 'Не удалось выполнить действие' });
        } finally {
            setLoading(false);
        }
    };

    const actions = [
        { id: 'downtime', label: 'Простой', disabled: !hasRoutePoints },
        { id: 'readdress', label: 'Переадресация', disabled: false },
        { id: 'cancel', label: 'Отмена подачи', disabled: false },
        { id: 'breakdown', label: 'Поломка', disabled: false },
        { id: 'return', label: 'Возврат ТС', disabled: false },
        { id: 'replace', label: 'Замена ресурса', disabled: false },
        { id: 'crew', label: 'Экипаж/РТО', disabled: false },
    ] as const;

    return (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Операционные действия</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">Простой, переадресация, поломка, отмена и возврат</p>
                </div>
                <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
                    {routePoints.length} точек
                </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {actions.map(action => (
                    <button
                        key={action.id}
                        type="button"
                        disabled={action.disabled}
                        onClick={() => setActiveAction(action.id)}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            activeAction === action.id
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        }`}
                    >
                        {action.label}
                    </button>
                ))}
            </div>

            {result && (
                <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
                    result.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}>
                    {result.message}
                </div>
            )}

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className="block">
                    <span className="text-xs font-semibold text-neutral-600">Точка маршрута</span>
                    <select
                        value={routePointId}
                        onChange={event => setRoutePointId(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                        <option value="">Без привязки к точке</option>
                        {routePoints.map((point, index) => (
                            <option key={point.id} value={point.id}>
                                {point.sequence ?? index + 1}. {point.type === 'loading' ? 'Погрузка' : 'Выгрузка'} · {point.address || point.id.slice(0, 8)}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className="text-xs font-semibold text-neutral-600">Причина</span>
                    <input
                        value={reason}
                        onChange={event => setReason(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                </label>

                {activeAction === 'readdress' && (
                    <label className="block lg:col-span-2">
                        <span className="text-xs font-semibold text-neutral-600">Новый адрес</span>
                        <input
                            value={address}
                            onChange={event => setAddress(event.target.value)}
                            placeholder="Новый адрес погрузки или выгрузки"
                            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                    </label>
                )}

                {(activeAction === 'downtime' || activeAction === 'cancel') && (
                    <>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Финансовый резерв, руб.</span>
                            <input
                                value={reserveAmount}
                                onChange={event => setReserveAmount(event.target.value)}
                                inputMode="decimal"
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </label>
                        {activeAction === 'downtime' && (
                            <label className="block">
                                <span className="text-xs font-semibold text-neutral-600">Бесплатные минуты</span>
                                <input
                                    value={freeMinutes}
                                    onChange={event => setFreeMinutes(event.target.value)}
                                    inputMode="numeric"
                                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </label>
                        )}
                    </>
                )}

                {activeAction === 'return' && (
                    <>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Одометр</span>
                            <input
                                value={odometerEnd}
                                onChange={event => setOdometerEnd(event.target.value)}
                                inputMode="decimal"
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Топливо</span>
                            <input
                                value={fuelEnd}
                                onChange={event => setFuelEnd(event.target.value)}
                                inputMode="decimal"
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Послерейсовый осмотр</span>
                            <select
                                value={postTripInspectionStatus}
                                onChange={event => setPostTripInspectionStatus(event.target.value as 'pending' | 'passed' | 'failed')}
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                                <option value="pending">Ожидает</option>
                                <option value="passed">Пройден</option>
                                <option value="failed">Не пройден</option>
                            </select>
                        </label>
                    </>
                )}

                {activeAction === 'replace' && (
                    <>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Новое ТС</span>
                            <select
                                value={replacementVehicleId}
                                onChange={event => setReplacementVehicleId(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                                <option value="">Не менять ТС</option>
                                {vehicles.map(vehicle => (
                                    <option key={vehicle.id} value={vehicle.id}>
                                        {vehicle.plateNumber || vehicle.id.slice(0, 8)} {vehicle.make || vehicle.model ? `· ${[vehicle.make, vehicle.model].filter(Boolean).join(' ')}` : ''}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Новый водитель</span>
                            <select
                                value={replacementDriverId}
                                onChange={event => setReplacementDriverId(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                                <option value="">Не менять водителя</option>
                                {drivers.map(driver => (
                                    <option key={driver.id} value={driver.id}>
                                        {driver.fullName || driver.id.slice(0, 8)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block lg:col-span-2">
                            <span className="text-xs font-semibold text-neutral-600">Новый прицеп</span>
                            <select
                                value={replacementTrailerId}
                                onChange={event => setReplacementTrailerId(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                                <option value="">Не менять прицеп</option>
                                {trailers.map(trailer => (
                                    <option key={trailer.id} value={trailer.id}>
                                        {trailer.plateNumber || trailer.id.slice(0, 8)}{trailer.currentVehicleId ? ' · уже сцеплен' : ''}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </>
                )}

                {activeAction === 'crew' && (
                    <>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Основной водитель</span>
                            <select
                                value={crewPrimaryDriverId}
                                onChange={event => setCrewPrimaryDriverId(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                                <option value="">Выберите водителя</option>
                                {drivers.map(driver => (
                                    <option key={driver.id} value={driver.id}>
                                        {driver.fullName || driver.id.slice(0, 8)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Второй водитель</span>
                            <select
                                value={crewSecondaryDriverId}
                                onChange={event => setCrewSecondaryDriverId(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                                <option value="">Без второго водителя</option>
                                {drivers.map(driver => (
                                    <option key={driver.id} value={driver.id}>
                                        {driver.fullName || driver.id.slice(0, 8)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Начало смены</span>
                            <input
                                type="datetime-local"
                                value={shiftStart}
                                onChange={event => setShiftStart(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Конец смены</span>
                            <input
                                type="datetime-local"
                                value={shiftEnd}
                                onChange={event => setShiftEnd(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-neutral-600">Лимит смены, минут</span>
                            <input
                                value={maxShiftMinutes}
                                onChange={event => setMaxShiftMinutes(event.target.value)}
                                inputMode="numeric"
                                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </label>
                    </>
                )}

                <label className="block lg:col-span-2">
                    <span className="text-xs font-semibold text-neutral-600">Комментарий</span>
                    <textarea
                        value={notes}
                        onChange={event => setNotes(event.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-3">
                    {activeAction === 'cancel' && (
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-600">
                            <input type="checkbox" checked={cancelTrip} onChange={event => setCancelTrip(event.target.checked)} />
                            Отменить рейс
                        </label>
                    )}
                    {activeAction === 'breakdown' && (
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-600">
                            <input type="checkbox" checked={requiresReplacement} onChange={event => setRequiresReplacement(event.target.checked)} />
                            Нужна замена ресурса
                        </label>
                    )}
                    {activeAction === 'return' && (
                        <>
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-600">
                                <input type="checkbox" checked={originalDocumentsReceived} onChange={event => setOriginalDocumentsReceived(event.target.checked)} />
                                Оригиналы сданы
                            </label>
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-600">
                                <input type="checkbox" checked={blockNextTrip} onChange={event => setBlockNextTrip(event.target.checked)} />
                                Блокировать следующий рейс
                            </label>
                        </>
                    )}
                    {(activeAction === 'replace' || activeAction === 'crew') && optionsLoading && (
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Загружаем справочники
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={submit}
                    disabled={
                        loading
                        || !reason.trim()
                        || (activeAction === 'downtime' && !routePointId)
                        || (activeAction === 'replace' && !replacementVehicleId && !replacementDriverId && !replacementTrailerId)
                        || (activeAction === 'crew' && !crewPrimaryDriverId)
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Зафиксировать
                </button>
            </div>
        </div>
    );
}

function TransportDocumentsBlock({ dossier, isAdmin }: { dossier: any; isAdmin: boolean }) {
    const transportDocuments = dossier?.transportDocuments;
    const etrn = dossier?.etrn;
    const tripId = dossier?.trip?.id;
    const [documentActionLoading, setDocumentActionLoading] = useState<string | null>(null);
    const [documentActionResult, setDocumentActionResult] = useState<string | null>(null);
    const [ediActionLoading, setEdiActionLoading] = useState<string | null>(null);
    const [ediStatuses, setEdiStatuses] = useState<Record<string, { status?: string; provider?: string; sentAt?: string }>>({});
    const [ediHistoryDoc, setEdiHistoryDoc] = useState<any | null>(null);
    const [ediHistory, setEdiHistory] = useState<any[]>([]);
    const [ediHistoryLoading, setEdiHistoryLoading] = useState(false);

    const refreshEdiStatus = async (docId: string) => {
        try {
            const res = await api.get<{ success: boolean; data: any[] }>(`/transport-documents/${docId}/edi/history`);
            const events = Array.isArray(res?.data) ? res.data : [];
            // Latest event determines status
            const latest = events[0];
            setEdiStatuses(prev => ({
                ...prev,
                [docId]: {
                    status: latest?.eventType || prev[docId]?.status,
                    provider: latest?.payload?.provider || prev[docId]?.provider,
                    sentAt: latest?.createdAt || prev[docId]?.sentAt,
                },
            }));
        } catch {
            // silent
        }
    };

    const sendEdi = async (docId: string, provider: 'diadoc' | 'sbis' | 'kontur') => {
        setEdiActionLoading(`send-${docId}-${provider}`);
        try {
            await api.post(`/transport-documents/${docId}/edi/send`, { provider });
            setDocumentActionResult(`EDI: документ отправлен через ${provider}`);
            await refreshEdiStatus(docId);
        } catch (err: any) {
            setDocumentActionResult(err?.message || 'Не удалось отправить EDI');
        } finally {
            setEdiActionLoading(null);
        }
    };

    const mockEdiProgress = async (docId: string, to: 'signed_by_carrier' | 'signed_by_client' | 'rejected') => {
        setEdiActionLoading(`mock-${docId}-${to}`);
        try {
            await api.post(`/transport-documents/${docId}/edi/mock-progress`, { to });
            setDocumentActionResult(`EDI mock: ${to}`);
            await refreshEdiStatus(docId);
        } catch (err: any) {
            setDocumentActionResult(err?.message || 'Не удалось обновить EDI mock');
        } finally {
            setEdiActionLoading(null);
        }
    };

    const openEdiHistory = async (doc: any) => {
        setEdiHistoryDoc(doc);
        setEdiHistory([]);
        setEdiHistoryLoading(true);
        try {
            const res = await api.get<{ success: boolean; data: any[] }>(`/transport-documents/${doc.id}/edi/history`);
            setEdiHistory(Array.isArray(res?.data) ? res.data : []);
        } catch {
            setEdiHistory([]);
        } finally {
            setEdiHistoryLoading(false);
        }
    };

    if (!transportDocuments && !etrn) return null;

    // TODO(type): formalize TransportDocument / ETRN shapes in @tms/shared and replace these locals
    type TransportDoc = {
        providerName?: string; retryCount?: number;
        providerDocumentId?: string; providerMessageId?: string; acceptedAt?: string;
        nextRetryAt?: string; lastAttemptAt?: string; lastRetryAt?: string; sentAt?: string;
        type?: string; status?: string; updatedAt?: string;
        [k: string]: unknown;
    };
    type DocProblem = { code?: string; severity?: string; message?: string; [k: string]: unknown };
    type EtrnTitle = { type?: string; status?: string; [k: string]: unknown };
    type EtrnProblem = { code?: string; severity?: string; message?: string; [k: string]: unknown };
    const docs = (transportDocuments?.documents || []) as TransportDoc[];
    const docProblems = (transportDocuments?.problems || []) as DocProblem[];
    const etrnTitles = (etrn?.titles || []) as EtrnTitle[];
    const etrnProblems = (etrn?.problems || []) as EtrnProblem[];
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

    const recordDocumentSignature = async (doc: any) => {
        if (!tripId || !doc?.id) return;
        setDocumentActionLoading(`sign-${doc.id}`);
        try {
            await api.post(`/trips/${tripId}/transport-documents/${doc.id}/signatures`, {
                signerRole: 'dispatcher',
                signerName: 'Оператор TMS',
                authorityType: 'manual_ui',
                signedAt: new Date().toISOString(),
                notes: 'Зафиксировано из web dossier',
            });
            setDocumentActionResult(`${transportDocumentLabel(doc.type)}: подпись зафиксирована`);
        } catch (err: any) {
            setDocumentActionResult(err?.message || 'Не удалось зафиксировать подпись');
        } finally {
            setDocumentActionLoading(null);
        }
    };

    const recordDocumentRefusal = async (doc: any) => {
        if (!tripId || !doc?.id) return;
        const reason = window.prompt('Причина отказа от подписи', 'Есть расхождения в документе');
        if (!reason) return;
        setDocumentActionLoading(`refuse-${doc.id}`);
        try {
            await api.post(`/trips/${tripId}/transport-documents/${doc.id}/signature-refusals`, {
                signerRole: 'dispatcher',
                signerName: 'Оператор TMS',
                reason,
                refusedAt: new Date().toISOString(),
                notes: 'Отказ зафиксирован из web dossier',
            });
            setDocumentActionResult(`${transportDocumentLabel(doc.type)}: отказ от подписи зафиксирован`);
        } catch (err: any) {
            setDocumentActionResult(err?.message || 'Не удалось зафиксировать отказ');
        } finally {
            setDocumentActionLoading(null);
        }
    };

    return (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Persisted transport documents</p>
                    <p className="text-sm font-semibold text-neutral-900">
                        {phaseLabelMap[transportDocuments?.lifecycle?.documentPhase] || transportDocuments?.lifecycle?.documentPhase || 'сформирован'} · {workflowLabelMap[etrn?.status] || etrn?.status || 'draft'}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
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
                    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-600 shadow-sm">
                        {transportDocuments?.summary?.problemCount ?? 0} issues
                    </span>
                </div>
            </div>

            {documentActionResult && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {documentActionResult}
                </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    Документов: {transportDocuments?.summary?.totalDocuments ?? 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    Готово: {transportDocuments?.summary?.completedDocuments ?? 0}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    Последняя активность: {formatTimelineDate(transportDocuments?.summary?.latestActivityAt)}
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm">
                    ETRN: {etrnTitles.filter((title) => title.status === 'blocked' || title.status === 'missing').length} blocked/missing
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
                        Последняя попытка: {formatTimelineDate(exchangeTotals.lastAttemptAt)}
                    </div>
                    <div className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                        Следующий retry: {formatTimelineDate(exchangeTotals.nextRetryAt)}
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
                                    {transportDocumentLabel(type)}
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
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{transportDocumentLabel(doc.type)}</p>
                                <p className="text-sm font-semibold text-neutral-900">{doc.externalId}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass(documentStatusTone(doc.status), 'bg')}`}>
                                    {transportDocumentStatusLabel(doc.status)}
                                </span>
                                <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                                    {doc.providerStatus || doc.providerName || 'internal'}
                                </span>
                            </div>
                        </div>
                        <div className="mt-3 grid gap-2 text-[11px] text-neutral-500">
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
                                <span className="inline-flex rounded-full bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
                                    синхр. {formatTimelineDate(doc.lastSyncedAt)}
                                </span>
                            )}
                        </div>
                        <div className="mt-3 text-[11px] text-neutral-500">
                            {doc.nextRetryAt
                                ? `Ручное действие: повторить после ${formatTimelineDate(doc.nextRetryAt)}`
                                : doc.status === 'error' || doc.status === 'rejected'
                                    ? 'Ручное действие: исправить блокер и повторить'
                                    : doc.providerStatus === 'retry_requested'
                                        ? 'Ручное действие: запрошен retry'
                                        : 'Ручное действие: наблюдение'}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                disabled={!tripId || documentActionLoading === `sign-${doc.id}`}
                                onClick={() => recordDocumentSignature(doc)}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                                {documentActionLoading === `sign-${doc.id}` ? 'Запись...' : 'Подписать'}
                            </button>
                            <button
                                type="button"
                                disabled={!tripId || documentActionLoading === `refuse-${doc.id}`}
                                onClick={() => recordDocumentRefusal(doc)}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                                {documentActionLoading === `refuse-${doc.id}` ? 'Запись...' : 'Отказать'}
                            </button>
                        </div>
                        {(doc.error || doc.status === 'error' || doc.status === 'rejected') && (
                            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                                {doc.error || 'Документ требует повторной проверки перед retry'}
                            </div>
                        )}
                        {(() => {
                            const ediOverride = ediStatuses[doc.id] || {};
                            const ediStatus = ediOverride.status || doc.ediStatus;
                            const ediProvider = ediOverride.provider || doc.ediProvider;
                            const ediSentAt = ediOverride.sentAt || doc.ediSentAt;
                            const badge = (() => {
                                switch (ediStatus) {
                                    case 'sent':
                                    case 'edi_sent':
                                        return { label: '📤 Отправлено', cls: 'border-blue-200 bg-blue-50 text-blue-700' };
                                    case 'signed_by_carrier':
                                        return { label: '✓ Подписано перевозчиком', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
                                    case 'signed_by_client':
                                        return { label: '✓✓ Подписано клиентом', cls: 'border-emerald-200 bg-emerald-100 text-emerald-800' };
                                    case 'rejected':
                                        return { label: '✕ Отклонено', cls: 'border-rose-200 bg-rose-50 text-rose-700' };
                                    default:
                                        return ediStatus
                                            ? { label: ediStatus, cls: 'border-neutral-200 bg-neutral-50 text-neutral-600' }
                                            : null;
                                }
                            })();
                            return (
                                <div className="mt-3 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">EDI</p>
                                        {badge ? (
                                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                                                {badge.label}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-neutral-400">не отправлено</span>
                                        )}
                                    </div>
                                    {(ediProvider || ediSentAt) && (
                                        <div className="flex flex-wrap gap-2 text-[10px] text-neutral-600">
                                            {ediProvider && <span className="rounded bg-white px-1.5 py-0.5 shadow-sm">{ediProvider}</span>}
                                            {ediSentAt && <span className="rounded bg-white px-1.5 py-0.5 shadow-sm">{formatTimelineDate(ediSentAt)}</span>}
                                        </div>
                                    )}
                                    {isAdmin && (
                                        <>
                                            <div className="flex flex-wrap gap-1.5">
                                                {(['diadoc', 'sbis', 'kontur'] as const).map((prov) => (
                                                    <button
                                                        key={prov}
                                                        type="button"
                                                        disabled={ediActionLoading === `send-${doc.id}-${prov}`}
                                                        onClick={() => sendEdi(doc.id, prov)}
                                                        className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                                                    >
                                                        {ediActionLoading === `send-${doc.id}-${prov}`
                                                            ? '...'
                                                            : prov === 'diadoc' ? 'Диадок' : prov === 'sbis' ? 'СБИС' : 'Контур'}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-[10px] text-neutral-500">Mock:</span>
                                                <select
                                                    onChange={(e) => {
                                                        const value = e.target.value as 'signed_by_carrier' | 'signed_by_client' | 'rejected' | '';
                                                        if (value) {
                                                            mockEdiProgress(doc.id, value);
                                                            e.target.value = '';
                                                        }
                                                    }}
                                                    disabled={Boolean(ediActionLoading?.startsWith(`mock-${doc.id}`))}
                                                    className="rounded-md border border-neutral-200 bg-white px-1.5 py-1 text-[10px] text-neutral-700 disabled:opacity-50"
                                                    defaultValue=""
                                                >
                                                    <option value="">Перейти в...</option>
                                                    <option value="signed_by_carrier">signed_by_carrier</option>
                                                    <option value="signed_by_client">signed_by_client</option>
                                                    <option value="rejected">rejected</option>
                                                </select>
                                            </div>
                                        </>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => openEdiHistory(doc)}
                                        className="text-[10px] font-semibold text-indigo-600 underline-offset-2 hover:underline"
                                    >
                                        История EDI
                                    </button>
                                </div>
                            );
                        })()}
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
                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">ETRN titles</p>
                                <p className="text-sm font-semibold text-neutral-900">
                                    {etrn?.summary?.completedTitles ?? 0}/{etrn?.summary?.totalTitles ?? 0} completed
                                </p>
                            </div>
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneClass(titleStatusTone(etrn?.status || 'draft'), 'bg')}`}>
                                {etrnTitleStatusLabel(etrn?.status || 'draft')}
                            </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {etrnTitles.slice(0, 6).map((title: any) => (
                                <div key={title.id} className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title.titleNumber}</p>
                                            <p className="text-sm font-semibold text-neutral-900">{title.titleLabel}</p>
                                        </div>
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass(titleStatusTone(title.status), 'bg')}`}>
                                            {etrnTitleStatusLabel(title.status)}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
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
                                    <p className="text-sm font-semibold text-neutral-900">Что мешает пройти по контуру</p>
                                </div>
                                <RetryHint label="Check blockers" />
                            </div>
                            <div className="mt-3 space-y-2">
                                {etrnProblems.slice(0, 4).map((problem: any) => (
                                    <div key={`${problem.code}-${problem.documentId || problem.at || problem.message}`} className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-neutral-700">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-neutral-900">{problem.message}</p>
                                                <p className="text-[11px] text-neutral-500">
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

            <Dialog
                open={Boolean(ediHistoryDoc)}
                onClose={() => setEdiHistoryDoc(null)}
                title={ediHistoryDoc ? `История EDI · ${transportDocumentLabel(ediHistoryDoc.type)} ${ediHistoryDoc.externalId || ''}` : 'История EDI'}
            >
                {ediHistoryLoading ? (
                    <div className="py-6 text-center text-sm text-neutral-500">Загрузка...</div>
                ) : ediHistory.length === 0 ? (
                    <div className="py-6 text-center text-sm text-neutral-400">Событий нет</div>
                ) : (
                    <ul className="space-y-2">
                        {ediHistory.map((evt: any, idx: number) => (
                            <li key={idx} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-neutral-800">{evt.eventType}</span>
                                    <span className="text-[10px] text-neutral-500">{formatTimelineDate(evt.createdAt)}</span>
                                </div>
                                {evt.payload && (
                                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-white p-1.5 text-[10px] text-neutral-600">
                                        {typeof evt.payload === 'string' ? evt.payload : JSON.stringify(evt.payload, null, 2)}
                                    </pre>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </Dialog>
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
    const [tripColdChain, setTripColdChain] = useState<Record<string, ColdChainSummaryRow>>({});
    const [dossierTripId, setDossierTripId] = useState<string | null>(null);
    const [dossierLoading, setDossierLoading] = useState(false);
    const [dossierError, setDossierError] = useState('');
    const [dossier, setDossier] = useState<any>(null);
    const [dossierRoutePoints, setDossierRoutePoints] = useState<RoutePoint[]>([]);
    const [dossierLoadPlan, setDossierLoadPlan] = useState<TripLoadPlan | null>(null);
    const [preferredDossierAction, setPreferredDossierAction] = useState<OperationalAction | null>(null);
    const [sortingRoute, setSortingRoute] = useState(false);
    const [tripsToast, setTripsToast] = useState<{ message: string; tone: 'success' | 'error' | 'warning' } | null>(null);
    const [tripEta, setTripEta] = useState<{ etaIso?: string | null; reason?: string } | null>(null);
    // Carriers (for assignment in dossier)
    const [carrierOptions, setCarrierOptions] = useState<Array<{ id: string; name: string; activeContract?: any }>>([]);
    const [assigningCarrier, setAssigningCarrier] = useState(false);
    const [selectedCarrierId, setSelectedCarrierId] = useState('');

    const canSortRoute = !!user?.roles?.some(r => r === 'dispatcher' || r === 'logist' || r === 'admin');

    useEffect(() => {
        if (!tripsToast) return;
        const id = setTimeout(() => setTripsToast(null), 4000);
        return () => clearTimeout(id);
    }, [tripsToast]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Wave 1: trip lifecycle (start/complete) modals
    const [startTripFor, setStartTripFor] = useState<Trip | null>(null);
    const [completeTripFor, setCompleteTripFor] = useState<Trip | null>(null);
    const [lifecycleOdometer, setLifecycleOdometer] = useState('');
    const [lifecycleNotes, setLifecycleNotes] = useState('');
    const [lifecycleSubmitting, setLifecycleSubmitting] = useState(false);
    const [lifecycleError, setLifecycleError] = useState('');
    const [lifecycleToast, setLifecycleToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        if (lifecycleToast) {
            const timer = setTimeout(() => setLifecycleToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [lifecycleToast]);

    const openStartTripModal = (trip: Trip) => {
        setStartTripFor(trip);
        setLifecycleOdometer('');
        setLifecycleNotes('');
        setLifecycleError('');
    };

    const openCompleteTripModal = (trip: Trip) => {
        setCompleteTripFor(trip);
        setLifecycleOdometer('');
        setLifecycleNotes('');
        setLifecycleError('');
    };

    const closeLifecycleModals = () => {
        setStartTripFor(null);
        setCompleteTripFor(null);
        setLifecycleOdometer('');
        setLifecycleNotes('');
        setLifecycleError('');
    };

    const submitStartTrip = async () => {
        if (!startTripFor) return;
        const odometer = Number(lifecycleOdometer);
        if (!Number.isFinite(odometer) || odometer < 0) {
            setLifecycleError('Введите корректное значение одометра');
            return;
        }
        try {
            setLifecycleSubmitting(true);
            setLifecycleError('');
            await api.post(`/trips/${startTripFor.id}/start`, { odometerStart: odometer });
            setLifecycleToast({ message: `Рейс ${startTripFor.number} запущен`, type: 'success' });
            closeLifecycleModals();
            await loadTrips();
        } catch (err: any) {
            setLifecycleError(err?.message || 'Не удалось запустить рейс');
        } finally {
            setLifecycleSubmitting(false);
        }
    };

    const submitCompleteTrip = async () => {
        if (!completeTripFor) return;
        const odometer = Number(lifecycleOdometer);
        if (!Number.isFinite(odometer) || odometer < 0) {
            setLifecycleError('Введите корректное значение одометра');
            return;
        }
        try {
            setLifecycleSubmitting(true);
            setLifecycleError('');
            await api.post(`/trips/${completeTripFor.id}/complete`, {
                odometerEnd: odometer,
                notes: lifecycleNotes.trim() || undefined,
            });
            setLifecycleToast({ message: `Рейс ${completeTripFor.number} завершён`, type: 'success' });
            closeLifecycleModals();
            await loadTrips();
        } catch (err: any) {
            setLifecycleError(err?.message || 'Не удалось завершить рейс');
        } finally {
            setLifecycleSubmitting(false);
        }
    };

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
                const result = await api.get<{ success: boolean; data: { orders?: Array<{ number: string; coldChainRequired?: boolean; temperatureMinC?: number | string | null; temperatureMaxC?: number | string | null }> } }>(`/trips/${trip.id}`);
                const orders = result.success ? (result.data.orders || []) : [];
                const numbers = orders.map(order => order.number);
                const coldChainRequired = orders.some(order => order.coldChainRequired === true);
                return {
                    tripId: trip.id,
                    numbers,
                    coldChainRequired,
                };
            }));

            if (cancelled) return;

            const nextNumbers: Record<string, string[]> = {};
            const coldTripIds: string[] = [];
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    nextNumbers[result.value.tripId] = result.value.numbers;
                    if (result.value.coldChainRequired) {
                        coldTripIds.push(result.value.tripId);
                    }
                }
            }
            setTripOrderNumbers(nextNumbers);

            if (coldTripIds.length === 0) {
                setTripColdChain({});
                return;
            }

            // Fetch temperature summaries lazily for cold-chain trips only
            const summaries = await Promise.allSettled(
                coldTripIds.map(async (tripId) => {
                    const r = await api.get<{ success: boolean; data: any }>(`/trips/${tripId}/temperature-summary`);
                    return { tripId, summary: r.success ? r.data : null };
                }),
            );

            if (cancelled) return;

            const nextCold: Record<string, ColdChainSummaryRow> = {};
            for (const result of summaries) {
                if (result.status === 'fulfilled' && result.value.summary) {
                    const s = result.value.summary;
                    nextCold[result.value.tripId] = {
                        coldChainRequired: true,
                        breachCount: Number(s.breachCount || 0),
                        minC: s.minC === null || s.minC === undefined ? null : Number(s.minC),
                        maxC: s.maxC === null || s.maxC === undefined ? null : Number(s.maxC),
                        slaMinC: s.slaMinC === null || s.slaMinC === undefined ? null : Number(s.slaMinC),
                        slaMaxC: s.slaMaxC === null || s.slaMaxC === undefined ? null : Number(s.slaMaxC),
                    };
                } else if (result.status === 'fulfilled') {
                    nextCold[result.value.tripId] = {
                        coldChainRequired: true,
                        breachCount: 0,
                        minC: null,
                        maxC: null,
                        slaMinC: null,
                        slaMaxC: null,
                    };
                }
            }
            setTripColdChain(nextCold);
        })().catch(() => {
            if (!cancelled) {
                setTripOrderNumbers({});
                setTripColdChain({});
            }
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
        setDossierRoutePoints([]);
        setDossierLoadPlan(null);
        setPreferredDossierAction(null);

        try {
            const [result, pointsResult, loadPlanResult] = await Promise.all([
                api.get<any>(`/trips/${tripId}/dossier`),
                api.get<any>(`/trips/${tripId}/points`).catch(() => ({ success: false, data: [] })),
                api.get<{ success: boolean; data: TripLoadPlan | null }>(`/trips/${tripId}/load-plan`).catch(() => ({ success: false, data: null as TripLoadPlan | null })),
            ]);
            setDossier(result.data || null);
            setDossierRoutePoints(pointsResult.success ? (pointsResult.data || []) : []);
            setDossierLoadPlan(loadPlanResult.success ? (loadPlanResult.data || null) : null);
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
        setDossierRoutePoints([]);
        setDossierLoadPlan(null);
        setPreferredDossierAction(null);
        setTripEta(null);
        setSelectedCarrierId('');
    };

    // ETA polling for in-transit trips while dossier modal is open
    useEffect(() => {
        if (!dossierTripId) return;
        const trip = trips.find(t => t.id === dossierTripId);
        if (!trip || trip.status !== 'in_transit') {
            setTripEta(null);
            return;
        }
        let cancelled = false;
        const fetchEta = async () => {
            try {
                const res = await api.get<{ success: boolean; data: { etaIso: string | null; distanceKm?: number } | null; reason?: string }>(`/trips/${dossierTripId}/eta`);
                if (cancelled) return;
                setTripEta({ etaIso: res.data?.etaIso ?? null, reason: res.reason });
            } catch {
                if (!cancelled) setTripEta({ etaIso: null, reason: 'no_gps' });
            }
        };
        fetchEta();
        const intervalId = setInterval(fetchEta, 60000);
        return () => { cancelled = true; clearInterval(intervalId); };
    }, [dossierTripId, trips]);

    // Load carriers when dossier opens for trips not yet started
    useEffect(() => {
        if (!dossierTripId) return;
        const trip = trips.find(t => t.id === dossierTripId);
        if (!trip) return;
        const startedStatuses = ['in_transit', 'completed', 'billed', 'cancelled'];
        if (startedStatuses.includes(trip.status)) return;
        let cancelled = false;
        api.get<{ success: boolean; data: Array<{ id: string; name: string; activeContract?: any }> }>('/carriers')
            .then(res => { if (!cancelled) setCarrierOptions(res.data || []); })
            .catch(() => { if (!cancelled) setCarrierOptions([]); });
        return () => { cancelled = true; };
    }, [dossierTripId, trips]);

    const handleAssignCarrier = async () => {
        if (!dossierTripId || !selectedCarrierId) return;
        setAssigningCarrier(true);
        try {
            await api.post(`/trips/${dossierTripId}/assign-carrier`, { carrierContractorId: selectedCarrierId });
            setTripsToast({ message: 'Перевозчик назначен', tone: 'success' });
            await openDossier(dossierTripId);
        } catch (err: any) {
            setTripsToast({ message: err?.message || 'Не удалось назначить перевозчика', tone: 'error' });
        } finally {
            setAssigningCarrier(false);
        }
    };

    const handleSortRoute = async () => {
        if (!dossierTripId || sortingRoute) return;
        setSortingRoute(true);
        try {
            const res = await api.post<{ success: boolean; data?: { sortedPoints?: RoutePoint[]; warnings?: string[] }; error?: string }>(
                `/trips/${dossierTripId}/sort-route-points`,
            );
            if (!res.success) throw new Error(res.error || 'Не удалось отсортировать маршрут');
            // Refetch points to ensure consistent state
            const pointsResult = await api.get<any>(`/trips/${dossierTripId}/points`).catch(() => ({ success: false, data: [] }));
            if (pointsResult.success) {
                setDossierRoutePoints(pointsResult.data || []);
            } else if (Array.isArray(res.data?.sortedPoints)) {
                setDossierRoutePoints(res.data!.sortedPoints!);
            }
            const warnings = res.data?.warnings || [];
            if (warnings.length > 0) {
                setTripsToast({ message: `Маршрут отсортирован. Предупреждения: ${warnings.join('; ')}`, tone: 'warning' });
            } else {
                setTripsToast({ message: 'Маршрут отсортирован', tone: 'success' });
            }
        } catch (err: any) {
            setTripsToast({ message: err?.message || 'Ошибка сортировки маршрута', tone: 'error' });
        } finally {
            setSortingRoute(false);
        }
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

    const tripColumns: Column<Trip>[] = [
        {
            id: 'number',
            header: '№ Рейса',
            accessor: (t) => t.number,
            sortable: true,
            sticky: 'left',
            minWidth: '130px',
            cell: (t) => (
                <div className="flex items-center gap-2 font-semibold text-brand-600">
                    <span>{t.number}</span>
                    {tripColdChain[t.id]?.coldChainRequired && (() => {
                        const cc = tripColdChain[t.id];
                        const hasBreach = cc.breachCount > 0;
                        return (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openDossier(t.id); }}
                                title={hasBreach ? `Нарушений SLA: ${cc.breachCount}` : 'Холодовая цепь'}
                                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold border transition-colors ${
                                    hasBreach
                                        ? 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-200'
                                        : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                }`}
                            >
                                <Thermometer className="w-3 h-3" />
                                {hasBreach ? `⚠ ${cc.breachCount}` : ''}
                            </button>
                        );
                    })()}
                </div>
            ),
        },
        {
            id: 'status',
            header: 'Статус',
            accessor: (t) => t.status,
            sortable: true,
            minWidth: '180px',
            cell: (t) => (
                <div className="flex flex-col gap-1">
                    <span className={`inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] || 'bg-neutral-100 text-neutral-700'}`}>
                        {STATUS_LABELS[t.status] || t.status}
                    </span>
                    {(tripOrderNumbers[t.id] || []).length > 1 && (
                        <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-700">
                            Сборный рейс • {(tripOrderNumbers[t.id] || []).length} заявок
                        </span>
                    )}
                    {t.carrierContractorId && (
                        <span className="inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            Перевозчик: {t.carrierName || 'назначен'}
                        </span>
                    )}
                </div>
            ),
        },
        {
            id: 'vehicle',
            header: 'ТС',
            minWidth: '180px',
            cell: (t) => t.vehicleId ? (
                <div className="flex flex-col gap-0.5 text-neutral-600">
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
                            }).tone === 'ready' ? 'ПЛ ✓' : 'ПЛ ⚠'}
                        </span>
                    )}
                    {!vehicleMap[t.vehicleId]?.bodyType && (
                        <span className="inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            Тип ТС для ПЛ не задан
                        </span>
                    )}
                    {trailerMap[t.vehicleId] && (
                        <span className="text-xs text-neutral-400">
                            + прицеп {trailerMap[t.vehicleId].plateNumber}
                        </span>
                    )}
                </div>
            ) : <span className="text-neutral-400">—</span>,
        },
        {
            id: 'orders',
            header: 'Заявки',
            minWidth: '160px',
            cell: (t) => (tripOrderNumbers[t.id] || []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                    {(tripOrderNumbers[t.id] || []).slice(0, 2).map((orderNumber) => (
                        <span key={orderNumber} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                            {orderNumber}
                        </span>
                    ))}
                    {(tripOrderNumbers[t.id] || []).length > 2 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600">
                            +{(tripOrderNumbers[t.id] || []).length - 2}
                        </span>
                    )}
                </div>
            ) : <span className="text-neutral-400">—</span>,
        },
        {
            id: 'distance',
            header: 'Дистанция',
            width: '130px',
            align: 'right',
            cell: (t) => (
                <span className="text-neutral-600 text-sm">
                    {t.plannedDistanceKm ? `${t.plannedDistanceKm} км` : '—'}
                    {t.actualDistanceKm ? (
                        <span className="text-emerald-600 ml-1">
                            <ArrowRight className="w-3 h-3 inline" />
                            {t.actualDistanceKm} км
                        </span>
                    ) : null}
                </span>
            ),
        },
        {
            id: 'plannedDepartureAt',
            header: 'Выезд (план)',
            accessor: (t) => t.plannedDepartureAt,
            cell: (t) => <span className="text-neutral-500 text-xs">{formatDate(t.plannedDepartureAt)}</span>,
            sortable: true,
            width: '130px',
            align: 'right',
            monospace: true,
        },
        {
            id: 'actualDepartureAt',
            header: 'Выезд (факт)',
            accessor: (t) => t.actualDepartureAt,
            cell: (t) => <span className="text-neutral-500 text-xs">{formatDate(t.actualDepartureAt)}</span>,
            sortable: true,
            width: '130px',
            align: 'right',
            monospace: true,
        },
        {
            id: 'actualCompletionAt',
            header: 'Завершён',
            accessor: (t) => t.actualCompletionAt,
            cell: (t) => <span className="text-neutral-500 text-xs">{formatDate(t.actualCompletionAt)}</span>,
            sortable: true,
            width: '130px',
            align: 'right',
            monospace: true,
        },
        {
            id: 'createdAt',
            header: 'Создан',
            accessor: (t) => t.createdAt,
            sortable: true,
            width: '120px',
            align: 'right',
            monospace: true,
            cell: (t) => <span className="text-neutral-400 text-xs">{formatDate(t.createdAt)}</span>,
        },
    ];

    return (
        <div className="space-y-6">
            {tripsToast && (
                <div
                    role="status"
                    className={`fixed top-4 right-4 z-[60] px-5 py-3 rounded-xl shadow-soft-lg text-white font-medium text-sm animate-fade-in ${
                        tripsToast.tone === 'success'
                            ? 'bg-emerald-600'
                            : tripsToast.tone === 'warning'
                                ? 'bg-amber-500'
                                : 'bg-red-600'
                    }`}
                >
                    {tripsToast.message}
                </div>
            )}
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-soft-md shrink-0">
                        <Map className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Рейсы</h1>
                        <p className="text-sm text-neutral-500 truncate">Все рейсы — {trips.length} записей</p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    isLoading={loading}
                    leftIcon={<RefreshCcw className="w-3.5 h-3.5" />}
                    onClick={() => loadTrips()}
                >
                    Обновить
                </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Stat label="Всего рейсов" value={trips.length} icon={Map} tone="neutral" />
                <Stat label="Сборных рейсов" value={multiOrderTripsCount} icon={FileText} tone="brand" />
                <Stat label="С ТС" value={withVehicleCount} icon={Truck} tone="info" />
                <Stat label="С прицепом" value={withTrailerCount} icon={Truck} tone="success" />
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setStatusFilter('')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                        ${!statusFilter ? 'bg-indigo-600 text-white shadow-sm' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                >
                    Все ({trips.length})
                </button>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setStatusFilter(key === statusFilter ? '' : key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
                            ${statusFilter === key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                    >
                        {label} ({statusCounts[key] || 0})
                    </button>
                ))}
            </div>

            {/* Search row (server-side) */}
            <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[220px] max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                        type="text"
                        placeholder="Поиск по номеру рейса..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full h-9 pl-10 pr-3 rounded-lg border border-neutral-200 bg-white text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    />
                </div>
            </div>

            {/* Table */}
            <DataTable<Trip>
                tableId="trips"
                data={trips}
                columns={tripColumns}
                keyField="id"
                loading={loading}
                onRowClick={(t) => openDossier(t.id)}
                rowClassName={(t) => (tripOrderNumbers[t.id] || []).length > 1 ? 'bg-indigo-50/40' : ''}
                rowActions={(t) => {
                    const actions: Array<{ id: string; label: string; icon?: React.ReactNode; onClick: (r: Trip) => void; tone?: 'default' | 'danger' }> = [
                        {
                            id: 'dossier',
                            label: 'Открыть досье',
                            icon: <FileText className="w-4 h-4" />,
                            onClick: (r) => openDossier(r.id),
                        },
                        {
                            id: 'documents',
                            label: 'Документы',
                            icon: <FolderOpen className="w-4 h-4" />,
                            onClick: (r) => router.push(`/trips/${r.id}/documents`),
                        },
                    ];
                    if (t.status === 'waybill_issued') {
                        actions.unshift({
                            id: 'start',
                            label: 'Начать рейс',
                            icon: <Play className="w-4 h-4" />,
                            onClick: (r) => openStartTripModal(r),
                        });
                    }
                    if (t.status === 'in_transit') {
                        actions.unshift({
                            id: 'complete',
                            label: 'Завершить рейс',
                            icon: <Flag className="w-4 h-4" />,
                            onClick: (r) => openCompleteTripModal(r),
                        });
                    }
                    return actions;
                }}
                emptyState={
                    <EmptyState
                        icon={Map}
                        title={statusFilter || debouncedSearch ? 'Рейсы по фильтру не найдены' : 'Пока нет рейсов'}
                        description={statusFilter || debouncedSearch
                            ? 'Попробуйте сбросить фильтры или изменить поисковый запрос.'
                            : 'Рейсы создаются из диспетчерской после назначения ТС на заявку.'}
                        action={(statusFilter || debouncedSearch) ? (
                            <Button variant="outline" size="sm" onClick={() => { setStatusFilter(''); setSearch(''); }}>
                                Сбросить фильтры
                            </Button>
                        ) : undefined}
                    />
                }
                pageSize={50}
            />
            {/* Wave 1: Toast */}
            {lifecycleToast && (
                <div className={`fixed top-4 right-4 z-[60] px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm ${lifecycleToast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {lifecycleToast.message}
                </div>
            )}

            {/* Wave 1: Start trip modal */}
            <Dialog
                open={!!startTripFor}
                onClose={closeLifecycleModals}
                title={startTripFor ? `Начать рейс ${startTripFor.number}` : 'Начать рейс'}
            >
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500">
                        Укажите показания одометра на момент начала рейса.
                    </p>
                    <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                            Одометр (км) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={lifecycleOdometer}
                            onChange={(e) => setLifecycleOdometer(e.target.value)}
                            placeholder="например 145320"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                        />
                    </div>
                    {lifecycleError && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {lifecycleError}
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={closeLifecycleModals} disabled={lifecycleSubmitting}>
                            Отмена
                        </Button>
                        <Button size="sm" onClick={submitStartTrip} disabled={lifecycleSubmitting || !lifecycleOdometer}>
                            {lifecycleSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                            Начать рейс
                        </Button>
                    </div>
                </div>
            </Dialog>

            {/* Wave 1: Complete trip modal */}
            <Dialog
                open={!!completeTripFor}
                onClose={closeLifecycleModals}
                title={completeTripFor ? `Завершить рейс ${completeTripFor.number}` : 'Завершить рейс'}
            >
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500">
                        Зафиксируйте показания одометра на финише и при необходимости оставьте комментарий.
                    </p>
                    <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                            Одометр (км) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={lifecycleOdometer}
                            onChange={(e) => setLifecycleOdometer(e.target.value)}
                            placeholder="например 145890"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                            Комментарий
                        </label>
                        <textarea
                            value={lifecycleNotes}
                            onChange={(e) => setLifecycleNotes(e.target.value)}
                            rows={3}
                            placeholder="Опционально"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-neutral-50 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                    </div>
                    {lifecycleError && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {lifecycleError}
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={closeLifecycleModals} disabled={lifecycleSubmitting}>
                            Отмена
                        </Button>
                        <Button size="sm" onClick={submitCompleteTrip} disabled={lifecycleSubmitting || !lifecycleOdometer}>
                            {lifecycleSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                            Завершить рейс
                        </Button>
                    </div>
                </div>
            </Dialog>

            <Dialog
                open={!!dossierTripId}
                onClose={closeDossier}
                title="Досье рейса"
                description={dossier?.trip?.number || dossierTripId || ''}
                size="xl"
            >
                {dossierTripId && (
                    <div>
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
                                        <div className="rounded-2xl border border-neutral-200 p-4">
                                            <div className="text-xs uppercase tracking-wide text-neutral-400">Рейс</div>
                                            <div className="mt-2 text-lg font-bold text-neutral-900">{dossier.trip?.number}</div>
                                            <div className="mt-1 text-sm text-neutral-500">{dossier.trip?.status}</div>
                                            {dossier?.trip?.status === 'in_transit' && (
                                                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                                                    <Clock3 className="w-3 h-3" />
                                                    {formatEtaBadge(tripEta?.etaIso, tripEta?.reason)}
                                                </div>
                                            )}
                                            {dossier?.trip?.carrierContractorId && (
                                                <div className="mt-2 text-xs text-neutral-600">
                                                    Перевозчик: <span className="font-medium">{dossier?.carrier?.name || dossier?.trip?.carrierContractorId}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="rounded-2xl border border-neutral-200 p-4">
                                            <div className="text-xs uppercase tracking-wide text-neutral-400">ТС / прицеп</div>
                                            <div className="mt-2 text-sm font-medium text-neutral-900">
                                                {dossier.vehicle?.plateNumber || 'Нет ТС'}
                                            </div>
                                            <div className="text-sm text-neutral-500">
                                                {dossier.trailer?.plateNumber ? `Прицеп: ${dossier.trailer.plateNumber}` : 'Прицеп не назначен'}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-neutral-200 p-4">
                                            <div className="text-xs uppercase tracking-wide text-neutral-400">ПЛ</div>
                                            <div className="mt-2 text-sm font-medium text-neutral-900">
                                                {dossier.waybill?.number || 'Не оформлен'}
                                            </div>
                                            <div className="text-sm text-neutral-500">
                                                {dossier.summary?.orderCount || 0} заявок в рейсе
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Готовность</p>
                                                <p className="text-sm font-semibold text-neutral-900">
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
                                                {dossierReadiness.tone === 'ready' ? 'Готов' : dossierReadiness.tone === 'attention' ? 'Проверить' : 'Заблок.'}
                                            </span>
                                        </div>
                                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                                            {dossierReadiness.items.map(item => (
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

                                    <DossierNextActions
                                        dossier={dossier}
                                        onSelectAction={setPreferredDossierAction}
                                    />

                                    <OperationalStructureBlock
                                        dossier={dossier}
                                        loadPlan={dossierLoadPlan}
                                        routePoints={dossierRoutePoints}
                                        canSort={canSortRoute}
                                        onSortRoute={handleSortRoute}
                                        sorting={sortingRoute}
                                    />

                                    <CloseGateBlock closeGate={dossier.closeGate} />

                                    <OperationalActionsBlock
                                        tripId={dossier.trip?.id || dossierTripId}
                                        routePoints={dossierRoutePoints}
                                        initialAction={preferredDossierAction}
                                        onDone={() => openDossier(dossier.trip?.id || dossierTripId)}
                                    />

                                    {/* Carrier assignment (Wave 4) */}
                                    {(() => {
                                        const status = dossier?.trip?.status;
                                        const startedStatuses = ['in_transit', 'completed', 'billed', 'cancelled'];
                                        if (status && startedStatuses.includes(status)) return null;
                                        return (
                                            <div className="rounded-2xl border border-neutral-200 p-4">
                                                <div className="text-sm font-semibold text-neutral-900 mb-2">Назначить перевозчика</div>
                                                {dossier?.trip?.carrierContractorId && (
                                                    <p className="text-xs text-neutral-500 mb-2">
                                                        Текущий перевозчик: {dossier?.carrier?.name || dossier?.trip?.carrierContractorId}
                                                    </p>
                                                )}
                                                <div className="flex items-end gap-2">
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-neutral-500 mb-1">Перевозчик с активным договором</label>
                                                        <select
                                                            value={selectedCarrierId}
                                                            onChange={(e) => setSelectedCarrierId(e.target.value)}
                                                            className="flex h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-sm"
                                                        >
                                                            <option value="">— выбрать —</option>
                                                            {carrierOptions
                                                                .filter(c => c.activeContract)
                                                                .map(c => (
                                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                                ))}
                                                        </select>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        disabled={!selectedCarrierId || assigningCarrier}
                                                        onClick={handleAssignCarrier}
                                                    >
                                                        {assigningCarrier ? 'Назначение...' : 'Назначить'}
                                                    </Button>
                                                </div>
                                                {carrierOptions.filter(c => c.activeContract).length === 0 && (
                                                    <p className="mt-2 text-xs text-amber-600">Нет перевозчиков с активным договором</p>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    <TransportDocumentsBlock dossier={dossier} isAdmin={Boolean(user?.roles?.includes('admin'))} />

                                    {(() => {
                                        const orders: any[] = dossier?.orders || [];
                                        const hasCold = orders.some((o) => o?.coldChainRequired === true)
                                            || tripColdChain[dossier?.trip?.id || dossierTripId || '']?.coldChainRequired;
                                        if (!hasCold) return null;
                                        return (
                                            <TemperaturePanel
                                                tripId={dossier?.trip?.id || dossierTripId || ''}
                                                tripNumber={dossier?.trip?.number}
                                            />
                                        );
                                    })()}

                                    <div className="grid gap-6 lg:grid-cols-2">
                                        <div className="rounded-2xl border border-neutral-200">
                                            <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-3 font-semibold text-neutral-900">
                                                Заявки
                                            </div>
                                            <div className="divide-y divide-neutral-100">
                                                {(dossier.orders || []).map((order: any) => (
                                                    <div key={order.id} className="p-4">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="text-sm font-semibold text-neutral-900">{order.number}</div>
                                                                    {order.adrClass && (
                                                                        <span
                                                                            className="inline-flex items-center gap-0.5 rounded border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700"
                                                                            title={`ADR класс ${order.adrClass}${order.adrUnNumber ? ` · ${order.adrUnNumber}` : ''}`}
                                                                        >
                                                                            <AlertTriangle className="w-2.5 h-2.5" />
                                                                            ADR-{order.adrClass}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="text-xs text-neutral-500">{order.cargoDescription || 'Без описания груза'}</div>
                                                                <div className="mt-2 text-xs text-neutral-500">
                                                                    Контрагент: {order.contractor?.name || 'Не указан'}
                                                                </div>
                                                            </div>
                                                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                                                {order.status}
                                                            </span>
                                                        </div>
                                                        <div className="mt-3 grid gap-2 text-xs text-neutral-500">
                                                            <div className="flex items-start gap-2">
                                                                <MapPin className="mt-0.5 w-3.5 h-3.5 text-neutral-400" />
                                                                <span>Погрузка: {order.loadingAddress || '—'}</span>
                                                            </div>
                                                            <div className="flex items-start gap-2">
                                                                <MapPin className="mt-0.5 w-3.5 h-3.5 text-neutral-400" />
                                                                <span>Выгрузка: {order.unloadingAddress || '—'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="rounded-2xl border border-neutral-200">
                                                <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-3 font-semibold text-neutral-900">
                                                    Участники
                                                </div>
                                                <div className="divide-y divide-neutral-100">
                                                    {(dossier.parties || []).map((party: any) => (
                                                        <div key={party.id} className="p-4">
                                                            <div className="text-sm font-medium text-neutral-900">{party.name}</div>
                                                            <div className="text-xs text-neutral-500">{party.inn}</div>
                                                            <div className="text-xs text-neutral-500">{party.legalAddress}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-neutral-200 p-4">
                                                <div className="text-sm font-semibold text-neutral-900 mb-3">Сводка</div>
                                                <div className="grid grid-cols-2 gap-3 text-sm text-neutral-600">
                                                    <div>Заявок: {dossier.summary?.orderCount ?? 0}</div>
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
                )}
            </Dialog>
        </div>
    );
}
