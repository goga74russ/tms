'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

// In-app колокольчик. Поллит счётчик непрочитанных (30с + при фокусе окна),
// список подгружает при открытии. Клик по уведомлению → отметка прочитанным
// + переход на рейс. Все сетевые сбои проглатываются — не ломают навигацию.
type AppNotification = {
    id: string;
    type: string;
    title: string;
    message: string;
    tripId: string | null;
    readAt: string | null;
    createdAt: string;
    meta?: Record<string, unknown>;
};

function formatWhen(iso: string): string {
    try {
        return new Date(iso).toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return '';
    }
}

export function NotificationsBell({ collapsed = false }: { collapsed?: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [count, setCount] = useState(0);
    const [items, setItems] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const loadCount = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data: { count: number } }>('/notifications/unread-count');
            setCount(res.data?.count ?? 0);
        } catch {
            // тихо: сбой поллинга не должен ломать UI
        }
    }, []);

    const loadList = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<{ success: boolean; data: AppNotification[] }>('/notifications');
            setItems(res.data ?? []);
        } catch {
            // no-op
        } finally {
            setLoading(false);
        }
    }, []);

    // Поллинг счётчика: интервал 30с + освежение при возврате фокуса на вкладку.
    useEffect(() => {
        void loadCount();
        const id = setInterval(() => void loadCount(), 30000);
        const onFocus = () => void loadCount();
        window.addEventListener('focus', onFocus);
        return () => {
            clearInterval(id);
            window.removeEventListener('focus', onFocus);
        };
    }, [loadCount]);

    // Закрытие выпадашки по клику вне.
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        if (next) void loadList();
    };

    const handleClick = async (n: AppNotification) => {
        setOpen(false);
        if (!n.readAt) {
            setCount((c) => Math.max(0, c - 1));
            setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
            try { await api.patch(`/notifications/${n.id}/read`); } catch { /* no-op */ }
        }
        if (n.tripId) router.push('/trips');
    };

    const markAll = async () => {
        setCount(0);
        setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
        try { await api.patch('/notifications/read-all'); } catch { /* no-op */ }
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={toggle}
                className="relative p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition"
                title="Уведомления"
                aria-label={count > 0 ? `Уведомления, ${count} новых` : 'Уведомления'}
            >
                <Bell className="w-5 h-5" />
                {count > 0 && (
                    <span
                        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-danger-600 text-white text-[10px] font-bold flex items-center justify-center"
                        aria-hidden="true"
                    >
                        {count > 9 ? '9+' : count}
                    </span>
                )}
            </button>

            {open && (
                <div
                    className={`absolute z-50 mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg ${collapsed ? 'left-0' : 'right-0'}`}
                    role="menu"
                >
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-100 sticky top-0 bg-white">
                        <span className="text-sm font-semibold text-neutral-900">Уведомления</span>
                        {items.some((x) => !x.readAt) && (
                            <button
                                type="button"
                                onClick={markAll}
                                className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                            >
                                <Check className="w-3 h-3" /> Прочитать все
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="px-4 py-8 text-center text-sm text-neutral-400">Загрузка…</div>
                    ) : items.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-neutral-400">Нет уведомлений</div>
                    ) : (
                        <ul className="divide-y divide-neutral-100">
                            {items.map((n) => (
                                <li key={n.id}>
                                    <button
                                        type="button"
                                        onClick={() => handleClick(n)}
                                        className={`w-full text-left px-4 py-3 hover:bg-neutral-50 transition ${n.readAt ? '' : 'bg-brand-50/40'}`}
                                    >
                                        <div className="flex items-start gap-2">
                                            {!n.readAt && (
                                                <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-600 shrink-0" aria-hidden="true" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-neutral-900 truncate">{n.title}</p>
                                                <p className="text-xs text-neutral-600 mt-0.5">{n.message}</p>
                                                <p className="text-[11px] text-neutral-400 mt-1">{formatWhen(n.createdAt)}</p>
                                            </div>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
