'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    ReferenceLine,
    Tooltip,
    ResponsiveContainer,
    Dot,
} from 'recharts';
import { Loader2, RefreshCcw, Plus, Dices, AlertTriangle, Thermometer } from 'lucide-react';
import { READING_SOURCE_LABELS, label } from '@tms/shared';
import { api } from '@/lib/api';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUser } from '@/lib/user-context';

// ============================================================
// Cold Chain — Temperature panel for a trip
// ============================================================

interface TemperatureReading {
    id: string;
    tripId: string;
    recordedAt: string;
    tempC: number;
    source?: string;
    breach?: boolean;
    breachMinC?: number;
    breachMaxC?: number;
    latitude?: number;
    longitude?: number;
    sensorId?: string;
}

interface TemperatureSummary {
    minC: number | null;
    maxC: number | null;
    avgC: number | null;
    count: number;
    breachCount: number;
    slaMinC: number | null;
    slaMaxC: number | null;
    firstAt?: string | null;
    lastAt?: string | null;
}

interface Props {
    tripId: string;
    tripNumber?: string;
}

function formatTime(value: string | null | undefined) {
    if (!value) return '—';
    return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatTimeShort(value: string | null | undefined) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatTemp(v: number | null | undefined) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return `${Number(v).toFixed(1)} °C`;
}

