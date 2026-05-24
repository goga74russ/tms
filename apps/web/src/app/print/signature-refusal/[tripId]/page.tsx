'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = '/api';

type Refusal = {
    signerRole?: string | null;
    signerName?: string | null;
    reason?: string | null;
    evidenceUrl?: string | null;
    refusedAt?: string | null;
    notes?: string | null;
};

type TransportDocument = {
    id: string;
    type?: string | null;
    titleType?: string | null;
    titleNumber?: string | null;
    externalId?: string | null;
    status?: string | null;
    providerName?: string | null;
    providerStatus?: string | null;
    error?: string | null;
    metadata?: {
        signatureRefusals?: Refusal[];
    } | null;
};

type Dossier = {
    trip?: {
        id?: string | null;
        number?: string | null;
        status?: string | null;
    } | null;
    vehicle?: {
        plateNumber?: string | null;
        make?: string | null;
        model?: string | null;
    } | null;
    trailer?: {
        plateNumber?: string | null;
    } | null;
    driver?: {
        fullName?: string | null;
        phone?: string | null;
    } | null;
    orders?: Array<{
        number?: string | null;
        loadingAddress?: string | null;
        unloadingAddress?: string | null;
        contractor?: {
            name?: string | null;
            inn?: string | null;
        } | null;
    }>;
    transportDocuments?: {
        documents?: TransportDocument[];
    } | null;
};

// Carrier requisites — env-driven; 'НЕ УСТАНОВЛЕНО' fallback signals misconfig.
const CARRIER = {
    name: process.env.NEXT_PUBLIC_CARRIER_NAME ?? 'НЕ УСТАНОВЛЕНО',
    inn: process.env.NEXT_PUBLIC_CARRIER_INN ?? 'НЕ УСТАНОВЛЕНО',
    kpp: process.env.NEXT_PUBLIC_CARRIER_KPP ?? 'НЕ УСТАНОВЛЕНО',
    address: process.env.NEXT_PUBLIC_CARRIER_ADDRESS ?? 'НЕ УСТАНОВЛЕНО',
};

const DOCUMENT_LABELS: Record<string, string> = {
    waybill: 'Путевой лист',
    etrn: 'ЭТРН',
    ttn: 'ТТН',
    upd: 'УПД',
    act: 'Акт',
    transport_document: 'Транспортный документ',
};

