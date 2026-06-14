'use client';

// ============================================================
// Шаблон Счёт-Фактуры (СФ) per ПП РФ 1137 от 26.12.2011.
// invoice-spec.md §7 — обязательные реквизиты:
//   1.  № и дата составления
//   2.  Продавец: имя/адрес/ИНН/КПП
//   3.  Покупатель: имя/адрес/ИНН/КПП
//   4.  Грузоотправитель (если отличается от продавца)
//   5.  Грузополучатель (если отличается от покупателя)
//   6.  Номер платёжно-расчётного документа при авансе
//   7.  Гос.контракт/договор (при наличии)
//   8.  Валюта
//   9.  Код вида товара (экспорт ЕАЭС) — для транспорта обычно опускаем
//   10. По строке: наименование, ед.изм, кол-во, цена, стоимость без НДС,
//       ставка, сумма НДС, стоимость с НДС
//   11. Страна происхождения + ТД (импорт) — для услуг N/A
//   12. Подписи или КЭП
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

// CFG-1/OBS-1: реквизиты продавца — из организации-получателя счёта
// (data.carrierRequisites), не из build-env и без хардкода ИП Бардина
// (Юр-аудит §2.1/§2.2). Незаполненная орг → 'НЕ УСТАНОВЛЕНО'.
const NOT_SET = 'НЕ УСТАНОВЛЕНО';
type CarrierReq = { name?: string | null; inn?: string | null; kpp?: string | null; address?: string | null; ogrn?: string | null };
function carrierFrom(cr: CarrierReq | null | undefined) {
    return {
        name: cr?.name?.trim() || NOT_SET,
        inn: cr?.inn?.trim() || NOT_SET,
        kpp: cr?.kpp?.trim() || '',
        ogrn: cr?.ogrn?.trim() || '', // ② форма СФ 01.04.2026 — ОГРНИП для ИП
        address: cr?.address?.trim() || NOT_SET,
    };
}

