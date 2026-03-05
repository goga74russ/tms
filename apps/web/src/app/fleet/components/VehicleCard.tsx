'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ArrowLeft, Wrench, ShieldCheck, AlertTriangle, FileText } from 'lucide-react';

interface VehicleDetail {
    id: string;
    plateNumber: string;
    vin: string;
    make: string;
    model: string;
    year: number;
    bodyType: string;
    payloadCapacityKg: number;
    payloadVolumeM3?: number;
    status: string;
    currentOdometerKm: number;
    fuelTankLiters?: number;
    fuelNormPer100Km?: number;
    techInspectionExpiry?: string;
    osagoExpiry?: string;
    maintenanceNextDate?: string;
    maintenanceNextKm?: number;
    tachographCalibrationExpiry?: string;
    deadlines: Record<string, string | null>;
    isBlocked: boolean;
    repairs: Array<{
        id: string;
        status: string;
        description: string;
        priority: string;
        source: string;
        totalCost: number;
        createdAt: string;
    }>;
    permits: Array<{
        id: string;
        zoneType: string;
        zoneName: string;
        permitNumber: string;
        validFrom: string;
        validUntil: string;
        isActive: boolean;
    }>;
    fines: Array<{
        id: string;
        status: string;
        violationType: string;
        amount: number;
        violationDate: string;
    }>;
}

const priorityBadge: Record<string, string> = {
    low: 'bg-slate-100 text-slate-600',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
};

const repairStatusLabel: Record<string, string> = {
    created: 'Создана',
    waiting_parts: 'Ждёт з/ч',
    in_progress: 'В работе',
    done: 'Готово',
};

function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU');
}

