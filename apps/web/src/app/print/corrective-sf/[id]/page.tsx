'use client';

// ============================================================
// Корректировочный СФ (КСФ) / Исправленный СФ (ИСФ)
// per ст. 169 ч. 5.2 НК РФ + invoice-spec.md §5.
//
// Дополнительные обязательные реквизиты (spec §7):
//   1. Слова «Корректировочный счёт-фактура» / «Исправление №…»
//   2. Порядковый номер и дата КСФ/ИСФ
//   3. Реквизиты исходного СФ («к счёту-фактуре № … от …»)
//   4. По каждой строке: до изменения / после изменения / разница
//
// correction_kind определяет шапку:
//   adjustment → КСФ (на разницу)
//   replacement → ИСФ (на полную сумму взамен)
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

export default function CorrectiveSfPrintPage() {
    const params = useParams();
    const id = params?.id as string;
    const [data, setData] = useState<any>(null);
    const [original, setOriginal] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const printedRef = useRef(false);

    useEffect(() => {
        if (!id) return;
        // Fetch the correction itself first
        fetch(`${API_BASE}/finance/invoices/${id}`, { credentials: 'include' })
            .then(r => r.json())
            .then(async (json) => {
                if (!json.success) { setError(json.error ?? 'Ошибка'); return; }
                setData(json.data);
                // Fetch original via related_invoice_id (если присутствует)
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
    if (!data) return <div className="loading">Загрузка корректировочного СФ…</div>;

    const inv = data;
    const isReplacement = inv.correctionKind === 'replacement';
    const title = isReplacement ? 'ИСПРАВЛЕНИЕ' : 'КОРРЕКТИРОВОЧНЫЙ СЧЁТ-ФАКТУРА';

    // Original totals
    const origTotal = original ? Number(original.total) : null;
    const origVat = original ? Number(original.vatAmount) : null;
    const origSub = original ? Number(original.subtotal) : null;

    // Корректировка
    const newTotal = Number(inv.total);
    const newVat = Number(inv.vatAmount);
    const newSub = Number(inv.subtotal);

    // Для adjustment — разница; для replacement — это полная новая сумма.
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
                        К счёту-фактуре № <strong>{original.number}</strong> от{' '}
                        <strong>{fmt(original.issuedAt ?? original.createdAt)}</strong>
                    </div>
                )}
                <div style={{ textAlign: 'center', fontSize: '8pt', color: '#666', marginBottom: 12 }}>
                    {isReplacement
                        ? '(Исправленный счёт-фактура — заменяет исходный, ст. 169 НК)'
                        : '(Корректировочный СФ — на разницу, ст. 169 ч. 5.2 НК)'}
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

                {/* Таблица: до / после / разница (для adjustment); только новая (для replacement) */}
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
                                <td style={{
                                    padding: 4, border: '1px solid #999', textAlign: 'right',
                                    color: (diffSub ?? 0) >= 0 ? '#0a7' : '#c33',
                                }}>
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
                                <td style={{
                                    padding: 4, border: '1px solid #999', textAlign: 'right',
                                    color: (diffVat ?? 0) >= 0 ? '#0a7' : '#c33',
                                }}>
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
                                <td style={{
                                    padding: 4, border: '1px solid #999', textAlign: 'right',
                                    color: (diff ?? 0) >= 0 ? '#0a7' : '#c33',
                                }}>
                                    {(diff ?? 0) >= 0 ? '+' : ''}{money(diff)}
                                </td>
                            )}
                        </tr>
                    </tbody>
                </table>

                {isReplacement && (
                    <div style={{
                        padding: 8, border: '1px solid #f59e0b', background: '#fffbeb',
                        marginBottom: 12, fontSize: '9pt'
                    }}>
                        <strong>Внимание:</strong> данный документ <strong>аннулирует</strong> исходный СФ № {original?.number ?? '—'}.
                        Согласно п. 7 ПП РФ 1137 — исходная запись в книге продаж аннулируется,
                        вместо неё проводится новая запись с реквизитами этого ИСФ.
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
                    Корректировочный документ составлен в соответствии с ст. 169 ч. 5.2 НК РФ
                    и Постановлением Правительства РФ № 1137 от 26.12.2011.
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
