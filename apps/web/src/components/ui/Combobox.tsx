'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
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
    // C9: ошибка поиска больше не молчит (была пустота, неотличимая от «ничего не найдено»).
    const [searchError, setSearchError] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Design Блок 1.5 — dropdown рендерится через portal в document.body, иначе
    // он обрезается границей Dialog/Drawer (overflow-auto). Координаты якоря
    // (input-контейнер) пересчитываем при открытии/скролле/ресайзе.
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    useEffect(() => {
        if (!isOpen || !containerRef.current) return;
        const update = () => {
            const r = containerRef.current!.getBoundingClientRect();
            setCoords({ top: r.bottom + 6, left: r.left, width: r.width });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        // F-04: якорь мог сдвинуться без scroll/resize (контент над комбобоксом
        // изменил высоту между рендерами) — дропдаун уезжал от инпута, и клик
        // по видимой позиции опции попадал мимо. ResizeObserver на контейнере +
        // зависимость от options ловят такие сдвиги.
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
        ro?.observe(containerRef.current);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
            ro?.disconnect();
        };
    }, [isOpen, options]);

    // Close dropdown on outside click. listRef (portal) тоже считается "внутри",
    // иначе mousedown по опции закрывал бы список до срабатывания onClick.
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            const t = e.target as Node;
            const inContainer = containerRef.current?.contains(t);
            const inList = listRef.current?.contains(t);
            if (!inContainer && !inList) {
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
        setSearchError(false);
        try {
            const results = await onSearch(q);
            setOptions(results);
            setIsOpen(true);
            setHighlightIndex(-1);
        } catch {
            // Показываем ошибку в дропдауне (а не молча пустоту); toast на каждый
            // keystroke был бы шумным.
            setOptions([]);
            setSearchError(true);
            setIsOpen(true);
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
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
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
                        focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:border-brand-400
                        ${selected
                            ? 'border-emerald-300 bg-emerald-50/50'
                            : 'border-neutral-200 bg-white'
                        }`}
                />
                {(query || selected) && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Dropdown — через portal в body (Блок 1.5: не обрезается модалкой) */}
            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={listRef}
                    style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
                    className="z-modal-dropdown bg-white border border-neutral-200 rounded-xl shadow-xl max-h-60 overflow-y-auto"
                >
                    {searchError ? (
                        <div className="px-4 py-3 text-sm text-rose-600 text-center">
                            Ошибка загрузки. Повторите ввод.
                        </div>
                    ) : options.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-neutral-400 text-center">
                            {emptyMessage}
                        </div>
                    ) : (
                        options.map((item, idx) => (
                            <button
                                key={getKey(item)}
                                type="button"
                                // F-04: выбор на mousedown — первое событие цепочки, срабатывает
                                // до blur инпута и любых закрытий/сдвигов списка. preventDefault
                                // не отдаёт фокус. onClick остаётся фоллбеком для чисто
                                // синтетических .click() без mousedown (автопилот/тесты);
                                // после mousedown-выбора список размонтирован — клик не дублирует.
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelect(item);
                                }}
                                onClick={() => handleSelect(item)}
                                className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-neutral-50 last:border-0
                                    ${idx === highlightIndex
                                        ? 'bg-indigo-50 text-indigo-900'
                                        : 'hover:bg-neutral-50 text-neutral-700'
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
                </div>,
                document.body
            )}
        </div>
    );
}
