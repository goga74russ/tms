'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, MapPin, Calendar, Package, User, Truck, Thermometer, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ORDER_STATUS, INVOICE_STATUS, INVOICE_TYPE, label } from '@tms/shared';

// ============================================================
// OrderDetailDrawer — side panel с подробностями заявки.
//
// Минимальная версия для H2: основные поля + ссылка на рейс.
// Расширенный вариант (изменение через drawer, история событий,
// прикреплённые документы) — backlog после первого UX-фидбека.
// ============================================================
interface DrawerOrder {
    id: string;
    number: string;
    status: string;
    cargoDescription: string;
    cargoWeightKg: number;
    cargoVolumeM3?: number | null;
    cargoPlaces?: number | null;
    cargoType?: string | null;
    coldChainRequired?: boolean;
    temperatureMinC?: number | null;
    temperatureMaxC?: number | null;
    loadingAddress: string;
    loadingDate?: string | null;
    loadingWindowStart?: string | null;
    loadingWindowEnd?: string | null;
    unloadingAddress: string;
    unloadingDate?: string | null;
    unloadingWindowStart?: string | null;
    unloadingWindowEnd?: string | null;
    notes?: string | null;
    vehicleRequirements?: string | null;
    tripId?: string | null;
    contractorId: string;
    createdAt: string;
    updatedAt: string;
    // K7 — backend подаёт customerPrice=null для не-manager+ ролей.
    customerPrice?: number | null;
    customerPriceCurrency?: string | null;
    customerPriceIncludesVat?: boolean | null;
    // N3 (Этап 5) — связанные счета (только для manager+/accountant/admin).
    invoiceLinks?: Array<{
        invoiceId: string;
        number: string;
        type: string;
        status: string;
        allocatedAmount: number;
        total: number;
    }> | null;
}

function formatDateTime(iso?: string | null): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return '—';
    }
}

function Row({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2 py-1.5 border-b border-neutral-100 last:border-b-0">
            {icon && <div className="text-neutral-400 mt-0.5 shrink-0">{icon}</div>}
            <div className="min-w-0 flex-1">
                <div className="text-xs text-neutral-500">{label}</div>
                <div className="text-sm text-neutral-800 break-words">{value}</div>
            </div>
        </div>
    );
}

