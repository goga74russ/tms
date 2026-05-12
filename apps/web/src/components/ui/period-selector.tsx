'use client';

import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Calendar } from 'lucide-react';
import { endOfMonth, endOfQuarter, endOfYear, startOfMonth, startOfQuarter, startOfYear, subDays } from 'date-fns';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

export type Period = '1w' | '4w' | 'mtd' | 'qtd' | 'ytd' | 'all' | 'custom';

export interface PeriodRange {
    from: Date;
    to: Date;
    label: string;
    preset: Period;
}

const PRESET_LABELS: Record<Exclude<Period, 'custom'>, string> = {
    '1w': 'Неделя',
    '4w': '4 недели',
    mtd: 'Месяц',
    qtd: 'Квартал',
    ytd: 'Год',
    all: 'Всё',
};

const ALL_PRESETS: Exclude<Period, 'custom'>[] = ['1w', '4w', 'mtd', 'qtd', 'ytd', 'all'];

export function computeRange(preset: Exclude<Period, 'custom'>, now: Date = new Date()): PeriodRange {
    let from: Date;
    let to: Date = now;
    switch (preset) {
        case '1w':
            from = subDays(now, 7);
            break;
        case '4w':
            from = subDays(now, 28);
            break;
        case 'mtd':
            from = startOfMonth(now);
            to = endOfMonth(now);
            break;
        case 'qtd':
            from = startOfQuarter(now);
            to = endOfQuarter(now);
            break;
        case 'ytd':
            from = startOfYear(now);
            to = endOfYear(now);
            break;
        case 'all':
        default:
            from = new Date(2000, 0, 1);
            break;
    }
    return { from, to, label: PRESET_LABELS[preset], preset };
}

export interface PeriodSelectorProps {
    value: PeriodRange;
    onChange: (range: PeriodRange) => void;
    presets?: Exclude<Period, 'custom'>[];
    className?: string;
}

function toIso(d: Date) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function PeriodSelector({ value, onChange, presets = ALL_PRESETS, className }: PeriodSelectorProps) {
    const [showCustom, setShowCustom] = React.useState(value.preset === 'custom');
    const [customFrom, setCustomFrom] = React.useState(toIso(value.from));
    const [customTo, setCustomTo] = React.useState(toIso(value.to));

    React.useEffect(() => {
        if (value.preset === 'custom') {
            setCustomFrom(toIso(value.from));
            setCustomTo(toIso(value.to));
        }
    }, [value]);

    const applyCustom = (fromStr: string, toStr: string) => {
        if (!fromStr || !toStr) return;
        const f = new Date(fromStr + 'T00:00:00');
        const t = new Date(toStr + 'T23:59:59');
        if (isNaN(f.getTime()) || isNaN(t.getTime())) return;
        onChange({ from: f, to: t, label: 'Свой период', preset: 'custom' });
    };

    return (
        <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="group" aria-label="Период">
            {presets.map((preset) => {
                const active = value.preset === preset;
                return (
                    <button
                        key={preset}
                        type="button"
                        onClick={() => {
                            setShowCustom(false);
                            onChange(computeRange(preset));
                        }}
                        className={cn(
                            'inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                            active
                                ? 'border-brand-200 bg-brand-50 text-brand-700'
                                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100',
                        )}
                        aria-pressed={active}
                    >
                        {PRESET_LABELS[preset]}
                    </button>
                );
            })}
            <button
                type="button"
                onClick={() => setShowCustom((s) => !s)}
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    value.preset === 'custom' || showCustom
                        ? 'border-brand-200 bg-brand-50 text-brand-700'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100',
                )}
                aria-pressed={value.preset === 'custom'}
                aria-expanded={showCustom}
            >
                <Calendar className="h-3.5 w-3.5" />
                Свой период
            </button>
            {showCustom && (
                <div className="flex items-center gap-1.5">
                    <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => {
                            setCustomFrom(e.target.value);
                            applyCustom(e.target.value, customTo);
                        }}
                        className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:border-brand-500 focus:outline-none"
                        aria-label="С"
                    />
                    <span className="text-xs text-neutral-400">—</span>
                    <input
                        type="date"
                        value={customTo}
                        onChange={(e) => {
                            setCustomTo(e.target.value);
                            applyCustom(customFrom, e.target.value);
                        }}
                        className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs text-neutral-700 focus:border-brand-500 focus:outline-none"
                        aria-label="По"
                    />
                </div>
            )}
        </div>
    );
}
