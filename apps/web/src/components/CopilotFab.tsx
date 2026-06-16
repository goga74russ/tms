'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { CopilotChat } from '@/components/CopilotChat';

interface CopilotFabProps {
    enabled: boolean;
}

/**
 * Floating Action Button that toggles the existing CopilotChat dock.
 *
 * CopilotChat is itself a fixed-positioned dock at bottom-right of the
 * viewport. We render it conditionally so users see a single, calm FAB
 * by default and only open the chat when needed.
 *
 * Keeps existing `data-tour` selector for the onboarding tour by exposing
 * both `copilot-fab` (the new button) and `dispatcher-copilot` (the
 * legacy selector) so the existing tour step continues to point at the
 * AI co-pilot affordance.
 */
// Build-time env flag — default OFF until Jurist J-3 (AI DPA) signed.
// Set NEXT_PUBLIC_AI_COPILOT_ENABLED=true in apps/web/.env to re-enable.
const AI_COPILOT_BUILD_ENABLED = process.env.NEXT_PUBLIC_AI_COPILOT_ENABLED === 'true';

export function CopilotFab({ enabled }: CopilotFabProps) {
    const [open, setOpen] = useState(false);

    // Close on Esc
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    // Hard kill-switch: skip entirely if build env disables the feature.
    if (!AI_COPILOT_BUILD_ENABLED) return null;
    if (!enabled) return null;

    return (
        <>
            {/* FAB itself — hidden while chat is open so the chat's own close
                control is the obvious next action. */}
            {!open && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    data-tour="copilot-fab"
                    data-tour-secondary="dispatcher-copilot"
                    aria-label="Открыть AI Со-пилот"
                    className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-success-500 via-accent-500 to-info-500 shadow-lg shadow-success-500/30 hover:shadow-xl hover:shadow-success-500/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center text-white group"
                >
                    <Sparkles className="w-6 h-6" />
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-success-400 ring-2 ring-white animate-pulse" />
                </button>
            )}

            {/* CopilotChat is itself fixed-positioned — render it inline when open */}
            {open && (
                <>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label="Скрыть AI Со-пилот"
                        className="fixed bottom-5 left-5 z-50 w-10 h-10 rounded-full bg-white border border-neutral-200 shadow-md flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
                        title="Закрыть (Esc)"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <div data-tour="dispatcher-copilot">
                        <CopilotChat />
                    </div>
                </>
            )}
        </>
    );
}
