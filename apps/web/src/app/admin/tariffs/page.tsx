'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Edit2, FileText, Plus, Search, X } from 'lucide-react';

interface Tariff {
    id: string;
    contractId: string;
    type: string;
    ratePerKm: number | string | null;
    ratePerTon: number | string | null;
    ratePerHour: number | string | null;
    fixedRate: number | string | null;
    nightCoefficient: number | string;
    urgentCoefficient: number | string;
    weekendCoefficient: number | string;
    minTripCost: number | string;
    vatIncluded: boolean;
    vatRate: number | string;
}

const TYPE_LABELS: Record<string, string> = {
    fixed: 'Фиксированный',
    fixed_route: 'Фиксированный маршрут',
    per_km: 'За км',
    per_hour: 'За час',
    per_ton: 'За тонну',
    combined: 'Комбинированный',
};

const TYPE_FILTERS = [
    { value: '', label: 'Все' },
    { value: 'fixed', label: 'Фиксированный' },
    { value: 'fixed_route', label: 'Фиксированный маршрут' },
    { value: 'per_km', label: 'За км' },
    { value: 'per_hour', label: 'За час' },
    { value: 'per_ton', label: 'За тонну' },
    { value: 'combined', label: 'Комбинированный' },
] as const;

const toNumber = (value: number | string | null | undefined) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
};

const formatMoney = (value: number | string | null | undefined) => {
    const n = toNumber(value);
    return n === null ? '—' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(n);
};

const formatCoeff = (value: number | string | null | undefined) => {
    const n = toNumber(value);
    return n === null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
};

const typeHint = (type: string) =>
    ({
        fixed: 'Фиксированная сумма.',
        fixed_route: 'Фикс для заранее согласованного маршрута.',
        per_km: 'Расчет по километражу.',
        per_hour: 'Расчет по времени.',
        per_ton: 'Расчет по массе груза.',
        combined: 'Можно сочетать несколько ставок.',
    }[type] || 'Выберите тип тарифа.');

const primaryRate = (t: Tariff) => {
    switch (t.type) {
        case 'per_km':
            return { label: 'Ставка за км', value: formatMoney(t.ratePerKm) };
        case 'per_hour':
            return { label: 'Ставка за час', value: formatMoney(t.ratePerHour) };
        case 'per_ton':
            return { label: 'Ставка за тонну', value: formatMoney(t.ratePerTon) };
        default:
            return { label: 'Фиксированная ставка', value: formatMoney(t.fixedRate) };
    }
};

function tariffDetails(t: Tariff) {
    const parts: string[] = [];
    if (toNumber(t.fixedRate) !== null) parts.push(`фикс ${formatMoney(t.fixedRate)}`);
    if (toNumber(t.ratePerKm) !== null) parts.push(`км ${formatMoney(t.ratePerKm)}`);
    if (toNumber(t.ratePerHour) !== null) parts.push(`час ${formatMoney(t.ratePerHour)}`);
    if (toNumber(t.ratePerTon) !== null) parts.push(`тонна ${formatMoney(t.ratePerTon)}`);
    return parts.join(' • ') || 'Ставка не заполнена';
}

