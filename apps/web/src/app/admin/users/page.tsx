'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Users, Plus, X, Edit2, CheckCircle2, XCircle,
    Shield, Search,
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
    onClose,
    onSuccess,
}: {
    user: UserRecord | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
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
            setError(err.message || 'Ошибка');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Card className="w-full max-w-md mx-4 shadow-xl">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>{isEdit ? 'Редактирование' : 'Новый пользователь'}</CardTitle>
                        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">Email *</label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                            disabled={isEdit}
                            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-50 disabled:text-slate-400"
                            placeholder="user@company.ru"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">ФИО *</label>
                        <input
                            type="text"
                            value={form.fullName}
                            onChange={e => setForm(prev => ({ ...prev, fullName: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="Иванов Иван Иванович"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">Телефон</label>
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            placeholder="+7 (999) 123-45-67"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">
                            {isEdit ? 'Новый пароль (оставить пустым — без изменений)' : 'Пароль *'}
                        </label>
                        <input
                            type="password"
                            value={form.password}
                            onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>

                    {/* Roles */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">Роли *</label>
                        <div className="flex flex-wrap gap-2">
                            {ROLE_OPTIONS.map(role => (
                                <button
                                    key={role}
                                    onClick={() => toggleRole(role)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${form.roles.includes(role)
                                            ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-indigo-300'
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
                                className="rounded border-slate-300"
                            />
                            <span className="text-sm text-slate-700">Активен</span>
                        </label>
                    )}

                    {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1" onClick={onClose}>Отмена</Button>
                        <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                            {submitting ? 'Сохраняю...' : isEdit ? 'Сохранить' : 'Создать'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ================================================================
// Main Page
// ================================================================
export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [modal, setModal] = useState<{ mode: 'create' | 'edit'; user: UserRecord | null } | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{ success: boolean; data: UserRecord[] }>('/auth/users');
            if (result.success) setUsers(result.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
    }, [toast]);

    const filtered = users.filter(u =>
        u.fullName.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Users className="w-6 h-6 text-indigo-600" />
                        Пользователи
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">{users.length} пользователей</p>
                </div>
                <Button onClick={() => setModal({ mode: 'create', user: null })}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Добавить
                </Button>
            </div>

            {toast && (
                <div className="fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg bg-emerald-600 text-white text-sm font-medium">
                    {toast}
                </div>
            )}

            {/* Search */}
            <div className="relative mb-4 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    placeholder="Поиск по имени или email"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">ФИО</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Email</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Роли</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Статус</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Дата</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-16">
                                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                                </td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-16 text-slate-400">Нет пользователей</td></tr>
                            ) : (
                                filtered.map(u => (
                                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-900">{u.fullName}</td>
                                        <td className="px-4 py-3 text-slate-600">{u.email}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {u.roles.map(r => (
                                                    <span key={r} className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700 font-medium">
                                                        {ROLE_LABELS[r] || r}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {u.isActive ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Активен
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
                                                    <XCircle className="w-3.5 h-3.5" /> Неактивен
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">
                                            {new Date(u.createdAt).toLocaleDateString('ru-RU')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setModal({ mode: 'edit', user: u })}
                                                className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {modal && (
                <UserFormModal
                    user={modal.user}
                    onClose={() => setModal(null)}
                    onSuccess={() => {
                        setModal(null);
                        setToast(modal.mode === 'create' ? '✅ Пользователь создан' : '✅ Пользователь обновлён');
                        load();
                    }}
                />
            )}
        </div>
    );
}
