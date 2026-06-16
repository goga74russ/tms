'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, Send, CheckCircle2, Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AuthSplitLayout } from '@/components/auth-split-layout';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailError(null);

        const trimmed = email.trim();
        if (!trimmed) {
            setEmailError('Введите электронную почту');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            setEmailError('Некорректный email');
            return;
        }

        setLoading(true);
        try {
            await api.forgotPassword(trimmed);
            // Enumeration-safe API: success regardless of whether the email
            // exists. UI just says "if it's registered, check inbox".
            setSent(true);
            toast({
                variant: 'success',
                title: 'Письмо отправлено',
                description: 'Проверьте почту — ссылка будет в течение минуты.',
                duration: 4000,
            });
        } catch (err: unknown) {
            const msg = (err as Error)?.message || 'Не удалось отправить запрос. Попробуйте позже.';
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthSplitLayout
            title="Восстановление пароля"
            subtitle="Введите email — пришлём ссылку для сброса"
            topRightLink={{ href: '/login', label: 'Назад ко входу' }}
            rightPanel={
                <div className="space-y-4 text-center">
                    <div className="mx-auto w-32 h-32 rounded-3xl bg-white/80 backdrop-blur flex items-center justify-center shadow-soft-lg border border-white/60">
                        <Inbox className="w-16 h-16 text-brand-600" strokeWidth={1.6} />
                    </div>
                    <div>
                        <div className="text-neutral-900 font-bold text-lg">Ссылка в письме</div>
                        <p className="text-sm text-neutral-600 mt-1.5 max-w-xs mx-auto leading-relaxed">
                            Откройте письмо и нажмите кнопку «Установить новый пароль». Ссылка действует 1 час.
                        </p>
                    </div>
                </div>
            }
        >
            {sent ? (
                <div className="space-y-5">
                    <div
                        role="status"
                        className="rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-900 flex items-start gap-3"
                    >
                        <CheckCircle2 className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold mb-1">Проверьте почту</p>
                            <p className="leading-relaxed">
                                Если адрес <span className="font-mono">{email.trim()}</span> зарегистрирован в системе,
                                на него отправлено письмо со ссылкой для сброса пароля.
                            </p>
                            <p className="leading-relaxed mt-2 text-success-800">
                                Не пришло за пару минут? Проверьте папку «Спам».
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2.5">
                        <Button
                            type="button"
                            variant="secondary"
                            fullWidth
                            onClick={() => {
                                setSent(false);
                                setEmail('');
                            }}
                        >
                            Отправить ещё раз
                        </Button>
                        <Link
                            href="/login"
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors w-full sm:w-auto"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Ко входу
                        </Link>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                        helperText="На этот адрес мы отправим письмо со ссылкой для сброса"
                    />

                    <Button
                        type="submit"
                        variant="brand"
                        size="lg"
                        fullWidth
                        isLoading={loading}
                        leftIcon={!loading ? <Send className="w-4 h-4" /> : undefined}
                    >
                        {loading ? 'Отправляем...' : 'Отправить ссылку'}
                    </Button>

                    <Link
                        href="/login"
                        className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline font-medium"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Вспомнили пароль? Войти
                    </Link>
                </form>
            )}
        </AuthSplitLayout>
    );
}
