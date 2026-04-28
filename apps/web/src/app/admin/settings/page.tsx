'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

type CostModelResponse = {
    fuelPricePerLiter: { value: number; source: string; description: string; updatedAt: string | null };
    driverSalaryPerHour: { value: number; source: string; description: string; updatedAt: string | null };
    amortizationPerKm: { value: number; source: string; description: string; updatedAt: string | null };
};

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState<CostModelResponse | null>(null);
    const [form, setForm] = useState({
        fuelPricePerLiter: '',
        driverSalaryPerHour: '',
        amortizationPerKm: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get<{ success: boolean; data: CostModelResponse }>('/settings/cost-model');
            setSettings(response.data);
            setForm({
                fuelPricePerLiter: String(response.data.fuelPricePerLiter.value),
                driverSalaryPerHour: String(response.data.driverSalaryPerHour.value),
                amortizationPerKm: String(response.data.amortizationPerKm.value),
            });
        } catch (e: any) {
            setError(e.message || 'Не удалось загрузить настройки');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const save = async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await api.put('/settings/cost-model', {
                fuelPricePerLiter: Number(form.fuelPricePerLiter),
                driverSalaryPerHour: Number(form.driverSalaryPerHour),
                amortizationPerKm: Number(form.amortizationPerKm),
            });
            setSuccess('Настройки сохранены');
            await load();
        } catch (e: any) {
            setError(e.message || 'Не удалось сохранить настройки');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="text-sm text-slate-500">Загрузка настроек...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-slate-900">Настройки себестоимости</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Эти значения используются в тарификации как основной источник. Переменные окружения остаются только fallback-слоем.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Cost model</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Топливо, ₽/л</span>
                            <input
                                type="number"
                                step="0.01"
                                value={form.fuelPricePerLiter}
                                onChange={(e) => setForm((prev) => ({ ...prev, fuelPricePerLiter: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Водитель, ₽/час</span>
                            <input
                                type="number"
                                step="0.01"
                                value={form.driverSalaryPerHour}
                                onChange={(e) => setForm((prev) => ({ ...prev, driverSalaryPerHour: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="block text-sm font-medium text-slate-700">Амортизация, ₽/км</span>
                            <input
                                type="number"
                                step="0.01"
                                value={form.amortizationPerKm}
                                onChange={(e) => setForm((prev) => ({ ...prev, amortizationPerKm: e.target.value }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                            />
                        </label>
                    </div>

                    {settings && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                            <p className="font-medium text-slate-800">Текущие источники значений</p>
                            <ul className="mt-2 space-y-1">
                                <li>Топливо: {settings.fuelPricePerLiter.source}</li>
                                <li>Водитель: {settings.driverSalaryPerHour.source}</li>
                                <li>Амортизация: {settings.amortizationPerKm.source}</li>
                            </ul>
                        </div>
                    )}

                    {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
                    {success && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

                    <div className="flex justify-end">
                        <Button onClick={save} disabled={saving}>
                            {saving ? 'Сохранение...' : 'Сохранить'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
