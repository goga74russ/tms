'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

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

    const carrierName = process.env.NEXT_PUBLIC_CARRIER_NAME ?? 'ООО «ТМС Логистик»';
    const carrierInn = process.env.NEXT_PUBLIC_CARRIER_INN ?? '0000000000';
    const carrierAddress = process.env.NEXT_PUBLIC_CARRIER_ADDRESS ?? 'г. Москва';

    const vehicleName = [data.vehicle?.make, data.vehicle?.model].filter(Boolean).join(' ') || '—';
    const shipperName = data.contractor?.name || data.contractorName || '—';
    const shipperInn = data.contractor?.inn || '—';
    const shipperKpp = data.contractor?.kpp || '—';
    const shipperAddress = data.contractor?.legalAddress || data.loadingAddress || '—';
    const consigneeName = data.consigneeContractor?.name || data.unloadingAddress || '—';
    const consigneeInn = data.consigneeContractor?.inn || '—';
    const consigneeKpp = data.consigneeContractor?.kpp || '—';
    const consigneeAddress = data.unloadingAddress || '—';

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
                        <div className="field-row"><span className="field-label">Статус путевого листа:</span><span className="field-value">{valueOrDash(data.status)}</span></div>
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
