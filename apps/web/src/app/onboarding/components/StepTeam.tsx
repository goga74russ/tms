'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';

const ROLE_OPTIONS = [
    { id: 'logist', label: 'Логист' },
    { id: 'dispatcher', label: 'Диспетчер' },
    { id: 'mechanic', label: 'Механик' },
    { id: 'medic', label: 'Медик' },
    { id: 'accountant', label: 'Бухгалтер' },
    { id: 'manager', label: 'Менеджер' },
    { id: 'driver', label: 'Водитель' },
];

interface Invite {
    email: string;
    fullName: string;
    roles: string[];
}

interface Props {
    onComplete: () => void;
    onBack: () => void;
}

export function StepTeam({ onComplete, onBack }: Props) {
    const [invites, setInvites] = useState<Invite[]>([{ email: '', fullName: '', roles: ['logist'] }]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const addRow = () => setInvites([...invites, { email: '', fullName: '', roles: ['logist'] }]);
    const removeRow = (i: number) => setInvites(invites.filter((_, idx) => idx !== i));
    const updateRow = (i: number, patch: Partial<Invite>) => {
        setInvites(invites.map((inv, idx) => idx === i ? { ...inv, ...patch } : inv));
    };

    const submit = async () => {
        const valid = invites.filter((i) => i.email.includes('@') && i.fullName.length > 0 && i.roles.length > 0);
        setError(null);
        setSaving(true);
        try {
            if (valid.length > 0) {
                const res = await api.post<{ success: boolean; error?: string }>('/onboarding/invite-team', { invites: valid });
                if (!res.success) {
                    setError(res.error ?? 'Ошибка приглашений');
                    return;
                }
            }
            const completeRes = await api.post<{ success: boolean; error?: string }>('/onboarding/complete', {});
            if (!completeRes.success) {
                setError(completeRes.error ?? 'Ошибка завершения');
                return;
            }
            onComplete();
        } catch (err: unknown) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-xl font-semibold text-slate-900">Шаг 6: Команда</h2>
                <p className="text-sm text-slate-500 mt-1">Пригласите коллег. Можно пропустить и добавить их позже в админке.</p>
            </div>

            <div className="space-y-2">
                {invites.map((inv, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-lg">
                        <input
                            type="email"
                            placeholder="email"
                            value={inv.email}
                            onChange={(e) => updateRow(i, { email: e.target.value })}
                            className="col-span-4 px-2 py-1.5 bg-white border border-slate-200 rounded text-sm"
                        />
                        <input
                            type="text"
                            placeholder="ФИО"
                            value={inv.fullName}
                            onChange={(e) => updateRow(i, { fullName: e.target.value })}
                            className="col-span-4 px-2 py-1.5 bg-white border border-slate-200 rounded text-sm"
                        />
                        <select
                            value={inv.roles[0]}
                            onChange={(e) => updateRow(i, { roles: [e.target.value] })}
                            className="col-span-3 px-2 py-1.5 bg-white border border-slate-200 rounded text-sm"
                        >
                            {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                        {invites.length > 1 && (
                            <button onClick={() => removeRow(i)} className="col-span-1 text-slate-400 hover:text-red-500">
                                <X className="w-4 h-4 mx-auto" />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <button onClick={addRow} className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
                <Plus className="w-4 h-4" /> Добавить ещё
            </button>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">{error}</div>}

            <div className="flex justify-between">
                <button onClick={onBack} className="text-sm text-slate-600 hover:underline">← Назад</button>
                <button
                    onClick={submit}
                    disabled={saving}
                    className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                    {saving ? 'Сохраняем...' : 'Завершить →'}
                </button>
            </div>
        </div>
    );
}
