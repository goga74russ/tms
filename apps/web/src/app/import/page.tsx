'use client';

// ============================================================
// Round 3B — D11: Bulk Excel import with server-side templates
// 4 cards: Контрагенты / ТС / Водители / Заказы
// Each card: download template (server) + upload + preview + commit
// ============================================================
import { useState, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import {
    Upload, Truck, Users, Building2, Package, CheckCircle2,
    AlertCircle, Loader2, Download, FileSpreadsheet, X,
} from 'lucide-react';

type EntityType = 'contractors' | 'vehicles' | 'drivers' | 'orders';

interface PreviewRow {
    index: number;
    data: Record<string, unknown>;
    valid: boolean;
    errors: string[];
}

interface PreviewResponse {
    success: boolean;
    data: {
        type: EntityType;
        total: number;
        validCount: number;
        errorCount: number;
        rows: PreviewRow[];
    };
}

interface CommitResult {
    created: number;
    usersCreated?: number;
    errors: { index: number; error: string }[];
}

const ENTITIES: Record<EntityType, { label: string; description: string; icon: React.ElementType; color: string }> = {
    contractors: {
        label: 'Контрагенты',
        description: 'Клиенты, грузоотправители, грузополучатели',
        icon: Building2,
        color: 'text-blue-600 bg-blue-50 border-blue-200',
    },
    vehicles: {
        label: 'Транспорт',
        description: 'Тягачи, фургоны, рефрижераторы, самосвалы',
        icon: Truck,
        color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    },
    drivers: {
        label: 'Водители',
        description: 'С автосозданием учётной записи',
        icon: Users,
        color: 'text-amber-600 bg-amber-50 border-amber-200',
    },
    orders: {
        label: 'Заявки',
        description: 'Связь с контрагентом по ИНН',
        icon: Package,
        color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    },
};

export default function ImportPage() {
    const [openCard, setOpenCard] = useState<EntityType | null>(null);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Импорт данных</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Скачайте шаблон Excel, заполните и загрузите обратно. Перед записью покажем предпросмотр с подсветкой ошибок.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {(Object.keys(ENTITIES) as EntityType[]).map((entity) => (
                    <ImportCard
                        key={entity}
                        entity={entity}
                        active={openCard === entity}
                        onOpen={() => setOpenCard((cur) => cur === entity ? null : entity)}
                    />
                ))}
            </div>

            {openCard && (
                <ImportPanel entity={openCard} onClose={() => setOpenCard(null)} />
            )}
        </div>
    );
}