export default function SfPrintPage() {
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
    if (!data) return <div className="loading">Загрузка СФ…</div>;

    const inv = data;
    const CARRIER = carrierFrom(data.carrierRequisites);
    const orders = Array.isArray(inv.orders) ? inv.orders : [];
    const vatRate = inv.vatRate != null ? Number(inv.vatRate) : null;

    // Если есть orders — по каждому строка, иначе одна общая.
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
                {/* Заголовок */}
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '14pt', marginBottom: 4 }}>
                    СЧЁТ-ФАКТУРА № {inv.number} от {fmt(inv.issuedAt ?? inv.createdAt)}
                </div>
                <div style={{ textAlign: 'center', fontSize: '8pt', color: '#666', marginBottom: 12 }}>
                    (по форме Постановления Правительства РФ № 1137 от 26.12.2011, в действ. редакции)
                </div>

                {/* §3 — реквизиты сторон */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: 8 }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '40%', padding: '4px 8px', border: '1px solid #999', verticalAlign: 'top' }}>
                                <strong>Продавец:</strong><br />
                                {CARRIER.name}<br />
                                Адрес: {CARRIER.address}<br />
                                ИНН: {CARRIER.inn}{CARRIER.kpp ? ` / КПП: ${CARRIER.kpp}` : ' (ИП — без КПП)'}
                                {/* ② форма СФ с 01.04.2026: для ИП — ОГРНИП */}
                                {CARRIER.ogrn && !CARRIER.kpp ? <><br />ОГРНИП: {CARRIER.ogrn}</> : null}
                            </td>
                            <td style={{ padding: '4px 8px', border: '1px solid #999', verticalAlign: 'top' }}>
                                <strong>Покупатель:</strong><br />
                                {inv.contractorName ?? '—'}<br />
                                Адрес: {inv.contractorAddress ?? '—'}<br />
                                ИНН: {inv.contractorInn ?? '—'}{inv.contractorKpp ? ` / КПП: ${inv.contractorKpp}` : ''}
                            </td>
                        </tr>
                        <tr>
                            <td style={{ padding: '4px 8px', border: '1px solid #999' }}>
                                <strong>Грузоотправитель:</strong> {CARRIER.name}<br />
                                Адрес: {CARRIER.address}
                            </td>
                            <td style={{ padding: '4px 8px', border: '1px solid #999' }}>
                                <strong>Грузополучатель:</strong> {inv.contractorName ?? '—'}<br />
                                Адрес: {inv.contractorAddress ?? '—'}
                            </td>
                        </tr>
                        <tr>
                            <td colSpan={2} style={{ padding: '4px 8px', border: '1px solid #999', fontSize: '9pt' }}>
                                <strong>К расчётно-платёжному документу № ___ от ___.___.____</strong>
                                <span style={{ marginLeft: 24, color: '#666' }}>(при авансе)</span>
                            </td>
                        </tr>
                        <tr>
                            <td colSpan={2} style={{ padding: '4px 8px', border: '1px solid #999' }}>
                                <strong>Валюта:</strong> {inv.currency ?? 'RUB'} — {inv.currency === 'RUB' || !inv.currency ? 'Российский рубль (643)' : inv.currency}
                            </td>
                        </tr>
                        {inv.basisText && (
                            <tr>
                                <td colSpan={2} style={{ padding: '4px 8px', border: '1px solid #999', fontSize: '9pt' }}>
                                    <strong>Основание:</strong> {inv.basisText}
                                </td>
                            </tr>
                        )}
                        {/* ② форма СФ с 01.04.2026 — строка 5б (реализация в счёт ранее
                            полученной оплаты). Для услуг без предоплаты — прочерк. */}
                        <tr>
                            <td colSpan={2} style={{ padding: '4px 8px', border: '1px solid #999', fontSize: '8pt', color: '#555' }}>
                                <strong>Стр. 5б</strong> (идентификатор реализации в счёт ранее полученной оплаты): {inv.advancePaymentRef ?? '—'}
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* Таблица товаров/услуг */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt', marginBottom: 8 }}>
                    <thead>
                        <tr style={{ background: '#eee' }}>
                            <th style={{ padding: 3, border: '1px solid #999', width: '4%' }}>№</th>
                            <th style={{ padding: 3, border: '1px solid #999' }}>Наименование услуги</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '7%' }}>Ед. изм.</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '6%' }}>Кол-во</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '10%' }}>Цена за ед., ₽</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '11%' }}>Стоимость без НДС, ₽</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '6%' }}>Ставка НДС</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '10%' }}>Сумма НДС, ₽</th>
                            <th style={{ padding: 3, border: '1px solid #999', width: '11%' }}>Стоимость с НДС, ₽</th>
                            {/* ② графа 14 — прослеживаемые товары; транспортные услуги не подлежат → прочерк */}
                            <th style={{ padding: 3, border: '1px solid #999', width: '9%' }}>Гр.14: прослеж., ₽</th>
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
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'center' }}>{vatRate != null ? `${vatRate}%` : '—'}</td>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(r.vat)}</td>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(r.total)}</td>
                                <td style={{ padding: 3, border: '1px solid #999', textAlign: 'center' }}>—</td>
                            </tr>
                        ))}
                        <tr style={{ fontWeight: 700, background: '#f5f5f5' }}>
                            <td colSpan={5} style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>Итого:</td>
                            <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(totalSub)}</td>
                            <td style={{ padding: 3, border: '1px solid #999' }}></td>
                            <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(totalVat)}</td>
                            <td style={{ padding: 3, border: '1px solid #999', textAlign: 'right' }}>{money(totalAll)}</td>
                            <td style={{ padding: 3, border: '1px solid #999' }}></td>
                        </tr>
                    </tbody>
                </table>

                {/* Сумма прописью */}
                <div style={{ fontSize: '9pt', marginBottom: 12 }}>
                    <strong>Всего к оплате:</strong> {money(totalAll)} ₽
                    {inv.includesVat ? ` (с НДС)` : ` + НДС ${money(totalVat)} ₽`}
                </div>

                {/* Подписи */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginTop: 24 }}>
                    <tbody>
                        <tr>
                            <td style={{ padding: 6, verticalAlign: 'bottom', width: '50%' }}>
                                Руководитель организации (или иное уполномоченное лицо):<br />
                                <div style={{ borderBottom: '1px solid #000', marginTop: 30, marginBottom: 4 }}></div>
                                <span style={{ fontSize: '8pt', color: '#666' }}>(подпись)</span>
                                <span style={{ marginLeft: 40 }}>{CARRIER.name}</span>
                            </td>
                            <td style={{ padding: 6, verticalAlign: 'bottom' }}>
                                Главный бухгалтер (или иное уполномоченное лицо):<br />
                                <div style={{ borderBottom: '1px solid #000', marginTop: 30, marginBottom: 4 }}></div>
                                <span style={{ fontSize: '8pt', color: '#666' }}>(подпись)</span>
                                <span style={{ marginLeft: 40 }}>__________________</span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div style={{ fontSize: '7pt', color: '#999', marginTop: 16, textAlign: 'center' }}>
                    Документ может быть подписан усиленной квалифицированной электронной подписью.
                    Форма соответствует Постановлению Правительства РФ № 1137 от 26.12.2011.
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
