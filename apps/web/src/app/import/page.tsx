'use client';

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { api } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Upload, Truck, Users, Building2, CheckCircle2,
    AlertCircle, Loader2, FileJson, X, Download, FileSpreadsheet,
} from 'lucide-react';

type EntityType = 'vehicles' | 'drivers' | 'contractors';

interface ImportResult {
    created: number;
    usersCreated?: number;
    errors: { index: number; error: string }[];
}

// ── Column definitions ──────────────────────────────────────────
const COLUMNS: Record<EntityType, { key: string; header: string; required?: boolean; example: string }[]> = {
    vehicles: [
        { key: 'plateNumber',        header: 'Госномер',           required: true,  example: 'А001АА77' },
        { key: 'vin',                header: 'VIN',                required: true,  example: 'XTA21700080000010' },
        { key: 'make',               header: 'Марка',              required: true,  example: 'ГАЗ' },
        { key: 'model',              header: 'Модель',             required: true,  example: 'Газель NEXT' },
        { key: 'year',               header: 'Год',                              example: '2024' },
        { key: 'bodyType',           header: 'Тип кузова',                       example: 'фургон' },
        { key: 'payloadCapacityKg',  header: 'Грузоподъёмность кг',              example: '1500' },
        { key: 'payloadVolumeM3',    header: 'Объём м3',                         example: '10' },
        { key: 'fuelNormPer100Km',   header: 'Расход л/100км',                   example: '18' },
    ],
    drivers: [
        { key: 'fullName',           header: 'ФИО',                required: true,  example: 'Петров Иван Сергеевич' },
        { key: 'licenseNumber',      header: 'Номер ВУ',           required: true,  example: '7700111222' },
        { key: 'licenseCategories',  header: 'Категории (B,C)',               example: 'B,C' },
        { key: 'birthDate',          header: 'Дата рождения',                  example: '1990-01-15' },
        { key: 'licenseExpiry',      header: 'Срок действия ВУ',               example: '2030-01-01' },
        { key: 'phone',              header: 'Телефон',                        example: '+79991234567' },
        { key: 'email',              header: 'Email',                          example: 'driver@example.com' },
    ],
    contractors: [
        { key: 'name',         header: 'Название',      required: true,  example: 'ООО "Тест"' },
        { key: 'inn',          header: 'ИНН',            required: true,  example: '7700000001' },
        { key: 'kpp',          header: 'КПП',                           example: '770001001' },
        { key: 'legalAddress', header: 'Юридический адрес',             example: 'г. Москва, ул. Ленина, 1' },
        { key: 'phone',        header: 'Телефон',                       example: '+74951234567' },
        { key: 'email',        header: 'Email',                         example: 'info@example.com' },
    ],
};

const ENTITY_LABELS: Record<EntityType, { label: string; icon: React.ElementType }> = {
    vehicles:    { label: 'Транспорт',   icon: Truck },
    drivers:     { label: 'Водители',    icon: Users },
    contractors: { label: 'Контрагенты', icon: Building2 },
};

// ── Excel template generator ────────────────────────────────────
function downloadTemplate(entity: EntityType) {
    const cols = COLUMNS[entity];
    const headers = cols.map(c => c.header);
    const example = cols.map(c => c.example);
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    // Column widths
    ws['!cols'] = cols.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Импорт');
    XLSX.writeFile(wb, `template_${entity}.xlsx`);
}

// ── Excel / CSV parser ──────────────────────────────────────────
function parseExcel(buffer: ArrayBuffer, entity: EntityType): unknown[] {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const cols = COLUMNS[entity];

    // Map localised headers → field keys
    const headerMap: Record<string, string> = {};
    cols.forEach(c => { headerMap[c.header] = c.key; });

    return rows.map(row => {
        const item: Record<string, unknown> = {};
        for (const [hdr, val] of Object.entries(row)) {
            const key = headerMap[hdr] ?? hdr;
            // Parse licenseCategories: "B,C" → ['B','C']
            if (key === 'licenseCategories' && typeof val === 'string') {
                item[key] = val.split(',').map(s => s.trim()).filter(Boolean);
            } else if (['year', 'payloadCapacityKg', 'payloadVolumeM3', 'fuelNormPer100Km'].includes(key)) {
                item[key] = val !== '' ? Number(val) : undefined;
            } else {
                item[key] = val !== '' ? val : undefined;
            }
        }
        return item;
    });
}

