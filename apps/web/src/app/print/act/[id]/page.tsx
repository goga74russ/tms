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

// CFG-1/OBS-1: реквизиты исполнителя акта — из организации-получателя счёта
// (data.carrierRequisites), не из build-env. Незаполненная орг → 'НЕ УСТАНОВЛЕНО',
// чтобы мисконфиг был сразу виден (не печатаем фиктивные реквизиты).
const NOT_SET = 'НЕ УСТАНОВЛЕНО';
type CarrierReq = { name?: string | null; inn?: string | null; kpp?: string | null; address?: string | null };
function carrierFrom(cr: CarrierReq | null | undefined) {
    return {
        name: cr?.name?.trim() || NOT_SET,
        inn: cr?.inn?.trim() || NOT_SET,
        kpp: cr?.kpp?.trim() || NOT_SET,
        address: cr?.address?.trim() || NOT_SET,
    };
}

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
    const CARRIER = carrierFrom(data.carrierRequisites);
    // Юр-аудит §1.1: type-guard — этот шаблон только для актов. УПД/СФ/корректировки
    // имеют свои шаблоны (роутинг печати исправлен в finance/page); но при прямом
    // заходе по ссылке покажем чёткое сообщение вместо ничтожного «акта».
    if (inv.type && inv.type !== 'act') {
        return (
            <div className="loading" style={{ padding: 24, maxWidth: 520 }}>
                Документ <b>{inv.number}</b> имеет тип «{inv.type}», а не «Акт».
                Откройте его в соответствующем шаблоне печати (кнопка «Печать» в реестре
                счетов выберет правильный автоматически).
            </div>
        );
    }
    // Юр-аудит §1.2: пустая таблица услуг. Раньше читали ТОЛЬКО legacy inv.tripRows
    // (заполняется из invoice_trips); документы, связанные через invoice_orders
    // (ручной выпуск), давали пустой акт → юр-ничтожный (ст.9 ФЗ-402). Теперь
    // fallback на inv.orders[] (API его отдаёт).
    const tripRows: any[] = Array.isArray(inv.tripRows) && inv.tripRows.length > 0
        ? inv.tripRows
        : (Array.isArray(inv.orders) ? inv.orders.map((o: any) => ({
            tripNumber: o.number ?? null,
            date: inv.createdAt,
            route: (o.loadingAddress && o.unloadingAddress) ? `${o.loadingAddress} → ${o.unloadingAddress}` : (o.cargoDescription ?? '—'),
            distanceKm: null,
            amount: o.allocatedAmount,
        })) : []);

    // Юр-аудит §1.2 #3: запрет печати акта без позиций — без перечня услуг документ
    // юр-ничтожен (нет обязательного реквизита «содержание факта хозяйственной жизни»,
    // ст. 9 ФЗ-402; заказчик не примет расход, ст. 252 НК).
    if (tripRows.length === 0) {
        return (
            <div className="loading" style={{ padding: 24, maxWidth: 540 }}>
                Акт <b>{inv.number}</b> не содержит позиций (рейсов/заявок) — печать запрещена:
                без перечня оказанных услуг документ юридически ничтожен (ст. 9 ФЗ-402).
                Свяжитесь с бухгалтером для пересчёта.
            </div>
        );
    }
    // C2: фактическая ставка НДС (из inv.vatRate или выведенная из сумм), не хардкод 20%.
    const subtotalNum = Number(inv.subtotal) || 0;
    const vatNum = Number(inv.vatAmount) || 0;
    const vatRatePct = inv.vatRate != null
        ? Number(inv.vatRate)
        : (subtotalNum > 0 && vatNum > 0 ? Math.round((vatNum / subtotalNum) * 100) : 0);
    const vatLabel = vatRatePct > 0 ? `НДС ${vatRatePct}%` : 'Без НДС';

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
                        <div style={{ fontSize: '8pt', color: '#555' }}>ИНН: {CARRIER.inn}{CARRIER.kpp && CARRIER.kpp !== 'НЕ УСТАНОВЛЕНО' ? ` / КПП: ${CARRIER.kpp}` : ' (ИП — без КПП)'}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>{CARRIER.address}</div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>ЗАКАЗЧИК:</div>
                        <div style={{ fontSize: '10pt' }}>{inv.contractorName || '—'}</div>
                        {inv.contractorInn && (
                            <div style={{ fontSize: '8pt', color: '#555' }}>ИНН: {inv.contractorInn}{inv.contractorKpp ? ` / КПП: ${inv.contractorKpp}` : ''}</div>
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
                    <div className="total-row"><span>{vatLabel}:</span><span>{money(inv.vatAmount)} ₽</span></div>
                    <div className="total-row-bold"><span>ИТОГО:</span><span>{money(inv.total)} ₽</span></div>
                </div>

                <div style={{ marginTop: 10, fontSize: '9pt', color: '#444' }}>
                    {/* Юр-аудит §1.4: формулировка НДС согласована с inv.includesVat
                        (ст. 168 ч.4 НК) — «в т.ч.» при НДС в составе vs «сверху» иначе. */}
                    Всего оказано услуг на сумму {money(inv.total)} руб. ({vatRatePct > 0
                        ? (inv.includesVat
                            ? `в т.ч. ${vatLabel}: ${money(inv.vatAmount)} руб.`
                            : `${vatLabel} сверху: ${money(inv.vatAmount)} руб.`)
                        : 'без НДС'}).
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
