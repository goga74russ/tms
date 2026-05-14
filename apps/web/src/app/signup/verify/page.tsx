'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, RefreshCw, ArrowRight, AlertCircle, Clipboard, Pencil, MailCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AuthSplitLayout } from '@/components/auth-split-layout';

const CODE_LENGTH = 6;

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-neutral-500">Загрузка...</div>}>
            <VerifyEmailContent />
        </Suspense>
    );
}

function VerifyIllustration() {
    return (
        <div className="space-y-5 text-center">
            <div className="mx-auto w-32 h-32 rounded-3xl bg-white/80 backdrop-blur flex items-center justify-center shadow-soft-lg border border-white/60">
                <MailCheck className="w-16 h-16 text-brand-600" strokeWidth={1.6} />
            </div>
            <div>
                <div className="text-neutral-900 font-bold text-lg">Проверяем почту</div>
                <p className="text-sm text-neutral-600 mt-1.5 max-w-xs mx-auto leading-relaxed">
                    Письмо приходит в течение минуты. Если не видите — посмотрите в папке «Спам».
                </p>
            </div>
            <div className="flex items-center justify-center gap-6 text-xs text-neutral-600 pt-2">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Отправлено
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                    Ждём ввода
                </div>
            </div>
        </div>
    );
}

function VerifyEmailContent() {
    const router = useRouter();
    const { toast } = useToast();
    const params = useSearchParams();
    const email = params.get('email') ?? '';

    const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendCooldown, setResendCooldown] = useState(60);
    const [resending, setResending] = useState(false);

    const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    useEffect(() => {
        inputsRef.current[0]?.focus();
    }, []);

    const code = digits.join('');

    const verify = useCallback(
        async (codeValue: string) => {
            if (codeValue.length !== CODE_LENGTH) return;
            setError(null);
            setLoading(true);
            try {
                const res = await api.post<{ success: boolean; error?: string }>('/auth/verify-email', {
                    email,
                    code: codeValue,
                });
                if (!res.success) {
                    setError(res.error ?? 'Неверный код');
                    toast({
                        variant: 'error',
                        title: 'Неверный код',
                        description: res.error ?? 'Проверьте код и попробуйте снова.',
                    });
                    return;
                }
                toast({
                    variant: 'success',
                    title: 'Почта подтверждена',
                    description: 'Перенаправляем в онбординг...',
                });
                router.push('/onboarding');
            } catch (err: unknown) {
                const message = (err as Error).message ?? 'Ошибка проверки';
                setError(message);
                toast({ variant: 'error', title: 'Ошибка', description: message });
            } finally {
                setLoading(false);
            }
        },
        [email, router, toast],
    );

    const handleChange = (idx: number, raw: string) => {
        const v = raw.replace(/\D/g, '');
        if (!v) {
            setDigits((prev) => {
                const next = [...prev];
                next[idx] = '';
                return next;
            });
            return;
        }
        if (v.length > 1) {
            const incoming = v.slice(0, CODE_LENGTH - idx).split('');
            setDigits((prev) => {
                const next = [...prev];
                incoming.forEach((d, i) => {
                    next[idx + i] = d;
                });
                return next;
            });
            const lastIdx = Math.min(CODE_LENGTH - 1, idx + incoming.length);
            inputsRef.current[lastIdx]?.focus();
            const fullCode =
                [...digits.slice(0, idx), ...incoming, ...digits.slice(idx + incoming.length)].join('').slice(0, CODE_LENGTH);
            if (fullCode.length === CODE_LENGTH) void verify(fullCode);
            return;
        }
        setDigits((prev) => {
            const next = [...prev];
            next[idx] = v;
            if (idx === CODE_LENGTH - 1 && next.join('').length === CODE_LENGTH) {
                setTimeout(() => verify(next.join('')), 0);
            }
            return next;
        });
        if (idx < CODE_LENGTH - 1) inputsRef.current[idx + 1]?.focus();
    };

    const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
            inputsRef.current[idx - 1]?.focus();
        }
        if (e.key === 'ArrowLeft' && idx > 0) inputsRef.current[idx - 1]?.focus();
        if (e.key === 'ArrowRight' && idx < CODE_LENGTH - 1) inputsRef.current[idx + 1]?.focus();
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
        if (!pasted) return;
        e.preventDefault();
        const next = pasted.split('').concat(Array(CODE_LENGTH).fill('')).slice(0, CODE_LENGTH);
        setDigits(next);
        const lastIdx = Math.min(CODE_LENGTH - 1, pasted.length - 1);
        inputsRef.current[lastIdx]?.focus();
        if (pasted.length === CODE_LENGTH) void verify(pasted);
    };

    const handlePasteButton = async () => {
        // Safari < 13.4, Firefox без permission, insecure HTTP — navigator.clipboard может отсутствовать.
        if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
            toast({
                variant: 'warning',
                title: 'Буфер недоступен',
                description: 'Браузер не разрешает чтение буфера. Вставьте код вручную (Ctrl+V).',
            });
            return;
        }
        try {
            const text = await navigator.clipboard.readText();
            const cleaned = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
            if (!cleaned) {
                toast({ variant: 'warning', title: 'В буфере нет цифр', description: 'Скопируйте код из письма.' });
                return;
            }
            const next = cleaned.split('').concat(Array(CODE_LENGTH).fill('')).slice(0, CODE_LENGTH);
            setDigits(next);
            const lastIdx = Math.min(CODE_LENGTH - 1, cleaned.length - 1);
            inputsRef.current[lastIdx]?.focus();
            if (cleaned.length === CODE_LENGTH) void verify(cleaned);
        } catch {
            toast({
                variant: 'warning',
                title: 'Нет доступа к буферу',
                description: 'Вставьте код вручную (Ctrl+V).',
            });
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;
        setResending(true);
        setError(null);
        try {
            await api.post('/auth/resend-code', { email });
            setResendCooldown(60);
            toast({
                variant: 'success',
                title: 'Код отправлен',
                description: `Новый код выслан на ${email}.`,
            });
        } catch (err: unknown) {
            const message = (err as Error).message ?? 'Не удалось отправить код';
            setError(message);
            toast({ variant: 'error', title: 'Ошибка', description: message });
        } finally {
            setResending(false);
        }
    };

    if (!email) {
        return (
            <div className="min-h-screen bg-neutral-50 flex flex-col justify-center items-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md w-full">
                    <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-neutral-900">Не удалось продолжить</h1>
                    <p className="text-sm text-neutral-600 mt-2">Email-адрес не передан. Зарегистрируйтесь заново.</p>
                    <Link
                        href="/signup"
                        className="mt-6 inline-flex items-center gap-2 bg-brand-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-brand-700"
                    >
                        К регистрации <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        );
    }

    const mins = Math.floor(resendCooldown / 60);
    const secs = resendCooldown % 60;
    const cooldownLabel = `${mins}:${String(secs).padStart(2, '0')}`;

    return (
        <AuthSplitLayout
            title="Проверьте почту"
            subtitle={
                <span className="inline-flex items-center gap-2 flex-wrap">
                    <span>Мы отправили 6-значный код на</span>
                    <span className="inline-flex items-center gap-1.5 bg-neutral-100 rounded-lg px-2 py-1 text-neutral-900 font-semibold">
                        <Mail className="w-3.5 h-3.5 text-neutral-500" />
                        {email}
                        <Link
                            href="/signup"
                            aria-label="Изменить email"
                            className="ml-1 text-neutral-400 hover:text-brand-600"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </Link>
                    </span>
                </span>
            }
            topRightLink={{ href: '/signup', label: 'Изменить email' }}
            rightPanel={<VerifyIllustration />}
        >
            <div className="space-y-5">
                {/* Code boxes */}
                <div className="flex justify-center gap-2 sm:gap-3" onPaste={handlePaste}>
                    {digits.map((d, idx) => (
                        <input
                            key={idx}
                            ref={(el) => {
                                inputsRef.current[idx] = el;
                            }}
                            inputMode="numeric"
                            maxLength={1}
                            value={d}
                            onChange={(e) => handleChange(idx, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(idx, e)}
                            onFocus={(e) => e.target.select()}
                            disabled={loading}
                            aria-label={`Цифра ${idx + 1}`}
                            className={`w-11 h-12 sm:w-12 sm:h-14 text-center text-2xl font-bold rounded-xl border bg-white text-neutral-900 transition-all focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 disabled:opacity-60 ${
                                error ? 'border-red-300' : 'border-neutral-300'
                            }`}
                        />
                    ))}
                </div>

                {/* Paste from clipboard */}
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={handlePasteButton}
                        className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-brand-700 px-3 py-1.5 rounded-lg hover:bg-neutral-50 transition-colors"
                    >
                        <Clipboard className="w-3.5 h-3.5" />
                        Вставить из буфера
                    </button>
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 justify-center" role="alert">
                        <AlertCircle className="w-4 h-4" /> {error}
                    </div>
                )}

                <Button
                    type="button"
                    variant="brand"
                    size="lg"
                    fullWidth
                    isLoading={loading}
                    disabled={code.length !== CODE_LENGTH}
                    onClick={() => verify(code)}
                    title={code.length !== CODE_LENGTH ? `Введите все ${CODE_LENGTH} цифр кода` : undefined}
                >
                    {loading ? 'Проверяем...' : 'Подтвердить'}
                </Button>

                <div className="text-center text-sm">
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendCooldown > 0 || resending}
                        className="inline-flex items-center gap-1.5 text-brand-600 hover:underline disabled:text-neutral-400 disabled:no-underline disabled:cursor-not-allowed font-medium"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
                        {resendCooldown > 0 ? `Отправить снова через ${cooldownLabel}` : 'Отправить снова'}
                    </button>
                </div>

                <div className="text-center text-xs text-neutral-500 leading-relaxed pt-3 border-t border-neutral-100">
                    Не пришло письмо? Проверьте папку <strong>«Спам»</strong> или подождите 1-2 минуты.
                </div>
            </div>
        </AuthSplitLayout>
    );
}
