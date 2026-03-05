'use client';

import { Camera, User, Wrench } from 'lucide-react';

interface Repair {
    id: string;
    vehicleId: string;
    status: string;
    description: string;
    priority: string;
    source: string;
    assignedTo?: string;
    totalCost: number;
    createdAt: string;
    photoUrls: string[];
}

const priorityConfig: Record<string, { label: string; color: string; dot: string }> = {
    low: { label: 'Низкий', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
    medium: { label: 'Средний', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
    high: { label: 'Высокий', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
    critical: { label: 'Критический', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

const sourceLabels: Record<string, string> = {
    auto_inspection: 'Из осмотра',
    driver: 'Водитель',
    mechanic: 'Механик',
    scheduled: 'Плановое ТО',
};

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function RepairCard({ repair }: { repair: Repair }) {
    const pr = priorityConfig[repair.priority] || priorityConfig.medium;

    return (
        <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm hover:shadow-md
            transition-shadow duration-200">
            {/* Priority & Source */}
            <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${pr.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${pr.dot}`} />
                    {pr.label}
                </span>
                <span className="text-xs text-slate-400">{sourceLabels[repair.source] || repair.source}</span>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-800 font-medium line-clamp-2 mb-2">
                {repair.description}
            </p>

            {/* Meta row */}
            <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-2">
                    {repair.assignedTo && (
                        <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {repair.assignedTo}
                        </span>
                    )}
                    {repair.photoUrls.length > 0 && (
                        <span className="flex items-center gap-0.5">
                            <Camera className="w-3 h-3" />
                            {repair.photoUrls.length}
                        </span>
                    )}
                </div>
                <span>{formatDate(repair.createdAt)}</span>
            </div>

            {/* Cost */}
            {repair.totalCost > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Wrench className="w-3 h-3" />
                        Затраты
                    </span>
                    <span className="text-xs font-semibold text-slate-700">
                        {repair.totalCost.toLocaleString()} ₽
                    </span>
                </div>
            )}
        </div>
    );
}
