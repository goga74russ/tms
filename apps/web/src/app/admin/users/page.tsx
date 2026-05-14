'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Stat } from '@/components/ui/stat';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import {
    Users, Edit2, CheckCircle2,
    Shield, UserCog, UserPlus, UserX,
} from 'lucide-react';

// ================================================================
// Types
// ================================================================
interface UserRecord {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    roles: string[];
    isActive: boolean;
    contractorId: string | null;
    organizationId: string | null;
    createdAt: string;
}

const ROLE_OPTIONS = [
    'admin', 'logist', 'dispatcher', 'manager', 'mechanic',
    'medic', 'repair_service', 'driver', 'accountant', 'client',
];

const ROLE_LABELS: Record<string, string> = {
    admin: 'Администратор',
    logist: 'Логист',
    dispatcher: 'Диспетчер',
    manager: 'Руководитель',
    mechanic: 'Механик',
    medic: 'Медик',
    repair_service: 'Рем. служба',
    driver: 'Водитель',
    accountant: 'Бухгалтер',
    client: 'Клиент',
};

// ================================================================
// User Form Modal
// ================================================================
function UserFormModal({
    user,
    open,
    onClose,
    onSuccess,
}: {
    user: UserRecord | null;
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const { toast } = useToast();
    const isEdit = !!user;
    const [form, setForm] = useState({
        email: user?.email || '',
        fullName: user?.fullName || '',
        phone: user?.phone || '',
        password: '',
        roles: user?.roles || [],
        isActive: user?.isActive ?? true,
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const toggleRole = (role: string) => {
        setForm(prev => ({
            ...prev,
            roles: prev.roles.includes(role)
                ? prev.roles.filter(r => r !== role)
                : [...prev.roles, role],
        }));
    };

    const handleSubmit = async () => {
        if (!form.email || !form.fullName || !form.roles.length) {
            setError('Заполните email, ФИО и выберите хотя бы одну роль');
            return;
        }
        if (!isEdit && !form.password) {
            setError('Пароль обязателен для нового пользователя');
            return;
        }

        try {
            setSubmitting(true);
            setError('');

            if (isEdit) {
                const body: Record<string, unknown> = {
                    fullName: form.fullName,
                    phone: form.phone || null,
                    roles: form.roles,
                    isActive: form.isActive,
                };
                if (form.password) body.password = form.password;
                await api.put(`/auth/users/${user!.id}`, body);
            } else {
                await api.post('/auth/users', {
                    email: form.email,
                    password: form.password,
                    fullName: form.fullName,
                    phone: form.phone || undefined,
                    roles: form.roles,
                });
            }

            onSuccess();
        } catch (err: any) {
            const msg = err.message || 'Ошибка';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={isEdit ? 'Редактирование' : 'Новый пользователь'}
            size="md"
        >
            <div className="space-y-4">
                <FormField
                    format="email"
                    label="Email"
                    required
                    value={form.email}
                    onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    disabled={isEdit}
                    placeholder="user@company.ru"
                />

                <Input
                    type="text"
                    label="ФИО"
                    required
                    value={form.fullName}
                    onChange={e => setForm(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Иванов Иван Иванович"
                />

                <FormField
                    format="phone"
                    label="Телефон"
                    value={form.phone}
                    onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+7 (999) 123-45-67"
                />

                <Input
                    type="password"
                    label={isEdit ? 'Новый пароль (оставить пустым — без изменений)' : 'Пароль'}
                    required={!isEdit}
                    value={form.password}
                    onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                />

                {/* Roles */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-neutral-700">Роли *</label>
                    <div className="flex flex-wrap gap-2">
                        {ROLE_OPTIONS.map(role => (
                            <button
                                key={role}
                                type="button"
                                onClick={() => toggleRole(role)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${form.roles.includes(role)
                                        ? 'bg-brand-100 text-brand-700 border-brand-300'
                                        : 'bg-neutral-50 text-neutral-500 border-neutral-200 hover:border-brand-300'
                                    }`}
                            >
                                {ROLE_LABELS[role] || role}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Active toggle */}
                {isEdit && (
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={e => setForm(prev => ({ ...prev, isActive: e.target.checked }))}
                            className="rounded border-neutral-300"
                        />
                        <span className="text-sm text-neutral-700">Активен</span>
                    </label>
                )}

                {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

                <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
                    <Button variant="brand" className="flex-1" isLoading={submitting} onClick={handleSubmit}>
                        {isEdit ? 'Сохранить' : 'Создать'}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}

// ================================================================
// Main Page
// ================================================================
export default function AdminUsersPage() {
    const { toast } = useToast();
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [modal, setModal] = useState<{ mode: 'create' | 'edit'; user: UserRecord | null } | null>(null);
    const [confirmAction, setConfirmAction] = useState<null | { action: () => Promise<void>; title: string; description: string; destructive?: boolean; confirmLabel?: string }>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{ success: boolean; data: UserRecord[] }>('/auth/users');
            if (result.success) setUsers(result.data);
        } catch (err: any) {
            toast({ variant: 'error', title: 'Не удалось загрузить пользователей', description: err?.message });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const filtered = users.filter(u => {
        if (statusFilter === 'active' && !u.isActive) return false;
        if (statusFilter === 'archived' && u.isActive) return false;
        if (roleFilter && !u.roles.includes(roleFilter)) return false;
        return true;
    });

    const activeCount = users.filter(u => u.isActive).length;
    const adminCount = users.filter(u => u.roles.includes('admin')).length;
    const driverCount = users.filter(u => u.roles.includes('driver')).length;

    async function toggleActive(user: UserRecord, isActive: boolean) {
        try {
            await api.put(`/auth/users/${user.id}`, {
                fullName: user.fullName,
                phone: user.phone,
                roles: user.roles,
                isActive,
            });
            toast({ variant: 'success', title: isActive ? 'Пользователь активирован' : 'Пользователь деактивирован' });
            load();
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err?.message });
        }
    }

    const columns: Column<UserRecord>[] = [
        {
            id: 'fullName',
            header: 'ФИО',
            accessor: (r) => r.fullName,
            cell: (r) => <span className="font-medium text-neutral-900">{r.fullName}</span>,
            sortable: true,
            sticky: 'left',
            minWidth: '200px',
        },
        {
            id: 'email',
            header: 'Email',
            accessor: (r) => r.email,
            cell: (r) => <span className="text-neutral-600">{r.email}</span>,
            sortable: true,
            minWidth: '200px',
        },
        {
            id: 'roles',
            header: 'Роли',
            cell: (r) => (
                <div className="flex flex-wrap gap-1">
                    {r.roles.map(role => (
                        <span key={role} className="px-2 py-0.5 rounded-full text-xs bg-brand-50 text-brand-700 font-medium">
                            {ROLE_LABELS[role] || role}
                        </span>
                    ))}
                </div>
            ),
            accessor: (r) => r.roles.join(','),
            minWidth: '220px',
        },
        {
            id: 'isActive',
            header: 'Статус',
            accessor: (r) => (r.isActive ? 1 : 0),
            cell: (r) => (
                <Pill tone={r.isActive ? 'success' : 'neutral'}>
                    {r.isActive ? 'Активен' : 'Неактивен'}
                </Pill>
            ),
            sortable: true,
            width: '120px',
        },
        {
            id: 'createdAt',
            header: 'Дата',
            accessor: (r) => r.createdAt,
            cell: (r) => <span className="text-neutral-500 text-xs">{new Date(r.createdAt).toLocaleDateString('ru-RU')}</span>,
            sortable: true,
            width: '110px',
            align: 'right',
            monospace: true,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Users}
                iconTone="brand"
                title="Пользователи"
                description="Учётные записи и роли в системе"
                actions={
                    <Button variant="brand" leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => setModal({ mode: 'create', user: null })}>
                        Добавить
                    </Button>
                }
            />

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Всего" value={users.length} icon={Users} tone="neutral" />
                <Stat label="Активные" value={activeCount} icon={CheckCircle2} tone="success" />
                <Stat label="Админы" value={adminCount} icon={Shield} tone="warning" />
                <Stat label="Водители" value={driverCount} icon={UserCog} tone="info" />
            </div>

            <DataTable<UserRecord>
                tableId="admin-users"
                data={filtered}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по имени или email..."
                searchKeys={['fullName', 'email']}
                filters={[
                    {
                        id: 'status',
                        label: 'Статус',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: [
                            { value: 'active', label: 'Активные' },
                            { value: 'archived', label: 'Неактивные' },
                        ],
                    },
                    {
                        id: 'role',
                        label: 'Роль',
                        value: roleFilter,
                        onChange: setRoleFilter,
                        options: ROLE_OPTIONS.map(r => ({ value: r, label: ROLE_LABELS[r] || r })),
                    },
                ]}
                bulkActions={(rows) => (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<UserX className="w-3.5 h-3.5" />}
                            onClick={() => {
                                const active = rows.filter(u => u.isActive);
                                if (active.length === 0) return;
                                setConfirmAction({
                                    action: async () => {
                                        await Promise.all(active.map(u => toggleActive(u, false)));
                                    },
                                    title: 'Деактивировать пользователей',
                                    description: `Деактивировать ${active.length} пользователей?`,
                                    destructive: true,
                                    confirmLabel: 'Деактивировать',
                                });
                            }}
                        >
                            Деактивировать ({rows.length})
                        </Button>
                    </>
                )}
                rowActions={(row) => [
                    {
                        id: 'edit',
                        label: 'Редактировать',
                        icon: <Edit2 className="w-4 h-4" />,
                        onClick: () => setModal({ mode: 'edit', user: row }),
                    },
                    {
                        id: 'toggle',
                        label: row.isActive ? 'Деактивировать' : 'Активировать',
                        icon: <UserX className="w-4 h-4" />,
                        onClick: () => toggleActive(row, !row.isActive),
                        tone: row.isActive ? 'danger' : 'default',
                    },
                ]}
                onRowClick={(row) => setModal({ mode: 'edit', user: row })}
                emptyState={
                    <EmptyState
                        icon={Users}
                        title="Пока нет пользователей"
                        description="Создайте первого пользователя для входа в систему."
                        tone="brand"
                        action={
                            <Button variant="brand" leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => setModal({ mode: 'create', user: null })}>
                                Добавить
                            </Button>
                        }
                    />
                }
                pageSize={50}
            />

            {modal && (
                <UserFormModal
                    key={modal.user?.id ?? 'new'}
                    user={modal.user}
                    open={true}
                    onClose={() => setModal(null)}
                    onSuccess={() => {
                        const created = modal.mode === 'create';
                        setModal(null);
                        toast({ variant: 'success', title: created ? 'Пользователь создан' : 'Пользователь обновлён' });
                        load();
                    }}
                />
            )}

            <ConfirmDialog
                open={!!confirmAction}
                onClose={() => setConfirmAction(null)}
                onConfirm={async () => {
                    await confirmAction?.action();
                    setConfirmAction(null);
                }}
                title={confirmAction?.title ?? ''}
                description={confirmAction?.description}
                destructive={confirmAction?.destructive}
                confirmLabel={confirmAction?.confirmLabel ?? 'Подтвердить'}
            />
        </div>
    );
}
