'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, MoreHorizontal, Search, Settings2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Skeleton } from './skeleton';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

// ===== Types =====

export type SortDirection = 'asc' | 'desc' | null;

export interface Column<T> {
    id: string;
    header: React.ReactNode;
    /** Cell renderer; if omitted, accessor is rendered as plain text. */
    cell?: (row: T) => React.ReactNode;
    /** Plain-value accessor; used for sort + search if not overridden. */
    accessor?: (row: T) => string | number | null | undefined;
    sortable?: boolean;
    width?: string;
    minWidth?: string;
    /** Column alignment. */
    align?: 'left' | 'right' | 'center';
    /** Monospace cell font (good for numbers/codes). */
    monospace?: boolean;
    /** Stick column to the left side; useful for the primary identifier column. */
    sticky?: 'left';
    /** Hide column by default; user can toggle via settings menu. */
    hiddenByDefault?: boolean;
    /** Force column visible (cannot be hidden via settings). */
    alwaysVisible?: boolean;
    /** Skip search index for this column even if accessor is defined. */
    excludeFromSearch?: boolean;
}

export interface DataTableFilterOption {
    value: string;
    label: string;
}

export interface DataTableFilter {
    id: string;
    label: string;
    options: DataTableFilterOption[];
    /** Currently selected value (controlled). */
    value?: string;
    /** Called when user selects a filter value (controlled). */
    onChange?: (value: string) => void;
}

export interface RowAction<T> {
    id: string;
    label: string;
    icon?: React.ReactNode;
    onClick: (row: T) => void;
    tone?: 'default' | 'danger';
    disabled?: (row: T) => boolean;
}

export type Density = 'compact' | 'comfortable' | 'dense';

export interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    keyField: keyof T | ((row: T) => string);
    loading?: boolean;

    /** Show search box above the table. */
    searchPlaceholder?: string;
    /** Column ids (or any subset) whose accessor is searched. */
    searchKeys?: Array<keyof T | string>;
    /** Custom search predicate; overrides searchKeys. */
    searchPredicate?: (row: T, query: string) => boolean;

    /** Toolbar content (typically Action buttons) shown to the right. */
    toolbar?: React.ReactNode;
    /** Filter dropdowns shown above the table. */
    filters?: DataTableFilter[];

    /** Render bulk-action buttons when at least one row is selected. */
    bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;

    /** Hover row actions; rendered in a 3-dot menu at the right. */
    rowActions?: (row: T) => RowAction<T>[];

    /** Row click handler; row becomes button-like. */
    onRowClick?: (row: T) => void;

    /** Custom row class function. */
    rowClassName?: (row: T) => string;

    emptyState?: React.ReactNode;
    density?: Density;

    /** Client-side pagination size (set 0 to disable). */
    pageSize?: number;

    /** Optional stable id for persisting column visibility in localStorage. */
    tableId?: string;

    /** Override outer card class. */
    className?: string;

    /** Initial sort. */
    defaultSort?: { columnId: string; direction: Exclude<SortDirection, null> };
}

// ===== Helpers =====

function getRowKey<T>(row: T, keyField: DataTableProps<T>['keyField']): string {
    if (typeof keyField === 'function') return keyField(row);
    const v = row[keyField] as unknown;
    return String(v);
}

const densityRowClass: Record<Density, string> = {
    compact: 'h-8',
    comfortable: 'h-10',
    dense: 'h-7',
};
const densityCellClass: Record<Density, string> = {
    compact: 'px-3 py-1.5',
    comfortable: 'px-4 py-2.5',
    dense: 'px-2.5 py-1',
};

function readColVis(tableId: string | undefined): Record<string, boolean> | null {
    if (!tableId || typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(`dt-cols-${tableId}`);
        return raw ? JSON.parse(raw) as Record<string, boolean> : null;
    } catch {
        return null;
    }
}

function writeColVis(tableId: string | undefined, vis: Record<string, boolean>) {
    if (!tableId || typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(`dt-cols-${tableId}`, JSON.stringify(vis));
    } catch { /* ignore */ }
}

// ===== Row actions menu =====

