"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Stat } from "@/components/ui/stat";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { Receipt, FileText, CheckCircle2 } from "lucide-react";

// ——— Types (structured for future API) ———
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

const TYPE_COLORS: Record<string, string> = {
    per_km: 'bg-blue-50 text-blue-700 border-blue-200',
    per_ton: 'bg-purple-50 text-purple-700 border-purple-200',
    per_hour: 'bg-amber-50 text-amber-700 border-amber-200',
    fixed_route: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    combined: 'bg-slate-100 text-slate-700 border-slate-200',
};

const TYPE_OPTIONS = [
    { value: '', label: 'Все типы' },
    ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))
];

export default function TariffsPage() {
    const { toast } = useToast();
    const [tariffs, setTariffs] = useState<Tariff[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('');

    useEffect(() => {
        api.get<{ success: boolean; data: Tariff[] }>('/auth/tariffs')
            .then(res => setTariffs(res.data))
            .catch(err => toast({ variant: 'error', title: 'Не удалось загрузить тарифы', description: err?.message }))
            .finally(() => setLoading(false));
    }, [toast]);

    const filtered = tariffs.filter(t => {
        if (filterType && t.type !== filterType) return false;
        if (search && !t.contractorName?.toLowerCase().includes(search.toLowerCase()) && !t.contractName?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const activeCount = tariffs.filter(t => t.active).length;

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

            <Card>
                <div className="p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <h2 className="text-xl font-semibold text-slate-900">Реестр тарифов</h2>
                        <div className="flex gap-3">
                            <Input
                                placeholder="Поиск контрагента..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-52"
                            />
                            <Select
                                value={filterType}
                                onChange={e => setFilterType(e.target.value)}
                                options={TYPE_OPTIONS}
                                className="w-48"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <SkeletonTable rows={6} columns={8} />
                    ) : filtered.length === 0 ? (
                        <EmptyState
                            icon={Receipt}
                            title={tariffs.length === 0 ? 'Тарифов пока нет' : 'Ничего не найдено'}
                            description={tariffs.length === 0 ? 'Тарифы появятся после настройки договоров с контрагентами.' : 'Попробуйте сбросить фильтры.'}
                        />
                    ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Контрагент</TableHead>
                                    <TableHead>Договор</TableHead>
                                    <TableHead>Тип</TableHead>
                                    <TableHead>Ставка</TableHead>
                                    <TableHead>Модификаторы</TableHead>
                                    <TableHead>НДС</TableHead>
                                    <TableHead>Мин. стоимость</TableHead>
                                    <TableHead className="text-center">Статус</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map(tariff => (
                                    <TableRow key={tariff.id}>
                                        <TableCell className="font-medium text-slate-900">{tariff.contractorName}</TableCell>
                                        <TableCell className="text-blue-600 font-medium">{tariff.contractName}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={TYPE_COLORS[tariff.type]}>
                                                {TYPE_LABELS[tariff.type]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-semibold">{tariff.rate}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {tariff.modifiers.length > 0
                                                    ? tariff.modifiers.map((m, i) => (
                                                        <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{m}</span>
                                                    ))
                                                    : <span className="text-xs text-slate-400">—</span>
                                                }
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-slate-500">
                                            {tariff.vatRate > 0
                                                ? `${tariff.vatRate}% ${tariff.vatIncluded ? '(вкл.)' : '(сверху)'}`
                                                : 'Без НДС'}
                                        </TableCell>
                                        <TableCell className="text-slate-500">
                                            {tariff.minTripCost > 0 ? `${tariff.minTripCost.toLocaleString('ru-RU')} ₽` : '—'}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={tariff.active ? 'default' : 'secondary'} className={tariff.active ? 'bg-emerald-600' : ''}>
                                                {tariff.active ? 'Активный' : 'Архив'}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
