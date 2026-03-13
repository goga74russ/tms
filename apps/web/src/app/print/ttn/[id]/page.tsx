'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = '/api';
const TOKEN_KEY = 'tms_token';

function fmt(d: string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const CARRIER = {
    name: process.env.NEXT_PUBLIC_CARRIER_NAME ?? 'ООО «ТМС Логистик»',
    inn: process.env.NEXT_PUBLIC_CARRIER_INN ?? '7701234567',
    kpp: process.env.NEXT_PUBLIC_CARRIER_KPP ?? '770101001',
    address: process.env.NEXT_PUBLIC_CARRIER_ADDRESS ?? 'г. Москва, ул. Транспортная, д. 1',
};

export default function TtnPrintPage() {
    const params = useParams();
    const id = params?.id as string;
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
        fetch(`${API_BASE}/orders/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            credentials: 'include',
        })
            .then(r => r.json())
            .then(json => {
                if (json.success) setData(json.data);
                else setError(json.error ?? 'Ошибка');
            })
            .catch(e => setError(e.message));
    }, [id]);

    useEffect(() => {
        if (data) {
            const timer = setTimeout(() => window.print(), 400);
            return () => clearTimeout(timer);
        }
    }, [data]);

    if (error) return <div className="loading">Ошибка: {error}</div>;
    if (!data) return <div className="loading">Загрузка ТТН…</div>;

    const o = data;

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>🖨 Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>✕ Закрыть</button>
            </div>

            <div className="print-page">
                {/* ГОСТ-шапка */}
                <div className="doc-header-row">
                    <div style={{ flex: 1 }}>
                        <div className="org-name">{CARRIER.name}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>ИНН {CARRIER.inn} / КПП {CARRIER.kpp}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>{CARRIER.address}</div>
                    </div>
                    <div style={{ border: '2px solid #000', padding: '8px 12px', textAlign: 'center', minWidth: 200 }}>
                        <div style={{ fontSize: '7pt', color: '#555' }}>Форма № 1-Т</div>
                        <div style={{ fontWeight: 700, fontSize: '11pt' }}>Товарно-транспортная накладная</div>
                        <div style={{ fontSize: '10pt' }}>№ {o.number}</div>
                        <div style={{ fontSize: '9pt' }}>от {fmt(o.createdAt)}</div>
                    </div>
                </div>
                <hr />

                {/* 1. Стороны */}
                <div className="section-title">1. Стороны грузоперевозки</div>
                <div className="two-col">
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt', marginBottom: 4 }}>Грузоотправитель (Перевозчик):</div>
                        <div style={{ fontSize: '10pt' }}>{CARRIER.name}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>ИНН: {CARRIER.inn}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>{CARRIER.address}</div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt', marginBottom: 4 }}>Грузополучатель:</div>
                        <div style={{ fontSize: '10pt' }}>{o.contractorName || o.unloadingAddress || '—'}</div>
                        {o.contractorInn && (
                            <div style={{ fontSize: '8pt', color: '#555' }}>ИНН: {o.contractorInn}</div>
                        )}
                        <div style={{ fontSize: '8pt', color: '#555' }}>{o.unloadingAddress || '—'}</div>
                    </div>
                </div>

                {/* 2. Транспортный раздел */}
                <div className="section-title" style={{ marginTop: 12 }}>2. Транспортный раздел</div>
                <div className="two-col">
                    <div>
                        <div className="field-row">
                            <span className="field-label">Транспортное средство:</span>
                            <span className="field-value">{[o.vehicleMake, o.vehicleModel].filter(Boolean).join(' ') || '—'}</span>
                        </div>
                        <div className="field-row">
                            <span className="field-label">Гос. номер:</span>
                            <span className="field-value-bold">{o.vehiclePlate || '—'}</span>
                        </div>
                        <div className="field-row">
                            <span className="field-label">Водитель:</span>
                            <span className="field-value">{o.driverName || '—'}</span>
                        </div>
                        <div className="field-row">
                            <span className="field-label">Удостоверение:</span>
                            <span className="field-value">{o.driverLicense || '—'}</span>
                        </div>
                    </div>
                    <div>
                        <div className="field-row">
                            <span className="field-label">Адрес погрузки:</span>
                            <span className="field-value">{o.loadingAddress || '—'}</span>
                        </div>
                        <div className="field-row">
                            <span className="field-label">Адрес выгрузки:</span>
                            <span className="field-value">{o.unloadingAddress || '—'}</span>
                        </div>
                        {o.distanceKm && (
                            <div className="field-row">
                                <span className="field-label">Расстояние, км:</span>
                                <span className="field-value">{o.distanceKm}</span>
                            </div>
                        )}
                        {o.tripNumber && (
                            <div className="field-row">
                                <span className="field-label">Рейс №:</span>
                                <span className="field-value">{o.tripNumber}</span>
                            </div>
                        )}
                        {o.waybillNumber && (
                            <div className="field-row">
                                <span className="field-label">Путевой лист:</span>
                                <span className="field-value">{o.waybillNumber}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Товарный раздел */}
                <div className="section-title" style={{ marginTop: 12 }}>3. Товарный раздел (сведения о грузе)</div>
                <table>
                    <thead>
                        <tr>
                            <th>Наименование груза</th>
                            <th style={{ width: 90, textAlign: 'right' }}>Масса брутто, кг</th>
                            <th style={{ width: 70, textAlign: 'right' }}>Объём, м³</th>
                            <th style={{ width: 60, textAlign: 'right' }}>Мест</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>{o.cargoDescription || '—'}</td>
                            <td style={{ textAlign: 'right' }}>{o.cargoWeightKg ?? '—'}</td>
                            <td style={{ textAlign: 'right' }}>{o.cargoVolumeCbm ?? '—'}</td>
                            <td style={{ textAlign: 'right' }}>{o.cargoPlaces ?? '—'}</td>
                        </tr>
                    </tbody>
                </table>

                {/* Подписи */}
                <hr style={{ marginTop: 16 }} />
                <div className="three-col" style={{ marginTop: 12 }}>
                    <div className="sig-item">
                        <div className="sig-label">Грузоотправитель</div>
                        <div className="sig-line" />
                    </div>
                    <div className="sig-item">
                        <div className="sig-label">Водитель (принял)</div>
                        <div className="sig-line" />
                        <div className="sig-name">{o.driverName}</div>
                    </div>
                    <div className="sig-item">
                        <div className="sig-label">Грузополучатель</div>
                        <div className="sig-line" />
                    </div>
                </div>

                {/* Отметка о приёмке */}
                <div style={{ marginTop: 16, padding: '8px 12px', border: '1px solid #ccc' }}>
                    <div style={{ fontWeight: 700, fontSize: '9pt', marginBottom: 8 }}>Отметка о приёмке груза:</div>
                    <div style={{ display: 'flex', gap: 30 }}>
                        <div>
                            <div style={{ fontSize: '9pt', color: '#666' }}>Груз получил:</div>
                            <div className="sig-line" style={{ width: 180, marginTop: 14 }} />
                        </div>
                        <div>
                            <div style={{ fontSize: '9pt', color: '#666' }}>Дата:</div>
                            <div className="sig-line" style={{ width: 100, marginTop: 14 }} />
                        </div>
                    </div>
                </div>

                <div className="footer-note">
                    ТТН № {o.number} | {CARRIER.name} | ИНН {CARRIER.inn} | Сформирована: {fmt(new Date().toISOString())}
                </div>
            </div>
        </>
    );
}