function ImportCard({
    entity,
    active,
    onOpen,
}: {
    entity: EntityType;
    active: boolean;
    onOpen: () => void;
}) {
    const cfg = ENTITIES[entity];
    const Icon = cfg.icon;

    async function downloadTemplate(e: React.MouseEvent) {
        e.stopPropagation();
        try {
            const res = await fetch(`/api/import/templates/${entity}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Не удалось скачать шаблон');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `template_${entity}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            alert(err?.message ?? 'Ошибка');
        }
    }

    return (
        <button
            type="button"
            onClick={onOpen}
            className={`text-left rounded-xl border-2 p-4 transition-all ${
                active
                    ? 'border-indigo-400 bg-indigo-50/40 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
        >
            <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${cfg.color}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                    <div className="font-semibold text-slate-900">{cfg.label}</div>
                    <p className="text-xs text-slate-500 mt-0.5">{cfg.description}</p>
                </div>
            </div>
            <div className="mt-3 flex gap-2">
                <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                    <Download className="w-3 h-3" />Шаблон
                </button>
                <span className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md text-indigo-600 font-medium">
                    <Upload className="w-3 h-3" />{active ? 'Скрыть' : 'Загрузить'}
                </span>
            </div>
        </button>
    );
}

function ImportPanel({
    entity,
    onClose,
}: {
    entity: EntityType;
    onClose: () => void;
}) {
    const cfg = ENTITIES[entity];
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [fileName, setFileName] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<PreviewResponse['data'] | null>(null);
    const [committing, setCommitting] = useState(false);
    const [result, setResult] = useState<CommitResult | null>(null);
    const [error, setError] = useState('');
    const [dragging, setDragging] = useState(false);

    const reset = () => {
        setFileName(''); setPreview(null); setResult(null); setError('');
    };

    const onSelectFile = useCallback(async (file: File) => {
        if (!/\.(xlsx|xls)$/i.test(file.name)) {
            setError('Поддерживаются только .xlsx файлы');
            return;
        }
        setLoading(true);
        setError('');
        setResult(null);
        setPreview(null);
        setFileName(file.name);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await api.post<PreviewResponse>(`/import/${entity}/preview`, fd);
            setPreview(res.data);
        } catch (err: any) {
            setError(err?.message ?? 'Ошибка предпросмотра');
        } finally {
            setLoading(false);
        }
    }, [entity]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onSelectFile(file);
    }, [onSelectFile]);

    const onCommit = useCallback(async () => {
        if (!preview) return;
        const validRows = preview.rows.filter((r) => r.valid).map((r) => r.data);
        if (validRows.length === 0) {
            setError('Нет валидных строк для импорта');
            return;
        }
        setCommitting(true);
        setError('');
        try {
            const res = await api.post<{ success: boolean; data: CommitResult }>(`/import/${entity}`, { items: validRows });
            setResult(res.data);
        } catch (err: any) {
            setError(err?.message ?? 'Ошибка импорта');
        } finally {
            setCommitting(false);
        }
    }, [entity, preview]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-base">
                        <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                        Импорт: {cfg.label}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
                        <X className="w-4 h-4" />
                    </button>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Drop zone */}
                <div
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                        dragging
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50/50'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) onSelectFile(f);
                            e.target.value = '';
                        }}
                    />
                    <FileSpreadsheet className={`w-8 h-8 mx-auto mb-2 ${dragging ? 'text-indigo-500' : 'text-slate-300'}`} />
                    {fileName ? (
                        <p className="text-sm font-medium text-slate-700">{fileName}</p>
                    ) : (
                        <>
                            <p className="text-sm font-medium text-slate-600">
                                Перетащите .xlsx или <span className="text-indigo-600 underline">выберите файл</span>
                            </p>
                            <p className="text-xs text-slate-400 mt-1">До 200 строк за импорт</p>
                        </>
                    )}
                </div>

                {loading && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin" />Парсим файл...
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
                    </div>
                )}

                {/* Preview */}
                {preview && !result && (
                    <>
                        <div className="grid grid-cols-3 gap-3">
                            <Stat label="Всего строк" value={preview.total} />
                            <Stat label="Валидных" value={preview.validCount} valueClass="text-emerald-700" />
                            <Stat label="С ошибками" value={preview.errorCount} valueClass={preview.errorCount > 0 ? 'text-rose-700' : ''} />
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-96">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold text-slate-500 w-10">#</th>
                                        <th className="px-3 py-2 text-left font-semibold text-slate-500">Данные</th>
                                        <th className="px-3 py-2 text-left font-semibold text-slate-500 w-64">Ошибки</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.rows.slice(0, 100).map((row) => (
                                        <tr
                                            key={row.index}
                                            className={`border-b border-slate-100 ${row.valid ? '' : 'bg-rose-50/30'}`}
                                        >
                                            <td className="px-3 py-2 text-slate-400 font-mono">{row.index + 1}</td>
                                            <td className="px-3 py-2 text-slate-700">
                                                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                                    {Object.entries(row.data).slice(0, 4).map(([k, v]) => (
                                                        <span key={k} className="text-xs">
                                                            <span className="text-slate-400">{k}:</span> <span className="font-medium">{Array.isArray(v) ? v.join(', ') : String(v ?? '—')}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2">
                                                {row.errors.length > 0 ? (
                                                    <ul className="text-rose-700 space-y-0.5">
                                                        {row.errors.map((e, i) => <li key={i}>• {e}</li>)}
                                                    </ul>
                                                ) : (
                                                    <span className="text-emerald-600">OK</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {preview.rows.length > 100 && (
                                <p className="px-3 py-2 text-xs text-slate-400 bg-slate-50">…и ещё {preview.rows.length - 100} строк</p>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={reset}
                                className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                            >
                                Отменить
                            </button>
                            <button
                                onClick={onCommit}
                                disabled={committing || preview.validCount === 0}
                                className="ml-auto flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {committing
                                    ? <><Loader2 className="w-4 h-4 animate-spin" />Импорт…</>
                                    : <><Upload className="w-4 h-4" />Подтвердить импорт ({preview.validCount})</>}
                            </button>
                        </div>
                    </>
                )}

                {/* Result */}
                {result && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                            Создано: <strong>{result.created}</strong>
                            {result.usersCreated ? <span className="ml-2">· аккаунтов: <strong>{result.usersCreated}</strong></span> : null}
                        </div>
                        {result.errors?.length > 0 && (
                            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                                <p className="font-medium mb-1">Ошибки ({result.errors.length}):</p>
                                <ul className="list-disc pl-5 space-y-0.5">
                                    {result.errors.slice(0, 10).map((e, i) => (
                                        <li key={i}>Строка {e.index + 1}: {e.error}</li>
                                    ))}
                                    {result.errors.length > 10 && <li>…ещё {result.errors.length - 10}</li>}
                                </ul>
                            </div>
                        )}
                        <button
                            onClick={reset}
                            className="text-sm text-indigo-600 hover:underline"
                        >
                            Импортировать ещё файл
                        </button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function Stat({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-lg font-semibold text-slate-900 ${valueClass ?? ''}`}>{value}</div>
        </div>
    );
}
