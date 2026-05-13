'use client';

// ============================================================
// Round 3B — D10: Audit log UI
// ============================================================
import { useEffect, useMemo, useState, useCallback, Fragment } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SkeletonRow } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import {
    History, Download, Filter, ChevronLeft, ChevronRight, ChevronDown, X, Search,
} from 'lucide-react';

interface AuditEvent {
    id: string;
    timestamp: string;
    authorId: string;
    authorRole: string;
    authorName: string | null;
    eventType: string;
    entityType: string;
    entityId: string;
    data: Record<string, unknown>;
    version: number;
    conflict: boolean;
}

interface ListResponse {
    success: boolean;
    data: AuditEvent[];
    pagination: { page: number; limit: number; total: number; pages: number };
}

interface TypesResponse {
    success: boolean;
    data: { eventTypes: string[]; entityTypes: string[] };
}

const PAGE_SIZE = 50;
const ALL = '__all__';

function formatDate(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
    } catch { return iso; }
}

function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

export default function AuditLogPage() {
    const [rows, setRows] = useState<AuditEvent[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    // filter state
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [entityType, setEntityType] = useState<string>(ALL);
    const [eventType, setEventType] = useState<string>(ALL);
    const [search, setSearch] = useState('');

    // distinct values for dropdowns
    const [eventTypes, setEventTypes] = useState<string[]>([]);
    const [entityTypes, setEntityTypes] = useState<string[]>([]);

    const buildQuery = useCallback((p: number) => {
        const params = new URLSearchParams();
        params.set('page', String(p));
        params.set('limit', String(PAGE_SIZE));
        if (from) params.set('from', new Date(from).toISOString());
        if (to) params.set('to', new Date(to).toISOString());
        if (entityType && entityType !== ALL) params.set('entity_type', entityType);
        if (eventType && eventType !== ALL) params.set('event_type', eventType);
        if (search.trim()) params.set('search', search.trim());
        return params.toString();
    }, [from, to, entityType, eventType, search]);

    const load = useCallback(async (p: number) => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get<ListResponse>(`/audit-log?${buildQuery(p)}`);
            setRows(res.data);
            setTotal(res.pagination.total);
            setPages(res.pagination.pages);
            setPage(res.pagination.page);
        } catch (err: any) {
            setError(err?.message ?? 'Ошибка загрузки');
        } finally {
            setLoading(false);
        }
    }, [buildQuery]);

    useEffect(() => {
        api.get<TypesResponse>('/audit-log/types').then((res) => {
            setEventTypes(res.data.eventTypes);
            setEntityTypes(res.data.entityTypes);
        }).catch(() => { /* non-fatal */ });
    }, []);

    useEffect(() => {
        load(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onApplyFilters = () => load(1);
    const onResetFilters = () => {
        setFrom(''); setTo('');
        setEntityType(ALL); setEventType(ALL);
        setSearch('');
        // load with empty filters (state will update first; use timeout 0)
        setTimeout(() => load(1), 0);
    };

    const exportCsv = async () => {
        // Pull up to 5000 rows for export
        const params = new URLSearchParams(buildQuery(1));
        params.set('limit', '500');
        const collected: AuditEvent[] = [];
        let p = 1;
        while (collected.length < 5000) {
            params.set('page', String(p));
            const res = await api.get<ListResponse>(`/audit-log?${params.toString()}`);
            collected.push(...res.data);
            if (p >= res.pagination.pages || res.data.length === 0) break;
            p++;
        }
        const headers = ['timestamp', 'authorName', 'authorRole', 'eventType', 'entityType', 'entityId', 'data'];
        const lines = [headers.join(',')];
        for (const r of collected) {
            lines.push([
                csvEscape(r.timestamp),
                csvEscape(r.authorName ?? r.authorId),
                csvEscape(r.authorRole),
                csvEscape(r.eventType),
                csvEscape(r.entityType),
                csvEscape(r.entityId),
                csvEscape(r.data),
            ].join(','));
        }
        const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const filtersActive = useMemo(() =>
        Boolean(from || to || (entityType && entityType !== ALL) || (eventType && eventType !== ALL) || search.trim()),
    [from, to, entityType, eventType, search]);

    const [filtersOpen, setFiltersOpen] = useState(false);
    const activeFiltersCount = [from, to, entityType !== ALL, eventType !== ALL, search.trim()].filter(Boolean).length;

    return (
        <div className="space-y-5">
            <PageHeader
                icon={History}
                iconTone="brand"
                title="Журнал событий"
                description="Append-only журнал всех действий пользователей с криптографической версионностью."
                actions={
                    <Button onClick={exportCsv} variant="outline" leftIcon={<Download className="w-4 h-4" />}>
                        Экспорт CSV
                    </Button>
                }
                meta={
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 font-medium text-neutral-700">
                            Всего записей: <span className="font-bold tabular-nums">{total.toLocaleString('ru-RU')}</span>
                        </span>
                        {activeFiltersCount > 0 && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 font-medium text-brand-700">
                                Активных фильтров: {activeFiltersCount}
                            </span>
                        )}
                    </div>
                }
            />

            {/* Compact toolbar with collapsible filters */}
            <div className="rounded-xl border border-neutral-200 bg-white">
                <div className="flex items-center gap-2 p-2.5 flex-wrap">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <Input
                            placeholder="Поиск по типу события..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && onApplyFilters()}
                            className="pl-9"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setFiltersOpen((v) => !v)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filtersOpen || activeFiltersCount > 0
                            ? 'bg-brand-50 text-brand-700 border border-brand-200'
                            : 'bg-neutral-50 text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
                            }`}
                    >
                        <Filter className="w-3.5 h-3.5" />
                        Фильтры
                        {activeFiltersCount > 0 && (
                            <span className="bg-brand-600 text-white text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
                                {activeFiltersCount}
                            </span>
                        )}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <Button size="sm" variant="brand" onClick={onApplyFilters} disabled={loading}>Применить</Button>
                    {filtersActive && (
                        <button
                            type="button"
                            onClick={onResetFilters}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900"
                        >
                            <X className="w-3 h-3" /> Сбросить
                        </button>
                    )}
                </div>

                {filtersOpen && (
                    <div className="border-t border-neutral-100 p-3 bg-neutral-50/40">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                                <label className="text-xs font-medium text-neutral-600 block mb-1">С даты</label>
                                <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-neutral-600 block mb-1">По дату</label>
                                <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-neutral-600 block mb-1">Тип сущности</label>
                                <Select
                                    value={entityType}
                                    onChange={(e) => setEntityType(e.target.value)}
                                    options={[
                                        { value: ALL, label: 'Все' },
                                        ...entityTypes.map((t) => ({ value: t, label: t })),
                                    ]}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-neutral-600 block mb-1">Тип события</label>
                                <Select
                                    value={eventType}
                                    onChange={(e) => setEventType(e.target.value)}
                                    options={[
                                        { value: ALL, label: 'Все' },
                                        ...eventTypes.map((t) => ({ value: t, label: t })),
                                    ]}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">
                                <th className="px-3 py-2.5 w-40">Время</th>
                                <th className="px-3 py-2.5">Автор</th>
                                <th className="px-3 py-2.5">Роль</th>
                                <th className="px-3 py-2.5">Событие</th>
                                <th className="px-3 py-2.5">Сущность</th>
                                <th className="px-3 py-2.5 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && rows.length === 0 && (
                                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} columns={6} />)
                            )}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={6}>
                                    <div className="p-6">
                                        <EmptyState
                                            icon={History}
                                            title="Нет событий"
                                            description={filtersActive ? 'Попробуйте сбросить фильтры.' : 'События появятся, когда пользователи начнут работать с системой.'}
                                        />
                                    </div>
                                </td></tr>
                            )}
                            {rows.map((r) => {
                                const isOpen = !!expanded[r.id];
                                return (
                                    <Fragment key={r.id}>
                                        <tr className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/60 transition-colors">
                                            <td className="px-3 py-2.5 whitespace-nowrap text-neutral-600 font-mono text-[11px]">{formatDate(r.timestamp)}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-neutral-800">{r.authorName ?? <span className="text-neutral-400 font-mono text-xs">{r.authorId.slice(0, 8)}…</span>}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                <span className="inline-block px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-[11px] font-medium">{r.authorRole}</span>
                                            </td>
                                            <td className="px-3 py-2.5 font-mono text-xs max-w-[260px]">
                                                <span className="block truncate text-neutral-800" title={r.eventType}>{r.eventType}</span>
                                            </td>
                                            <td className="px-3 py-2.5 whitespace-nowrap text-xs" title={`${r.entityType} · ${r.entityId}`}>
                                                <span className="text-neutral-700">{r.entityType}</span>
                                                <span className="text-neutral-400"> · {r.entityId.slice(0, 8)}…</span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                <button
                                                    onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                                                    className="text-neutral-400 hover:text-neutral-900 transition-colors"
                                                    aria-label={isOpen ? 'Свернуть' : 'Раскрыть'}
                                                    aria-expanded={isOpen}
                                                >
                                                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                                </button>
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="border-b border-neutral-100 bg-neutral-50/50">
                                                <td colSpan={6} className="px-3 py-3">
                                                    <pre className="text-[11px] text-neutral-700 bg-white border border-neutral-200 rounded-lg p-3 overflow-x-auto font-mono leading-relaxed">{JSON.stringify(r.data, null, 2)}</pre>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {pages > 1 && (
                    <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-2.5 bg-neutral-50">
                        <span className="text-xs text-neutral-500 tabular-nums">
                            Страница <strong className="text-neutral-700">{page}</strong> из <strong className="text-neutral-700">{pages}</strong>
                        </span>
                        <div className="flex gap-1">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => load(page - 1)}
                                disabled={loading || page <= 1}
                            ><ChevronLeft className="w-4 h-4" /></Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => load(page + 1)}
                                disabled={loading || page >= pages}
                            ><ChevronRight className="w-4 h-4" /></Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
