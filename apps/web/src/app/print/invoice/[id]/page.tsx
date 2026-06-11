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

// CFG-1/OBS-1 (demo-readiness 2026-06-11): реквизиты исполнителя берём из данных
// счёта (data.carrierRequisites = организация-получатель платежа), а не из
// build-env NEXT_PUBLIC_CARRIER_*. Юр-аудит §2.1/§2.2: банк/счёт/ИНН не
// хардкодим — при незаполненной орг показываем 'НЕ УСТАНОВЛЕНО' и гейтим печать.
// ③ (миг.0048): наименование банка и корр.счёт теперь в орг-модели (bankName/corrAccount).
const NOT_SET = 'НЕ УСТАНОВЛЕНО';
type CarrierReq = { name?: string | null; inn?: string | null; kpp?: string | null; address?: string | null; bankBik?: string | null; bankAccount?: string | null; bankName?: string | null; corrAccount?: string | null };
function carrierFrom(cr: CarrierReq | null | undefined) {
    return {
        name: cr?.name?.trim() || NOT_SET,
        inn: cr?.inn?.trim() || NOT_SET,
        kpp: cr?.kpp?.trim() || '', // ИП — без КПП
        address: cr?.address?.trim() || NOT_SET,
        bank: cr?.bankName?.trim() || NOT_SET,
        bik: cr?.bankBik?.trim() || NOT_SET,
        account: cr?.bankAccount?.trim() || NOT_SET,
        corr: cr?.corrAccount?.trim() || NOT_SET,
    };
}

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

    const CARRIER = carrierFrom(data.carrierRequisites);

    // Юр-аудит §9 #5: блокировка печати счёта при ненастроенных реквизитах
    // исполнителя — иначе уйдёт счёт без банка/ИНН (клиент не сможет оплатить
    // или оплатит не туда). Реквизиты резолвятся из организации-получателя счёта.
    if (CARRIER.name === NOT_SET || CARRIER.inn === NOT_SET || CARRIER.account === NOT_SET) {
        return (
            <div className="loading" style={{ padding: 24, maxWidth: 540 }}>
                Реквизиты исполнителя (наименование / ИНН / расчётный счёт) не настроены
                в профиле организации. Печать счёта с пустыми реквизитами недопустима —
                заполните банковские реквизиты в настройках организации.
            </div>
        );
    }

    const inv = data;
    const tripCount = Array.isArray(inv.tripIds) ? inv.tripIds.length : 1;
    const pricePerTrip = tripCount ? Number(inv.subtotal) / tripCount : Number(inv.subtotal);

    // P1-A (web-P1-6): заголовок по типу документа + ставка НДС из данных счёта
    // (был хардкод «СЧЁТ НА ОПЛАТУ» + «НДС 20%» для всех типов → СФ/УПД печатались
    // как счёт с неверным НДС).
    const DOC_TITLES: Record<string, string> = {
        payment: 'СЧЁТ НА ОПЛАТУ',
        advance: 'СЧЁТ НА ОПЛАТУ (АВАНС)',
        sf: 'СЧЁТ-ФАКТУРА',
        upd: 'УНИВЕРСАЛЬНЫЙ ПЕРЕДАТОЧНЫЙ ДОКУМЕНТ (УПД)',
        corrective_sf: 'КОРРЕКТИРОВОЧНЫЙ СЧЁТ-ФАКТУРА',
        corrective_upd: 'КОРРЕКТИРОВОЧНЫЙ УПД',
        act: 'АКТ ВЫПОЛНЕННЫХ РАБОТ',
    };
    const docTitle = DOC_TITLES[inv.type as string] ?? 'СЧЁТ НА ОПЛАТУ';
    const vatRateNum = Number(inv.vatRate ?? 0);
    const vatAmountNum = Number(inv.vatAmount ?? 0);
    const hasVat = vatRateNum > 0 && vatAmountNum > 0;
    const vatLabel = hasVat ? `НДС ${vatRateNum}%` : 'Без НДС';
    // «Счёт действителен 10 дней» — только для платёжных/авансовых счетов.
    const isPayable = inv.type === 'payment' || inv.type === 'advance';

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
                            <div style={{ fontSize: '9pt', color: '#555' }}>ИНН: {CARRIER.inn}{CARRIER.kpp && CARRIER.kpp !== 'НЕ УСТАНОВЛЕНО' ? ` / КПП: ${CARRIER.kpp}` : ' (ИП — без КПП)'}</div>
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
                <div className="doc-title">{docTitle}</div>
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
                        <span className="field-value" style={{ fontSize: '8pt', color: '#555' }}>ИНН: {inv.contractorInn}{inv.contractorKpp ? ` КПП: ${inv.contractorKpp}` : ''}</span>
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
                    <div className="total-row"><span>{vatLabel}:</span><span>{hasVat ? `${money(inv.vatAmount)} ₽` : '—'}</span></div>
                    <div className="total-row-bold"><span>К ОПЛАТЕ:</span><span>{money(inv.total)} ₽</span></div>
                </div>

                <div style={{ marginTop: 10, fontSize: '9pt', color: '#444' }}>
                    {/* Юр-аудит §1.4: формулировка по inv.includesVat (ст. 168 ч.4 НК). */}
                    Всего к оплате: {money(inv.total)} руб. {hasVat
                        ? (inv.includesVat
                            ? `(в т.ч. НДС ${vatRateNum}%: ${money(inv.vatAmount)} руб.)`
                            : `(НДС ${vatRateNum}% сверху: ${money(inv.vatAmount)} руб.)`)
                        : '(НДС не облагается)'}
                </div>
                {isPayable && (
                    <div style={{ marginTop: 4, fontSize: '9pt', color: '#e65c00' }}>
                        Счёт действителен 10 дней с даты выставления.
                    </div>
                )}

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
