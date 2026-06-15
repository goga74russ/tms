'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { WAYBILL_STATUS, label } from '@tms/shared';

const API_BASE = '/api';

function fmtDate(value: string | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function fmtDateTime(value: string | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function valueOrDash(value: unknown) {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
}

export default function EtrnPreviewPage() {
    const params = useParams();
    const id = params?.id as string;
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;

        fetch(`${API_BASE}/waybills/${id}`, { credentials: 'include' })
            .then(r => r.json())
            .then(json => {
                if (json.success) {
                    setData(json.data);
                    return;
                }
                setError(json.error ?? 'Ошибка загрузки ЭТрН');
            })
            .catch(e => setError(e.message));
    }, [id]);

    if (error) return <div className="loading">Ошибка: {error}</div>;
    if (!data) return <div className="loading">Загрузка предпросмотра ЭТрН…</div>;

    // CFG-1/OBS-1: реквизиты перевозчика — из организации рейса (data.carrierRequisites),
    // не из build-env. Никаких фейковых заглушек: официальная ЭТрН с фиктивными
    // реквизитами юридически недействительна, поэтому при незаполненной орг — гейт.
    const cr = (data.carrierRequisites ?? {}) as { name?: string | null; inn?: string | null; address?: string | null };
    const carrierNameRaw = (cr.name ?? '').trim();
    const carrierInnRaw = (cr.inn ?? '').trim();
    const carrierAddressRaw = (cr.address ?? '').trim();

    // ИНН перевозчика обязателен и должен быть валидным (10 или 12 цифр, не нули).
    const carrierInnValid = /^\d{10}$|^\d{12}$/.test(carrierInnRaw) && !/^0+$/.test(carrierInnRaw);
    const carrierConfigured = carrierNameRaw !== '' && carrierInnValid;

    if (!carrierConfigured) {
        return (
            <div className="print-page">
                <div
                    role="alert"
                    style={{
                        border: '1px solid #b91c1c',
                        background: '#fef2f2',
                        color: '#7f1d1d',
                        borderRadius: 8,
                        padding: 16,
                        lineHeight: 1.55,
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        Реквизиты перевозчика не настроены
                    </div>
                    <p>
                        Невозможно сформировать ЭТрН: не заданы корректные реквизиты перевозчика
                        (наименование и/или ИНН). Документ не может быть выпущен с фиктивными
                        реквизитами. Обратитесь к администратору.
                    </p>
                </div>
            </div>
        );
    }

    const carrierName = carrierNameRaw;
    const carrierInn = carrierInnRaw;
    const carrierAddress = carrierAddressRaw || '—';

    const vehicleName = [data.vehicle?.make, data.vehicle?.model].filter(Boolean).join(' ') || '—';
    const shipperName = data.contractor?.name || data.contractorName || '—';
    const shipperInn = data.contractor?.inn || '—';
    const shipperKpp = data.contractor?.kpp || '—';
    const shipperAddress = data.contractor?.legalAddress || data.loadingAddress || '—';
    // A4 (код-аудит 2026-06-14): грузополучатель — это контрагент, не место
    // выгрузки. Имя/адрес берём из consigneeContractor (юр.реквизиты), а
    // unloadingAddress показываем отдельной строкой «Место выгрузки». Совпадает
    // с серверным A3 и 422-гейтом CONSIGNEE_REQUISITES_MISSING.
    const consigneeName = data.consigneeContractor?.name || '—';
    const consigneeInn = data.consigneeContractor?.inn || '—';
    const consigneeKpp = data.consigneeContractor?.kpp || '—';
    const consigneeAddress = data.consigneeContractor?.legalAddress || '—';

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>Закрыть</button>
            </div>

            <div className="print-page">
                <div className="doc-header-row">
                    <div>
                        <div className="org-name">{carrierName}</div>
                        <div style={{ fontSize: '10pt', color: '#475569', marginTop: 4 }}>
                            Предпросмотр ЭТрН по путевому листу {valueOrDash(data.number)}
                        </div>
                    </div>
                    <div className="doc-number">
                        <div style={{ fontSize: '13pt', fontWeight: 700 }}>ЭЛЕКТРОННАЯ ТРАНСПОРТНАЯ НАКЛАДНАЯ</div>
                        <div>Путевой лист: {valueOrDash(data.number)}</div>
                        <div>Дата выдачи: {fmtDate(data.issuedAt)}</div>
                    </div>
                </div>

                <hr />

                <div className="section-title">Состав документа</div>
                <div className="two-col">
                    <div>
                        <div className="field-row"><span className="field-label">Тип документа:</span><span className="field-value">ЭТрН XML</span></div>
                        <div className="field-row"><span className="field-label">Титул:</span><span className="field-value">Титул 1, перевозка</span></div>
                        <div className="field-row"><span className="field-label">Рейс:</span><span className="field-value">{valueOrDash(data.trip?.number)}</span></div>
                    </div>
                    <div>
                        <div className="field-row"><span className="field-label">Дата формирования:</span><span className="field-value">{fmtDateTime(data.issuedAt)}</span></div>
                        <div className="field-row"><span className="field-label">Статус путевого листа:</span><span className="field-value">{data.status ? label(WAYBILL_STATUS, data.status) : '—'}</span></div>
                        <div className="field-row"><span className="field-label">Перевозчик:</span><span className="field-value">{carrierName}</span></div>
                    </div>
                </div>

                <div className="section-title">Участники перевозки</div>
                <div className="three-col">
                    <div>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Грузоотправитель</div>
                        <div className="field-row"><span className="field-label">Наименование:</span><span className="field-value">{shipperName}</span></div>
                        <div className="field-row"><span className="field-label">ИНН:</span><span className="field-value">{shipperInn}</span></div>
                        <div className="field-row"><span className="field-label">КПП:</span><span className="field-value">{shipperKpp}</span></div>
                        <div className="field-row"><span className="field-label">Адрес:</span><span className="field-value">{shipperAddress}</span></div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Грузополучатель</div>
                        <div className="field-row"><span className="field-label">Наименование:</span><span className="field-value">{consigneeName}</span></div>
                        <div className="field-row"><span className="field-label">ИНН:</span><span className="field-value">{consigneeInn}</span></div>
                        <div className="field-row"><span className="field-label">КПП:</span><span className="field-value">{consigneeKpp}</span></div>
                        <div className="field-row"><span className="field-label">Адрес:</span><span className="field-value">{consigneeAddress}</span></div>
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Перевозчик</div>
                        <div className="field-row"><span className="field-label">Наименование:</span><span className="field-value">{carrierName}</span></div>
                        <div className="field-row"><span className="field-label">ИНН:</span><span className="field-value">{carrierInn}</span></div>
                        <div className="field-row"><span className="field-label">Адрес:</span><span className="field-value">{carrierAddress}</span></div>
                    </div>
                </div>

                <div className="section-title">Груз и маршрут</div>
                <div className="two-col">
                    <div>
                        <div className="field-row"><span className="field-label">Описание груза:</span><span className="field-value">{valueOrDash(data.cargoDescription)}</span></div>
                        <div className="field-row"><span className="field-label">Масса:</span><span className="field-value">{data.cargoWeightKg ? `${data.cargoWeightKg} кг` : '—'}</span></div>
                        <div className="field-row"><span className="field-label">Погрузка:</span><span className="field-value">{valueOrDash(data.loadingAddress)}</span></div>
                        <div className="field-row"><span className="field-label">Выгрузка:</span><span className="field-value">{valueOrDash(data.unloadingAddress)}</span></div>
                    </div>
                    <div>
                        <div className="field-row"><span className="field-label">Выезд:</span><span className="field-value">{fmtDateTime(data.departureAt)}</span></div>
                        <div className="field-row"><span className="field-label">Возврат:</span><span className="field-value">{fmtDateTime(data.returnAt)}</span></div>
                        <div className="field-row"><span className="field-label">Одометр выезд:</span><span className="field-value">{valueOrDash(data.odometerOut)}</span></div>
                        <div className="field-row"><span className="field-label">Одометр возврат:</span><span className="field-value">{valueOrDash(data.odometerIn)}</span></div>
                    </div>
                </div>

                <div className="section-title">Транспорт и водитель</div>
                <div className="two-col">
                    <div>
                        <div className="field-row"><span className="field-label">ТС:</span><span className="field-value">{vehicleName}</span></div>
                        <div className="field-row"><span className="field-label">Госномер:</span><span className="field-value-bold">{valueOrDash(data.vehicle?.plateNumber)}</span></div>
                        <div className="field-row"><span className="field-label">VIN:</span><span className="field-value">{valueOrDash(data.vehicle?.vin)}</span></div>
                    </div>
                    <div>
                        <div className="field-row"><span className="field-label">Водитель:</span><span className="field-value">{valueOrDash(data.driver?.fullName)}</span></div>
                        <div className="field-row"><span className="field-label">ВУ:</span><span className="field-value">{valueOrDash(data.driver?.licenseNumber)}</span></div>
                    </div>
                </div>

                <div className="section-title">Что увидит оператор</div>
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, background: '#f8fafc', lineHeight: 1.55 }}>
                    <p>Этот экран показывает человекочитаемую структуру ЭТрН, которую система выгружает в XML.</p>
                    <p style={{ marginTop: 8 }}>Для юридически значимого обмена используется XML-файл, а этот preview нужен для проверки состава данных перед отправкой и для демонстрации бизнес-пользователям.</p>
                </div>

                <div className="footer-note">
                    ЭТрН preview | Путевой лист {valueOrDash(data.number)} | Сформировано {fmtDate(new Date().toISOString())}
                </div>
            </div>
        </>
    );
}