export function TemperaturePanel({ tripId, tripNumber }: Props) {
    const { user } = useUser();
    // C9: гейт кнопки «Mock tick». Сервер (POST .../temperature-mock-tick)
    // требует РОВНО admin (isAdmin = roles.includes('admin')). Клиент включал
    // и dispatcher → диспетчер видел кнопку и ловил 403. Выравниваем: admin-only.
    const isAdmin = !!user?.roles?.includes('admin');

    const [summary, setSummary] = useState<TemperatureSummary | null>(null);
    const [readings, setReadings] = useState<TemperatureReading[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [addOpen, setAddOpen] = useState(false);
    const [addTemp, setAddTemp] = useState('');
    const [addSensorId, setAddSensorId] = useState('');
    const [addSubmitting, setAddSubmitting] = useState(false);
    const [addError, setAddError] = useState('');

    const [mockSubmitting, setMockSubmitting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [sumRes, readRes] = await Promise.all([
                api
                    .get<{ success: boolean; data: TemperatureSummary }>(
                        `/trips/${tripId}/temperature-summary`,
                    )
                    .catch(() => ({ success: false, data: null as any })),
                api
                    .get<{ success: boolean; data: TemperatureReading[] }>(
                        `/trips/${tripId}/temperature-readings?limit=200`,
                    )
                    .catch(() => ({ success: false, data: [] })),
            ]);
            setSummary(sumRes.success ? sumRes.data : null);
            setReadings(
                readRes.success && Array.isArray(readRes.data) ? readRes.data : [],
            );
        } catch (e: any) {
            setError(e?.message || 'Не удалось загрузить данные температуры');
        } finally {
            setLoading(false);
        }
    }, [tripId]);

    useEffect(() => {
        load();
    }, [load]);

    const submitAddReading = async () => {
        const tempC = Number(addTemp);
        if (!Number.isFinite(tempC)) {
            setAddError('Укажите корректную температуру');
            return;
        }
        try {
            setAddSubmitting(true);
            setAddError('');
            await api.post(`/trips/${tripId}/temperature-readings`, {
                tempC,
                sensorId: addSensorId.trim() || undefined,
                source: 'manual',
            });
            setAddOpen(false);
            setAddTemp('');
            setAddSensorId('');
            await load();
        } catch (e: any) {
            setAddError(e?.message || 'Не удалось сохранить замер');
        } finally {
            setAddSubmitting(false);
        }
    };

    const submitMockTick = async () => {
        try {
            setMockSubmitting(true);
            await api.post(`/trips/${tripId}/temperature-mock-tick`);
            await load();
        } catch (e: any) {
            setError(e?.message || 'Не удалось сгенерировать тестовый замер');
        } finally {
            setMockSubmitting(false);
        }
    };

    const slaMin = summary?.slaMinC ?? null;
    const slaMax = summary?.slaMaxC ?? null;

    // Build chart data — sorted by time ascending
    const chartData = [...readings]
        .sort(
            (a, b) =>
                new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
        )
        .map((r) => ({
            ts: new Date(r.recordedAt).getTime(),
            label: formatTimeShort(r.recordedAt),
            tempC: Number(r.tempC),
            breach: !!r.breach,
        }));

    const breachCount = summary?.breachCount ?? 0;
    const hasBreaches = breachCount > 0;

    // Last 50 readings (descending — newest first)
    const recentReadings = [...readings]
        .sort(
            (a, b) =>
                new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
        )
        .slice(0, 50);

    return (
        <div className="rounded-2xl border border-neutral-200 bg-white">
            <div className="border-b border-neutral-100 bg-gradient-to-r from-cyan-50 to-blue-50 px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="flex items-center gap-2 text-neutral-900 font-semibold">
                        <Thermometer className="w-4 h-4 text-blue-600" />
                        Температурный режим
                        {tripNumber && (
                            <span className="text-xs font-normal text-neutral-500">
                                · рейс {tripNumber}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
                        SLA контроль холодовой цепи и журнал замеров
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={load}
                        disabled={loading}
                    >
                        <RefreshCcw
                            className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`}
                        />
                        Обновить
                    </Button>
                    <Button size="sm" onClick={() => setAddOpen(true)}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Добавить замер
                    </Button>
                    {isAdmin && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={submitMockTick}
                            disabled={mockSubmitting}
                        >
                            {mockSubmitting ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <Dices className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Тестовый замер
                        </Button>
                    )}
                </div>
            </div>

            <div className="p-4 space-y-4">
                {error && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {error}
                    </div>
                )}

                {/* Summary tiles */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="rounded-xl border border-neutral-200 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                            SLA
                        </p>
                        <p className="text-sm font-semibold text-neutral-900 mt-1">
                            {slaMin !== null ? `${Number(slaMin).toFixed(1)}` : '—'}
                            {' / '}
                            {slaMax !== null ? `${Number(slaMax).toFixed(1)}` : '—'}{' '}
                            <span className="text-xs text-neutral-500">°C</span>
                        </p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                            Мин
                        </p>
                        <p className="text-sm font-semibold text-neutral-900 mt-1">
                            {formatTemp(summary?.minC ?? null)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                            Макс
                        </p>
                        <p className="text-sm font-semibold text-neutral-900 mt-1">
                            {formatTemp(summary?.maxC ?? null)}
                        </p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                            Средняя
                        </p>
                        <p className="text-sm font-semibold text-neutral-900 mt-1">
                            {formatTemp(summary?.avgC ?? null)}
                        </p>
                    </div>
                    <div
                        className={`rounded-xl border p-3 ${
                            hasBreaches
                                ? 'border-rose-300 bg-rose-50'
                                : 'border-neutral-200'
                        }`}
                    >
                        <p
                            className={`text-[11px] uppercase tracking-wide ${
                                hasBreaches ? 'text-rose-700' : 'text-neutral-500'
                            }`}
                        >
                            Нарушений
                        </p>
                        <p
                            className={`text-sm font-semibold mt-1 ${
                                hasBreaches ? 'text-rose-700' : 'text-neutral-900'
                            }`}
                        >
                            {breachCount} <span className="text-xs">из {summary?.count ?? 0}</span>
                        </p>
                    </div>
                </div>

                {/* Chart */}
                <div className="rounded-xl border border-neutral-200 p-3">
                    {loading ? (
                        <div className="h-64 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                        </div>
                    ) : chartData.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-neutral-400 text-sm">
                            <Thermometer className="w-8 h-8 mb-2" />
                            Нет данных о температуре
                        </div>
                    ) : (
                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer>
                                <LineChart
                                    data={chartData}
                                    margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
                                >
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fontSize: 11 }}
                                        stroke="#94a3b8"
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11 }}
                                        stroke="#94a3b8"
                                        unit="°"
                                    />
                                    <Tooltip
                                        formatter={(value: any) => [`${Number(value).toFixed(1)} °C`, 'Температура']}
                                    />
                                    {slaMin !== null && (
                                        <ReferenceLine
                                            y={Number(slaMin)}
                                            stroke="#0ea5e9"
                                            strokeDasharray="4 3"
                                            label={{
                                                value: `мин ${Number(slaMin).toFixed(1)}`,
                                                position: 'insideTopLeft',
                                                fill: '#0369a1',
                                                fontSize: 10,
                                            }}
                                        />
                                    )}
                                    {slaMax !== null && (
                                        <ReferenceLine
                                            y={Number(slaMax)}
                                            stroke="#ef4444"
                                            strokeDasharray="4 3"
                                            label={{
                                                value: `макс ${Number(slaMax).toFixed(1)}`,
                                                position: 'insideBottomLeft',
                                                fill: '#b91c1c',
                                                fontSize: 10,
                                            }}
                                        />
                                    )}
                                    <Line
                                        type="monotone"
                                        dataKey="tempC"
                                        stroke="#2563eb"
                                        strokeWidth={2}
                                        dot={(props: any) => {
                                            const { cx, cy, payload, index } = props;
                                            if (cx === undefined || cy === undefined) return <></> as any;
                                            const isBreach = payload?.breach;
                                            return (
                                                <Dot
                                                    key={`dot-${index}`}
                                                    cx={cx}
                                                    cy={cy}
                                                    r={isBreach ? 4 : 2.5}
                                                    fill={isBreach ? '#ef4444' : '#2563eb'}
                                                    stroke={isBreach ? '#b91c1c' : '#2563eb'}
                                                />
                                            );
                                        }}
                                        activeDot={{ r: 5 }}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Recent readings table */}
                <div className="rounded-xl border border-neutral-200 overflow-hidden">
                    <div className="bg-neutral-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 border-b border-neutral-100 flex items-center justify-between">
                        <span>Последние замеры ({recentReadings.length})</span>
                        {hasBreaches && (
                            <span className="inline-flex items-center gap-1 text-rose-700">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {breachCount} нарушений SLA
                            </span>
                        )}
                    </div>
                    {recentReadings.length === 0 ? (
                        <div className="px-3 py-6 text-sm text-neutral-400 text-center">
                            Замеров нет
                        </div>
                    ) : (
                        <div className="max-h-72 overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-neutral-50 sticky top-0">
                                    <tr className="text-neutral-500 text-left">
                                        <th className="px-3 py-2 font-medium">Время</th>
                                        <th className="px-3 py-2 font-medium">°C</th>
                                        <th className="px-3 py-2 font-medium">Источник</th>
                                        <th className="px-3 py-2 font-medium">Сенсор</th>
                                        <th className="px-3 py-2 font-medium">Статус</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {recentReadings.map((r) => (
                                        <tr
                                            key={r.id}
                                            className={r.breach ? 'bg-rose-50/60' : ''}
                                        >
                                            <td className="px-3 py-1.5 text-neutral-700">
                                                {formatTime(r.recordedAt)}
                                            </td>
                                            <td
                                                className={`px-3 py-1.5 font-semibold ${
                                                    r.breach
                                                        ? 'text-rose-700'
                                                        : 'text-neutral-900'
                                                }`}
                                            >
                                                {Number(r.tempC).toFixed(1)}
                                            </td>
                                            <td className="px-3 py-1.5 text-neutral-500">
                                                {label(READING_SOURCE_LABELS, r.source)}
                                            </td>
                                            <td className="px-3 py-1.5 text-neutral-500">
                                                {r.sensorId || '—'}
                                            </td>
                                            <td className="px-3 py-1.5">
                                                {r.breach ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Нарушение
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                                                        OK
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <Dialog
                open={addOpen}
                onClose={() => {
                    setAddOpen(false);
                    setAddError('');
                }}
                title="Добавить ручной замер"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                            Температура (°C) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            value={addTemp}
                            onChange={(e) => setAddTemp(e.target.value)}
                            placeholder="например, 4.2"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                            Сенсор (опционально)
                        </label>
                        <input
                            type="text"
                            value={addSensorId}
                            onChange={(e) => setAddSensorId(e.target.value)}
                            placeholder="ID сенсора"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                    </div>
                    {addError && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {addError}
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAddOpen(false)}
                            disabled={addSubmitting}
                        >
                            Отмена
                        </Button>
                        <Button
                            size="sm"
                            onClick={submitAddReading}
                            disabled={addSubmitting || !addTemp}
                        >
                            {addSubmitting && (
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            )}
                            Сохранить
                        </Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
