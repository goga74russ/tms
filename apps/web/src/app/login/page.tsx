'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, KeyRound, Mail, MapPin, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AuthSplitLayout } from '@/components/auth-split-layout';
// C9: раньше здесь был ДУБЛЬ ROLE_ROUTES/ROLE_PRIORITY/pickRouteForRoles,
// дрифтнувший от канона (driver: '/' вместо '/trips'). Импортируем единый
// источник из lib/routing.ts (покрыт routing.test.ts).
import { pickRouteForRoles } from '@/lib/routing';

function ProductShowcase() {
    return (
        <div className="space-y-5">
            {/* Fake browser chrome card */}
            <div className="rounded-2xl border border-white/60 bg-white shadow-soft-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-neutral-50 border-b border-neutral-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-danger-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-warning-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-success-400" />
                    <span className="ml-3 text-[11px] text-neutral-500 font-mono">transpult.ru/dispatcher</span>
                </div>
                <div className="p-5 space-y-4">
                    {/* Stat bar */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-brand-50 px-3 py-2.5 border border-brand-100">
                            <div className="text-[10px] uppercase tracking-wider text-brand-700 font-semibold">Активные</div>
                            <div className="text-xl font-bold text-neutral-900 tabular-nums">24</div>
                        </div>
                        <div className="rounded-xl bg-success-50 px-3 py-2.5 border border-success-100">
                            <div className="text-[10px] uppercase tracking-wider text-success-700 font-semibold">SLA</div>
                            <div className="text-xl font-bold text-neutral-900 tabular-nums">92%</div>
                        </div>
                        <div className="rounded-xl bg-warning-50 px-3 py-2.5 border border-warning-100">
                            <div className="text-[10px] uppercase tracking-wider text-warning-700 font-semibold">Алёрты</div>
                            <div className="text-xl font-bold text-neutral-900 tabular-nums">3</div>
                        </div>
                    </div>
                    {/* Trip cards */}
                    {[
                        { id: 'TR-2841', route: 'Москва → Казань', status: 'В пути', tone: 'brand' as const },
                        { id: 'TR-2842', route: 'СПб → Великий Новгород', status: 'Погрузка', tone: 'amber' as const },
                    ].map((t) => (
                        <div key={t.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 bg-white px-3 py-2.5">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.tone === 'brand' ? 'bg-brand-50 text-brand-600' : 'bg-warning-50 text-warning-600'}`}>
                                <MapPin className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-neutral-500 font-mono">{t.id}</div>
                                <div className="text-sm font-semibold text-neutral-900 truncate">{t.route}</div>
                            </div>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${t.tone === 'brand' ? 'bg-brand-100 text-brand-700' : 'bg-warning-100 text-warning-700'}`}>
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
        // P3 (код-аудит 2026-06-14): на логине не навязываем произвольный min (был 4,
        // в рассинхроне с signup/reset=8). Проверяем только непустоту — корректность
        // пароля валидирует сервер по хэшу (иначе legacy-пароли <8 не смогли бы войти).
        if (!password) {
            setPasswordError('Введите пароль');
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
                // Persist the "remember me" hint so other components can prefer long-lived UI state.
                // Real long-lived sessions still require server-side support; this is at least honest:
                // the box is no longer a no-op.
                try {
                    if (typeof window !== 'undefined') {
                        if (remember) {
                            window.localStorage.setItem('auth:remember', '1');
                        } else {
                            window.localStorage.removeItem('auth:remember');
                        }
                    }
                } catch { /* localStorage may be unavailable */ }

                const meResult = await api.me();
                await refetch();
                const roles: string[] = meResult?.data?.roles ?? [];
                const route = pickRouteForRoles(roles);
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
            title="Войти в ТрансПульт"
            subtitle="Продолжите работу с вашим аккаунтом"
            topRightLink={{ href: '/signup', label: 'Создать аккаунт' }}
            rightPanel={<ProductShowcase />}
        >
            {formError && (
                <div
                    role="alert"
                    className="mb-5 bg-danger-50 text-danger-700 p-3 rounded-lg text-sm font-medium border border-danger-200 flex items-start gap-2"
                >
                    <span className="w-5 h-5 rounded-full bg-danger-100 text-danger-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">!</span>
                    <span>{formError}</span>
                </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5" noValidate>
                <FormField
                    format="email"
                    label="Электронная почта"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError(null);
                    }}
                    leftAddon={<Mail className="h-4 w-4" />}
                    placeholder="your@company.ru"
                    externalError={emailError}
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

                <p className="text-center text-sm text-neutral-600 pt-3 border-t border-neutral-100">
                    Нет аккаунта?{' '}
                    <Link href="/signup" className="text-brand-600 font-semibold hover:underline">
                        Зарегистрироваться
                    </Link>
                </p>

                {process.env.NODE_ENV !== 'production' && (
                    <div className="text-center">
                        <p className="text-[11px] text-neutral-400">
                            Тестовый аккаунт (только dev): <span className="font-mono text-neutral-500">admin@tms.local</span>
                        </p>
                    </div>
                )}
            </form>
        </AuthSplitLayout>
    );
}
