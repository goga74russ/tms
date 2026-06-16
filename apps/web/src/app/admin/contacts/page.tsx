'use client';

// Админ: заявки «Связаться» с лендинга (лиды). Founder видит контакты и
// отмечает статус (new → contacted → closed). Гейт: только admin.
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';
import { Mail, Phone, RefreshCw, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface ContactRequest {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    fleetSize: string | null;
    comment: string | null;
    status: 'new' | 'contacted' | 'closed';
    createdAt: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
    new: { label: 'Новая', cls: 'bg-accent-50 text-accent-700' },
    contacted: { label: 'Связались', cls: 'bg-info-50 text-info-700' },
    closed: { label: 'Закрыта', cls: 'bg-neutral-100 text-neutral-500' },
};

export default function AdminContactsPage() {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();
    const [rows, setRows] = useState<ContactRequest[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Только super-admin (платформенный оператор): лиды с лендинга — не для арендаторов.
        if (!userLoading && (!user || !user.isSuperAdmin)) router.push('/');
    }, [user, userLoading, router]);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get<{ success: boolean; data: ContactRequest[] }>('/contacts');
            setRows(res.data ?? []);
        } catch {
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user?.isSuperAdmin) load();
    }, [user, load]);

    async function setStatus(id: string, status: ContactRequest['status']) {
        try {
            await api.patch(`/contacts/${id}`, { status });
            setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
        } catch {
            // no-op
        }
    }

    const newCount = rows.filter((r) => r.status === 'new').length;

    return (
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Inbox className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-neutral-900">Заявки с сайта</h1>
                        <p className="text-sm text-neutral-500 mt-0.5">
                            Лиды из формы «Связаться»{newCount > 0 ? ` · ${newCount} новых` : ''}
                        </p>
                    </div>
                </div>
                <Button variant="outline" size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={load}>
                    Обновить
                </Button>
            </div>

            {loading ? (
                <div className="text-sm text-neutral-500 py-10 text-center">Загрузка…</div>
            ) : rows.length === 0 ? (
                <div className="text-sm text-neutral-500 py-16 text-center border border-dashed border-neutral-200 rounded-xl">
                    Заявок пока нет.
                </div>
            ) : (
                <div className="space-y-3">
                    {rows.map((r) => {
                        const meta = STATUS_META[r.status] ?? STATUS_META.new;
                        return (
                            <div key={r.id} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-neutral-900">{r.name}</span>
                                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta!.cls}`}>{meta!.label}</span>
                                            {r.fleetSize && (
                                                <span className="text-[11px] text-neutral-500 px-2 py-0.5 rounded-full bg-neutral-100">{r.fleetSize} машин</span>
                                            )}
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-neutral-600">
                                            <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700">
                                                <Phone className="w-3.5 h-3.5" /> {r.phone}
                                            </a>
                                            {r.email && (
                                                <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 hover:text-neutral-900">
                                                    <Mail className="w-3.5 h-3.5" /> {r.email}
                                                </a>
                                            )}
                                            <span className="text-neutral-400">{new Date(r.createdAt).toLocaleString('ru-RU')}</span>
                                        </div>
                                        {r.comment && <p className="mt-2 text-sm text-neutral-700 leading-relaxed">{r.comment}</p>}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        {r.status !== 'contacted' && (
                                            <Button variant="outline" size="sm" onClick={() => setStatus(r.id, 'contacted')}>Связались</Button>
                                        )}
                                        {r.status !== 'closed' && (
                                            <Button variant="ghost" size="sm" onClick={() => setStatus(r.id, 'closed')}>Закрыть</Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
