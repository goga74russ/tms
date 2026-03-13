'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = '/api';
const TOKEN_KEY = 'tms_token';

function fmt(d: string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function money(n: number | string | null | undefined) {
    if (n == null) return '—';
    return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CARRIER = {
    name: process.env.NEXT_PUBLIC_CARRIER_NAME ?? 'ООО «ТМС Логистик»',
    inn: process.env.NEXT_PUBLIC_CARRIER_INN ?? '7701234567',
    kpp: process.env.NEXT_PUBLIC_CARRIER_KPP ?? '770101001',
    address: process.env.NEXT_PUBLIC_CARRIER_ADDRESS ?? 'г. Москва, ул. Транспортная, д. 1',
};

export default function ActPrintPage() {
    const params = useParams();
    const id = params?.id as string;
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
        fetch(`${API_BASE}/finance/invoices`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            credentials: 'include',
        })
            .then(r => r.json())
            .then(json => {
                if (json.success) {
                    const inv = json.data.find((i: any) => i.id === id);
                    if (inv) setData(inv);
                    else setError('Документ не найден');
                } else {
                    setError(json.error ?? 'Ошибка');
                }
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
    if (!data) return <div className="loading">Загрузка акта…</div>;

    const inv = data;
    const tripIds: string[] = Array.isArray(inv.tripIds) ? inv.tripIds : [];
    const costPerTrip = tripIds.length ? Number(inv.subtotal) / tripIds.length : Number(inv.subtotal);

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>🖨 Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>✕ Закрыть</button>
            </div>

            <div className="print-page">
                {/* Заголовок */}
                <div className="doc-title">АКТ ВЫПОЛНЕННЫХ РАБОТ</div>
                <div className="doc-subtitle">№ {inv.number} от {fmt(inv.createdAt)}</div>
                <div className="doc-subtitle">за период: {fmt(inv.periodStart)} — {fmt(inv.periodEnd)}</div>
                <hr />

                {/* Стороны */}
                <div className="two-col" style={{ marginTop: 8 }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>ИСПОЛНИТЕЛЬ:</div>
                        <div style={{ fontSize: '10pt' }}>{CARRIER.name}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>ИНН: {CARRIER.inn} / КПП: {CARRIER.kpp}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>{CARRIER.address}</div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>ЗАКАЗЧИК:</div>
                        <div style={{ fontSize: '10pt' }}>{inv.contractorName || '—'}</div>
                        {inv.contractorInn && (
                            <div style={{ fontSize: '8pt', color: '#555' }}>ИНН: {inv.contractorInn} / КПП: {inv.contractorKpp || '—'}</div>
                        )}
                    </div>
                </div>

                <hr style={{ margin: '10px 0' }} />

                {/* Таблица рейсов */}
                <div className="section-title">Перечень оказанных услуг</div>
                <table>
                    <thead>
                        <tr>
                            <th style={{ width: 28 }}>№</th>
                            <th style={{ width: 65 }}>Дата</th>
                            <th style={{ width: 70 }}>Рейс №</th>
                            <th>Маршрут</th>
                            <th style={{ width: 45, textAlign: 'right' }}>км</th>
                            <th style={{ width: 95, textAlign: 'right' }}>Сумма, руб.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tripIds.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888' }}>Данные о рейсах не указаны</td></tr>
                        ) : (
                            tripIds.map((tid: string, i: number) => (
                                <tr key={tid}>
                                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                                    <td>{fmt(inv.periodStart)}</td>
                                    <td>{tid.slice(0, 8)}</td>
                                    <td>—</td>
                                    <td style={{ textAlign: 'right' }}>—</td>
                                    <td style={{ textAlign: 'right' }}>{money(costPerTrip)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Итого */}
                <div className="totals-block">
                    <div className="total-row"><span>Итого без НДС:</span><span>{money(inv.subtotal)} ₽</span></div>
                    <div className="total-row"><span>НДС 20%:</span><span>{money(inv.vatAmount)} ₽</span></div>
                    <div className="total-row-bold"><span>ИТОГО:</span><span>{money(inv.total)} ₽</span></div>
                </div>

                <div style={{ marginTop: 10, fontSize: '9pt', color: '#444' }}>
                    Всего оказано услуг на сумму {money(inv.total)} руб. (НДС 20% включён).
                </div>

                <div style={{ marginTop: 10, fontSize: '9pt' }}>
                    Вышеперечисленные услуги выполнены полностью и в срок.
                    Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.
                </div>

                {/* Подписи */}
                <hr style={{ marginTop: 16 }} />
                <div className="two-col" style={{ marginTop: 12 }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>ИСПОЛНИТЕЛЬ:</div>
                        <div style={{ fontSize: '8pt', color: '#555', marginBottom: 16 }}>{CARRIER.name}</div>
                        <div className="sig-line" style={{ width: 180 }} />
                        <div style={{ fontSize: '8pt', color: '#999' }}>(подпись / печать)</div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>ЗАКАЗЧИК:</div>
                        <div style={{ fontSize: '8pt', color: '#555', marginBottom: 16 }}>{inv.contractorName || '—'}</div>
                        <div className="sig-line" style={{ width: 180 }} />
                        <div style={{ fontSize: '8pt', color: '#999' }}>(подпись / печать)</div>
                    </div>
                </div>

                <div className="footer-note">
                    Акт № {inv.number} | {CARRIER.name} | ИНН {CARRIER.inn} | Сформирован: {fmt(new Date().toISOString())}
                </div>
            </div>
        </>
    );
}
