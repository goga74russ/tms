'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, KeyRound, Mail, MapPin, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AuthSplitLayout } from '@/components/auth-split-layout';

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

function ProductShowcase() {
    return (
        <div className="space-y-5">
            {/* Fake browser chrome card */}
            <div className="rounded-2xl border border-white/60 bg-white shadow-soft-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-neutral-50 border-b border-neutral-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="ml-3 text-[11px] text-neutral-500 font-mono">tms-prod.ru/dispatcher</span>
                </div>
                <div className="p-5 space-y-4">
                    {/* Stat bar */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-brand-50 px-3 py-2.5 border border-brand-100">
                            <div className="text-[10px] uppercase tracking-wider text-brand-700 font-semibold">Активные</div>
                            <div className="text-xl font-bold text-neutral-900 tabular-nums">24</div>
                        </div>
                        <div className="rounded-xl bg-emerald-50 px-3 py-2.5 border border-emerald-100">
                            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">SLA</div>
                            <div className="text-xl font-bold text-neutral-900 tabular-nums">92%</div>
                        </div>
                        <div className="rounded-xl bg-amber-50 px-3 py-2.5 border border-amber-100">
                            <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Алёрты</div>
                            <div className="text-xl font-bold text-neutral-900 tabular-nums">3</div>
                        </div>
                    </div>
                    {/* Trip cards */}
                    {[
                        { id: 'TR-2841', route: 'Москва → Казань', status: 'В пути', tone: 'brand' as const },
                        { id: 'TR-2842', route: 'СПб → Великий Новгород', status: 'Погрузка', tone: 'amber' as const },
                    ].map((t) => (
                        <div key={t.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-white px-3 py-2.5">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.tone === 'brand' ? 'bg-brand-50 text-brand-600' : 'bg-amber-50 text-amber-600'}`}>
                                <MapPin className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-neutral-500 font-mono">{t.id}</div>
                                <div className="text-sm font-semibold text-neutral-900 truncate">{t.route}</div>
                            </div>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${t.tone === 'brand' ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700'}`}>
                                {t.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="text-center">
                <div className="inline-flex items-center gap-2 text-neutral-700 text-sm font-medium">
                    <Activity className="w-4 h-4 text-brand-600" />
                    Главное в одном кабинете
                </div>
                <p className="text-xs text-neutral-500 mt-1.5 max-w-xs mx-auto">
                    Рейсы, водители, ТС и финансы — без переключения вкладок.
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(true);
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
        } catch (err: unknown) {
            const msg = (err as Error)?.message || 'Ошибка авторизации. Проверьте подключение.';
            setFormError(msg);
            toast({ variant: 'error', title: 'Ошибка авторизации', description: msg });
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthSplitLayout
            title="Войти в TMS"
            subtitle="Продолжите работу с вашим аккаунтом"
            topRightLink={{ href: '/signup', label: 'Создать аккаунт' }}
            rightPanel={<ProductShowcase />}
        >
            {formError && (
                <div
                    role="alert"
                    className="mb-5 bg-red-50 text-red-700 p-3 rounded-lg text-sm font-medium border border-red-200 flex items-start gap-2"
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

                <div>
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
                    <div className="mt-2.5 flex items-center justify-between">
                        <label className="inline-flex items-center gap-2 text-sm text-neutral-600 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500 focus:ring-offset-0"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                            />
                            Запомнить меня
                        </label>
                        <Link
                            href="/forgot-password"
                            className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
                        >
                            Забыли пароль?
                        </Link>
                    </div>
                </div>

                <Button
                    type="submit"
                    variant="brand"
                    size="lg"
                    fullWidth
                    isLoading={loading}
                    leftIcon={!loading ? <LogIn className="w-5 h-5" /> : undefined}
                >
                    {loading ? 'Вход...' : 'Войти'}
                </Button>

                {/* Divider */}
                <div className="relative flex items-center py-1">
                    <div className="flex-1 border-t border-neutral-200" />
                    <span className="px-3 text-xs text-neutral-400 uppercase tracking-wider">или</span>
                    <div className="flex-1 border-t border-neutral-200" />
                </div>

                {/* Disabled social buttons */}
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        disabled
                        className="relative inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-400 text-sm font-medium cursor-not-allowed"
                    >
                        <span className="w-4 h-4 rounded-sm bg-gradient-to-br from-red-400 to-amber-400" aria-hidden />
                        Google
                        <span className="absolute -top-2 -right-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-600">
                            Скоро
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled
                        className="relative inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-400 text-sm font-medium cursor-not-allowed"
                    >
                        <span className="w-4 h-4 rounded-sm bg-red-500 text-white text-[10px] font-black flex items-center justify-center" aria-hidden>Я</span>
                        Яндекс
                        <span className="absolute -top-2 -right-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-600">
                            Скоро
                        </span>
                    </button>
                </div>

                <p className="text-center text-sm text-neutral-600 pt-3 border-t border-neutral-100">
                    Нет аккаунта?{' '}
                    <Link href="/signup" className="text-brand-600 font-semibold hover:underline">
                        Зарегистрироваться
                    </Link>
                </p>

                <div className="text-center">
                    <p className="text-[11px] text-neutral-400">
                        Тестовый аккаунт: <span className="font-mono text-neutral-500">admin@tms.local</span>
                    </p>
                </div>
            </form>
        </AuthSplitLayout>
    );
}
