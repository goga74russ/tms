'use client';

import { useEffect, useRef } from 'react';
import { Map as MapIcon, Wifi, WifiOff, RefreshCw, Search, Moon, Sun, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type CockpitFilter = 'all' | 'blocking' | 'warning' | 'ok';

interface CockpitTopBarProps {
    wsConnected: boolean;
    loading: boolean;
    onRefresh: () => void;
    blockingCount: number;
    warningCount: number;
    okCount: number;
    activeFilter: CockpitFilter;
    onFilterChange: (filter: CockpitFilter) => void;
    search: string;
    onSearchChange: (value: string) => void;
    darkMode: boolean;
    onToggleDarkMode: () => void;
}

export function CockpitTopBar({
    wsConnected,
    loading,
    onRefresh,
    blockingCount,
    warningCount,
    okCount,
    activeFilter,
    onFilterChange,
    search,
    onSearchChange,
    darkMode,
    onToggleDarkMode,
}: CockpitTopBarProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    // "/" keyboard shortcut focuses the search box (like Flightradar24)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const pillBase = 'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium border tabular-nums transition-colors';
    const pillBlocking = activeFilter === 'blocking'
        ? 'bg-red-600 text-white border-red-600'
        : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100';
    const pillWarning = activeFilter === 'warning'
        ? 'bg-amber-500 text-white border-amber-500'
        : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100';
    const pillOk = activeFilter === 'ok'
        ? 'bg-emerald-600 text-white border-emerald-600'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';

    return (
        <div className="h-12 px-3 flex items-center gap-3 border-b border-neutral-200 bg-white">
            <div className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <MapIcon className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-base font-semibold text-neutral-900 leading-none">Диспетчерская</h1>
            </div>

            {/* Counters / filters */}
            <div className="flex items-center gap-1.5 ml-2" data-tour="dispatcher-stats">
                <button
                    type="button"
                    className={`${pillBase} ${pillBlocking}`}
                    onClick={() => onFilterChange(activeFilter === 'blocking' ? 'all' : 'blocking')}
                    title="Блокеры"
                >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{blockingCount}</span>
                </button>
                <button
                    type="button"
                    className={`${pillBase} ${pillWarning}`}
                    onClick={() => onFilterChange(activeFilter === 'warning' ? 'all' : 'warning')}
                    title="Риски"
                >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{warningCount}</span>
                </button>
                <button
                    type="button"
                    className={`${pillBase} ${pillOk}`}
                    onClick={() => onFilterChange(activeFilter === 'ok' ? 'all' : 'ok')}
                    title="OK"
                >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{okCount}</span>
                </button>
            </div>

            <div className="flex-1" />

            {/* Search */}
            <div className="relative w-64 max-w-[40vw]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    placeholder="Поиск рейса, ТС, водителя..."
                    className="w-full h-8 pl-8 pr-10 text-xs border border-neutral-200 rounded-md bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:bg-white"
                />
                <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-neutral-400 border border-neutral-200 rounded px-1 leading-4 bg-white">
                    /
                </kbd>
            </div>

            {/* Live / Offline */}
            <div
                className={`inline-flex items-center gap-1.5 px-2 h-7 rounded-full text-[11px] font-medium border ${
                    wsConnected
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-neutral-50 text-neutral-500 border-neutral-200'
                }`}
                aria-live="polite"
            >
                {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                <span>{wsConnected ? 'Онлайн' : 'Нет связи'}</span>
            </div>

            <Button
                variant="outline"
                size="sm"
                isLoading={loading}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={onRefresh}
                className="h-8"
            >
                Обновить
            </Button>

            <button
                type="button"
                onClick={onToggleDarkMode}
                className="w-8 h-8 rounded-md border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 flex items-center justify-center transition-colors"
                title={darkMode ? 'Светлая тема' : 'Тёмная тема (control tower)'}
                aria-label="Переключить тему"
            >
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
        </div>
    );
}
