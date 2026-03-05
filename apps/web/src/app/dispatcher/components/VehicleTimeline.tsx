'use client';

import { Clock } from 'lucide-react';

interface TimelineSegment {
    start: number; // hour 0-24
    end: number;
    type: string; // 'trip' | 'broken' | 'maintenance'
}

interface TimelineRow {
    vehicleId: string;
    plateNumber: string;
    segments: TimelineSegment[];
}

interface VehicleTimelineProps {
    data: TimelineRow[];
}

const SEGMENT_COLORS: Record<string, string> = {
    trip: '#3b82f6',
    broken: '#ef4444',
    maintenance: '#f59e0b',
};

const HOURS = Array.from({ length: 25 }, (_, i) => i);

export function VehicleTimeline({ data }: VehicleTimelineProps) {
    const currentHour = new Date().getHours();

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    Таймлайн занятости ТС
                </h3>
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: SEGMENT_COLORS.trip }} />
                        <span className="text-slate-500">Рейс</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: SEGMENT_COLORS.broken }} />
                        <span className="text-slate-500">Неисправен</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: SEGMENT_COLORS.maintenance }} />
                        <span className="text-slate-500">ТО</span>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                    {/* Hour labels */}
                    <div className="flex border-b border-slate-100">
                        <div className="w-28 flex-shrink-0" />
                        <div className="flex-1 flex">
                            {HOURS.map(h => (
                                <div
                                    key={h}
                                    className={`flex-1 text-center text-[10px] py-1.5 ${h === currentHour
                                            ? 'font-bold text-blue-600'
                                            : 'text-slate-400'
                                        }`}
                                >
                                    {h.toString().padStart(2, '0')}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Rows */}
                    {data.map((row) => (
                        <div
                            key={row.vehicleId}
                            className="flex items-center border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                        >
                            {/* Vehicle label */}
                            <div className="w-28 flex-shrink-0 px-3 py-3">
                                <span className="text-xs font-bold text-slate-700">
                                    {row.plateNumber}
                                </span>
                            </div>

                            {/* Timeline bar */}
                            <div className="flex-1 relative h-10 py-1.5">
                                {/* Grid lines */}
                                <div className="absolute inset-0 flex">
                                    {HOURS.map(h => (
                                        <div
                                            key={h}
                                            className={`flex-1 border-l ${h === currentHour
                                                    ? 'border-blue-300 border-dashed'
                                                    : 'border-slate-100'
                                                }`}
                                        />
                                    ))}
                                </div>

                                {/* Segments */}
                                {row.segments.map((seg, i) => {
                                    const left = `${(seg.start / 24) * 100}%`;
                                    const width = `${((seg.end - seg.start) / 24) * 100}%`;
                                    const color = SEGMENT_COLORS[seg.type] || '#94a3b8';

                                    return (
                                        <div
                                            key={i}
                                            className="absolute top-1.5 bottom-1.5 rounded-md transition-opacity hover:opacity-80"
                                            style={{
                                                left,
                                                width,
                                                backgroundColor: color,
                                                opacity: 0.85,
                                            }}
                                        />
                                    );
                                })}

                                {/* Current time indicator */}
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10"
                                    style={{ left: `${(currentHour / 24) * 100}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
