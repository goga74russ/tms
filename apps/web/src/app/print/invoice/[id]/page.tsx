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

// Fallbacks mirror apps/api/src/modules/documents/pdf-base.ts CARRIER defaults
// (ИП Бардин Г.Д. — actual registered entity). Operators should still set
// NEXT_PUBLIC_CARRIER_* env vars at build time; these defaults exist so a
// missed env doesn't render fictional "ООО ТМС Логистик" placeholder data.
const CARRIER = {
    name: process.env.NEXT_PUBLIC_CARRIER_NAME ?? 'ИП Бардин Георгий Дмитриевич',
    inn: process.env.NEXT_PUBLIC_CARRIER_INN ?? '746003023587',
    // ИП has no КПП.
    kpp: process.env.NEXT_PUBLIC_CARRIER_KPP ?? '',
    address: process.env.NEXT_PUBLIC_CARRIER_ADDRESS ?? 'Челябинская область, Чебаркульский район, село Непряхино',
    bank: process.env.NEXT_PUBLIC_CARRIER_BANK ?? 'ООО "Банк Точка"',
    bik: process.env.NEXT_PUBLIC_CARRIER_BIK ?? '044525104',
    account: process.env.NEXT_PUBLIC_CARRIER_ACCOUNT ?? '40802810220000919838',
};

export default function InvoicePrintPage() {
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
    if (!data) return <div className="loading">Загрузка счёта…</div>;

    const inv = data;
    const tripCount = Array.isArray(inv.tripIds) ? inv.tripIds.length : 1;
    const pricePerTrip = tripCount ? Number(inv.subtotal) / tripCount : Number(inv.subtotal);

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>Закрыть</button>
            </div>

            <div className="print-page">
                {/* Банковские реквизиты */}
                <div style={{ background: '#f5f5f5', padding: '10px 12px', marginBottom: 12, border: '1px solid #ddd' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '11pt' }}>{CARRIER.name}</div>
                            <div style={{ fontSize: '9pt', color: '#555' }}>ИНН: {CARRIER.inn} / КПП: {CARRIER.kpp}</div>
                            <div style={{ fontSize: '9pt', color: '#555' }}>{CARRIER.address}</div>
                        </div>
                        <div style={{ fontSize: '9pt', color: '#444' }}>
                            <div>Банк: {CARRIER.bank}</div>
                            <div>БИК: {CARRIER.bik}</div>
                            <div>р/с: {CARRIER.account}</div>
                        </div>
                    </div>
                </div>

                {/* Заголовок */}
                <div className="doc-title">СЧЁТ НА ОПЛАТУ</div>
                <div className="doc-subtitle">№ {inv.number} от {fmt(inv.createdAt)}</div>
                <hr />

                {/* Стороны */}
                <div className="field-row" style={{ marginTop: 8 }}>
                    <span className="field-label" style={{ fontWeight: 700 }}>Поставщик:</span>
                    <span className="field-value">{CARRIER.name}</span>
                </div>
                <div className="field-row">
                    <span className="field-label" style={{ fontWeight: 700 }}>Покупатель:</span>
                    <span className="field-value">{inv.contractorName || '—'}</span>
                </div>
                {inv.contractorInn && (
                    <div className="field-row">
                        <span className="field-label" />
                        <span className="field-value" style={{ fontSize: '8pt', color: '#555' }}>ИНН: {inv.contractorInn} КПП: {inv.contractorKpp || '—'}</span>
                    </div>
                )}

                <hr style={{ margin: '10px 0' }} />

                {/* Таблица */}
                <table>
                    <thead>
                        <tr>
                            <th style={{ width: 28 }}>№</th>
                            <th>Наименование</th>
                            <th style={{ width: 40, textAlign: 'right' }}>Кол.</th>
                            <th style={{ width: 45, textAlign: 'center' }}>Ед.</th>
                            <th style={{ width: 90, textAlign: 'right' }}>Цена, руб.</th>
                            <th style={{ width: 100, textAlign: 'right' }}>Сумма, руб.</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ textAlign: 'center' }}>1</td>
                            <td>Транспортные услуги за период {fmt(inv.periodStart)} — {fmt(inv.periodEnd)}</td>
                            <td style={{ textAlign: 'right' }}>{tripCount}</td>
                            <td style={{ textAlign: 'center' }}>рейс</td>
                            <td style={{ textAlign: 'right' }}>{money(pricePerTrip)}</td>
                            <td style={{ textAlign: 'right' }}>{money(inv.subtotal)}</td>
                        </tr>
                    </tbody>
                </table>

                {/* Итого */}
                <div className="totals-block">
                    <div className="total-row"><span>Итого без НДС:</span><span>{money(inv.subtotal)} ₽</span></div>
                    <div className="total-row"><span>НДС 20%:</span><span>{money(inv.vatAmount)} ₽</span></div>
                    <div className="total-row-bold"><span>К ОПЛАТЕ:</span><span>{money(inv.total)} ₽</span></div>
                </div>

                <div style={{ marginTop: 10, fontSize: '9pt', color: '#444' }}>
                    Всего к оплате: {money(inv.total)} руб. (включая НДС 20%: {money(inv.vatAmount)} руб.)
                </div>
                <div style={{ marginTop: 4, fontSize: '9pt', color: '#e65c00' }}>
                    Счёт действителен 10 дней с даты выставления.
                </div>

                {/* Подписи */}
                <hr style={{ marginTop: 16 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, marginTop: 12 }}>
                    <div>
                        <div style={{ fontSize: '9pt', marginBottom: 18 }}>Руководитель</div>
                        <div className="sig-line" />
                    </div>
                    <div>
                        <div style={{ fontSize: '9pt', marginBottom: 18 }}>Главный бухгалтер</div>
                        <div className="sig-line" />
                    </div>
                </div>

                <div className="footer-note">
                    Счёт № {inv.number} | {CARRIER.name} | ИНН {CARRIER.inn} | Сформирован: {fmt(new Date().toISOString())}
                </div>
            </div>
        </>
    );
}
