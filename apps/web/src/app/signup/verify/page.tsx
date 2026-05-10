'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail } from 'lucide-react';
import { api } from '@/lib/api';

export default function VerifyEmailPage() {
    const router = useRouter();
    const params = useSearchParams();
    const email = params.get('email') ?? '';
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resendCooldown, setResendCooldown] = useState(60);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (code.length !== 6) {
            setError('Код должен содержать 6 цифр');
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const res = await api.post<{ success: boolean; error?: string }>('/auth/verify-email', { email, code });
            if (!res.success) {
                setError(res.error ?? 'Неверный код');
                return;
            }
            router.push('/onboarding');
        } catch (err: unknown) {
            setError((err as Error).message ?? 'Ошибка проверки');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;
        setError(null);
        try {
            await api.post('/auth/resend-code', { email });
            setResendCooldown(60);
        } catch (err: unknown) {
            setError((err as Error).message ?? 'Не удалось отправить код');
        }
    };

    if (!email) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
                <p className="text-slate-700">Email не передан. <a href="/signup" className="text-indigo-600 hover:underline">Вернуться к регистрации</a></p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-8 text-center text-white">
                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Mail className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">Проверьте почту</h1>
                    <p className="text-indigo-100 mt-2 text-sm">Мы отправили 6-значный код на <strong>{email}</strong></p>
                </div>

                <form onSubmit={handleVerify} className="p-8 space-y-5">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">{error}</div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 block">Код подтверждения</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="\d{6}"
                            maxLength={6}
                            required
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                            className="block w-full text-center tracking-[0.5em] text-2xl py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                            placeholder="000000"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || code.length !== 6}
                        className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 transition-all"
                    >
                        {loading ? 'Проверяем...' : 'Подтвердить'}
                    </button>

                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendCooldown > 0}
                        className="w-full text-sm text-indigo-600 hover:underline disabled:text-slate-400 disabled:no-underline"
                    >
                        {resendCooldown > 0 ? `Отправить код повторно через ${resendCooldown}с` : 'Отправить код повторно'}
                    </button>
                </form>
            </div>
        </div>
    );
}
