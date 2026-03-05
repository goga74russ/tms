'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Upload, Truck, Users, Building2, CheckCircle2,
    AlertCircle, Loader2, FileJson, X,
} from 'lucide-react';

type EntityType = 'vehicles' | 'drivers' | 'contractors';

interface ImportResult {
    created: number;
    errors: { index: number; error: string }[];
}

const entityConfig: Record<EntityType, {
    label: string; icon: any;
    fields: string; example: string;
}> = {
    vehicles: {
        label: 'Транспорт',
        icon: Truck,
        fields: 'plateNumber, vin, make, model, year, bodyType, payloadCapacityKg',
        example: JSON.stringify([
            { plateNumber: 'А001АА77', vin: 'XTA21700080000010', make: 'ГАЗ', model: 'Газель NEXT', year: 2024, bodyType: 'фургон', payloadCapacityKg: 1500 },
        ], null, 2),
    },
    drivers: {
        label: 'Водители',
        icon: Users,
        fields: 'userId, fullName, birthDate, licenseNumber, licenseCategories',
        example: JSON.stringify([
            { userId: '00000000-0000-0000-0000-000000000000', fullName: 'Петров Иван', birthDate: '1990-01-15', licenseNumber: '7700111222', licenseCategories: ['B', 'C'] },
        ], null, 2),
    },
    contractors: {
        label: 'Контрагенты',
        icon: Building2,
        fields: 'name, inn, kpp, legalAddress, phone, email',
        example: JSON.stringify([
            { name: 'ООО "Тест"', inn: '7700000001', kpp: '770001001', legalAddress: 'г. Москва', phone: '+7 (999) 123-45-67', email: 'test@example.com' },
        ], null, 2),
    },
};

export default function ImportPage() {
    const [activeEntity, setActiveEntity] = useState<EntityType>('vehicles');
    const [jsonInput, setJsonInput] = useState('');
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState('');

    function loadExample() {
        setJsonInput(entityConfig[activeEntity].example);
        setResult(null);
        setError('');
    }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            try {
                // Try parsing CSV → JSON
                if (file.name.endsWith('.csv')) {
                    const lines = text.split('\n').filter(l => l.trim());
                    const headers = lines[0].split(',').map(h => h.trim());
                    const items = lines.slice(1).map(line => {
                        const vals = line.split(',').map(v => v.trim());
                        const obj: any = {};
                        headers.forEach((h, i) => { obj[h] = vals[i]; });
                        return obj;
                    });
                    setJsonInput(JSON.stringify(items, null, 2));
                } else {
                    setJsonInput(text);
                }
            } catch {
                setJsonInput(text);
            }
        };
        reader.readAsText(file);
        setResult(null);
        setError('');
    }

    async function handleImport() {
        setImporting(true);
        setError('');
        setResult(null);
        try {
            const items = JSON.parse(jsonInput);
            if (!Array.isArray(items)) throw new Error('Данные должны быть массивом JSON');
            if (items.length === 0) throw new Error('Массив пустой');
            if (items.length > 200) throw new Error('Максимум 200 записей за раз');

            const res = await api.post<ImportResult>(`/import/${activeEntity}`, { items });
            setResult(res);
        } catch (err: any) {
            setError(err.message || 'Ошибка импорта');
        } finally {
            setImporting(false);
        }
    }

    function resetForm() {
        setJsonInput('');
        setResult(null);
        setError('');
    }

    const config = entityConfig[activeEntity];
    let parsedCount = 0;
    try { parsedCount = JSON.parse(jsonInput)?.length || 0; } catch { }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Импорт данных</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Массовая загрузка ТС, водителей и контрагентов (JSON / CSV)
                </p>
            </div>

            {/* Entity Tabs */}
            <Tabs defaultValue="vehicles" className="w-full" onValueChange={(v) => {
                setActiveEntity(v as EntityType);
                resetForm();
            }}>
                <TabsList className="mb-4">
                    {(Object.entries(entityConfig) as [EntityType, typeof entityConfig[EntityType]][]).map(([key, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                            <TabsTrigger key={key} value={key} className="gap-2">
                                <Icon className="w-4 h-4" />
                                {cfg.label}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>

                {(['vehicles', 'drivers', 'contractors'] as EntityType[]).map(entity => (
                    <TabsContent key={entity} value={entity} className="m-0">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                            {/* Info bar */}
                            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 rounded-t-xl">
                                <p className="text-xs text-slate-500">
                                    <strong>Поля:</strong> {entityConfig[entity].fields}
                                </p>
                            </div>

                            <div className="p-4 space-y-4">
                                {/* File upload + example */}
                                <div className="flex gap-3">
                                    <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                                        text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer">
                                        <Upload className="w-4 h-4" />
                                        Загрузить файл
                                        <input type="file" accept=".json,.csv" className="hidden" onChange={handleFileUpload} />
                                    </label>
                                    <button onClick={loadExample}
                                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg
                                        text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                                        <FileJson className="w-4 h-4" />
                                        Пример
                                    </button>
                                    {jsonInput && (
                                        <button onClick={resetForm}
                                            className="flex items-center gap-1 px-3 py-2 text-sm text-slate-400 hover:text-slate-600">
                                            <X className="w-4 h-4" /> Очистить
                                        </button>
                                    )}
                                </div>

                                {/* JSON editor */}
                                <textarea
                                    value={jsonInput}
                                    onChange={e => { setJsonInput(e.target.value); setResult(null); setError(''); }}
                                    placeholder='[{"plateNumber": "А001АА77", ...}]'
                                    className="w-full h-56 font-mono text-sm px-4 py-3 rounded-lg border border-slate-200
                                        focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
                                        bg-slate-50 resize-y"
                                />

                                {/* Preview count */}
                                {parsedCount > 0 && !result && (
                                    <p className="text-sm text-slate-500">
                                        📋 Готово к импорту: <strong>{parsedCount}</strong> записей
                                    </p>
                                )}

                                {/* Error */}
                                {error && (
                                    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}

                                {/* Result */}
                                {result && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                            Создано: <strong>{result.created}</strong>
                                        </div>
                                        {result.errors && result.errors.length > 0 && (
                                            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                                                <p className="font-medium mb-1">Ошибки ({result.errors.length}):</p>
                                                <ul className="list-disc pl-5 space-y-0.5">
                                                    {result.errors.slice(0, 10).map((e, i) => (
                                                        <li key={i}>Строка {e.index + 1}: {e.error}</li>
                                                    ))}
                                                    {result.errors.length > 10 && <li>...ещё {result.errors.length - 10}</li>}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Import button */}
                                <button
                                    onClick={handleImport}
                                    disabled={importing || !jsonInput.trim()}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg
                                        text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    {importing ? 'Импорт...' : 'Импортировать'}
                                </button>
                            </div>
                        </div>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
