'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = '/api';

type Claim = {
    id: string;
    tripId?: string | null;
    orderId?: string | null;
    contractorId?: string | null;
    type?: string | null;
    status: string;
    cause?: string | null;
    amount?: string | number | null;
    reserveAmount?: string | number | null;
    estimatedAmount?: string | number | null;
    resolvedAmount?: string | number | null;
    effectiveExposureAmount?: string | number | null;
    exposureBasis?: string | null;
    description: string;
    resolution?: string | null;
    settlementNote?: string | null;
    attachments?: unknown[];
    createdAt: string;
    resolvedAt?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
    damage: 'Повреждение',
    delay: 'Просрочка',
    loss: 'Утрата',
    other: 'Прочее',
};

const STATUS_LABELS: Record<string, string> = {
    open: 'Открыта',
    investigating: 'В работе',
    resolved: 'Урегулирована',
    rejected: 'Отклонена',
};

const CAUSE_LABELS: Record<string, string> = {
    shortage: 'Недостача',
    damage: 'Повреждение',
    delay: 'Задержка',
    downtime: 'Простой',
    refusal: 'Отказ',
    overage: 'Излишек',
    wrong_docs: 'Ошибки в документах',
    other: 'Прочее',
};

// CFG-1/OBS-1: реквизиты исполнителя — из организации претензии
// (claim.carrierRequisites), не из build-env. 'НЕ УСТАНОВЛЕНО' сигналит мисконфиг.
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

function fmt(value?: string | null) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function money(value: unknown) {
    if (value === null || value === undefined || value === '') return '-';
    const parsed = Number(typeof value === 'string' ? value.replace(/\s/g, '').replace(',', '.') : value);
    if (!Number.isFinite(parsed)) return '-';
    return parsed.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function evidenceText(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.length ? `${value.length} элементов` : null;
    if (typeof value === 'object') return 'предоставлено';
    return null;
}

function collectEvidence(claim: Claim) {
    const rows: Array<{ label: string; value: string }> = [];
    if (!Array.isArray(claim.attachments)) return rows;

    claim.attachments.forEach((attachment, index) => {
        if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
            const value = evidenceText(attachment);
            if (value) rows.push({ label: `Вложение ${index + 1}`, value });
            return;
        }

        const record = attachment as Record<string, unknown>;
        const nested = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
            ? record.metadata as Record<string, unknown>
            : {};
        const merged = { ...record, ...nested };
        const picked = Object.entries(merged)
            .filter(([key]) => !['kind', 'version', 'metadata'].includes(key))
            .map(([key, value]) => {
                const formatted = evidenceText(value);
                return formatted ? { label: key, value: formatted } : null;
            })
            .filter(Boolean) as Array<{ label: string; value: string }>;

        if (picked.length) rows.push(...picked.slice(0, 4));
        else rows.push({ label: `Вложение ${index + 1}`, value: 'предоставлено' });
    });

    return rows.slice(0, 8);
}

// BUG-2 (integration-pass-2026-06-11): в блоке «СВЯЗАННЫЕ ОБЪЕКТЫ» выводились
// сырые UUID. Резолвим человекочитаемые номера/имя по связанным сущностям
// (trip.number=TRP-…, order.number=ORD-…, contractor.name) с фолбэком на UUID,
// чтобы печать оставалась полной даже при недоступности связанной записи.
type RelatedLabels = { trip?: string; order?: string; contractor?: string };