export function OrderDetailDrawer({ orderId, onClose }: { orderId: string; onClose: () => void }) {
    const [order, setOrder] = useState<DrawerOrder | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        api.get<{ success: boolean; data: DrawerOrder }>(`/orders/${orderId}`)
            .then((r) => {
                if (!cancelled) setOrder(r.data);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Не удалось загрузить заявку');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [orderId]);

    // Escape closes
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-neutral-900/40"
                onClick={onClose}
                aria-hidden="true"
            />
            {/* Panel */}
            <aside
                className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-xl flex flex-col"
                role="dialog"
                aria-label="Детали заявки"
            >
                <header className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 shrink-0">
                    <div>
                        <div className="text-xs text-neutral-500 uppercase tracking-wider">Заявка</div>
                        <div className="text-lg font-semibold text-neutral-900">
                            {order?.number ?? '…'}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500"
                        aria-label="Закрыть"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {loading && (
                        <div className="flex items-center justify-center py-12 text-neutral-400">
                            <Loader2 className="w-6 h-6 animate-spin mr-2" />
                            Загрузка…
                        </div>
                    )}
                    {error && (
                        <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                            {error}
                        </div>
                    )}
                    {order && !loading && !error && (
                        <div className="space-y-5">
                            <section>
                                <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
                                    Статус
                                </h3>
                                <div className="text-sm font-medium">
                                    {label(ORDER_STATUS, order.status)}
                                </div>
                            </section>

                            <section>
                                <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
                                    Груз
                                </h3>
                                <Row
                                    icon={<Package className="w-4 h-4" />}
                                    label="Описание"
                                    value={order.cargoDescription}
                                />
                                <Row
                                    label="Вес"
                                    value={`${order.cargoWeightKg} кг`}
                                />
                                {order.cargoVolumeM3 != null && (
                                    <Row label="Объём" value={`${order.cargoVolumeM3} м³`} />
                                )}
                                {order.cargoPlaces != null && (
                                    <Row label="Мест" value={String(order.cargoPlaces)} />
                                )}
                                {order.cargoType && (
                                    <Row label="Тип груза" value={order.cargoType} />
                                )}
                                {order.coldChainRequired && (
                                    <Row
                                        icon={<Thermometer className="w-4 h-4 text-info-600" />}
                                        label="Cold chain"
                                        value={
                                            order.temperatureMinC != null && order.temperatureMaxC != null
                                                ? `${order.temperatureMinC}…${order.temperatureMaxC} °C`
                                                : 'требуется'
                                        }
                                    />
                                )}
                            </section>

                            <section>
                                <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
                                    Маршрут
                                </h3>
                                <Row
                                    icon={<MapPin className="w-4 h-4" />}
                                    label="Откуда"
                                    value={order.loadingAddress}
                                />
                                <Row
                                    icon={<Calendar className="w-4 h-4" />}
                                    label="Дата погрузки"
                                    value={formatDateTime(order.loadingDate)}
                                />
                                <Row
                                    icon={<MapPin className="w-4 h-4" />}
                                    label="Куда"
                                    value={order.unloadingAddress}
                                />
                                <Row
                                    icon={<Calendar className="w-4 h-4" />}
                                    label="Дата выгрузки"
                                    value={formatDateTime(order.unloadingDate)}
                                />
                            </section>

                            {(order.vehicleRequirements || order.notes) && (
                                <section>
                                    <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
                                        Дополнительно
                                    </h3>
                                    {order.vehicleRequirements && (
                                        <Row label="Требования к ТС" value={order.vehicleRequirements} />
                                    )}
                                    {order.notes && (
                                        <Row label="Примечания" value={order.notes} />
                                    )}
                                </section>
                            )}

                            {order.tripId && (
                                <section className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
                                    <div className="flex items-center gap-2 text-brand-800">
                                        <Truck className="w-4 h-4" />
                                        <div className="text-sm">
                                            Назначен рейс —{' '}
                                            <Link
                                                href={`/trips/${order.tripId}`}
                                                className="font-medium underline"
                                            >
                                                открыть досье
                                            </Link>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* N3 (Этап 5) — связанные счета. Видны только manager+/accountant/admin
                                (backend подаёт invoiceLinks=null для прочих ролей). */}
                            {order.invoiceLinks && order.invoiceLinks.length > 0 && (
                                <section>
                                    <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
                                        Связанные счета
                                    </h3>
                                    <div className="space-y-1.5">
                                        {order.invoiceLinks.map((link) => (
                                            <div
                                                key={link.invoiceId}
                                                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 flex items-center justify-between gap-2"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-medium text-neutral-900">
                                                        {link.number}
                                                    </div>
                                                    <div className="text-xs text-neutral-500">
                                                        {label(INVOICE_TYPE, link.type)}
                                                        {' · '}
                                                        <span className="text-neutral-700">
                                                            {label(INVOICE_STATUS, link.status)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className="text-sm font-semibold text-success-700">
                                                        {new Intl.NumberFormat('ru-RU', {
                                                            style: 'currency',
                                                            currency: 'RUB',
                                                            maximumFractionDigits: 0,
                                                        }).format(link.allocatedAmount)}
                                                    </div>
                                                    <div className="text-[10px] text-neutral-500">
                                                        в счёте: {new Intl.NumberFormat('ru-RU', {
                                                            style: 'currency',
                                                            currency: 'RUB',
                                                            maximumFractionDigits: 0,
                                                        }).format(link.total)}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* K7 — Финансовая секция. customerPrice=null означает либо
                                цена реально не задана, либо backend срезал RBAC. Для
                                role>=manager (видит цену) при null покажем «не задана»;
                                для логиста/диспетчера секция вообще не показывается. */}
                            {order.customerPrice != null && (
                                <section className="rounded-lg border border-success-200 bg-success-50/60 px-4 py-3">
                                    <h3 className="text-xs uppercase tracking-wider text-success-800 mb-2 font-semibold">
                                        Стоимость от заказчика
                                    </h3>
                                    <div className="text-2xl font-bold text-success-900">
                                        {new Intl.NumberFormat('ru-RU', {
                                            style: 'currency',
                                            currency: order.customerPriceCurrency || 'RUB',
                                            maximumFractionDigits: 2,
                                        }).format(order.customerPrice)}
                                    </div>
                                    <div className="text-xs text-success-700 mt-0.5">
                                        {order.customerPriceIncludesVat ? 'цена с НДС' : 'цена без НДС'}
                                    </div>
                                </section>
                            )}

                            <section className="text-xs text-neutral-400 pt-2 border-t border-neutral-100">
                                <div>Создана: {formatDateTime(order.createdAt)}</div>
                                <div>Обновлена: {formatDateTime(order.updatedAt)}</div>
                            </section>
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}