function fmt(value?: string | null) {
    if (!value) return '-';
    return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function docLabel(doc?: TransportDocument | null) {
    const type = doc?.type || 'transport_document';
    const label = DOCUMENT_LABELS[type] || type;
    return doc?.titleType ? `${label} (${doc.titleType})` : label;
}

function latestRefusal(doc?: TransportDocument | null): Refusal | null {
    const refusals = doc?.metadata?.signatureRefusals;
    if (!Array.isArray(refusals) || refusals.length === 0) return null;
    return refusals.slice().sort((a, b) => {
        const left = a.refusedAt ? new Date(a.refusedAt).getTime() : 0;
        const right = b.refusedAt ? new Date(b.refusedAt).getTime() : 0;
        return right - left;
    })[0] ?? null;
}

export default function SignatureRefusalPrintPage() {
    const params = useParams();
    const tripId = params?.tripId as string;
    const [documentId, setDocumentId] = useState<string | null>(null);
    const [dossier, setDossier] = useState<Dossier | null>(null);
    const [error, setError] = useState<string | null>(null);
    const printedRef = useRef(false);

    useEffect(() => {
        setDocumentId(new URLSearchParams(window.location.search).get('documentId'));
    }, []);

    useEffect(() => {
        if (!tripId) return;
        fetch(`${API_BASE}/trips/${tripId}/dossier`, { credentials: 'include' })
            .then(response => response.json())
            .then(json => {
                if (json.success) setDossier(json.data);
                else setError(json.error ?? 'Не удалось загрузить досье рейса');
            })
            .catch(err => setError(err.message));
    }, [tripId]);

    const document = useMemo(() => {
        const docs = dossier?.transportDocuments?.documents || [];
        if (documentId) return docs.find(doc => doc.id === documentId) ?? null;
        return docs.find(doc => latestRefusal(doc)) ?? docs.find(doc => doc.status === 'rejected') ?? null;
    }, [documentId, dossier]);

    const refusal = latestRefusal(document);

    useEffect(() => {
        if (!dossier || printedRef.current) return;
        printedRef.current = true;
        const timer = window.setTimeout(() => window.print(), 400);
        return () => window.clearTimeout(timer);
    }, [dossier]);

    if (error) return <div className="loading">Ошибка: {error}</div>;
    if (!dossier) return <div className="loading">Загрузка акта отказа от подписи...</div>;

    const firstOrder = dossier.orders?.[0];

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>Закрыть</button>
            </div>

            <div className="print-page">
                <div className="doc-title">АКТ ОБ ОТКАЗЕ ОТ ПОДПИСИ</div>
                <div className="doc-subtitle">по рейсу {dossier.trip?.number || tripId} от {fmt(refusal?.refusedAt || new Date().toISOString())}</div>
                <hr />

                <div className="two-col" style={{ marginTop: 8 }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>Перевозчик:</div>
                        <div style={{ fontSize: '10pt' }}>{CARRIER.name}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>ИНН: {CARRIER.inn} / КПП: {CARRIER.kpp}</div>
                        <div style={{ fontSize: '8pt', color: '#555' }}>{CARRIER.address}</div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '9pt' }}>Рейс и транспорт:</div>
                        <div style={{ fontSize: '9pt' }}>Рейс: {dossier.trip?.number || tripId}</div>
                        <div style={{ fontSize: '9pt' }}>Статус: {dossier.trip?.status || '-'}</div>
                        <div style={{ fontSize: '9pt' }}>ТС: {[dossier.vehicle?.plateNumber, dossier.vehicle?.make, dossier.vehicle?.model].filter(Boolean).join(' ') || '-'}</div>
                        <div style={{ fontSize: '9pt' }}>Прицеп: {dossier.trailer?.plateNumber || '-'}</div>
                    </div>
                </div>

                <div className="section-title">Документ</div>
                <div className="field-row"><div className="field-label">Тип:</div><div className="field-value-bold">{docLabel(document)}</div></div>
                <div className="field-row"><div className="field-label">Внешний номер:</div><div className="field-value">{document?.externalId || document?.titleNumber || '-'}</div></div>
                <div className="field-row"><div className="field-label">Статус:</div><div className="field-value">{document?.status || '-'}</div></div>
                <div className="field-row"><div className="field-label">Провайдер:</div><div className="field-value">{document?.providerName || 'internal'} / {document?.providerStatus || '-'}</div></div>

                <div className="section-title">Отказ</div>
                <div className="field-row"><div className="field-label">Дата и время:</div><div className="field-value">{fmt(refusal?.refusedAt)}</div></div>
                <div className="field-row"><div className="field-label">Роль подписанта:</div><div className="field-value">{refusal?.signerRole || '-'}</div></div>
                <div className="field-row"><div className="field-label">ФИО подписанта:</div><div className="field-value-bold">{refusal?.signerName || '-'}</div></div>
                <div style={{ marginTop: 6, fontSize: '10pt', lineHeight: 1.35 }}>
                    Причина отказа: {refusal?.reason || document?.error || 'Причина не указана'}
                </div>
                {refusal?.notes && (
                    <div style={{ marginTop: 6, fontSize: '9pt', color: '#444' }}>
                        Примечание: {refusal.notes}
                    </div>
                )}
                {refusal?.evidenceUrl && (
                    <div style={{ marginTop: 6, fontSize: '9pt', color: '#444' }}>
                        Доказательство: {refusal.evidenceUrl}
                    </div>
                )}

                <div className="section-title">Маршрут и заявка</div>
                <table>
                    <tbody>
                        <tr><td style={{ width: 160 }}>Заказчик</td><td>{firstOrder?.contractor?.name || '-'}</td></tr>
                        <tr><td>ИНН заказчика</td><td>{firstOrder?.contractor?.inn || '-'}</td></tr>
                        <tr><td>Заявка</td><td>{firstOrder?.number || '-'}</td></tr>
                        <tr><td>Погрузка</td><td>{firstOrder?.loadingAddress || '-'}</td></tr>
                        <tr><td>Выгрузка</td><td>{firstOrder?.unloadingAddress || '-'}</td></tr>
                        <tr><td>Водитель</td><td>{dossier.driver?.fullName || '-'}</td></tr>
                    </tbody>
                </table>

                <div className="section-title">Подтверждение</div>
                <div style={{ minHeight: 48, fontSize: '10pt', lineHeight: 1.35 }}>
                    Настоящий акт фиксирует отказ от подписания указанного транспортного документа. Документ может быть приложен к бумажному досье рейса и использован для ручного закрытия исключения в document queue.
                </div>

                <div className="no-break">
                    <hr style={{ marginTop: 16 }} />
                    <div className="two-col" style={{ marginTop: 12 }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '9pt' }}>Представитель перевозчика:</div>
                            <div className="sig-line" style={{ width: 180, marginTop: 18 }} />
                            <div style={{ fontSize: '8pt', color: '#999' }}>(подпись / ФИО)</div>
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '9pt' }}>Сторона, отказавшаяся от подписи:</div>
                            <div className="sig-line" style={{ width: 180, marginTop: 18 }} />
                            <div style={{ fontSize: '8pt', color: '#999' }}>(подпись при наличии / ФИО)</div>
                        </div>
                    </div>
                </div>

                <div className="footer-note">
                    Акт отказа от подписи | рейс {dossier.trip?.number || tripId} | сформирован: {fmt(new Date().toISOString())}
                </div>
            </div>
        </>
    );
}
