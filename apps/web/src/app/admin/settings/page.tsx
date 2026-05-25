'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { Settings, Info, Database, Fuel, Briefcase, Wrench, Scale, AlertTriangle } from 'lucide-react';

// J1 — налоговые режимы и их человеческие подписи.
const TAX_REGIME_LABELS: Record<string, string> = {
    osno: 'ОСНО — общая система (с НДС 20/10/0%)',
    usn_income: 'УСН доходы 6% (без НДС)',
    usn_income_expense: 'УСН доходы−расходы 15% (без НДС)',
    usn_with_vat: 'УСН с НДС (244-ФЗ, доход >60M ₽)',
    ausn: 'АУСН — автоматизированная УСН (без НДС)',
    patent: 'Патент (только ИП, без НДС)',
    npd: 'НПД — самозанятые (до 2.4M ₽/год)',
};
const TAX_REGIME_OPTIONS = Object.entries(TAX_REGIME_LABELS).map(([value, label]) => ({ value, label }));

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
        try {
            await api.put('/settings/cost-model', {
                fuelPricePerLiter: Number(form.fuelPricePerLiter),
                driverSalaryPerHour: Number(form.driverSalaryPerHour),
                amortizationPerKm: Number(form.amortizationPerKm),
            });
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
            <PageHeader
                icon={Settings}
                iconTone="brand"
                title="Настройки себестоимости"
                description="Используются как основной источник для тарификации. Переменные окружения остаются fallback-слоем."
                actions={
                    <Button variant="brand" isLoading={saving} onClick={save} disabled={loading}>
                        Сохранить изменения
                    </Button>
                }
            />

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                {/* Main column */}
                <div className="space-y-5">
                    {/* J1 — Налоговый режим (фундамент для счетов и НДС) */}
                    <TaxRegimeCard />

                    <SectionCard
                        icon={Fuel}
                        title="Топливо"
                        hint="Цена литра дизельного топлива, используется в расчёте топливной составляющей рейса."
                    >
                        {loading ? (
                            <Skeleton className="h-12 w-full" />
                        ) : (
                            <Input
                                label="₽ за литр"
                                type="number"
                                step="0.01"
                                value={form.fuelPricePerLiter}
                                onChange={(e) => setForm((prev) => ({ ...prev, fuelPricePerLiter: e.target.value }))}
                            />
                        )}
                        {settings && (
                            <SourceBadge source={settings.fuelPricePerLiter.source} updatedAt={settings.fuelPricePerLiter.updatedAt} />
                        )}
                    </SectionCard>

                    <SectionCard
                        icon={Briefcase}
                        title="Водитель"
                        hint="Ставка водителя за час работы. Применяется к фактическому времени рейса."
                    >
                        {loading ? (
                            <Skeleton className="h-12 w-full" />
                        ) : (
                            <Input
                                label="₽ в час"
                                type="number"
                                step="0.01"
                                value={form.driverSalaryPerHour}
                                onChange={(e) => setForm((prev) => ({ ...prev, driverSalaryPerHour: e.target.value }))}
                            />
                        )}
                        {settings && (
                            <SourceBadge source={settings.driverSalaryPerHour.source} updatedAt={settings.driverSalaryPerHour.updatedAt} />
                        )}
                    </SectionCard>

                    <SectionCard
                        icon={Wrench}
                        title="Амортизация ТС"
                        hint="Амортизация транспортного средства на километр пробега."
                    >
                        {loading ? (
                            <Skeleton className="h-12 w-full" />
                        ) : (
                            <Input
                                label="₽ за км"
                                type="number"
                                step="0.01"
                                value={form.amortizationPerKm}
                                onChange={(e) => setForm((prev) => ({ ...prev, amortizationPerKm: e.target.value }))}
                            />
                        )}
                        {settings && (
                            <SourceBadge source={settings.amortizationPerKm.source} updatedAt={settings.amortizationPerKm.updatedAt} />
                        )}
                    </SectionCard>

                    {error && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
                    )}

                    <div className="flex justify-end pt-2">
                        <Button variant="brand" isLoading={saving} onClick={save} disabled={loading}>
                            Сохранить изменения
                        </Button>
                    </div>
                </div>

                {/* Help sidebar */}
                <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
                    <Card className="bg-gradient-to-br from-brand-50 to-white border-brand-100">
                        <CardContent className="space-y-3 p-5">
                            <div className="flex items-center gap-2 text-brand-700">
                                <Info className="w-4 h-4" />
                                <h3 className="text-sm font-semibold">Как это работает</h3>
                            </div>
                            <p className="text-xs text-neutral-600 leading-relaxed">
                                Эти значения применяются <strong>ко всем рейсам организации</strong> при расчёте себестоимости. Если оставить поле пустым, используется значение из <code className="px-1 py-0.5 rounded bg-neutral-100 text-[10px] font-mono">.env</code>.
                            </p>
                            <p className="text-xs text-neutral-600 leading-relaxed">
                                Изменения вступают в силу сразу для новых рейсов. Уже завершённые рейсы пересчитываются вручную через биллинг.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-5 space-y-2">
                            <div className="flex items-center gap-2">
                                <Database className="w-4 h-4 text-neutral-500" />
                                <h3 className="text-sm font-semibold text-neutral-900">Что ещё можно настроить</h3>
                            </div>
                            <ul className="text-xs text-neutral-600 space-y-1.5 pt-1">
                                <li>• Тарифы клиентов — в разделе <strong>Тарифы</strong></li>
                                <li>• Шаблоны чек-листов — в <strong>Шаблоны ЧЛ</strong></li>
                                <li>• Пороги ADR / маркировки — в <strong>Контроль соответствия</strong></li>
                                <li>• Интеграции и ключи API — в <strong>Интеграции</strong></li>
                            </ul>
                        </CardContent>
                    </Card>
                </aside>
            </div>
        </div>
    );
}

