'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, Trash2, Mail, User, CheckCircle2, SkipForward } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/ui/toast';

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
    const { toast } = useToast();

    const addRow = () => setInvites([...invites, { email: '', fullName: '', roles: ['logist'] }]);
    const removeRow = (i: number) => setInvites(invites.filter((_, idx) => idx !== i));
    const updateRow = (i: number, patch: Partial<Invite>) => {
        setInvites(invites.map((inv, idx) => (idx === i ? { ...inv, ...patch } : inv)));
    };

    const finish = async (skip: boolean) => {
        setSaving(true);
        try {
            const valid = skip
                ? []
                : invites.filter(
                      (i) => i.email.includes('@') && i.fullName.trim().length > 0 && i.roles.length > 0,
                  );
            if (valid.length > 0) {
                const res = await api.post<{ success: boolean; error?: string }>('/onboarding/invite-team', {
                    invites: valid,
                });
                if (!res.success) {
                    toast({
                        variant: 'error',
                        title: 'Не удалось отправить приглашения',
                        description: res.error ?? 'Попробуйте ещё раз.',
                    });
                    return;
                }
            }
            const completeRes = await api.post<{ success: boolean; error?: string }>(
                '/onboarding/complete',
                {},
            );
            if (!completeRes.success) {
                toast({
                    variant: 'error',
                    title: 'Не удалось завершить онбординг',
                    description: completeRes.error ?? 'Попробуйте ещё раз.',
                });
                return;
            }
            toast({
                variant: 'success',
                title: 'Онбординг завершён',
                description:
                    valid.length > 0 ? `Приглашения отправлены: ${valid.length}` : 'Готово к работе.',
            });
            onComplete();
        } catch (err: unknown) {
            toast({
                variant: 'error',
                title: 'Ошибка',
                description: (err as Error).message ?? 'Попробуйте ещё раз',
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <p className="text-sm text-neutral-600">
                Пригласите коллег — они получат e-mail со ссылкой для регистрации с уже назначенной ролью.
                Можно пропустить шаг и добавить позже в админке.
            </p>

            <div className="space-y-2.5">
                {/* invites have no stable id yet (created locally); index is the editing identity used by updateRow/removeRow */}
                {invites.map((inv, i) => (
                    <div
                        key={i}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start sm:items-center bg-neutral-50 border border-neutral-200 rounded-xl p-3"
                    >
                        <div className="sm:col-span-5">
                            <FormField
                                format="email"
                                placeholder="email@company.ru"
                                value={inv.email}
                                onChange={(e) => updateRow(i, { email: e.target.value })}
                                leftAddon={<Mail className="h-4 w-4" />}
                                aria-label="E-mail приглашаемого"
                            />
                        </div>
                        <div className="sm:col-span-4">
                            <Input
                                type="text"
                                placeholder="ФИО"
                                value={inv.fullName}
                                onChange={(e) => updateRow(i, { fullName: e.target.value })}
                                leftAddon={<User className="h-4 w-4" />}
                                aria-label="ФИО приглашаемого"
                            />
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-2 items-center sm:contents">
                            <select
                                value={inv.roles[0]}
                                onChange={(e) => updateRow(i, { roles: [e.target.value] })}
                                className="sm:col-span-2 h-10 px-2 bg-white border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                            >
                                {ROLE_OPTIONS.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.label}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => removeRow(i)}
                                disabled={invites.length === 1}
                                aria-label="Удалить строку"
                                title={
                                    invites.length === 1
                                        ? 'Нужна хотя бы одна строка — добавьте ещё, чтобы удалить эту'
                                        : 'Удалить строку'
                                }
                                className="sm:col-span-1 inline-flex items-center justify-center h-10 rounded-lg text-neutral-400 hover:text-danger-600 hover:bg-danger-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400 disabled:cursor-not-allowed"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
                <Plus className="w-4 h-4" /> Добавить ещё
            </button>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-neutral-100">
                <Button variant="ghost" onClick={onBack} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                    Назад
                </Button>
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={() => finish(true)}
                        disabled={saving}
                        leftIcon={<SkipForward className="w-4 h-4" />}
                    >
                        Пропустить
                    </Button>
                    <Button
                        variant="brand"
                        onClick={() => finish(false)}
                        isLoading={saving}
                        rightIcon={!saving ? <CheckCircle2 className="w-4 h-4" /> : undefined}
                    >
                        Завершить
                    </Button>
                </div>
            </div>
        </div>
    );
}