// ── Component ────────────────────────────────────────────────────
export default function ImportPage() {
    const [activeEntity, setActiveEntity] = useState<EntityType>('vehicles');
    const [items, setItems]     = useState<unknown[]>([]);
    const [fileName, setFileName] = useState('');
    const [importing, setImporting] = useState(false);
    const [result, setResult]   = useState<ImportResult | null>(null);
    const [error, setError]     = useState('');
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const reset = useCallback(() => {
        setItems([]);
        setFileName('');
        setResult(null);
        setError('');
    }, []);

    // Parse any supported file format
    const parseFile = useCallback(async (file: File, entity: EntityType) => {
        const name = file.name.toLowerCase();
        try {
            if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                const buf = await file.arrayBuffer();
                const parsed = parseExcel(buf, entity);
                setItems(parsed);
                setFileName(file.name);
                setResult(null);
                setError('');
            } else if (name.endsWith('.csv')) {
                const text = await file.text();
                const wb = XLSX.read(text, { type: 'string' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
                setItems(rows);
                setFileName(file.name);
                setResult(null);
                setError('');
            } else if (name.endsWith('.json')) {
                const text = await file.text();
                const parsed = JSON.parse(text);
                setItems(Array.isArray(parsed) ? parsed : []);
                setFileName(file.name);
                setResult(null);
                setError('');
            } else {
                setError('Поддерживаются форматы: .xlsx, .xls, .csv, .json');
            }
        } catch (e: any) {
            setError(`Ошибка чтения файла: ${e.message}`);
        }
    }, []);

    // Drag-n-drop handlers
    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = () => setDragging(false);
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) parseFile(file, activeEntity);
    }, [activeEntity, parseFile]);

    const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) parseFile(file, activeEntity);
        e.target.value = '';
    }, [activeEntity, parseFile]);

    async function handleImport() {
        if (!items.length) return;
        setImporting(true);
        setError('');
        setResult(null);
        try {
            if (items.length > 200) throw new Error('Максимум 200 записей за раз');
            const res = await api.post<ImportResult>(`/import/${activeEntity}`, { items });
            setResult(res);
        } catch (err: any) {
            setError(err.message || 'Ошибка импорта');
        } finally {
            setImporting(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Импорт данных</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Массовая загрузка ТС, водителей и контрагентов (Excel / CSV / JSON)
                </p>
            </div>

            <Tabs defaultValue="vehicles" className="w-full" onValueChange={(v) => {
                setActiveEntity(v as EntityType);
                reset();
            }}>
                <TabsList className="mb-4">
                    {(Object.entries(ENTITY_LABELS) as [EntityType, typeof ENTITY_LABELS[EntityType]][]).map(([key, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                            <TabsTrigger key={key} value={key} className="gap-2">
                                <Icon className="w-4 h-4" />{cfg.label}
                            </TabsTrigger>
                        );
                    })}
                </TabsList>

                {(['vehicles', 'drivers', 'contractors'] as EntityType[]).map(entity => (
                    <TabsContent key={entity} value={entity} className="m-0 space-y-4">

                        {/* Column hints */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Колонки</p>
                            <div className="flex flex-wrap gap-2">
                                {COLUMNS[entity].map(c => (
                                    <span key={c.key}
                                        className={`text-xs px-2 py-0.5 rounded-full border font-mono ${c.required
                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                            : 'bg-white border-slate-200 text-slate-500'}`}>
                                        {c.header}{c.required ? ' *' : ''}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Drop zone */}
                        <div
                            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                                ${dragging
                                    ? 'border-indigo-400 bg-indigo-50'
                                    : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50/50'}`}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv,.json"
                                className="hidden"
                                onChange={onFileChange}
                            />
                            <FileSpreadsheet className={`w-10 h-10 mx-auto mb-3 ${dragging ? 'text-indigo-500' : 'text-slate-300'}`} />
                            {fileName ? (
                                <p className="text-sm font-medium text-slate-700">{fileName}</p>
                            ) : (
                                <>
                                    <p className="text-sm font-medium text-slate-600">
                                        Перетащите файл или <span className="text-indigo-600 underline">выберите</span>
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv, .json · до 200 строк</p>
                                </>
                            )}
                        </div>

                        {/* Action bar */}
                        <div className="flex flex-wrap gap-3 items-center">
                            <button
                                onClick={() => downloadTemplate(entity)}
                                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                Скачать шаблон Excel
                            </button>
                            {fileName && (
                                <button onClick={reset}
                                    className="flex items-center gap-1 px-3 py-2 text-sm text-slate-400 hover:text-slate-600">
                                    <X className="w-4 h-4" /> Очистить
                                </button>
                            )}
                            <div className="ml-auto flex items-center gap-3">
                                {items.length > 0 && !result && (
                                    <span className="text-sm text-slate-500">
                                        📋 <strong>{items.length}</strong> записей
                                    </span>
                                )}
                                <button
                                    onClick={handleImport}
                                    disabled={importing || items.length === 0}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                    {importing
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <Upload className="w-4 h-4" />}
                                    {importing ? 'Импорт...' : 'Импортировать'}
                                </button>
                            </div>
                        </div>

                        {/* Preview table (first 5 rows) */}
                        {items.length > 0 && !result && (
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            {Object.keys(items[0] as object).map(k => (
                                                <th key={k} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{k}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(items as Record<string, unknown>[]).slice(0, 5).map((row, i) => (
                                            <tr key={i} className="border-b border-slate-100 last:border-0">
                                                {Object.values(row).map((v, j) => (
                                                    <td key={j} className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[180px] truncate">
                                                        {Array.isArray(v) ? v.join(', ') : String(v ?? '')}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {items.length > 5 && (
                                    <p className="px-3 py-2 text-xs text-slate-400 bg-slate-50">...ещё {items.length - 5} строк</p>
                                )}
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                            </div>
                        )}

                        {/* Result */}
                        {result && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                    Создано: <strong>{result.created}</strong>
                                    {result.usersCreated ? <span className="ml-2 text-emerald-600">· аккаунтов: <strong>{result.usersCreated}</strong></span> : null}
                                </div>
                                {result.errors?.length > 0 && (
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
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
