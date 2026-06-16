'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, ShieldCheck, AlertTriangle, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AuthSplitLayout } from '@/components/auth-split-layout';

// useSearchParams() requires a Suspense boundary in App Router builds.
// Default-export a thin wrapper that hosts the boundary.
export default function ResetPasswordPage() {
    return (
        <Suspense fallback={null}>
            <ResetPasswordContent />
        </Suspense>
    );
}

function ResetPasswordContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast } = useToast();
    const token = useMemo(() => searchParams.get('token') ?? '', [searchParams]);

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [confirmError, setConfirmError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const tokenMissing = !token || token.length < 20;

    const validate = (): boolean => {
        let ok = true;
        setPasswordError(null);
        setConfirmError(null);
        if (!password) {
            setPasswordError('Введите новый пароль');
            ok = false;
        } else if (password.length < 8) {
            setPasswordError('Минимум 8 символов');
            ok = false;
        }
        if (!confirm) {
            setConfirmError('Повторите пароль');
            ok = false;
        } else if (password && confirm !== password) {
            setConfirmError('Пароли не совпадают');
            ok = false;
        }
        return ok;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        if (tokenMissing || !validate()) return;

        setLoading(true);
        try {
            await api.resetPassword(token, password);
            toast({
                variant: 'success',
                title: 'Пароль обновлён',
                description: 'Войдите в систему с новым паролем.',
                duration: 3500,
            });
            router.push('/login');
        } catch (err: unknown) {
            const msg = (err as Error)?.message || 'Не удалось сбросить пароль. Запросите новую ссылку.';
            setFormError(msg);
            toast({ variant: 'error', title: 'Ошибка сброса пароля', description: msg });
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthSplitLayout
            title="Новый пароль"
            subtitle="Придумайте надёжный пароль — минимум 8 символов"
            topRightLink={{ href: '/login', label: 'Назад ко входу' }}
            rightPanel={
                <div className="space-y-4 text-center">
                    <div className="mx-auto w-32 h-32 rounded-3xl bg-white/80 backdrop-blur flex items-center justify-center shadow-soft-lg border border-white/60">
                        <ShieldCheck className="w-16 h-16 text-brand-600" strokeWidth={1.6} />
                    </div>
                    <div>
                        <div className="text-neutral-900 font-bold text-lg">Безопасный сброс</div>
                        <p className="text-sm text-neutral-600 mt-1.5 max-w-xs mx-auto leading-relaxed">
                            Ссылка действует 1 час и работает один раз. После сброса войдите с новым паролем.
                        </p>
                    </div>
                </div>
            }
        >
            {tokenMissing ? (
                <div className="space-y-5">
                    <div
                        role="alert"
                        className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900 flex items-start gap-3"
                    >
                        <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold mb-1">Ссылка недействительна</p>
                            <p className="leading-relaxed">
                                В адресе нет токена сброса — возможно, ссылка была обрезана почтовым клиентом
                                или вы открыли страницу напрямую. Запросите новую ссылку.
                            </p>
                        </div>
                    </div>

                    <Link
                        href="/forgot-password"
                        className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
                    >
                        Запросить новую ссылку
                    </Link>
                </div>
            ) : (
                <>
                    {formError && (
                        <div
                            role="alert"
                            className="mb-5 bg-danger-50 text-danger-700 p-3 rounded-lg text-sm font-medium border border-danger-200 flex items-start gap-2"
                        >
                            <span className="w-5 h-5 rounded-full bg-danger-100 text-danger-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">!</span>
                            <span>{formError}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                        <Input
                            label="Новый пароль"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                if (passwordError) setPasswordError(null);
                            }}
                            leftAddon={<KeyRound className="h-4 w-4" />}
                            placeholder="••••••••"
                            helperText="Минимум 8 символов. Используйте буквы, цифры и спецсимволы."
                            error={passwordError}
                            disabled={loading}
                        />

                        <Input
                            label="Повторите пароль"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={confirm}
                            onChange={(e) => {
                                setConfirm(e.target.value);
                                if (confirmError) setConfirmError(null);
                            }}
                            leftAddon={<KeyRound className="h-4 w-4" />}
                            placeholder="••••••••"
                            error={confirmError}
                            disabled={loading}
                        />

                        <Button
                            type="submit"
                            variant="brand"
                            size="lg"
                            fullWidth
                            isLoading={loading}
                            leftIcon={!loading ? <ShieldCheck className="w-4 h-4" /> : undefined}
                        >
                            {loading ? 'Сохраняем...' : 'Установить пароль'}
                        </Button>

                        <div className="flex items-center justify-between text-sm">
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-1.5 text-brand-600 hover:underline font-medium"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                Ко входу
                            </Link>
                            <Link
                                href="/forgot-password"
                                className="text-neutral-500 hover:text-neutral-700 hover:underline"
                            >
                                Запросить новую ссылку
                            </Link>
                        </div>
                    </form>
                </>
            )}
        </AuthSplitLayout>
    );
}
