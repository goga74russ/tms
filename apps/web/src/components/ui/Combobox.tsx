'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode, type KeyboardEvent } from 'react';
import { Search, X, Loader2 } from 'lucide-react';

export interface ComboboxProps<T> {
    /** Placeholder for the search input */
    placeholder?: string;
    /** Async function to fetch options based on query */
    onSearch: (query: string) => Promise<T[]>;
    /** Render each option in dropdown */
    renderOption: (item: T) => ReactNode;
    /** Get display label for selected item */
    getLabel: (item: T) => string;
    /** Get unique key for each item */
    getKey: (item: T) => string;
    /** Called when an item is selected */
    onSelect: (item: T | null) => void;
    /** Currently selected item */
    selected?: T | null;
    /** Debounce delay in ms */
    debounceMs?: number;
    /** Minimum characters to trigger search */
    minChars?: number;
    /** Icon to show in input */
    icon?: ReactNode;
    /** Additional class for container */
    className?: string;
    /** Empty state message */
    emptyMessage?: string;
}

export function Combobox<T>({
    placeholder = 'Поиск...',
    onSearch,
    renderOption,
    getLabel,
    getKey,
    onSelect,
    selected = null,
    debounceMs = 300,
    minChars = 1,
    icon,
    className = '',
    emptyMessage = 'Ничего не найдено',
}: ComboboxProps<T>) {
    const [query, setQuery] = useState('');
    const [options, setOptions] = useState<T[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounced search
    const doSearch = useCallback(async (q: string) => {
        if (q.length < minChars) {
            setOptions([]);
            setIsOpen(false);
            return;
        }
        setIsLoading(true);
        try {
            const results = await onSearch(q);
            setOptions(results);
            setIsOpen(true);
            setHighlightIndex(-1);
        } catch {
            setOptions([]);
        } finally {
            setIsLoading(false);
        }
    }, [onSearch, minChars]);

    const handleInputChange = (value: string) => {
        setQuery(value);
        if (selected) onSelect(null); // clear selection when typing

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(value), debounceMs);
    };

    const handleSelect = (item: T) => {
        onSelect(item);
        setQuery(getLabel(item));
        setIsOpen(false);
        setHighlightIndex(-1);
    };

    const handleClear = () => {
        setQuery('');
        onSelect(null);
        setOptions([]);
        setIsOpen(false);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen || options.length === 0) {
            if (e.key === 'ArrowDown' && query.length >= minChars) {
                doSearch(query);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightIndex(prev => Math.min(prev + 1, options.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightIndex >= 0 && highlightIndex < options.length) {
                    handleSelect(options[highlightIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setHighlightIndex(-1);
                break;
        }
    };

    // Scroll highlighted item into view
    useEffect(() => {
        if (highlightIndex >= 0 && listRef.current) {
            const items = listRef.current.children;
            if (items[highlightIndex]) {
                (items[highlightIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightIndex]);

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Input */}
            <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        icon || <Search className="w-4 h-4" />
                    )}
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => handleInputChange(e.target.value)}
                    onFocus={() => {
                        if (options.length > 0 && query.length >= minChars) setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={`w-full pl-10 pr-9 py-2.5 rounded-xl border text-sm transition-all
                        focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                        ${selected
                            ? 'border-emerald-300 bg-emerald-50/50'
                            : 'border-slate-200 bg-white'
                        }`}
                />
                {(query || selected) && (
                    <button
                        onClick={handleClear}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div
                    ref={listRef}
                    className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto"
                >
                    {options.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-400 text-center">
                            {emptyMessage}
                        </div>
                    ) : (
                        options.map((item, idx) => (
                            <button
                                key={getKey(item)}
                                onClick={() => handleSelect(item)}
                                className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-slate-50 last:border-0
                                    ${idx === highlightIndex
                                        ? 'bg-indigo-50 text-indigo-900'
                                        : 'hover:bg-slate-50 text-slate-700'
                                    }
                                    ${selected && getKey(item) === getKey(selected)
                                        ? 'bg-emerald-50'
                                        : ''
                                    }`}
                            >
                                {renderOption(item)}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
