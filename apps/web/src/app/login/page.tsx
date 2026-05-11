'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Truck, LogIn, KeyRound, Mail, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

// Role → dashboard route mapping
const ROLE_ROUTES: Record<string, string> = {
    logist: '/logist',
    dispatcher: '/dispatcher',
    mechanic: '/mechanic',
    medic: '/medic',
    manager: '/kpi',
    accountant: '/finance',
    repair_service: '/repair',
    admin: '/admin/users',
    client: '/client',
    driver: '/',
};

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const router = useRouter();
    const { refetch } = useUser();
    const { toast } = useToast();

    const validate = (): boolean => {
        let ok = true;
        setEmailError(null);
        setPasswordError(null);
        if (!email.trim()) {
            setEmailError('Введите электронную почту');
            ok = false;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setEmailError('Некорректный email');
            ok = false;
        }
        if (!password) {
            setPasswordError('Введите пароль');
            ok = false;
        } else if (password.length < 4) {
            setPasswordError('Пароль слишком короткий');
            ok = false;
        }
        return ok;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        if (!validate()) return;
        setLoading(true);

        try {
            const result = await api.login(email.trim(), password);
            if (result.success) {
                const meResult = await api.me();
                await refetch();
                const roles: string[] = meResult?.data?.roles ?? [];
                const route =
                    roles.reduce<string>((acc, role) => acc || (ROLE_ROUTES[role] ?? ''), '') || '/';
                toast({
                    variant: 'success',
                    title: 'Добро пожаловать',
                    description: 'Перенаправляем в рабочее пространство...',
                    duration: 2500,
                });
                router.push(route);
            } else {
                const msg = 'Неверный логин или пароль';
                setFormError(msg);
                toast({ variant: 'error', title: 'Не удалось войти', description: msg });
            }
        } catch (err: any) {
            const msg = err?.message || 'Ошибка авторизации. Проверьте подключение.';
            setFormError(msg);
            toast({ variant: 'error', title: 'Ошибка авторизации', description: msg });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col">
            {/* Background gradient */}
            <div
                className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 via-white to-indigo-50"
                aria-hidden="true"
            />
            <div
                className="absolute inset-0 -z-10 opacity-40 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.15),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.12),transparent_50%)]"
                aria-hidden="true"
            />

            {/* Top bar */}
            <header className="flex items-center justify-between px-6 py-4">
                <Link
                    href="/landing"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                    <ArrowLeft className="w-4 h-4" />
                    На главную
                </Link>
                <Link href="/signup" className="text-sm font-medium text-slate-600 hover:text-brand-700">
                    Нет аккаунта? <span className="text-brand-700 font-semibold">Регистрация</span>
                </Link>
            </header>

            <main className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    <div className="bg-white rounded-2xl shadow-soft-lg border border-slate-100 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-center text-white">
                            <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm border border-white/20 shadow-soft">
                                <Truck className="w-8 h-8 text-white" />
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight">TMS — Управление транспортом</h1>
                            <p className="text-brand-100 mt-2 text-sm">Войдите в свой рабочий кабинет</p>
                        </div>

                        {/* Form */}
                        <div className="p-8">
                            {formError && (
                                <div
                                    role="alert"
                                    className="mb-6 bg-red-50 text-red-700 p-3 rounded-lg text-sm font-medium border border-red-200 flex items-start gap-2"
                                >
                                    <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">!</span>
                                    <span>{formError}</span>
                                </div>
                            )}

                            <form onSubmit={handleLogin} className="space-y-5" noValidate>
                                <Input
                                    label="Электронная почта"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        if (emailError) setEmailError(null);
                                    }}
                                    leftAddon={<Mail className="h-4 w-4" />}
                                    placeholder="admin@tms.local"
                                    error={emailError}
                                    disabled={loading}
                                />

                                <Input
                                    label="Пароль"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (passwordError) setPasswordError(null);
                                    }}
                                    leftAddon={<KeyRound className="h-4 w-4" />}
                                    placeholder="••••••••"
                                    error={passwordError}
                                    disabled={loading}
                                />

                                <Button
                                    type="submit"
                                    variant="brand"
                                    size="lg"
                                    fullWidth
                                    isLoading={loading}
                                    leftIcon={!loading ? <LogIn className="w-5 h-5" /> : undefined}
                                >
                                    {loading ? 'Вход...' : 'Войти в систему'}
                                </Button>
                            </form>

                            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                                <p className="text-xs text-slate-500">
                                    Тестовый аккаунт: <span className="font-mono text-slate-700">admin@tms.local</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    <p className="mt-6 text-center text-xs text-slate-400">
                        © {new Date().getFullYear()} TMS. Все права защищены.{' '}
                        <Link href="/legal/privacy" className="underline hover:text-slate-600">
                            Политика конфиденциальности
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
}