function SectionCard({
    icon: Icon,
    title,
    hint,
    children,
}: {
    icon: typeof Fuel;
    title: string;
    hint: string;
    children: React.ReactNode;
}) {
    return (
        <Card>
            <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
                        <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{hint}</p>
                    </div>
                </div>
                <div className="space-y-2 pl-12">
                    {children}
                </div>
            </CardContent>
        </Card>
    );
}

// J1 — Карточка налогового режима. Юр-обоснование в invoice-spec.md (Jurist).
// Логика: пока taxRegime='unspecified' — yellow warning + блок «выберите».
// Изменение — PATCH /api/auth/me/organization → refetch user → banner исчезает.
function TaxRegimeCard() {
    const { user, refetch } = useUser();
    const { toast } = useToast();
    const currentRegime = user?.organization?.taxRegime ?? 'unspecified';
    const [value, setValue] = useState<string>(currentRegime === 'unspecified' ? '' : currentRegime);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Подцепить значение когда user подгружается асинхронно.
        if (user?.organization?.taxRegime && user.organization.taxRegime !== 'unspecified') {
            setValue(user.organization.taxRegime);
        }
    }, [user?.organization?.taxRegime]);

    const isUnspecified = currentRegime === 'unspecified';
    const canSave = value && value !== currentRegime && !saving;

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            await api.patch('/auth/me/organization', { taxRegime: value });
            toast({
                variant: 'success',
                title: 'Налоговый режим сохранён',
                description: 'Это критическое юр-событие — записано в журнал.',
            });
            await refetch();
        } catch (e: any) {
            toast({ variant: 'error', title: 'Не удалось сохранить', description: e?.message ?? 'Неизвестная ошибка' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className={isUnspecified ? 'border-amber-300 bg-amber-50/40' : undefined}>
            <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isUnspecified ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-600'
                    }`}>
                        <Scale className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-semibold text-neutral-900">Налоговый режим</h2>
                        <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                            От этого зависит порядок выставления счетов, НДС и счетов-фактур.
                            Изменения — критическое событие, фиксируется в журнале.
                        </p>
                    </div>
                </div>

                {isUnspecified && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-100/60 px-3 py-2 text-xs text-amber-900">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                            <strong>Не выбран.</strong> Выпуск счетов и СФ заблокирован до явного выбора режима.
                            После выбора вернуться к «не задан» через UI нельзя.
                        </div>
                    </div>
                )}

                <div className="space-y-2 pl-12">
                    <label className="text-xs font-medium text-neutral-700 block">Режим организации</label>
                    <select
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                    >
                        <option value="">— Выберите режим —</option>
                        {TAX_REGIME_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    <div className="flex items-center gap-3 pt-2">
                        <Button
                            variant="brand"
                            size="sm"
                            isLoading={saving}
                            disabled={!canSave}
                            onClick={save}
                        >
                            Сохранить режим
                        </Button>
                        {!isUnspecified && value === currentRegime && (
                            <span className="text-xs text-emerald-600">
                                Текущий режим: {TAX_REGIME_LABELS[currentRegime] ?? currentRegime}
                            </span>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function SourceBadge({ source, updatedAt }: { source: string; updatedAt: string | null }) {
    const isEnv = source.toLowerCase().includes('env');
    return (
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${isEnv ? 'bg-neutral-100 text-neutral-600' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isEnv ? 'bg-neutral-400' : 'bg-emerald-500'}`} />
                {isEnv ? 'fallback из .env' : 'настроено в БД'}
            </span>
            {updatedAt && (
                <span className="text-neutral-400">
                    обновлено {new Date(updatedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
            )}
        </div>
    );
}
