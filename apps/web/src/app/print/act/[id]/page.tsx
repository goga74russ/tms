'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = '/api';

function fmt(d: string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function money(n: number | string | null | undefined) {
    if (n == null) return '—';
    return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Реквизиты перевозчика — берутся из NEXT_PUBLIC_CARRIER_* env.
// Если не заданы — печатаем «НЕ УСТАНОВЛЕНО», чтобы было сразу видно,
// что прод-окружение не сконфигурировано. Раньше fallback был на тестовые
// 7701234567 / 770101001, что попадало в реальные печатные документы.
const CARRIER = {
    name: process.env.NEXT_PUBLIC_CARRIER_NAME ?? 'НЕ УСТАНОВЛЕНО',
    inn: process.env.NEXT_PUBLIC_CARRIER_INN ?? 'НЕ УСТАНОВЛЕНО',
    kpp: process.env.NEXT_PUBLIC_CARRIER_KPP ?? 'НЕ УСТАНОВЛЕНО',
    address: process.env.NEXT_PUBLIC_CARRIER_ADDRESS ?? 'НЕ УСТАНОВЛЕНО',
};

export default function ActPrintPage() {
    const params = useParams();
    const id = params?.id as string;
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const printedRef = useRef(false);

    useEffect(() => {
        if (!id) return;
        fetch(`${API_BASE}/finance/invoices/${id}`, {
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
        if (data && !printedRef.current) {
            printedRef.current = true;
            const timer = setTimeout(() => window.print(), 400);
            return () => clearTimeout(timer);
        }
    }, [data]);

    if (error) return <div className="loading">Ошибка: {error}</div>;
    if (!data) return <div className="loading">Загрузка акта…</div>;

    const inv = data;
    const tripRows: any[] = Array.isArray(inv.tripRows) ? inv.tripRows : [];

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>Закрыть</button>
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
                        {tripRows.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888' }}>Данные о рейсах не указаны</td></tr>
                        ) : (
                            tripRows.map((t: any, i: number) => (
                                <tr key={t.tripNumber ?? `${t.date}:${t.route}:${i}`}>
                                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                                    <td>{fmt(t.date)}</td>
                                    <td>{t.tripNumber ?? '—'}</td>
                                    <td>{t.route}</td>
                                    <td style={{ textAlign: 'right' }}>{t.distanceKm ?? '—'}</td>
                                    <td style={{ textAlign: 'right' }}>{money(t.amount)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Итого */}
                <div className="totals-block no-break">
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
                <div className="no-break">
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
                </div>

                <div className="footer-note">
                    Акт № {inv.number} | {CARRIER.name} | ИНН {CARRIER.inn} | Сформирован: {fmt(new Date().toISOString())}
                </div>
            </div>
        </>
    );
}
