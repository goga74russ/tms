import * as React from "react";
import { Button } from "./button";

// Lightweight dialog using native <dialog> element (no Radix dependency)
interface DialogProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

function Dialog({ open, onClose, title, children }: DialogProps) {
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

    return (
        <dialog
            ref={ref}
            onClose={onClose}
            className="fixed inset-0 z-50 m-auto max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-black/50"
        >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-4">{children}</div>
        </dialog>
    );
}

export { Dialog };
