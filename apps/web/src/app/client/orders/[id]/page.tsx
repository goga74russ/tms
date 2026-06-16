'use client';

// ============================================================
// /client/orders/[id] — Detail-страница заявки для клиента.
//
// Drill-down с /client. Использует существующий GET /orders/:id
// (RLS уже фильтрует по contractor клиента на сервере). Если этот
// endpoint вернёт 404 или 403 — fallback на /orders?limit=200
// и поиск по id в списке (на случай, если RLS режет single-GET,
// но list ещё пускает).
//
// Sections: маршрут, груз (с cold-chain / ADR), документы (ТТН),
// timeline статусов (best-effort из /audit?entity=order), перевозчик,
// финансы. Для клиента — только итоговая сумма счёта, без
// себестоимости рейса.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { api } from '@/lib/api';
import {
    ArrowLeft,
    MapPin,
    Package,
    FileText,
    Activity,
    Wallet,
    Truck,
    Thermometer,
    AlertTriangle,
    Calendar,
    Phone,
    Clock,
    CheckCircle2,
    Loader2,
    Download,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Pill, type PillTone } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

const ALLOWED_ROLES = ['client', 'admin'];

interface OrderDetail {
    id: string;
    number: string;
    status: string;
    contractorId?: string;
    cargoDescription?: string | null;
    cargoWeightKg?: number | string | null;
    cargoVolumeM3?: number | string | null;
    cargoPlaces?: number | null;
    cargoType?: string | null;
    coldChainRequired?: boolean | null;
    temperatureMin?: number | string | null;
    temperatureMax?: number | string | null;
    temperatureMinC?: number | string | null;
    temperatureMaxC?: number | string | null;
    adrClass?: string | null;
    adrUnNumber?: string | null;
    hydraulicLiftRequired?: boolean | null;
    loadingAddress?: string | null;
    loadingDate?: string | null;
    loadingWindowStart?: string | null;
    loadingWindowEnd?: string | null;
    unloadingAddress?: string | null;
    unloadingDate?: string | null;
    unloadingWindowStart?: string | null;
    unloadingWindowEnd?: string | null;
    notes?: string | null;
    tripId?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

interface TripInfo {
    id: string;
    number?: string;
    carrierName?: string | null;
    driverId?: string | null;
    plannedDistanceKm?: number | null;
}

interface DriverInfo {
    id?: string;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
}

interface InvoiceRow {
    id: string;
    number: string;
    status: string;
    totalAmount?: number | string;
    total?: number | string;
    createdAt?: string;
    orderIds?: string[];
    tripIds?: string[];
}

interface AuditEventRow {
    id: string;
    timestamp?: string;
    createdAt?: string;
    eventType?: string;
    action?: string;
    entityType?: string;
    payload?: Record<string, unknown> | null;
    userId?: string | null;
}

const STATUS_MAP: Record<string, { label: string; tone: PillTone }> = {
    draft: { label: 'Создана', tone: 'neutral' },
    confirmed: { label: 'В работе', tone: 'info' },
    assigned: { label: 'Назначена', tone: 'brand' },
    in_transit: { label: 'В пути', tone: 'warning' },
    delivered: { label: 'Доставлена', tone: 'success' },
    completed: { label: 'Завершена', tone: 'success' },
    cancelled: { label: 'Отменена', tone: 'danger' },
};

// P2-E4: enum синхронизирован с invoice-fsm (M/T-16). Старые sent/paid/overdue
// оставлены как fallback для легаси-данных, но новые статусы — основные.
const INVOICE_STATUS_MAP: Record<string, { label: string; tone: PillTone }> = {
    draft: { label: 'Черновик', tone: 'neutral' },
    issued: { label: 'Выставлен', tone: 'info' },
    paid_partial: { label: 'Частично оплачен', tone: 'info' },
    paid_full: { label: 'Оплачен', tone: 'success' },
    corrected: { label: 'Скорректирован', tone: 'neutral' },
    cancelled: { label: 'Отменён', tone: 'neutral' },
    // legacy fallback:
    sent: { label: 'Выставлен', tone: 'info' },
    paid: { label: 'Оплачен', tone: 'success' },
    overdue: { label: 'Просрочен', tone: 'danger' },
};

function formatMoney(value: number | string | null | undefined) {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('ru-RU') + ' ₽';
}

function formatDate(value?: string | null) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatWindow(start?: string | null, end?: string | null) {
    if (!start && !end) return null;
    if (start && end) return `${formatDateTime(start)} — ${formatDateTime(end)}`;
    return formatDateTime(start || end);
}

function statusPill(status?: string) {
    const meta = (status && STATUS_MAP[status]) || { label: status || 'Неизвестно', tone: 'neutral' as PillTone };
    return <Pill tone={meta.tone}>{meta.label}</Pill>;
}

export default function ClientOrderDetailPage() {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const orderId = params?.id;

    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [trip, setTrip] = useState<TripInfo | null>(null);
    const [driver, setDriver] = useState<DriverInfo | null>(null);
    const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
    const [events, setEvents] = useState<AuditEventRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!userLoading && (!user || !user.roles.some((r: string) => ALLOWED_ROLES.includes(r)))) {
            router.push('/');
        }
    }, [user, userLoading, router]);

    const loadOrder = useCallback(async () => {
        if (!orderId) return;
        setLoading(true);
        setError('');

        // 1. Order — single GET with list-fallback for RLS edge cases.
        let ord: OrderDetail | null = null;
        try {
            const res = await api.get<{ success?: boolean; data?: OrderDetail }>(`/orders/${orderId}`);
            ord = res?.data ?? (res as unknown as OrderDetail);
        } catch {
            try {
                const list = await api.get<{ data?: OrderDetail[] }>('/orders?limit=200');
                ord = (list?.data || []).find((o) => o.id === orderId) || null;
            } catch {
                /* fall through to error state below */
            }
        }

        if (!ord) {
            setError('Заявка не найдена или недоступна.');
            setOrder(null);
            setLoading(false);
            return;
        }
        setOrder(ord);

        // 2. Trip + driver (best-effort, ignored on 403).
        if (ord.tripId) {
            try {
                const tripRes = await api.get<{ success?: boolean; data?: TripInfo & { driverId?: string | null } }>(`/trips/${ord.tripId}`);
                const tripData = tripRes?.data ?? (tripRes as unknown as TripInfo);
                if (tripData) {
                    setTrip(tripData);
                    if (tripData.driverId) {
                        try {
                            const drvRes = await api.get<{ success?: boolean; data?: DriverInfo }>(`/drivers/${tripData.driverId}`);
                            const drvData = drvRes?.data ?? (drvRes as unknown as DriverInfo);
                            if (drvData) setDriver(drvData);
                        } catch { /* driver hidden — fine */ }
                    }
                }
            } catch { /* trip hidden — fine */ }
        }

        // 3. Invoice — pull list and find by association (no single-order endpoint).
        // P1-A (web-P1-5): матчим по orderIds (новая модель T-16 invoice_orders),
        // с fallback на tripIds (легаси invoice_trips) через tripId заказа.
        try {
            const invRes = await api.get<{ data?: InvoiceRow[] }>('/finance/invoices?limit=100');
            const rows = invRes?.data || [];
            const inv = rows.find((i) => Array.isArray(i.orderIds) && i.orderIds.includes(orderId))
                ?? (ord.tripId ? rows.find((i) => Array.isArray(i.tripIds) && i.tripIds.includes(ord.tripId!)) : undefined);
            if (inv) setInvoice(inv);
        } catch { /* finance hidden for some clients — fine */ }

        // 4. Status events — best-effort via audit log.
        try {
            const evRes = await api.get<{ data?: AuditEventRow[] }>(`/audit-log?entityType=order&entityId=${orderId}&limit=20`);
            const rows = evRes?.data || [];
            if (Array.isArray(rows) && rows.length) setEvents(rows);
        } catch { /* audit hidden — fine */ }

        setLoading(false);
    }, [orderId]);

    useEffect(() => { loadOrder(); }, [loadOrder]);

    const cargoTemp = useMemo(() => {
        if (!order) return null;
        const minC = order.temperatureMinC ?? order.temperatureMin;
        const maxC = order.temperatureMaxC ?? order.temperatureMax;
        if (minC == null && maxC == null) return null;
        const fmt = (v: number | string | null | undefined) => (v == null ? '—' : `${v} °C`);
        return `${fmt(minC)} … ${fmt(maxC)}`;
    }, [order]);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12 text-neutral-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden />
                <span>Загружаем заявку…</span>
            </div>
        );
    }

    if (error || !order) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                    <Link href="/client" className="text-neutral-500 hover:text-neutral-700 inline-flex items-center gap-1">
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Назад к списку
                    </Link>
                </div>
                <EmptyState
                    icon={AlertTriangle}
                    tone="warning"
                    title="Заявка недоступна"
                    description={error || 'Возможно, у вас нет доступа к этой заявке.'}
                />
            </div>
        );
    }

    const tripNumber = trip?.number;
    const driverName = driver
        ? [driver.lastName, driver.firstName].filter(Boolean).join(' ').trim() || null
        : null;
    const invoiceTotal = invoice ? (invoice.totalAmount ?? invoice.total) : null;
    const loadingWindow = formatWindow(order.loadingWindowStart, order.loadingWindowEnd);
    const unloadingWindow = formatWindow(order.unloadingWindowStart, order.unloadingWindowEnd);
    const ttnUrl = `/api/orders/${order.id}/ttn`;

    return (
        <div className="space-y-6">
            {/* Breadcrumb + back */}
            <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <Link href="/client" className="hover:text-neutral-700">Кабинет клиента</Link>
                <span aria-hidden>/</span>
                <Link href="/client" className="hover:text-neutral-700">Заявки</Link>
                <span aria-hidden>/</span>
                <span className="font-mono text-neutral-700">{order.number}</span>
            </nav>

            <div className="flex items-center justify-between gap-3 flex-wrap">
                <Link
                    href="/client"
                    className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Назад к списку
                </Link>
                {statusPill(order.status)}
            </div>

            {/* Hero secondary */}
            <Card>
                <CardContent className="pt-6 pb-6 space-y-4">
                    <div className="flex items-start gap-3 flex-wrap">
                        <div className="shrink-0 w-12 h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                            <Package className="w-6 h-6" aria-hidden />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-2xl font-semibold text-neutral-900 font-mono leading-tight break-all">
                                {order.number}
                            </h1>
                            <p className="mt-1 text-sm text-neutral-500">
                                {order.cargoDescription || 'Без описания груза'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-neutral-700 flex-wrap">
                        <MapPin className="h-4 w-4 text-neutral-400" aria-hidden />
                        <span className="break-words">{order.loadingAddress || '—'}</span>
                        <span aria-hidden className="text-neutral-300">→</span>
                        <span className="break-words">{order.unloadingAddress || '—'}</span>
                    </div>

                    <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-neutral-100">
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-neutral-500">Создана</dt>
                            <dd className="mt-1 text-sm font-medium text-neutral-900">{formatDate(order.createdAt)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-neutral-500">Доставка</dt>
                            <dd className="mt-1 text-sm font-medium text-neutral-900">{formatDate(order.unloadingDate)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-wide text-neutral-500">К оплате</dt>
                            <dd className="mt-1 text-sm font-medium text-neutral-900">
                                {invoiceTotal != null ? formatMoney(invoiceTotal) : '—'}
                            </dd>
                        </div>
                    </dl>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Маршрут */}
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <SectionHeader icon={MapPin} title="Маршрут" />
                        <RoutePoint
                            kind="loading"
                            address={order.loadingAddress}
                            date={order.loadingDate}
                            window={loadingWindow}
                        />
                        <div className="ml-4 border-l-2 border-dashed border-neutral-200 h-6" aria-hidden />
                        <RoutePoint
                            kind="unloading"
                            address={order.unloadingAddress}
                            date={order.unloadingDate}
                            window={unloadingWindow}
                        />
                        {trip?.plannedDistanceKm != null && (
                            <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                                Плановое расстояние: {Math.round(Number(trip.plannedDistanceKm))} км
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Груз */}
                <Card>
                    <CardContent className="pt-6 space-y-3">
                        <SectionHeader icon={Package} title="Груз" />
                        <DescriptionList>
                            <Row label="Описание">{order.cargoDescription || '—'}</Row>
                            <Row label="Вес">
                                {order.cargoWeightKg != null ? `${Number(order.cargoWeightKg).toLocaleString('ru-RU')} кг` : '—'}
                            </Row>
                            <Row label="Объём">
                                {order.cargoVolumeM3 != null ? `${Number(order.cargoVolumeM3).toLocaleString('ru-RU')} м³` : '—'}
                            </Row>
                            {order.cargoPlaces != null && (
                                <Row label="Мест">{order.cargoPlaces}</Row>
                            )}
                            {order.cargoType && <Row label="Тип">{order.cargoType}</Row>}
                        </DescriptionList>

                        {(order.coldChainRequired || cargoTemp || order.adrClass || order.hydraulicLiftRequired) && (
                            <div className="pt-3 border-t border-neutral-100 flex flex-wrap gap-2">
                                {order.coldChainRequired && (
                                    <Pill tone="info" icon={Thermometer}>
                                        Холодовая цепь{cargoTemp ? `: ${cargoTemp}` : ''}
                                    </Pill>
                                )}
                                {!order.coldChainRequired && cargoTemp && (
                                    <Pill tone="info" icon={Thermometer}>{cargoTemp}</Pill>
                                )}
                                {order.adrClass && (
                                    <Pill tone="warning" icon={AlertTriangle}>
                                        ADR класс {order.adrClass}{order.adrUnNumber ? ` · UN ${order.adrUnNumber}` : ''}
                                    </Pill>
                                )}
                                {order.hydraulicLiftRequired && (
                                    <Pill tone="neutral">Гидроборт</Pill>
                                )}
                            </div>
                        )}

                        {order.notes && (
                            <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-100 whitespace-pre-wrap">
                                {order.notes}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Перевозчик */}
                <Card>
                    <CardContent className="pt-6 space-y-3">
                        <SectionHeader icon={Truck} title="Перевозчик" />
                        {trip ? (
                            <DescriptionList>
                                {tripNumber && <Row label="Рейс">
                                    <span className="font-mono">{tripNumber}</span>
                                </Row>}
                                {trip.carrierName && <Row label="Компания">{trip.carrierName}</Row>}
                                {driverName && <Row label="Водитель">{driverName}</Row>}
                                {driver?.phone && (
                                    <Row label="Телефон">
                                        <a
                                            href={`tel:${driver.phone}`}
                                            className="inline-flex items-center gap-1.5 text-brand-700 hover:underline"
                                        >
                                            <Phone className="h-3.5 w-3.5" aria-hidden />
                                            {driver.phone}
                                        </a>
                                    </Row>
                                )}
                            </DescriptionList>
                        ) : (
                            <p className="text-sm text-neutral-500">
                                Перевозчик ещё не назначен.
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Финансы */}
                <Card>
                    <CardContent className="pt-6 space-y-3">
                        <SectionHeader icon={Wallet} title="Финансы" />
                        {invoice ? (
                            <DescriptionList>
                                <Row label="Счёт">
                                    <span className="font-mono">{invoice.number}</span>
                                </Row>
                                <Row label="Статус">
                                    {(() => {
                                        const meta = INVOICE_STATUS_MAP[invoice.status] || { label: invoice.status, tone: 'neutral' as PillTone };
                                        return <Pill tone={meta.tone}>{meta.label}</Pill>;
                                    })()}
                                </Row>
                                <Row label="Сумма">
                                    <span className="font-semibold text-neutral-900">{formatMoney(invoiceTotal)}</span>
                                </Row>
                            </DescriptionList>
                        ) : (
                            <p className="text-sm text-neutral-500">
                                Счёт по заявке ещё не выставлен.
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Документы */}
                <Card>
                    <CardContent className="pt-6 space-y-3">
                        <SectionHeader icon={FileText} title="Документы" />
                        <ul className="space-y-2">
                            <li>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        if (typeof window !== 'undefined') window.open(ttnUrl, '_blank', 'noopener');
                                    }}
                                    leftIcon={<Download className="h-4 w-4" aria-hidden />}
                                >
                                    Скачать ТТН (PDF)
                                </Button>
                            </li>
                        </ul>
                        <p className="text-xs text-neutral-500 pt-2">
                            Акты и УПД появятся здесь после закрытия рейса.
                        </p>
                    </CardContent>
                </Card>

                {/* Статусы и события */}
                <Card>
                    <CardContent className="pt-6 space-y-3">
                        <SectionHeader icon={Activity} title="Статусы и события" />
                        {events.length === 0 ? (
                            <Timeline
                                items={[
                                    { label: 'Создана', at: order.createdAt, tone: 'neutral' },
                                    order.updatedAt && order.updatedAt !== order.createdAt
                                        ? { label: STATUS_MAP[order.status]?.label || order.status, at: order.updatedAt, tone: 'brand' }
                                        : null,
                                ].filter(Boolean) as TimelineItem[]}
                            />
                        ) : (
                            <Timeline
                                items={events.map((ev) => ({
                                    label: ev.eventType || ev.action || 'Событие',
                                    at: ev.timestamp || ev.createdAt,
                                    tone: 'brand' as PillTone,
                                }))}
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// ---------- Small render helpers ----------

function SectionHeader({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; title: string }) {
    return (
        <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-neutral-400" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">{title}</h2>
        </div>
    );
}

function DescriptionList({ children }: { children: React.ReactNode }) {
    return <dl className="space-y-2 text-sm">{children}</dl>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[120px_1fr] gap-2">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="text-neutral-900 min-w-0 break-words">{children}</dd>
        </div>
    );
}

function RoutePoint({
    kind,
    address,
    date,
    window,
}: {
    kind: 'loading' | 'unloading';
    address?: string | null;
    date?: string | null;
    window?: string | null;
}) {
    const tone = kind === 'loading' ? 'bg-sky-50 text-sky-600' : 'bg-success-50 text-success-600';
    const label = kind === 'loading' ? 'Погрузка' : 'Выгрузка';
    return (
        <div className="flex gap-3">
            <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}>
                <MapPin className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
                <p className="mt-0.5 text-sm font-medium text-neutral-900 break-words">{address || '—'}</p>
                {(date || window) && (
                    <p className="mt-1 text-xs text-neutral-500 inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" aria-hidden />
                        {window || formatDateTime(date)}
                    </p>
                )}
            </div>
        </div>
    );
}

type TimelineItem = { label: string; at?: string | null; tone: PillTone };

function Timeline({ items }: { items: TimelineItem[] }) {
    if (items.length === 0) {
        return (
            <p className="text-sm text-neutral-500">Событий пока нет.</p>
        );
    }
    return (
        <ol className="space-y-3">
            {items.map((item, i) => (
                <li key={`${item.label}-${i}`} className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                        <CheckCircle2 className="h-4 w-4 text-success-500" aria-hidden />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm text-neutral-900">{item.label}</p>
                        <p className="text-xs text-neutral-500 inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden />
                            {formatDateTime(item.at)}
                        </p>
                    </div>
                </li>
            ))}
        </ol>
    );
}
