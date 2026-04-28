'use client';

import { Search, X } from 'lucide-react';

interface OrderFiltersProps {
    filters: {
        contractorId?: string;
        dateFrom?: string;
        dateTo?: string;
        search?: string;
    };
    onFiltersChange: (filters: {
        contractorId?: string;
        dateFrom?: string;
        dateTo?: string;
        search?: string;
    }) => void;
    contractors: { id: string; name: string }[];
}

export function OrderFilters({ filters, onFiltersChange, contractors }: OrderFiltersProps) {
    const hasActiveFilters = !!(filters.contractorId || filters.dateFrom || filters.dateTo || filters.search);

    return (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Поиск по номеру, грузу, адресу..."
                        value={filters.search || ''}
                        onChange={(e) => onFiltersChange({ ...filters, search: e.target.value || undefined })}
                        className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>

                {/* Client */}
                <select
                    value={filters.contractorId || ''}
                    onChange={(e) => onFiltersChange({ ...filters, contractorId: e.target.value || undefined })}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[180px]"
                >
                    <option value="">Все клиенты</option>
                    {contractors.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>

                {/* Date from */}
                <input
                    type="date"
                    value={filters.dateFrom || ''}
                    onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value || undefined })}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Дата от"
                />

                {/* Date to */}
                <input
                    type="date"
                    value={filters.dateTo || ''}
                    onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value || undefined })}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Дата до"
                />

                {/* Clear */}
                {hasActiveFilters && (
                    <button
                        onClick={() => onFiltersChange({})}
                        className="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 flex items-center gap-1 transition-colors"
                    >
                        <X className="w-4 h-4" />
                        Сбросить
                    </button>
                )}
            </div>
        </div>
    );
}
