'use client';

// ============================================================
// Round 3B — D9: In-app onboarding tour
// Lightweight reusable spotlight tour. No deps beyond React + Tailwind.
// Persists completion state to localStorage and (best-effort) to the
// server via POST /auth/me/preferences.
// ============================================================
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X, Check } from 'lucide-react';
import { api } from '@/lib/api';

export interface TourStep {
    targetSelector: string;
    title: string;
    description: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface OnboardingTourProps {
    steps: TourStep[];
    storageKey: string;
    onClose?: () => void;
    /** If true, the tour ignores the localStorage flag and always shows. */
    forceShow?: boolean;
}

interface Rect { top: number; left: number; width: number; height: number; }

const PADDING = 8;
const TOOLTIP_MAX_WIDTH = 340;
const TOOLTIP_GAP = 16;

function getRect(el: Element): Rect {
    const r = el.getBoundingClientRect();
    return {
        top: r.top + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
        height: r.height,
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function OnboardingTour({ steps, storageKey, onClose, forceShow }: OnboardingTourProps) {
    const [stepIndex, setStepIndex] = useState(0);
    const [active, setActive] = useState(false);
    const [targetRect, setTargetRect] = useState<Rect | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Decide whether to start the tour
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (forceShow) {
            setActive(true);
            return;
        }
        try {
            const v = window.localStorage.getItem(storageKey);
            if (!v) setActive(true);
        } catch {
            setActive(true);
        }
    }, [storageKey, forceShow]);

    const step = steps[stepIndex];

    // Recompute target rect on step change / resize / scroll
    useLayoutEffect(() => {
        if (!active || !step) return;

        function update() {
            const el = document.querySelector(step.targetSelector);
            if (!el) {
                setTargetRect(null);
                setTooltipPos({ top: 100 + window.scrollY, left: window.innerWidth / 2 - TOOLTIP_MAX_WIDTH / 2 });
                return;
            }
            // Make sure target is visible
            try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch { /* noop */ }
            const r = getRect(el);
            setTargetRect(r);
            const tooltipW = TOOLTIP_MAX_WIDTH;
            const tooltipH = tooltipRef.current?.offsetHeight ?? 200;
            const pos = step.position ?? 'bottom';
            let top = r.top;
            let left = r.left;
            switch (pos) {
                case 'top':
                    top = r.top - tooltipH - TOOLTIP_GAP;
                    left = r.left + r.width / 2 - tooltipW / 2;
                    break;
                case 'bottom':
                    top = r.top + r.height + TOOLTIP_GAP;
                    left = r.left + r.width / 2 - tooltipW / 2;
                    break;
                case 'left':
                    top = r.top + r.height / 2 - tooltipH / 2;
                    left = r.left - tooltipW - TOOLTIP_GAP;
                    break;
                case 'right':
                    top = r.top + r.height / 2 - tooltipH / 2;
                    left = r.left + r.width + TOOLTIP_GAP;
                    break;
            }
            const margin = 12;
            left = clamp(left, margin + window.scrollX, window.innerWidth - tooltipW - margin + window.scrollX);
            top = clamp(top, margin + window.scrollY, window.innerHeight + window.scrollY - tooltipH - margin);
            setTooltipPos({ top, left });
        }

        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        const id = window.setTimeout(update, 250); // re-measure after layout settles
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
            window.clearTimeout(id);
        };
    }, [active, stepIndex, step]);

    if (!active || !step) return null;
    if (typeof document === 'undefined') return null;

    function persistAndClose(completed: boolean) {
        try { window.localStorage.setItem(storageKey, completed ? 'completed' : 'skipped'); } catch { /* noop */ }
        // Best-effort server-side persistence
        try {
            api.post('/auth/me/preferences', { tourCompleted: completed, storageKey })
                .catch(() => { /* non-fatal */ });
        } catch { /* noop */ }
        setActive(false);
        onClose?.();
    }

    function next() {
        if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
        else persistAndClose(true);
    }
    function prev() {
        if (stepIndex > 0) setStepIndex(stepIndex - 1);
    }
    function skip() {
        persistAndClose(false);
    }

    const isLast = stepIndex === steps.length - 1;
    const isFirst = stepIndex === 0;

    return createPortal(
        <div className="fixed inset-0 z-tour pointer-events-none">
            {/* Backdrop with cut-out for the target */}
            <svg className="absolute inset-0 w-full h-full pointer-events-auto" style={{ width: '100vw', height: '100vh' }}>
                <defs>
                    <mask id="tour-mask">
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        {targetRect && (
                            <rect
                                x={targetRect.left - PADDING - window.scrollX}
                                y={targetRect.top - PADDING - window.scrollY}
                                width={targetRect.width + PADDING * 2}
                                height={targetRect.height + PADDING * 2}
                                rx="8"
                                ry="8"
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    x="0" y="0" width="100%" height="100%"
                    fill="rgba(15, 23, 42, 0.65)"
                    mask="url(#tour-mask)"
                    onClick={skip}
                />
                {targetRect && (
                    <rect
                        x={targetRect.left - PADDING - window.scrollX}
                        y={targetRect.top - PADDING - window.scrollY}
                        width={targetRect.width + PADDING * 2}
                        height={targetRect.height + PADDING * 2}
                        rx="8"
                        ry="8"
                        fill="none"
                        stroke="rgb(99, 102, 241)"
                        strokeWidth="2"
                        pointerEvents="none"
                    />
                )}
            </svg>

            {/* Tooltip */}
            {tooltipPos && (
                <div
                    ref={tooltipRef}
                    role="dialog"
                    aria-label={step.title}
                    className="absolute pointer-events-auto bg-white rounded-xl shadow-xl border border-neutral-200 p-4"
                    style={{
                        top: tooltipPos.top - window.scrollY,
                        left: tooltipPos.left - window.scrollX,
                        width: TOOLTIP_MAX_WIDTH,
                        position: 'fixed',
                    }}
                >
                    <button
                        onClick={skip}
                        aria-label="Закрыть"
                        className="absolute top-2 right-2 text-neutral-400 hover:text-neutral-700 p-1"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <div className="text-xs font-medium text-indigo-600 mb-1">
                        Шаг {stepIndex + 1} из {steps.length}
                    </div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-2">{step.title}</h3>
                    <p className="text-sm text-neutral-600 mb-4">{step.description}</p>
                    <div className="flex items-center justify-between gap-2">
                        <button
                            onClick={skip}
                            className="text-xs text-neutral-500 hover:text-neutral-800"
                        >
                            Пропустить
                        </button>
                        <div className="flex gap-2">
                            <button
                                onClick={prev}
                                disabled={isFirst}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:pointer-events-none"
                            >
                                <ArrowLeft className="w-3 h-3" />Назад
                            </button>
                            <button
                                onClick={next}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                            >
                                {isLast ? <><Check className="w-3 h-3" />Готово</> : <>Далее<ArrowRight className="w-3 h-3" /></>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body,
    );
}
