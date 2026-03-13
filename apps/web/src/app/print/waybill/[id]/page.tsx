'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const API_BASE = '/api';
const TOKEN_KEY = 'tms_token';

function fmt(d: string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDt(d: string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function WaybillPrintPage() {
    const params = useParams();
    const id = params?.id as string;
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
        fetch(`${API_BASE}/waybills/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            credentials: 'include',
        })
            .then(r => r.json())
            .then(json => {
                if (json.success) setData(json.data);
                else setError(json.error ?? 'Ошибка загрузки');
            })
            .catch(e => setError(e.message));
    }, [id]);

    useEffect(() => {
        if (data) {
            const timer = setTimeout(() => window.print(), 400);
            return () => clearTimeout(timer);
        }
    }, [data]);

    if (error) return <div className="loading">Ошибка: {error}</div>;
    if (!data) return <div className="loading">Загрузка путевого листа…</div>;

    const w = data;
    const carrier = process.env.NEXT_PUBLIC_CARRIER_NAME ?? 'ООО «ТМС Логистик»';

    return (
        <>
            <div className="print-actions no-print">
                <button className="print-btn print-btn-primary" onClick={() => window.print()}>🖨 Печать</button>
                <button className="print-btn print-btn-secondary" onClick={() => window.close()}>✕ Закрыть</button>
            </div>

            <div className="print-page">
                {/* Шапка */}
                <div className="doc-header-row">
                    <div>
                        <div className="org-name">{carrier}</div>
                        <div style={{ fontSize: '9pt', color: '#555' }}>Транспортное предприятие</div>
                    </div>
                    <div className="doc-number">
                        <div style={{ fontSize: '9pt', color: '#555' }}>Форма № 4-П</div>
                        <div style={{ fontSize: '13pt', fontWeight: 700 }}>ПУТЕВОЙ ЛИСТ</div>
                        <div>№ {w.number}</div>
                        <div style={{ fontSize: '9pt' }}>от {fmt(w.issuedAt)}</div>
                    </div>
                </div>
                <hr />

                {/* ТС */}
                <div className="section-title">Транспортное средство</div>
                <div className="two-col">
                    <div>
                        <div className="field-row"><span className="field-label">Марка / Модель:</span><span className="field-value">{[w.vehicle?.make, w.vehicle?.model].filter(Boolean).join(' ') || '—'}</span></div>
                        <div className="field-row"><span className="field-label">Гос. номер:</span><span className="field-value-bold">{w.vehicle?.plateNumber || '—'}</span></div>
                    </div>
                    <div>
                        <div className="field-row"><span className="field-label">Одометр выезд, км:</span><span className="field-value">{w.odometerOut ?? '—'}</span></div>
                        <div className="field-row"><span className="field-label">Одометр возврат, км:</span><span className="field-value">{w.odometerIn ?? '—'}</span></div>
                        <div className="field-row"><span className="field-label">Топливо выдано, л:</span><span className="field-value">{w.fuelOut ?? '—'}</span></div>
                    </div>
                </div>

                {/* Водитель */}
                <div className="section-title">Водитель</div>
                <div className="two-col">
                    <div className="field-row"><span className="field-label">ФИО:</span><span className="field-value">{w.driver?.fullName || '—'}</span></div>
                    <div className="field-row"><span className="field-label">Удостоверение:</span><span className="field-value">{w.driver?.licenseNumber || '—'}</span></div>
                </div>

                {/* Штампы */}
                <div className="section-title">Штамп механика (технический осмотр)</div>
                <div className="two-col" style={{ marginBottom: 8 }}>
                    <div>
                        <div className="field-row"><span className="field-label">Решение:</span>
                            <span className={w.mechanicDecision === 'approved' ? 'stamp-approved' : 'stamp-rejected'}>
                                {w.mechanicDecision === 'approved' ? 'ДОПУЩЕН' : (w.mechanicDecision === 'rejected' ? 'НЕ ДОПУЩЕН' : '—')}
                            </span>
                        </div>
                    </div>
                    <div>
                        <div className="field-row"><span className="field-label">Время:</span><span className="field-value">{fmtDt(w.mechanicTime)}</span></div>
                        <div className="sig-line" style={{ width: 140 }} />
                        <div style={{ fontSize: '8pt', color: '#999' }}>(подпись механика)</div>
                    </div>
                </div>

                <div className="section-title">Штамп медика (медицинский осмотр)</div>
                <div className="two-col" style={{ marginBottom: 8 }}>
                    <div>
                        <div className="field-row"><span className="field-label">Решение:</span>
                            <span className={w.medicDecision === 'approved' ? 'stamp-approved' : 'stamp-rejected'}>
                                {w.medicDecision === 'approved' ? 'ДОПУЩЕН' : (w.medicDecision === 'rejected' ? 'НЕ ДОПУЩЕН' : '—')}
                            </span>
                        </div>
                    </div>
                    <div>
                        <div className="field-row"><span className="field-label">Время:</span><span className="field-value">{fmtDt(w.medicTime)}</span></div>
                        <div className="sig-line" style={{ width: 140 }} />
                        <div style={{ fontSize: '8pt', color: '#999' }}>(подпись медика)</div>
                    </div>
                </div>

                {/* Маршрут */}
                <div className="section-title">Маршрут и задание</div>
                <div className="two-col">
                    <div>
                        <div className="field-row"><span className="field-label">Рейс №:</span><span className="field-value">{w.trip?.number || '—'}</span></div>
                        <div className="field-row"><span className="field-label">Выезд:</span><span className="field-value">{fmtDt(w.departureAt)}</span></div>
                        <div className="field-row"><span className="field-label">Возврат:</span><span className="field-value">{fmtDt(w.returnAt)}</span></div>
                    </div>
                    <div>
                        <div className="field-row"><span className="field-label">Откуда:</span><span className="field-value">{w.loadingAddress || '—'}</span></div>
                        <div className="field-row"><span className="field-label">Куда:</span><span className="field-value">{w.unloadingAddress || '—'}</span></div>
                    </div>
                </div>

                {/* Подписи */}
                <hr style={{ marginTop: 16 }} />
                <div className="three-col" style={{ marginTop: 12 }}>
                    <div className="sig-item">
                        <div className="sig-label">Механик</div>
                        <div className="sig-line" />
                    </div>
                    <div className="sig-item">
                        <div className="sig-label">Медик</div>
                        <div className="sig-line" />
                    </div>
                    <div className="sig-item">
                        <div className="sig-label">Диспетчер</div>
                        <div className="sig-line" />
                    </div>
                </div>
                <div style={{ marginTop: 20 }}>
                    <div className="sig-label">Водитель (принял ТС)</div>
                    <div className="sig-line" style={{ width: 200 }} />
                    <div className="sig-name">{w.driver?.fullName}</div>
                </div>

                <div className="footer-note">
                    Путевой лист № {w.number} | {carrier} | Дата формирования: {fmt(new Date().toISOString())}
                </div>
            </div>
        </>
    );
}
