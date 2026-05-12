"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { DataTable, type Column, Pill, type PillTone } from "@/components/ui/data-table";
import { Receipt, FileText, CheckCircle2 } from "lucide-react";

// ——— Types ———
interface Tariff {
    id: string;
    contractorName: string;
    contractName: string;
    type: 'per_km' | 'per_ton' | 'per_hour' | 'fixed_route' | 'combined';
    rate: string;
    modifiers: string[];
    vatIncluded: boolean;
    vatRate: number;
    roundingPrecision: number;
    minTripCost: number;
    active: boolean;
}

const TYPE_LABELS: Record<string, string> = {
    per_km: 'За км',
    per_ton: 'За тонну',
    per_hour: 'За час',
    fixed_route: 'Фикс маршрут',
    combined: 'Комби',
};

const TYPE_TONES: Record<string, PillTone> = {
    per_km: 'info',
    per_ton: 'brand',
    per_hour: 'warning',
    fixed_route: 'success',
    combined: 'neutral',
};

function rateAsNumber(rate: string): number {
    const cleaned = String(rate ?? '').replace(/[^\d.,-]/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
}

export default function TariffsPage() {
    const { toast } = useToast();
    const [tariffs, setTariffs] = useState<Tariff[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('');

    useEffect(() => {
        api.get<{ success: boolean; data: Tariff[] }>('/auth/tariffs')
            .then(res => setTariffs(res.data))
            .catch(err => toast({ variant: 'error', title: 'Не удалось загрузить тарифы', description: err?.message }))
            .finally(() => setLoading(false));
    }, [toast]);

    const filtered = filterType ? tariffs.filter(t => t.type === filterType) : tariffs;
    const activeCount = tariffs.filter(t => t.active).length;

    const columns: Column<Tariff>[] = [
        {
            id: 'contractorName',
            header: 'Контрагент',
            accessor: (r) => r.contractorName,
            cell: (r) => <span className="font-medium text-slate-900">{r.contractorName}</span>,
            sortable: true,
            sticky: 'left',
            minWidth: '200px',
        },
        {
            id: 'contractName',
            header: 'Договор',
            accessor: (r) => r.contractName,
            cell: (r) => <span className="font-medium text-brand-600">{r.contractName}</span>,
            minWidth: '180px',
        },
        {
            id: 'type',
            header: 'Тип',
            accessor: (r) => TYPE_LABELS[r.type] ?? r.type,
            cell: (r) => <Pill tone={TYPE_TONES[r.type] ?? 'neutral'}>{TYPE_LABELS[r.type] ?? r.type}</Pill>,
            width: '140px',
        },
        {
            id: 'rate',
            header: 'Ставка',
            accessor: (r) => rateAsNumber(r.rate),
            cell: (r) => <span className="font-semibold text-slate-900">{r.rate}</span>,
            sortable: true,
            align: 'right',
            width: '130px',
        },
        {
            id: 'modifiers',
            header: 'Модификаторы',
            accessor: (r) => r.modifiers.join(', '),
            cell: (r) => (
                <div className="flex flex-wrap gap-1">
                    {r.modifiers.length > 0
                        ? r.modifiers.map((m, i) => (
                            <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{m}</span>
                        ))
                        : <span className="text-xs text-slate-400">—</span>
                    }
                </div>
            ),
            minWidth: '180px',
        },
        {
            id: 'vat',
            header: 'НДС',
            accessor: (r) => r.vatRate,
            cell: (r) => (
                <span className="text-slate-600 text-sm">
                    {r.vatRate > 0 ? `${r.vatRate}% ${r.vatIncluded ? '(вкл.)' : '(сверху)'}` : 'Без НДС'}
                </span>
            ),
            width: '130px',
        },
        {
            id: 'minTripCost',
            header: 'Мин. стоимость',
            accessor: (r) => r.minTripCost,
            cell: (r) => (
                <span className="text-slate-600 text-sm">
                    {r.minTripCost > 0 ? `${r.minTripCost.toLocaleString('ru-RU')} ₽` : '—'}
                </span>
            ),
            align: 'right',
            width: '140px',
        },
        {
            id: 'active',
            header: 'Статус',
            accessor: (r) => (r.active ? 1 : 0),
            cell: (r) => (
                <Pill tone={r.active ? 'success' : 'neutral'}>
                    {r.active ? 'Активный' : 'Архив'}
                </Pill>
            ),
            width: '110px',
        },
    ];

    return (
        <div className="p-8 space-y-6 bg-slate-50 min-h-screen text-slate-900">
            <div className="flex justify-between items-center flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Тарифы</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Тарифные сетки по договорам с контрагентами</p>
                    </div>
                </div>
                <Button variant="brand" disabled>
                    + Новый тариф (скоро)
                </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Всего тарифов" value={tariffs.length} icon={Receipt} tone="neutral" />
                <Stat label="Активные" value={activeCount} icon={CheckCircle2} tone="success" />
                <Stat label="Архив" value={tariffs.length - activeCount} icon={FileText} tone="neutral" />
            </div>

            <DataTable<Tariff>
                tableId="tariffs"
                data={filtered}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск контрагента или договора…"
                searchKeys={['contractorName', 'contractName']}
                filters={[
                    {
                        id: 'type',
                        label: 'Тип',
                        value: filterType,
                        onChange: setFilterType,
                        options: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
                    },
                ]}
                emptyState={
                    <EmptyState
                        icon={Receipt}
                        title={tariffs.length === 0 ? 'Тарифов пока нет' : 'Ничего не найдено'}
                        description={tariffs.length === 0 ? 'Тарифы появятся после настройки договоров с контрагентами.' : 'Попробуйте сбросить фильтры.'}
                    />
                }
                pageSize={50}
            />
        </div>
    );
}