export default function ClaimActPrintPage() {
    const params = useParams();
    const id = params?.id as string;
    const [claim, setClaim] = useState<Claim | null>(null);
    const [related, setRelated] = useState<RelatedLabels>({});
    const [error, setError] = useState<string | null>(null);
    const printedRef = useRef(false);

    useEffect(() => {
        if (!id) return;
        fetch(`${API_BASE}/claims/${id}`, { credentials: 'include' })
            .then(response => response.json())
            .then(json => {
                if (json.success) setClaim(json.data);
                else setError(json.error ?? 'Не удалось загрузить претензию');
            })
            .catch(err => setError(err.message));
    }, [id]);

    // Резолв номеров рейса/заявки и имени контрагента (одиночного GET для
    // контрагента нет — ищем в списке). Фейл любого запроса не ломает печать.
    useEffect(() => {
        if (!claim) return;
        let cancelled = false;
        (async () => {
            const next: RelatedLabels = {};
            const safeJson = async (url: string) => {
                try {
                    const r = await fetch(url, { credentials: 'include' });
                    if (!r.ok) return null;
                    const j = await r.json();
                    return j.success ? j.data : null;
                } catch { return null; }
            };
            if (claim.tripId) next.trip = (await safeJson(`${API_BASE}/trips/${claim.tripId}`))?.number ?? undefined;
            if (claim.orderId) next.order = (await safeJson(`${API_BASE}/orders/${claim.orderId}`))?.number ?? undefined;
            if (claim.contractorId) {
                const list = await safeJson(`${API_BASE}/fleet/contractors?limit=500`);
                const arr = Array.isArray(list) ? list : (list?.items ?? []);
                next.contractor = arr.find((c: { id?: string }) => c?.id === claim.contractorId)?.name ?? undefined;
            }
            if (!cancelled) setRelated(next);
        })();
        return () => { cancelled = true; };
    }, [claim]);

    useEffect(() => {
        if (!claim || printedRef.current) return;
        printedRef.current = true;
        const timer = window.setTimeout(() => window.print(), 400);
        return () => window.clearTimeout(timer);
    }, [claim]);

    if (error) return <div className="loading">Ошибка: {error}</div>;
    if (!claim) return <div className="loading">Загрузка акта претензии...</div>;

    const evidence = collectEvidence(claim);
    const CARRIER = carrierFrom((claim as { carrierRequisites?: CarrierReq }).carrierRequisites);
    const titleStatus = STATUS_LABELS[claim.status] ?? claim.status;
    const titleType = TYPE_LABELS[claim.type ?? ''] ?? claim.type ?? '-';
    const cause = CAUSE_LABELS[claim.cause ?? ''] ?? claim.cause ?? '-';

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>Закрыть</button>
            </div>

            <div className="print-page">
                <div className="doc-title">АКТ ПО ПРЕТЕНЗИИ</div>
                <div className="doc-subtitle">N {claim.id.slice(0, 8)} от {fmt(claim.createdAt)}</div>
                <div className="doc-subtitle">Статус: {titleStatus}</div>
                <hr />

                <div className="two-col" style={{ marginTop: 8 }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>ИСПОЛНИТЕЛЬ:</div>
                        <div style={{ fontSize: '10pt' }}>{CARRIER.name}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>ИНН: {CARRIER.inn}{CARRIER.kpp && CARRIER.kpp !== 'НЕ УСТАНОВЛЕНО' ? ` / КПП: ${CARRIER.kpp}` : ' (ИП — без КПП)'}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>{CARRIER.address}</div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>СВЯЗАННЫЕ ОБЪЕКТЫ:</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>Рейс: {claim.tripId ? (related.trip ?? `${claim.tripId.slice(0, 8)}…`) : '-'}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>Заявка: {claim.orderId ? (related.order ?? `${claim.orderId.slice(0, 8)}…`) : '-'}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>Контрагент: {claim.contractorId ? (related.contractor ?? `${claim.contractorId.slice(0, 8)}…`) : '-'}</div>
                    </div>
                </div>

                <div className="section-title">Суть претензии</div>
                <div className="field-row"><div className="field-label">Тип:</div><div className="field-value-bold">{titleType}</div></div>
                <div className="field-row"><div className="field-label">Причина:</div><div className="field-value">{cause}</div></div>
                <div className="field-row"><div className="field-label">Дата создания:</div><div className="field-value">{fmt(claim.createdAt)}</div></div>
                <div className="field-row"><div className="field-label">Дата закрытия:</div><div className="field-value">{fmt(claim.resolvedAt)}</div></div>
                <div style={{ marginTop: 6, fontSize: '10pt', lineHeight: 1.35 }}>{claim.description}</div>

                <div className="section-title">Финансовая оценка</div>
                <table>
                    <thead>
                        <tr>
                            <th>Показатель</th>
                            <th style={{ width: 140, textAlign: 'right' }}>Сумма, руб.</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>Заявленная сумма</td><td style={{ textAlign: 'right' }}>{money(claim.amount)}</td></tr>
                        <tr><td>Резерв</td><td style={{ textAlign: 'right' }}>{money(claim.reserveAmount)}</td></tr>
                        <tr><td>Оценка</td><td style={{ textAlign: 'right' }}>{money(claim.estimatedAmount)}</td></tr>
                        <tr><td>Эффективная экспозиция ({claim.exposureBasis ?? 'none'})</td><td style={{ textAlign: 'right' }}>{money(claim.effectiveExposureAmount)}</td></tr>
                        <tr><td>Итоговое урегулирование</td><td style={{ textAlign: 'right' }}>{money(claim.resolvedAmount)}</td></tr>
                    </tbody>
                </table>

                <div className="section-title">Доказательная база</div>
                {evidence.length === 0 ? (
                    <div style={{ fontSize: '9pt', color: '#666' }}>Доказательства не приложены.</div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: 180 }}>Поле</th>
                                <th>Значение</th>
                            </tr>
                        </thead>
                        <tbody>
                            {evidence.map((item, index) => (
                                <tr key={`${item.label}-${index}`}>
                                    <td>{item.label}</td>
                                    <td>{item.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div className="section-title">Решение и урегулирование</div>
                <div style={{ minHeight: 42, fontSize: '10pt', lineHeight: 1.35 }}>
                    {claim.resolution || 'Решение по претензии пока не зафиксировано.'}
                </div>
                {claim.settlementNote && (
                    <div style={{ marginTop: 8, fontSize: '9pt', color: '#444' }}>
                        Примечание по урегулированию: {claim.settlementNote}
                    </div>
                )}

                <div className="no-break">
                    <hr style={{ marginTop: 16 }} />
                    <div className="two-col" style={{ marginTop: 12 }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '9pt' }}>ОТВЕТСТВЕННЫЙ ТрансПульт:</div>
                            <div className="sig-line" style={{ width: 180, marginTop: 18 }} />
                            <div style={{ fontSize: '8pt', color: '#999' }}>(подпись / ФИО)</div>
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '9pt' }}>СТОРОНА ПРЕТЕНЗИИ:</div>
                            <div className="sig-line" style={{ width: 180, marginTop: 18 }} />
                            <div style={{ fontSize: '8pt', color: '#999' }}>(подпись / ФИО)</div>
                        </div>
                    </div>
                </div>

                <div className="footer-note">
                    Акт претензии {claim.id.slice(0, 8)} | {CARRIER.name} | Сформирован: {fmt(new Date().toISOString())}
                </div>
            </div>
        </>
    );
}