function RowActionsMenu<T>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    return (
        <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                aria-label="Действия"
                onClick={() => setOpen((s) => !s)}
                className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
                <MoreHorizontal className="w-4 h-4" />
            </button>
            {open && (
                <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-neutral-200 bg-white shadow-soft py-1"
                >
                    {actions.map((a) => {
                        const disabled = a.disabled?.(row);
                        return (
                            <button
                                key={a.id}
                                role="menuitem"
                                disabled={disabled}
                                onClick={() => { setOpen(false); a.onClick(row); }}
                                className={cn(
                                    'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors',
                                    'disabled:opacity-50 disabled:cursor-not-allowed',
                                    a.tone === 'danger'
                                        ? 'text-danger-600 hover:bg-danger-50'
                                        : 'text-neutral-700 hover:bg-neutral-100',
                                )}
                            >
                                {a.icon && <span className="shrink-0 inline-flex">{a.icon}</span>}
                                <span>{a.label}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ===== Column visibility menu =====

function ColumnVisibilityMenu<T>({
    columns,
    visible,
    onChange,
}: {
    columns: Column<T>[];
    visible: Record<string, boolean>;
    onChange: (next: Record<string, boolean>) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                aria-label="Столбцы"
                onClick={() => setOpen((s) => !s)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-600 hover:bg-neutral-50"
            >
                <Settings2 className="w-4 h-4" />
                Столбцы
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded-lg border border-neutral-200 bg-white shadow-soft py-1 max-h-80 overflow-auto">
                    {columns.filter((c) => !c.alwaysVisible).map((c) => {
                        const checked = visible[c.id] !== false;
                        return (
                            <label
                                key={c.id}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onChange({ ...visible, [c.id]: !checked })}
                                    className="rounded border-neutral-300"
                                />
                                <span>{typeof c.header === 'string' ? c.header : c.id}</span>
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ===== Main component =====

export function DataTable<T>(props: DataTableProps<T>) {
    const {
        data,
        columns,
        keyField,
        loading,
        searchPlaceholder,
        searchKeys,
        searchPredicate,
        toolbar,
        filters,
        bulkActions,
        rowActions,
        onRowClick,
        rowClassName,
        emptyState,
        density = 'comfortable',
        pageSize = 50,
        tableId,
        className,
        defaultSort,
    } = props;

    const [search, setSearch] = React.useState('');
    const [sort, setSort] = React.useState<{ columnId: string; direction: Exclude<SortDirection, null> } | null>(
        defaultSort ?? null,
    );
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [page, setPage] = React.useState(1);
    const searchRef = React.useRef<HTMLInputElement>(null);

    // Column visibility
    const [vis, setVis] = React.useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        for (const c of columns) initial[c.id] = !c.hiddenByDefault;
        const stored = readColVis(tableId);
        // Отсеиваем устаревшие ключи: применяем только сохранённые значения
        // для столбцов, которые существуют сейчас (иначе мусор копится в localStorage).
        if (stored) {
            for (const c of columns) {
                if (Object.prototype.hasOwnProperty.call(stored, c.id)) {
                    initial[c.id] = stored[c.id];
                }
            }
        }
        return initial;
    });

    React.useEffect(() => { writeColVis(tableId, vis); }, [vis, tableId]);

    const visibleColumns = React.useMemo(
        () => columns.filter((c) => c.alwaysVisible || vis[c.id] !== false),
        [columns, vis],
    );

    // Keyboard shortcuts
    React.useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                if (e.key === 'Escape' && target === searchRef.current) {
                    setSearch('');
                }
                return;
            }
            if (e.key === '/') {
                e.preventDefault();
                searchRef.current?.focus();
            } else if (e.key === 'Escape') {
                if (selected.size > 0) setSelected(new Set());
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [selected.size]);

    // Filter / search / sort pipeline
    const processed = React.useMemo(() => {
        let rows = data;

        // Apply controlled filter values (filters' visual UI is owned by parent via onChange)
        // We don't filter here — filters are expected to drive parent state; we just render UI.

        // Search
        const q = search.trim().toLowerCase();
        if (q) {
            if (searchPredicate) {
                rows = rows.filter((r) => searchPredicate(r, q));
            } else if (searchKeys && searchKeys.length > 0) {
                rows = rows.filter((r) => searchKeys.some((k) => {
                    const col = columns.find((c) => c.id === k);
                    let v: unknown;
                    if (col?.accessor) v = col.accessor(r);
                    else v = (r as unknown as Record<string, unknown>)[k as string];
                    if (v == null) return false;
                    return String(v).toLowerCase().includes(q);
                }));
            } else {
                // Fall back: search all columns with accessor
                rows = rows.filter((r) => columns.some((c) => {
                    if (c.excludeFromSearch || !c.accessor) return false;
                    const v = c.accessor(r);
                    if (v == null) return false;
                    return String(v).toLowerCase().includes(q);
                }));
            }
        }

        // Sort
        if (sort) {
            const col = columns.find((c) => c.id === sort.columnId);
            if (col?.accessor) {
                const dir = sort.direction === 'asc' ? 1 : -1;
                rows = [...rows].sort((a, b) => {
                    const va = col.accessor!(a);
                    const vb = col.accessor!(b);
                    if (va == null && vb == null) return 0;
                    if (va == null) return 1;
                    if (vb == null) return -1;
                    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
                    return String(va).localeCompare(String(vb), 'ru') * dir;
                });
            }
        }

        return rows;
    }, [data, search, sort, columns, searchKeys, searchPredicate]);

    // Reset page when filters/search change
    React.useEffect(() => { setPage(1); }, [search, sort, data.length]);

    // Стабильный ключ набора строк: сериализованный список row-key по keyField.
    // Зависеть от ссылки `data` нельзя — страницы, считающие data инлайн без
    // useMemo, дают новый массив на каждый re-render, и выделение сбрасывалось
    // бы сразу после клика по чекбоксу (ломая bulk-действия). Этот ключ меняется
    // только при РЕАЛЬНОЙ смене набора строк.
    const dataKey = React.useMemo(
        () => data.map((r) => getRowKey(r, keyField)).join(''),
        [data, keyField],
    );

    // Сбрасываем выделение при смене идентичности набора строк — иначе bulk-бар
    // показывает стейл-счётчик по ключам, которых уже нет в наборе.
    React.useEffect(() => { setSelected(new Set()); }, [dataKey]);

    const totalRows = processed.length;
    const usePaging = pageSize > 0;
    const totalPages = usePaging ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
    const currentPage = Math.min(page, totalPages);
    const pageStart = usePaging ? (currentPage - 1) * pageSize : 0;
    const pageEnd = usePaging ? Math.min(pageStart + pageSize, totalRows) : totalRows;
    const pageRows = usePaging ? processed.slice(pageStart, pageEnd) : processed;

    function toggleSort(columnId: string) {
        const col = columns.find((c) => c.id === columnId);
        if (!col?.sortable) return;
        setSort((s) => {
            if (!s || s.columnId !== columnId) return { columnId, direction: 'asc' };
            if (s.direction === 'asc') return { columnId, direction: 'desc' };
            return null;
        });
    }

    function toggleRowSelected(key: string) {
        setSelected((s) => {
            const next = new Set(s);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }

    function togglePageSelected() {
        setSelected((s) => {
            const next = new Set(s);
            const pageKeys = pageRows.map((r) => getRowKey(r, keyField));
            const allSelected = pageKeys.every((k) => next.has(k));
            if (allSelected) {
                for (const k of pageKeys) next.delete(k);
            } else {
                for (const k of pageKeys) next.add(k);
            }
            return next;
        });
    }

    const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(getRowKey(r, keyField)));
    const someSelected = selected.size > 0;
    const selectedRows = React.useMemo(
        () => data.filter((r) => selected.has(getRowKey(r, keyField))),
        [data, selected, keyField],
    );

    const hasSelection = !!bulkActions;
    const hasRowActions = !!rowActions;

    const cellPad = densityCellClass[density];
    const rowH = densityRowClass[density];

    return (
        <div className={cn('bg-white rounded-xl shadow-soft border border-neutral-200 overflow-hidden', className)}>
            {/* Toolbar */}
            <div className="border-b border-neutral-200 px-3 py-2.5 flex flex-wrap items-center gap-2">
                {someSelected && bulkActions ? (
                    <div className="flex items-center gap-2 w-full">
                        <span className="text-sm text-neutral-600 font-medium">
                            Выбрано: {selected.size}
                        </span>
                        <div className="flex items-center gap-2 flex-1 flex-wrap">
                            {bulkActions(selectedRows, () => setSelected(new Set()))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelected(new Set())}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-800 rounded-md hover:bg-neutral-100"
                        >
                            <X className="w-3.5 h-3.5" />
                            Сбросить
                        </button>
                    </div>
                ) : (
                    <>
                        {searchPlaceholder !== undefined && (
                            <div className="relative flex-1 min-w-[200px] max-w-xs">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    placeholder={searchPlaceholder}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full h-9 pl-10 pr-8 rounded-lg border border-neutral-200 bg-white text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-neutral-400 hover:text-neutral-700"
                                        aria-label="Очистить поиск"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        )}
                        {filters?.map((f) => (
                            <div key={f.id} className="relative">
                                <select
                                    value={f.value ?? ''}
                                    onChange={(e) => f.onChange?.(e.target.value)}
                                    aria-label={f.label}
                                    className="appearance-none h-9 pl-3 pr-8 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 cursor-pointer"
                                >
                                    <option value="">{f.label}: все</option>
                                    {f.options.map((o) => (
                                        <option key={o.value} value={o.value}>{f.label}: {o.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                            </div>
                        ))}
                        <div className="flex-1" />
                        {tableId && (
                            <ColumnVisibilityMenu columns={columns} visible={vis} onChange={setVis} />
                        )}
                        {toolbar}
                    </>
                )}
            </div>

            {/* Table */}
            <div className="relative overflow-auto max-h-[calc(100vh-280px)]">
                <table
                    role="table"
                    className="w-full text-sm border-separate border-spacing-0"
                >
                    <thead className="sticky top-0 z-10 bg-neutral-50/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-50/80">
                        <tr>
                            {hasSelection && (
                                <th
                                    scope="col"
                                    className={cn(
                                        'sticky left-0 z-20 bg-neutral-50 w-10 border-b border-neutral-200',
                                        cellPad,
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        aria-label="Выделить все"
                                        checked={allPageSelected}
                                        onChange={togglePageSelected}
                                        className="rounded border-neutral-300 cursor-pointer"
                                    />
                                </th>
                            )}
                            {visibleColumns.map((c) => {
                                const isSorted = sort?.columnId === c.id;
                                const SortIcon = !c.sortable
                                    ? null
                                    : !isSorted
                                        ? ChevronsUpDown
                                        : sort!.direction === 'asc'
                                            ? ChevronUp
                                            : ChevronDown;
                                return (
                                    <th
                                        key={c.id}
                                        scope="col"
                                        style={{ width: c.width, minWidth: c.minWidth }}
                                        className={cn(
                                            'text-xs font-semibold text-neutral-600 uppercase tracking-wide border-b border-neutral-200 text-left whitespace-nowrap',
                                            cellPad,
                                            c.align === 'right' && 'text-right',
                                            c.align === 'center' && 'text-center',
                                            c.sticky === 'left' && 'sticky left-0 z-20 bg-neutral-50',
                                            hasSelection && c.sticky === 'left' && 'left-10',
                                        )}
                                    >
                                        {c.sortable ? (
                                            <button
                                                type="button"
                                                onClick={() => toggleSort(c.id)}
                                                className="inline-flex items-center gap-1 hover:text-neutral-900 transition-colors"
                                            >
                                                <span>{c.header}</span>
                                                {SortIcon && (
                                                    <SortIcon
                                                        className={cn(
                                                            'w-3.5 h-3.5',
                                                            isSorted ? 'text-brand-600' : 'text-neutral-400',
                                                        )}
                                                    />
                                                )}
                                            </button>
                                        ) : (
                                            <span>{c.header}</span>
                                        )}
                                    </th>
                                );
                            })}
                            {hasRowActions && (
                                <th scope="col" className={cn('w-10 border-b border-neutral-200', cellPad)} />
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: Math.min(pageSize || 8, 8) }).map((_, i) => (
                                <tr key={`sk-${i}`} className={rowH}>
                                    {hasSelection && <td className={cn(cellPad, 'border-b border-neutral-100')}><Skeleton className="h-4 w-4" /></td>}
                                    {visibleColumns.map((c) => (
                                        <td key={c.id} className={cn(cellPad, 'border-b border-neutral-100')}>
                                            <Skeleton className="h-4 w-full max-w-[140px]" />
                                        </td>
                                    ))}
                                    {hasRowActions && <td className={cn(cellPad, 'border-b border-neutral-100')} />}
                                </tr>
                            ))
                        ) : pageRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={visibleColumns.length + (hasSelection ? 1 : 0) + (hasRowActions ? 1 : 0)}
                                    className="p-8"
                                >
                                    {emptyState ?? (
                                        <div className="text-center text-sm text-neutral-500 py-8">
                                            {search ? 'Ничего не найдено. Попробуйте изменить запрос.' : 'Нет данных.'}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ) : (
                            pageRows.map((row) => {
                                const key = getRowKey(row, keyField);
                                const isSel = selected.has(key);
                                const actions = rowActions?.(row) ?? [];
                                return (
                                    <tr
                                        key={key}
                                        data-selected={isSel || undefined}
                                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                                        onKeyDown={onRowClick ? (e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onRowClick(row);
                                            }
                                        } : undefined}
                                        tabIndex={onRowClick ? 0 : undefined}
                                        role={onRowClick ? 'button' : undefined}
                                        className={cn(
                                            'group transition-colors',
                                            rowH,
                                            onRowClick && 'cursor-pointer',
                                            'hover:bg-neutral-50',
                                            isSel && 'bg-brand-50/40 hover:bg-brand-50/60',
                                            rowClassName?.(row),
                                        )}
                                    >
                                        {hasSelection && (
                                            <td
                                                onClick={(e) => e.stopPropagation()}
                                                className={cn(cellPad, 'border-b border-neutral-100 sticky left-0 bg-white group-hover:bg-neutral-50', isSel && 'bg-brand-50/40 group-hover:bg-brand-50/60')}
                                            >
                                                <input
                                                    type="checkbox"
                                                    aria-label="Выделить строку"
                                                    checked={isSel}
                                                    onChange={() => toggleRowSelected(key)}
                                                    className="rounded border-neutral-300 cursor-pointer"
                                                />
                                            </td>
                                        )}
                                        {visibleColumns.map((c) => {
                                            const content = c.cell ? c.cell(row) : (c.accessor ? c.accessor(row) : null);
                                            return (
                                                <td
                                                    key={c.id}
                                                    style={{ width: c.width, minWidth: c.minWidth }}
                                                    className={cn(
                                                        'border-b border-neutral-100 text-neutral-700',
                                                        cellPad,
                                                        c.align === 'right' && 'text-right',
                                                        c.align === 'center' && 'text-center',
                                                        c.monospace && 'font-mono text-[12.5px]',
                                                        c.sticky === 'left' && 'sticky left-0 bg-white group-hover:bg-neutral-50',
                                                        isSel && c.sticky === 'left' && 'bg-brand-50/40 group-hover:bg-brand-50/60',
                                                        hasSelection && c.sticky === 'left' && 'left-10',
                                                    )}
                                                >
                                                    {content as React.ReactNode}
                                                </td>
                                            );
                                        })}
                                        {hasRowActions && (
                                            <td className={cn(cellPad, 'border-b border-neutral-100 text-right')}>
                                                {actions.length > 0 && (
                                                    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                                        <RowActionsMenu row={row} actions={actions} />
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination footer */}
            {usePaging && totalRows > 0 && (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-neutral-200 text-xs text-neutral-500 flex-wrap">
                    <div>
                        Показано <span className="font-medium text-neutral-700">{pageStart + 1}–{pageEnd}</span> из{' '}
                        <span className="font-medium text-neutral-700">{totalRows}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={currentPage <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="inline-flex items-center justify-center h-7 px-2 rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Предыдущая страница"
                        >
                            ←
                        </button>
                        <span className="px-1.5">
                            Стр. <span className="font-medium text-neutral-700">{currentPage}</span> из{' '}
                            <span className="font-medium text-neutral-700">{totalPages}</span>
                        </span>
                        <button
                            type="button"
                            disabled={currentPage >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className="inline-flex items-center justify-center h-7 px-2 rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Следующая страница"
                        >
                            →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ===== Pill (status badge) re-usable here too =====

export type PillTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const pillToneClass: Record<PillTone, string> = {
    neutral: 'bg-neutral-100 text-neutral-700',
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-700',
    info: 'bg-sky-50 text-sky-700',
};

export function Pill({
    tone = 'neutral',
    children,
    className,
    icon: Icon,
}: {
    tone?: PillTone;
    children: React.ReactNode;
    className?: string;
    /**
     * Optional Lucide-style icon component. Renders inline before the label so
     * severity is not communicated by colour alone — important for colour-blind
     * users. Pass for danger/warning/success Pills on critical screens.
     */
    icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}) {
    return (
        <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            pillToneClass[tone],
            className,
        )}>
            {Icon ? <Icon className="h-3 w-3" aria-hidden /> : null}
            {children}
        </span>
    );
}