function TariffModal({
    tariff,
    onClose,
    onSaved,
}: {
    tariff: Tariff | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState({
        contractId: tariff?.contractId || '',
        type: tariff?.type || 'fixed',
        ratePerKm: tariff?.ratePerKm?.toString() || '',
        ratePerTon: tariff?.ratePerTon?.toString() || '',
        ratePerHour: tariff?.ratePerHour?.toString() || '',
        fixedRate: tariff?.fixedRate?.toString() || '',
        nightCoefficient: tariff?.nightCoefficient?.toString() || '1',
        urgentCoefficient: tariff?.urgentCoefficient?.toString() || '1',
        weekendCoefficient: tariff?.weekendCoefficient?.toString() || '1',
        minTripCost: tariff?.minTripCost?.toString() || '0',
        vatIncluded: tariff?.vatIncluded ?? true,
        vatRate: tariff?.vatRate?.toString() || '20',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const currentHint = typeHint(form.type);

    const save = async () => {
        if (!form.contractId || !form.type) {
            setError('Укажите контракт и тип тарифа');
            return;
        }

        const body = {
            contractId: form.contractId,
            type: form.type,
            ratePerKm: form.ratePerKm ? parseFloat(form.ratePerKm) : null,
            ratePerTon: form.ratePerTon ? parseFloat(form.ratePerTon) : null,
            ratePerHour: form.ratePerHour ? parseFloat(form.ratePerHour) : null,
            fixedRate: form.fixedRate ? parseFloat(form.fixedRate) : null,
            nightCoefficient: parseFloat(form.nightCoefficient) || 1,
            urgentCoefficient: parseFloat(form.urgentCoefficient) || 1,
            weekendCoefficient: parseFloat(form.weekendCoefficient) || 1,
            minTripCost: parseFloat(form.minTripCost) || 0,
            vatIncluded: form.vatIncluded,
            vatRate: parseFloat(form.vatRate) || 20,
        };

        try {
            setSubmitting(true);
            setError('');
            if (tariff) await api.put(`/auth/tariffs/${tariff.id}`, body);
            else await api.post('/auth/tariffs', body);
            onSaved();
        } catch (e: any) {
            setError(e.message || 'Не удалось сохранить тариф');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Card className="mx-4 max-h-[90vh] w-full max-w-xl overflow-y-auto shadow-xl">
                <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <CardTitle>{tariff ? 'Редактирование тарифа' : 'Новый тариф'}</CardTitle>
                            <p className="mt-1 text-sm text-slate-500">{currentHint}</p>
                        </div>
                        <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
                            <X className="h-5 w-5 text-slate-400" />
                        </button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Для комбинированного тарифа можно заполнить несколько ставок. Оставьте только нужные поля.
                    </div>
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Preview</p>
                                <p className="text-sm font-semibold text-slate-900">{TYPE_LABELS[form.type] || form.type}</p>
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                                {currentHint}
                            </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                            {form.fixedRate && <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 shadow-sm">Фикс: {formatMoney(form.fixedRate)}</span>}
                            {form.ratePerKm && <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 shadow-sm">Км: {formatMoney(form.ratePerKm)}</span>}
                            {form.ratePerHour && <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 shadow-sm">Час: {formatMoney(form.ratePerHour)}</span>}
                            {form.ratePerTon && <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 shadow-sm">Тонна: {formatMoney(form.ratePerTon)}</span>}
                            <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 shadow-sm">НДС: {form.vatIncluded ? `${form.vatRate}%` : 'нет'}</span>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Как применяется</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-700">
                            <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">База: {form.fixedRate ? formatMoney(form.fixedRate) : '—'}</span>
                            <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">Км: {form.ratePerKm ? formatMoney(form.ratePerKm) : '—'}</span>
                            <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">Час: {form.ratePerHour ? formatMoney(form.ratePerHour) : '—'}</span>
                            <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">Тонна: {form.ratePerTon ? formatMoney(form.ratePerTon) : '—'}</span>
                            <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">Мин. рейс: {form.minTripCost ? formatMoney(form.minTripCost) : '—'}</span>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">ID контракта *</span>
                            <input
                                value={form.contractId}
                                onChange={e => setForm(prev => ({ ...prev, contractId: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                placeholder="UUID контракта"
                                disabled={!!tariff}
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Тип *</span>
                            <select
                                value={form.type}
                                onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            >
                                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Фиксированная ставка</span>
                            <input
                                type="number"
                                step="0.01"
                                value={form.fixedRate}
                                onChange={e => setForm(prev => ({ ...prev, fixedRate: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Ставка за км</span>
                            <input
                                type="number"
                                step="0.01"
                                value={form.ratePerKm}
                                onChange={e => setForm(prev => ({ ...prev, ratePerKm: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Ставка за час</span>
                            <input
                                type="number"
                                step="0.01"
                                value={form.ratePerHour}
                                onChange={e => setForm(prev => ({ ...prev, ratePerHour: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Ставка за тонну</span>
                            <input
                                type="number"
                                step="0.01"
                                value={form.ratePerTon}
                                onChange={e => setForm(prev => ({ ...prev, ratePerTon: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Ночь, коэффициент</span>
                            <input
                                type="number"
                                step="0.1"
                                value={form.nightCoefficient}
                                onChange={e => setForm(prev => ({ ...prev, nightCoefficient: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Срочность, коэффициент</span>
                            <input
                                type="number"
                                step="0.1"
                                value={form.urgentCoefficient}
                                onChange={e => setForm(prev => ({ ...prev, urgentCoefficient: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Выходной, коэффициент</span>
                            <input
                                type="number"
                                step="0.1"
                                value={form.weekendCoefficient}
                                onChange={e => setForm(prev => ({ ...prev, weekendCoefficient: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </label>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Минимальная стоимость рейса</span>
                            <input
                                type="number"
                                step="0.01"
                                value={form.minTripCost}
                                onChange={e => setForm(prev => ({ ...prev, minTripCost: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">НДС %</span>
                            <input
                                type="number"
                                step="0.1"
                                value={form.vatRate}
                                onChange={e => setForm(prev => ({ ...prev, vatRate: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                        </label>
                        <div className="flex items-end pb-1">
                            <label className="flex cursor-pointer items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={form.vatIncluded}
                                    onChange={e => setForm(prev => ({ ...prev, vatIncluded: e.target.checked }))}
                                    className="rounded border-slate-300"
                                />
                                <span className="text-sm text-slate-700">НДС включен</span>
                            </label>
                        </div>
                    </div>
                    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1" onClick={onClose}>
                            Отмена
                        </Button>
                        <Button className="flex-1" onClick={save} disabled={submitting}>
                            {submitting ? 'Сохраняем...' : tariff ? 'Сохранить' : 'Создать'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function AdminTariffsPage() {
    const [tariffs, setTariffs] = useState<Tariff[]>([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState<{ mode: 'create' | 'edit'; tariff: Tariff | null } | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{ success: boolean; data: Tariff[] }>('/auth/tariffs');
            if (result.success) setTariffs(result.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(timer);
    }, [toast]);

    const filteredTariffs = tariffs.filter(t => {
        const q = search.trim().toLowerCase();
        if (q) {
            const haystack = `${TYPE_LABELS[t.type] || t.type} ${t.contractId}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        if (typeFilter && t.type !== typeFilter) return false;
        return true;
    });

    const visibleCount = filteredTariffs.length;
    const routeCount = tariffs.filter(t => t.type === 'fixed_route').length;
    const kmCount = tariffs.filter(t => t.type === 'per_km').length;
    const vatCount = tariffs.filter(t => t.vatIncluded).length;
    const hasFilters = Boolean(search.trim() || typeFilter);

    return (
        <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
                        <FileText className="h-6 w-6 text-indigo-600" />
                        Тарифы
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">
                        {tariffs.length} тарифов в системе • {visibleCount} в текущем фильтре
                    </p>
                </div>
                <Button onClick={() => setModal({ mode: 'create', tariff: null })}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Добавить тариф
                </Button>
            </div>

            {toast && (
                <div className="fixed right-4 top-4 z-50 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
                    {toast}
                </div>
            )}

            <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-slate-200/80 shadow-sm">
                    <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Всего тарифов</p>
                        <p className="mt-2 text-2xl font-bold text-slate-900">{tariffs.length}</p>
                    </CardContent>
                </Card>
                <Card className="border-slate-200/80 shadow-sm">
                    <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Видно по фильтру</p>
                        <p className="mt-2 text-2xl font-bold text-slate-900">{visibleCount}</p>
                    </CardContent>
                </Card>
                <Card className="border-slate-200/80 shadow-sm">
                    <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Маршрутных тарифов</p>
                        <p className="mt-2 text-2xl font-bold text-slate-900">{routeCount}</p>
                    </CardContent>
                </Card>
                <Card className="border-slate-200/80 shadow-sm">
                    <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Тарифов с НДС</p>
                        <p className="mt-2 text-2xl font-bold text-slate-900">{vatCount}</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="mb-6 border-slate-200/80 shadow-sm">
                <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative w-full max-w-lg">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Поиск по контракту или типу тарифа"
                            className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {TYPE_FILTERS.map(filter => {
                            const active = typeFilter === filter.value;
                            return (
                                <button
                                    key={filter.value || 'all'}
                                    type="button"
                                    onClick={() => setTypeFilter(filter.value)}
                                    className={[
                                        'rounded-full border px-3 py-1.5 text-sm font-medium transition',
                                        active
                                            ? 'border-indigo-600 bg-indigo-600 text-white'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600',
                                    ].join(' ')}
                                >
                                    {filter.label}
                                </button>
                            );
                        })}
                        {hasFilters && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearch('');
                                    setTypeFilter('');
                                }}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-500 hover:border-rose-200 hover:text-rose-600"
                            >
                                Сбросить
                            </button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200/80 shadow-sm">
                <CardHeader className="border-b border-slate-100 bg-slate-50/80">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <CardTitle>Реестр тарифов</CardTitle>
                            <p className="mt-1 text-sm text-slate-500">
                                {hasFilters ? 'Показаны только подходящие тарифы.' : 'Все тарифы и их базовые параметры.'}
                            </p>
                        </div>
                        <div className="text-sm text-slate-500">
                            {kmCount} тарифов по километражу • {routeCount} маршрутных
                        </div>
                    </div>
                </CardHeader>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-white">
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Тип</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Контракт</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Ставка</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Минимум</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Коэффициенты</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">НДС</th>
                                <th className="w-10 px-4 py-3 text-left font-semibold text-slate-600" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center">
                                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                                    </td>
                                </tr>
                            ) : filteredTariffs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center">
                                        <div className="mx-auto max-w-md">
                                            <p className="text-base font-medium text-slate-700">
                                                {tariffs.length === 0 ? 'Пока нет тарифов' : 'Ничего не найдено'}
                                            </p>
                                            <p className="mt-2 text-sm text-slate-500">
                                                {tariffs.length === 0
                                                    ? 'Создайте первый тариф, чтобы начать расчеты.'
                                                    : 'Попробуйте изменить поиск или сбросить фильтры.'}
                                            </p>
                                            {tariffs.length === 0 && (
                                                <div className="mt-4">
                                                    <Button onClick={() => setModal({ mode: 'create', tariff: null })}>
                                                        <Plus className="mr-1.5 h-4 w-4" />
                                                        Добавить тариф
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredTariffs.map(tariff => {
                                    const rate = primaryRate(tariff);
                                    return (
                                        <tr key={tariff.id} className="border-b border-slate-50 align-top hover:bg-slate-50/80">
                                            <td className="px-4 py-4">
                                                <div className="space-y-1">
                                                    <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                                        {TYPE_LABELS[tariff.type] || tariff.type}
                                                    </span>
                                                    <p className="text-xs text-slate-500">{typeHint(tariff.type)}</p>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="font-mono text-sm text-slate-700">{tariff.contractId}</div>
                                                <p className="mt-1 text-xs text-slate-500">ID договора / контракта</p>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="font-medium text-slate-900">{rate.label}</div>
                                                <div className="mt-1 text-sm text-slate-700">{rate.value}</div>
                                                <p className="mt-1 text-xs text-slate-500">{tariffDetails(tariff)}</p>
                                            </td>
                                            <td className="px-4 py-4 text-slate-700">{formatMoney(tariff.minTripCost)}</td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col gap-1 text-xs text-slate-600">
                                                    <span>Ночь: ×{formatCoeff(tariff.nightCoefficient)}</span>
                                                    <span>Срочность: ×{formatCoeff(tariff.urgentCoefficient)}</span>
                                                    <span>Выходной: ×{formatCoeff(tariff.weekendCoefficient)}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span
                                                    className={[
                                                        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                                                        tariff.vatIncluded
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-slate-100 text-slate-600',
                                                    ].join(' ')}
                                                >
                                                    {tariff.vatIncluded ? `${toNumber(tariff.vatRate) ?? 20}% НДС` : 'Без НДС'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <button
                                                    onClick={() => setModal({ mode: 'edit', tariff })}
                                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                                                    type="button"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {modal && (
                <TariffModal
                    tariff={modal.tariff}
                    onClose={() => setModal(null)}
                    onSaved={() => {
                        setModal(null);
                        setToast(modal.mode === 'create' ? 'Тариф создан' : 'Тариф обновлен');
                        load();
                    }}
                />
            )}
        </div>
    );
}
