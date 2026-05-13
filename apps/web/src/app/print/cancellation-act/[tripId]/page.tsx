'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const API_BASE = '/api';

type Trip = {
    id: string;
    number: string;
    status: string;
    plannedDepartureAt?: string | null;
    actualDepartureAt?: string | null;
    notes?: string | null;
    createdAt: string;
};

const CARRIER = {
    name: process.env.NEXT_PUBLIC_CARRIER_NAME ?? 'ООО "ТМС Логистик"',
    inn: process.env.NEXT_PUBLIC_CARRIER_INN ?? '7701234567',
    kpp: process.env.NEXT_PUBLIC_CARRIER_KPP ?? '770101001',
    address: process.env.NEXT_PUBLIC_CARRIER_ADDRESS ?? 'г. Москва, ул. Транспортная, д. 1',
};

function fmt(value?: string | null) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function money(value?: string | null) {
    if (!value) return '-';
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return '-';
    return parsed.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export default function CancellationActPrintPage() {
    return (
        <Suspense fallback={<div style={{ padding: 24 }}>Загрузка...</div>}>
            <CancellationActPrintContent />
        </Suspense>
    );
}

function CancellationActPrintContent() {
    const params = useParams();
    const search = useSearchParams();
    const tripId = params?.tripId as string;
    const [trip, setTrip] = useState<Trip | null>(null);
    const [error, setError] = useState<string | null>(null);
    const printedRef = useRef(false);

    const reason = search.get('reason') || 'Груз не готов после подачи транспортного средства';
    const amount = search.get('amount');
    const vehicleArrivedAt = search.get('vehicleArrivedAt');
    const routePointId = search.get('routePointId');

    useEffect(() => {
        if (!tripId) return;
        fetch(`${API_BASE}/trips/${tripId}`, { credentials: 'include' })
            .then(response => response.json())
            .then(json => {
                if (json.success) setTrip(json.data);
                else setError(json.error ?? 'Не удалось загрузить рейс');
            })
            .catch(err => setError(err.message));
    }, [tripId]);

    useEffect(() => {
        if (!trip || printedRef.current) return;
        printedRef.current = true;
        const timer = window.setTimeout(() => window.print(), 400);
        return () => window.clearTimeout(timer);
    }, [trip]);

    if (error) return <div className="loading">Ошибка: {error}</div>;
    if (!trip) return <div className="loading">Загрузка акта срыва подачи...</div>;

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>Закрыть</button>
            </div>

            <div className="print-page">
                <div className="doc-title">АКТ О СРЫВЕ ПОДАЧИ ТС</div>
                <div className="doc-subtitle">Рейс N {trip.number} от {fmt(trip.createdAt)}</div>
                <hr />

                <div className="two-col" style={{ marginTop: 8 }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>Перевозчик:</div>
                        <div style={{ fontSize: '10pt' }}>{CARRIER.name}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>ИНН: {CARRIER.inn} / КПП: {CARRIER.kpp}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>{CARRIER.address}</div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>Рейс:</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>ID: {trip.id}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>Статус: {trip.status}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>Точка маршрута: {routePointId || '-'}</div>
                    </div>
                </div>

                <div className="section-title">Факт подачи и отмены</div>
                <div className="field-row"><div className="field-label">Подача ТС:</div><div className="field-value">{fmt(vehicleArrivedAt)}</div></div>
                <div className="field-row"><div className="field-label">Плановый выезд:</div><div className="field-value">{fmt(trip.plannedDepartureAt)}</div></div>
                <div className="field-row"><div className="field-label">Фактический выезд:</div><div className="field-value">{fmt(trip.actualDepartureAt)}</div></div>
                <div className="field-row"><div className="field-label">Причина:</div><div className="field-value-bold">{reason}</div></div>

                <div className="section-title">Начисление</div>
                <table>
                    <tbody>
                        <tr>
                            <td>Основание</td>
                            <td>Срыв подачи после прибытия транспортного средства</td>
                        </tr>
                        <tr>
                            <td>Сумма штрафа / резерва</td>
                            <td style={{ textAlign: 'right' }}>{money(amount)} руб.</td>
                        </tr>
                    </tbody>
                </table>

                <div className="section-title">Примечание</div>
                <div style={{ minHeight: 48, fontSize: '10pt', lineHeight: 1.35 }}>
                    {trip.notes || 'ТС прибыло на точку подачи, груз или погрузка не были готовы. Акт сформирован для подтверждения основания начисления.'}
                </div>

                <hr style={{ marginTop: 16 }} />
                <div className="two-col" style={{ marginTop: 12 }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>Перевозчик:</div>
                        <div className="sig-line" style={{ width: 180, marginTop: 18 }} />
                        <div style={{ fontSize: '8pt', color: '#999' }}>(подпись / ФИО)</div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>Заказчик / склад:</div>
                        <div className="sig-line" style={{ width: 180, marginTop: 18 }} />
                        <div style={{ fontSize: '8pt', color: '#999' }}>(подпись / ФИО)</div>
                    </div>
                </div>

                <div className="footer-note">
                    Акт срыва подачи по рейсу {trip.number} | {CARRIER.name} | сформирован: {fmt(new Date().toISOString())}
                </div>
            </div>
        </>
    );
}
