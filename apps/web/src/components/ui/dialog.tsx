import * as React from "react";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "./button";

// Lightweight dialog using native <dialog> element (no Radix dependency).
// Native <dialog> gives us: Esc-to-close, focus trap, backdrop click area,
// inert-rest-of-page for screen readers — all for free.

type DialogSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<DialogSize, string> = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
};

interface DialogProps {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: React.ReactNode;
    size?: DialogSize;
    children: React.ReactNode;
}

function Dialog({ open, onClose, title, description, size = "md", children }: DialogProps) {
    const ref = React.useRef<HTMLDialogElement>(null);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (open) {
            if (!el.open) el.showModal();
        } else {
            if (el.open) el.close();
        }
    }, [open]);

    // Backdrop click → close (native <dialog> doesn't do this by default).
    const handleClick = (e: React.MouseEvent<HTMLDialogElement>) => {
        if (e.target === ref.current) onClose();
    };

    return (
        // Регрессия модалок: grid/fixed/m-auto на самом <dialog> ломали native
        // top-layer центрирование и (через fixed inset-0 + minmax(0,1fr)) раздували
        // тело на всю высоту. Native <dialog> сам центрируется через showModal();
        // на нём оставляем только ширину/рамку/фон. Высоту и header/body layout —
        // на внутренней flex-обёртке (max-h там, чтобы окно росло по контенту).
        <dialog
            ref={ref}
            onClose={onClose}
            onClick={handleClick}
            className={`z-modal w-full ${SIZE_CLASS[size]} rounded-xl border border-neutral-200 bg-white p-0 shadow-xl backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm`}
        >
            <div className="flex flex-col max-h-[90dvh] overflow-hidden">
                <div className="flex items-start justify-between border-b border-neutral-200 px-6 py-4 gap-4 shrink-0">
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-neutral-900 leading-tight">{title}</h2>
                        {description && (
                            <p className="text-sm text-neutral-500 mt-1 leading-relaxed">{description}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Закрыть"
                        className="text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg p-1 transition-colors -mr-1 -mt-1 shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="overflow-y-auto px-6 py-4">{children}</div>
            </div>
        </dialog>
    );
}

// ConfirmDialog — replaces window.confirm() with a styled, RU-friendly,
// accessible alternative. Returns control to the caller via onConfirm/onCancel.

interface ConfirmDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
    description?: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** Use red destructive styling on the confirm button. */
    destructive?: boolean;
    /** Show loading state on confirm button while async action runs. */
    loading?: boolean;
}

function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel = "Подтвердить",
    cancelLabel = "Отмена",
    destructive = false,
    loading = false,
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onClose={onClose} title={title} size="sm">
            <div className="space-y-4">
                {destructive && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>Действие необратимо.</span>
                    </div>
                )}
                {description && (
                    <div className="text-sm text-neutral-700 leading-relaxed">{description}</div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={loading}>
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={destructive ? "destructive" : "brand"}
                        onClick={onConfirm}
                        isLoading={loading}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}

export { Dialog, ConfirmDialog };
