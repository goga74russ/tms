'use client';

// ============================================================
// УПД — Универсальный передаточный документ
// (Приказ ФНС России от 21.12.2020 № ЕД-7-26/901@,
//  ранее ММВ-7-15/820@). Заменяет связку СФ + Акт.
//
// Структура аналогична СФ (см. /print/sf), но добавляет:
//   • Дата фактической отгрузки / оказания услуги
//   • Подписи передающей и принимающей сторон с должностями
//   • Статус документа (1=СФ+Акт, 2=Акт без НДС)
// ============================================================
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

const CARRIER = {
    name: process.env.NEXT_PUBLIC_CARRIER_NAME ?? 'ИП Бардин Георгий Дмитриевич',
    inn: process.env.NEXT_PUBLIC_CARRIER_INN ?? '746003023587',
    kpp: process.env.NEXT_PUBLIC_CARRIER_KPP ?? '',
    address: process.env.NEXT_PUBLIC_CARRIER_ADDRESS ?? 'Челябинская область, Чебаркульский район, село Непряхино',
};

export default function UpdPrintPage() {
    const params = useParams();
    const id = params?.id as string;
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const printedRef = useRef(false);

    useEffect(() => {
        if (!id) return;
        fetch(`${API_BASE}/finance/invoices/${id}`, { credentials: 'include' })
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
    if (!data) return <div className="loading">Загрузка УПД…</div>;

    const inv = data;
    const orders = Array.isArray(inv.orders) ? inv.orders : [];
    const vatRate = inv.vatRate != null ? Number(inv.vatRate) : null;
    const isVatStatus1 = vatRate != null; // Status 1 = СФ+акт; Status 2 = акт без НДС

    type Row = { name: string; qty: number; price: number; subtotal: number; vat: number; total: number };
    const rows: Row[] = orders.length > 0
        ? orders.map((o: any) => {
            const sub = vatRate != null && inv.includesVat
                ? o.allocatedAmount / (1 + vatRate / 100)
                : o.allocatedAmount - (o.allocatedVat ?? 0);
            const vat = vatRate != null
                ? (inv.includesVat ? o.allocatedAmount - sub : sub * vatRate / 100)
                : 0;
            return {
                name: `Транспортные услуги по заявке ${o.number} (${o.cargoDescription || '—'})`,
                qty: 1,
                price: sub,
                subtotal: sub,
                vat,
                total: sub + vat,
            };
        })
        : [{
            name: `Транспортные услуги${inv.basisText ? ': ' + inv.basisText : ''}`,
            qty: 1,
            price: Number(inv.subtotal),
            subtotal: Number(inv.subtotal),
            vat: Number(inv.vatAmount),
            total: Number(inv.total),
        }];

    const totalSub = rows.reduce((s, r) => s + r.subtotal, 0);
    const totalVat = rows.reduce((s, r) => s + r.vat, 0);
    const totalAll = rows.reduce((s, r) => s + r.total, 0);

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>Закрыть</button>
            </div>

            <div className="print-page" style={{ fontFamily: 'Times New Roman, serif', fontSize: '10pt' }}>
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '14pt' }}>
                    УНИВЕРСАЛЬНЫЙ ПЕРЕДАТОЧНЫЙ ДОКУМЕНТ
                </div>
                <div style={{ textAlign: 'center', fontSize: '10pt', marginBottom: 4 }}>
                    № {inv.number} от {fmt(inv.issuedAt ?? inv.createdAt)}
                </div>
                <div style={{ textAlign: 'center', fontSize: '9pt', marginBottom: 12 }}>
                    Статус: <strong>{isVatStatus1 ? '1 (Счёт-фактура и передаточный документ)' : '2 (Передаточный документ без СФ)'}</strong>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: 8 }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '50%', padding: '4px 8px', border: '1px solid #999', verticalAlign: 'top' }}>
                                <strong>Продавец (исполнитель):</strong><br />
                                {CARRIER.name}<br />
                                Адрес: {CARRIER.address}<br />
                                ИНН: {CARRIER.inn}{CARRIER.kpp ? ` / КПП: ${CARRIER.kpp}` : ' (ИП — без КПП)'}
                            </td>
                            <td style={{ padding: '4px 8px', border: '1px solid #999', verticalAlign: 'top' }}>
                                <strong>Покупатель (заказчик):</strong><br />
                                {inv.contractorName ?? '—'}<br />
                                Адрес: {inv.contractorAddress ?? '—'}<br />
                                ИНН: {inv.contractorInn ?? '—'}{inv.contractorKpp ? ` / КПП: ${inv.contractorKpp}` : ''}
                            </td>
                        </tr>
                        <tr>
                            <td colSpan={2} style={{ padding: '4px 8px', border: '1px solid #999' }}>
                                <strong>Валюта:</strong> {inv.currency ?? 'RUB'} —{' '}
                                {inv.currency === 'RUB' || !inv.currency ? 'Российский рубль (643)' : inv.currency}
                                <span style={{ marginLeft: 24 }}>
                                    <strong>Основание:</strong> {inv.basisText ?? '—'}
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt', marginBottom: 8 }}>
                    <thead>
                        <tr style={{ background: '#eee' }}>
                            <th style={{ padding: 3, border: '1px solid #999', width: '4%' }}>№</th>
                            <th style={{ padding: 3, border: '1px solid #999' }}>Наименование услуги</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '7%' }}>Ед.</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '6%' }}>Кол-во</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '10%' }}>Цена, ₽</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '11%' }}>Стоим. без НДС, ₽</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '6%' }}>Ставка</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '10%' }}>Сумма НДС, ₽</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '11%' }}>Стоим. с НДС, ₽</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i}>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'center' }}>{i + 1}</td>
                                <td style={{ padding: 3, border: '1px solid #999' }}>{r.name}</td>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'center' }}>усл.</td>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{r.qty}</td>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(r.price)}</td>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(r.subtotal)}</td>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'center' }}>{vatRate != null ? `${vatRate}%` : 'без НДС'}</td>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(r.vat)}</td>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(r.total)}</td>
                            </tr>
                        ))}
                        <tr style={{ fontWeight: 700, background: '#f5f5f5' }}>
                            <td colSpan={5} style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>Итого:</td>
                            <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(totalSub)}</td>
                            <td style={{ padding: 3, border: '1px solid #999' }}></td>
                            <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(totalVat)}</td>
                            <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(totalAll)}</td>
                        </tr>
                    </tbody>
                </table>

                <div style={{ fontSize: '9pt', marginBottom: 8 }}>
                    <strong>Дата фактической отгрузки / оказания услуги:</strong> {fmt(inv.issuedAt ?? inv.createdAt)}
                </div>
                <div style={{ fontSize: '9pt', marginBottom: 16 }}>
                    <strong>Всего к оплате:</strong> {money(totalAll)} ₽
                    {isVatStatus1 ? ` (в т.ч. НДС ${money(totalVat)} ₽)` : ' (без НДС)'}
                </div>

                {/* Подписи: передающей стороны и принимающей */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginTop: 16 }}>
                    <tbody>
                        <tr>
                            <td style={{ padding: 6, verticalAlign: 'bottom', width: '50%' }}>
                                <strong>Товар (услугу) передал:</strong><br />
                                Должность: ___________________<br />
                                <div style={{ borderBottom: '1px solid #000', marginTop: 30, marginBottom: 4 }}></div>
                                <span style={{ fontSize: '8pt', color: '#666' }}>(подпись)</span>
                                <span style={{ marginLeft: 30 }}>{CARRIER.name}</span>
                            </td>
                            <td style={{ padding: 6, verticalAlign: 'bottom' }}>
                                <strong>Товар (услугу) принял:</strong><br />
                                Должность: ___________________<br />
                                <div style={{ borderBottom: '1px solid #000', marginTop: 30, marginBottom: 4 }}></div>
                                <span style={{ fontSize: '8pt', color: '#666' }}>(подпись)</span>
                                <span style={{ marginLeft: 30 }}>{inv.contractorName ?? '—'}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div style={{ fontSize: '7pt', color: '#999', marginTop: 16, textAlign: 'center' }}>
                    Форма УПД соответствует Приказу ФНС России № ЕД-7-26/901@ от 21.12.2020.
                    Документ может быть подписан усиленной квалифицированной электронной подписью.
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-page { padding: 0; }
                }
                .loading { padding: 40px; text-align: center; font-family: sans-serif; }
                .print-actions { padding: 12px; background: #f5f5f5; border-bottom: 1px solid #ddd; }
                .print-btn { margin-right: 8px; padding: 8px 16px; border: 1px solid #999; cursor: pointer; }
                .print-btn-primary { background: #2c5aa0; color: white; border-color: #2c5aa0; }
                .print-btn-secondary { background: white; color: #333; }
                .print-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
            `}</style>
        </>
    );
}