function DeadlineBadge({ color, label }: { color: string | null; label: string }) {
    if (!color) return <span className="text-slate-400 text-xs">нет данных</span>;
    const styles: Record<string, string> = {
        green: 'bg-emerald-100 text-emerald-700',
        yellow: 'bg-amber-100 text-amber-700',
        red: 'bg-red-100 text-red-700',
        blocked: 'bg-red-200 text-red-800 font-bold',
    };
    const labels: Record<string, string> = {
        green: '>30 дней',
        yellow: '7–30 дней',
        red: '<7 дней!',
        blocked: 'ПРОСРОЧЕН',
    };
    return (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${styles[color]}`}>
            {label}: {labels[color]}
        </span>
    );
}

export function VehicleCard({ vehicleId, onBack }: { vehicleId: string; onBack: () => void }) {
    const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<'info' | 'repairs' | 'permits' | 'fines'>('info');

    useEffect(() => {
        loadVehicle();
    }, [vehicleId]);

    async function loadVehicle() {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/vehicles/${vehicleId}`);
            setVehicle(result.data);
        } catch (err) {
            console.error('Failed to load vehicle:', err);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (!vehicle) {
        return (
            <div className="p-6 text-center text-slate-500">
                <p>Транспортное средство не найдено</p>
                <button onClick={onBack} className="mt-4 text-indigo-600 text-sm hover:underline">← Назад</button>
            </div>
        );
    }

    const sections = [
        { id: 'info' as const, label: 'Информация', icon: FileText },
        { id: 'repairs' as const, label: `Ремонты (${vehicle.repairs.length})`, icon: Wrench },
        { id: 'permits' as const, label: `Пропуска (${vehicle.permits.length})`, icon: ShieldCheck },
        { id: 'fines' as const, label: `Штрафы (${vehicle.fines.length})`, icon: AlertTriangle },
    ];

    return (
        <div>
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-slate-600" />
                </button>
                <div>
                    <h2 className="text-lg font-bold text-slate-900 font-mono">{vehicle.plateNumber}</h2>
                    <p className="text-sm text-slate-500">{vehicle.make} {vehicle.model} ({vehicle.year})</p>
                </div>
                {vehicle.isBlocked && (
                    <span className="ml-auto px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full animate-pulse">
                        ⚠ ЗАБЛОКИРОВАН
                    </span>
                )}
            </div>

            {/* Section tabs */}
            <div className="px-4 border-b border-slate-200 flex gap-1">
                {sections.map(s => {
                    const Icon = s.icon;
                    return (
                        <button
                            key={s.id}
                            onClick={() => setActiveSection(s.id)}
                            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors
                                ${activeSection === s.id
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {s.label}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div className="p-6">
                {activeSection === 'info' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Basic info */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Основное</h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div><span className="text-slate-500">VIN:</span> <span className="font-mono">{vehicle.vin}</span></div>
                                <div><span className="text-slate-500">Тип кузова:</span> {vehicle.bodyType}</div>
                                <div><span className="text-slate-500">Грузоподъёмность:</span> {(vehicle.payloadCapacityKg / 1000).toFixed(1)} т</div>
                                {vehicle.payloadVolumeM3 && <div><span className="text-slate-500">Объём:</span> {vehicle.payloadVolumeM3} м³</div>}
                                <div><span className="text-slate-500">Пробег:</span> {vehicle.currentOdometerKm.toLocaleString()} км</div>
                                {vehicle.fuelTankLiters && <div><span className="text-slate-500">Бак:</span> {vehicle.fuelTankLiters} л</div>}
                                {vehicle.fuelNormPer100Km && <div><span className="text-slate-500">ГСМ-норма:</span> {vehicle.fuelNormPer100Km} л/100км</div>}
                            </div>
                        </div>

                        {/* Document deadlines */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Сроки документов</h3>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600">Техосмотр</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">{formatDate(vehicle.techInspectionExpiry)}</span>
                                        <DeadlineBadge color={vehicle.deadlines.techInspection} label="ТО" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600">ОСАГО</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">{formatDate(vehicle.osagoExpiry)}</span>
                                        <DeadlineBadge color={vehicle.deadlines.osago} label="ОСАГО" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600">ТО</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">{formatDate(vehicle.maintenanceNextDate)}</span>
                                        <DeadlineBadge color={vehicle.deadlines.maintenance} label="ТО" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-600">Тахограф</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">{formatDate(vehicle.tachographCalibrationExpiry)}</span>
                                        <DeadlineBadge color={vehicle.deadlines.tachograph} label="Тахограф" />
                                    </div>
                                </div>
                                {vehicle.maintenanceNextKm && (
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                        <span className="text-sm text-slate-600">Следующее ТО по пробегу</span>
                                        <span className="text-sm font-medium">{vehicle.maintenanceNextKm.toLocaleString()} км</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'repairs' && (
                    <div className="space-y-3">
                        {vehicle.repairs.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-8">Нет истории ремонтов</p>
                        ) : vehicle.repairs.map(r => (
                            <div key={r.id} className="flex items-start gap-4 p-4 rounded-lg border border-slate-100 hover:border-slate-200">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800 truncate">{r.description}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityBadge[r.priority] || ''}`}>
                                            {r.priority}
                                        </span>
                                        <span className="text-xs text-slate-400">{r.source}</span>
                                        <span className="text-xs text-slate-400">{formatDate(r.createdAt)}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-medium text-slate-600">{repairStatusLabel[r.status] || r.status}</span>
                                    {r.totalCost > 0 && (
                                        <p className="text-xs text-slate-400 mt-0.5">{r.totalCost.toLocaleString()} ₽</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeSection === 'permits' && (
                    <div className="space-y-3">
                        {vehicle.permits.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-8">Нет пропусков</p>
                        ) : vehicle.permits.map(p => (
                            <div key={p.id} className="flex items-center gap-4 p-4 rounded-lg border border-slate-100">
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-800">{p.zoneName}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">Пропуск: {p.permitNumber}</p>
                                </div>
                                <div className="text-right text-xs">
                                    <p className="text-slate-500">{formatDate(p.validFrom)} — {formatDate(p.validUntil)}</p>
                                    <span className={`inline-flex px-2 py-0.5 rounded-full mt-1 ${p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {p.isActive ? 'Действует' : 'Неактивен'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeSection === 'fines' && (
                    <div className="space-y-3">
                        {vehicle.fines.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-8">Нет штрафов</p>
                        ) : vehicle.fines.map(f => (
                            <div key={f.id} className="flex items-center gap-4 p-4 rounded-lg border border-slate-100">
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-800">{f.violationType}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(f.violationDate)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-900">{f.amount.toLocaleString()} ₽</p>
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs mt-1
                                        ${f.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                            f.status === 'new' ? 'bg-amber-100 text-amber-700' :
                                                f.status === 'appealed' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-slate-100 text-slate-600'}`}>
                                        {f.status === 'new' ? 'Новый' : f.status === 'confirmed' ? 'Подтверждён' : f.status === 'paid' ? 'Оплачен' : 'Обжалован'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
