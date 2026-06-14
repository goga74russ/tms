'use client';

// ============================================================
// Корректировочный УПД (КУПД) / Исправленный УПД (ИУПД)
// P1-5 — зеркало corrective-sf для типа corrective_upd (Приказ ФНС
// ЕД-7-26/901@ + ст. 169 ч. 5.2 НК). До/после/разница — как в КСФ.
//   adjustment  → КУПД (на разницу)
//   replacement → ИУПД (на полную сумму взамен, аннулирует исходный)
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

// Реквизиты продавца — из организации счёта (③), не из build-env/хардкода.
const NOT_SET = 'НЕ УСТАНОВЛЕНО';
type CarrierReq = { name?: string | null; inn?: string | null; kpp?: string | null; address?: string | null };
function carrierFrom(cr: CarrierReq | null | undefined) {
    return {
        name: cr?.name?.trim() || NOT_SET,
        inn: cr?.inn?.trim() || NOT_SET,
        kpp: cr?.kpp?.trim() || '',
        address: cr?.address?.trim() || NOT_SET,
    };
}

export default function CorrectiveUpdPrintPage() {
    const params = useParams();
    const id = params?.id as string;
    const [data, setData] = useState<any>(null);
    const [original, setOriginal] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const printedRef = useRef(false);

    useEffect(() => {
        if (!id) return;
        fetch(`${API_BASE}/finance/invoices/${id}`, { credentials: 'include' })
            .then(r => r.json())
            .then(async (json) => {
                if (!json.success) { setError(json.error ?? 'Ошибка'); return; }
                setData(json.data);
                const relId = json.data.relatedInvoiceId;
                if (relId) {
                    const r2 = await fetch(`${API_BASE}/finance/invoices/${relId}`, { credentials: 'include' });
                    const j2 = await r2.json();
                    if (j2.success) setOriginal(j2.data);
                }
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
    if (!data) return <div className="loading">Загрузка корректировочного УПД…</div>;

    const inv = data;
    const CARRIER = carrierFrom(data.carrierRequisites);
    const isReplacement = inv.correctionKind === 'replacement';
    const title = isReplacement ? 'ИСПРАВЛЕНИЕ УПД' : 'КОРРЕКТИРОВОЧНЫЙ УПД';

    const origTotal = original ? Number(original.total) : null;
    const origVat = original ? Number(original.vatAmount) : null;
    const origSub = original ? Number(original.subtotal) : null;

    const newTotal = Number(inv.total);
    const newVat = Number(inv.vatAmount);
    const newSub = Number(inv.subtotal);

    const diff = origTotal != null ? newTotal - origTotal : null;
    const diffVat = origVat != null ? newVat - origVat : null;
    const diffSub = origSub != null ? newSub - origSub : null;

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>Закрыть</button>
            </div>

            <div className="print-page" style={{ fontFamily: 'Times New Roman, serif', fontSize: '10pt' }}>
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '14pt' }}>
                    {title} № {inv.number} от {fmt(inv.issuedAt ?? inv.createdAt)}
                </div>
                {original && (
                    <div style={{ textAlign: 'center', fontSize: '10pt', marginBottom: 4 }}>
                        К универсальному передаточному документу № <strong>{original.number}</strong> от{' '}
                        <strong>{fmt(original.issuedAt ?? original.createdAt)}</strong>
                    </div>
                )}
                <div style={{ textAlign: 'center', fontSize: '8pt', color: '#666', marginBottom: 12 }}>
                    {isReplacement
                        ? '(Исправленный УПД — заменяет исходный, ст. 169 НК + Приказ ФНС ЕД-7-26/901@)'
                        : '(Корректировочный УПД — на разницу, ст. 169 ч. 5.2 НК)'}
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: 8 }}>
                    <tbody>
                        <tr>
                            <td style={{ width: '50%', padding: '4px 8px', border: '1px solid #999', verticalAlign: 'top' }}>
                                <strong>Продавец:</strong><br />
                                {CARRIER.name}<br />
                                Адрес: {CARRIER.address}<br />
                                ИНН: {CARRIER.inn}{CARRIER.kpp ? ` / КПП: ${CARRIER.kpp}` : ' (ИП — без КПП)'}
                            </td>
                            <td style={{ padding: '4px 8px', border: '1px solid #999', verticalAlign: 'top' }}>
                                <strong>Покупатель:</strong><br />
                                {inv.contractorName ?? '—'}<br />
                                Адрес: {inv.contractorAddress ?? '—'}<br />
                                ИНН: {inv.contractorInn ?? '—'}{inv.contractorKpp ? ` / КПП: ${inv.contractorKpp}` : ''}
                            </td>
                        </tr>
                        <tr>
                            <td colSpan={2} style={{ padding: '4px 8px', border: '1px solid #999' }}>
                                <strong>Основание корректировки:</strong> {inv.correctionReason ?? inv.basisText ?? '—'}
                            </td>
                        </tr>
                    </tbody>
                </table>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginBottom: 8 }}>
                    <thead>
                        <tr style={{ background: '#eee' }}>
                            <th style={{ padding: 4, border: '1px solid #999' }}>Показатель</th>
                            {!isReplacement && (
                                <th style={{ padding: 4, border: '1px solid #999' }}>До изменения, ₽</th>
                            )}
                            <th style={{ padding: 4, border: '1px solid #999' }}>
                                {isReplacement ? 'Новое значение, ₽' : 'После изменения, ₽'}
                            </th>
                            {!isReplacement && (
                                <th style={{ padding: 4, border: '1px solid #999' }}>Разница, ₽</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ padding: 4, border: '1px solid #999' }}>Стоимость без НДС</td>
                            {!isReplacement && (
                                <td style={{ padding: 4, border: '1px solid #999', textAlign: 'right' }}>{money(origSub)}</td>
                            )}
                            <td style={{ padding: 4, border: '1px solid #999', textAlign: 'right' }}>{money(newSub)}</td>
                            {!isReplacement && (
                                <td style={{ padding: 4, border: '1px solid #999', textAlign: 'right', color: (diffSub ?? 0) >= 0 ? '#0a7' : '#c33' }}>
                                    {(diffSub ?? 0) >= 0 ? '+' : ''}{money(diffSub)}
                                </td>
                            )}
                        </tr>
                        <tr>
                            <td style={{ padding: 4, border: '1px solid #999' }}>Сумма НДС</td>
                            {!isReplacement && (
                                <td style={{ padding: 4, border: '1px solid #999', textAlign: 'right' }}>{money(origVat)}</td>
                            )}
                            <td style={{ padding: 4, border: '1px solid #999', textAlign: 'right' }}>{money(newVat)}</td>
                            {!isReplacement && (
                                <td style={{ padding: 4, border: '1px solid #999', textAlign: 'right', color: (diffVat ?? 0) >= 0 ? '#0a7' : '#c33' }}>
                                    {(diffVat ?? 0) >= 0 ? '+' : ''}{money(diffVat)}
                                </td>
                            )}
                        </tr>
                        <tr style={{ fontWeight: 700, background: '#f5f5f5' }}>
                            <td style={{ padding: 4, border: '1px solid #999' }}>Итого с НДС</td>
                            {!isReplacement && (
                                <td style={{ padding: 4, border: '1px solid #999', textAlign: 'right' }}>{money(origTotal)}</td>
                            )}
                            <td style={{ padding: 4, border: '1px solid #999', textAlign: 'right' }}>{money(newTotal)}</td>
                            {!isReplacement && (
                                <td style={{ padding: 4, border: '1px solid #999', textAlign: 'right', color: (diff ?? 0) >= 0 ? '#0a7' : '#c33' }}>
                                    {(diff ?? 0) >= 0 ? '+' : ''}{money(diff)}
                                </td>
                            )}
                        </tr>
                    </tbody>
                </table>

                {isReplacement && (
                    <div style={{ padding: 8, border: '1px solid #f59e0b', background: '#fffbeb', marginBottom: 12, fontSize: '9pt' }}>
                        <strong>Внимание:</strong> данный документ <strong>аннулирует</strong> исходный УПД № {original?.number ?? '—'}.
                        Согласно п. 7 ПП РФ 1137 — исходная запись в книге продаж аннулируется,
                        вместо неё проводится новая запись с реквизитами этого ИУПД.
                    </div>
                )}

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt', marginTop: 16 }}>
                    <tbody>
                        <tr>
                            <td style={{ padding: 6, verticalAlign: 'bottom', width: '50%' }}>
                                Руководитель организации:<br />
                                <div style={{ borderBottom: '1px solid #000', marginTop: 30, marginBottom: 4 }}></div>
                                <span style={{ fontSize: '8pt', color: '#666' }}>(подпись)</span>
                                <span style={{ marginLeft: 40 }}>{CARRIER.name}</span>
                            </td>
                            <td style={{ padding: 6, verticalAlign: 'bottom' }}>
                                Главный бухгалтер:<br />
                                <div style={{ borderBottom: '1px solid #000', marginTop: 30, marginBottom: 4 }}></div>
                                <span style={{ fontSize: '8pt', color: '#666' }}>(подпись)</span>
                                <span style={{ marginLeft: 40 }}>__________________</span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div style={{ fontSize: '7pt', color: '#999', marginTop: 16, textAlign: 'center' }}>
                    Корректировочный УПД составлен в соответствии со ст. 169 ч. 5.2 НК РФ,
                    Приказом ФНС России ЕД-7-26/901@ и Постановлением Правительства РФ № 1137.
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
