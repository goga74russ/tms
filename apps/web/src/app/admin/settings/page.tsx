'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { Settings } from 'lucide-react';

type CostModelResponse = {
    fuelPricePerLiter: { value: number; source: string; description: string; updatedAt: string | null };
    driverSalaryPerHour: { value: number; source: string; description: string; updatedAt: string | null };
    amortizationPerKm: { value: number; source: string; description: string; updatedAt: string | null };
};

export default function AdminSettingsPage() {
    const { toast } = useToast();
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
            const msg = e.message || 'Не удалось загрузить настройки';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
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
            toast({ variant: 'success', title: 'Настройки сохранены' });
            await load();
        } catch (e: any) {
            const msg = e.message || 'Не удалось сохранить настройки';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                    <Settings className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Настройки себестоимости</h1>
                    <p className="mt-0.5 text-sm text-slate-500">
                        Эти значения используются в тарификации как основной источник. Переменные окружения остаются только fallback-слоем.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Cost model</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="grid gap-4 md:grid-cols-3">
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-16 w-full" />
                        </div>
                    ) : (
                    <div className="grid gap-4 md:grid-cols-3">
                        <Input
                            label="Топливо, ₽/л"
                            type="number"
                            step="0.01"
                            value={form.fuelPricePerLiter}
                            onChange={(e) => setForm((prev) => ({ ...prev, fuelPricePerLiter: e.target.value }))}
                        />
                        <Input
                            label="Водитель, ₽/час"
                            type="number"
                            step="0.01"
                            value={form.driverSalaryPerHour}
                            onChange={(e) => setForm((prev) => ({ ...prev, driverSalaryPerHour: e.target.value }))}
                        />
                        <Input
                            label="Амортизация, ₽/км"
                            type="number"
                            step="0.01"
                            value={form.amortizationPerKm}
                            onChange={(e) => setForm((prev) => ({ ...prev, amortizationPerKm: e.target.value }))}
                        />
                    </div>
                    )}

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
                        <Button variant="brand" isLoading={saving} onClick={save}>Сохранить</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
