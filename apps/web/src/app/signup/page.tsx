'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Truck,
    Mail,
    KeyRound,
    User,
    Phone,
    Building,
    ShieldCheck,
    ArrowRight,
    Check,
    X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface FieldErrors {
    email?: string;
    password?: string;
    fullName?: string;
    phone?: string;
    companyName?: string;
    consent?: string;
}

function scorePassword(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const safe = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
    const map: Record<0 | 1 | 2 | 3 | 4, { label: string; color: string }> = {
        0: { label: '—', color: 'bg-neutral-200' },
        1: { label: 'Слабый', color: 'bg-red-500' },
        2: { label: 'Средний', color: 'bg-amber-500' },
        3: { label: 'Хороший', color: 'bg-emerald-500' },
        4: { label: 'Отличный', color: 'bg-emerald-600' },
    };
    return { score: safe, ...map[safe] };
}

export default function SignupPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [consent, setConsent] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});

    const pwScore = useMemo(() => scorePassword(password), [password]);

    const validate = (): FieldErrors => {
        const e: FieldErrors = {};
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) e.email = 'Введите корректный e-mail';
        if (password.length < 8) e.password = 'Минимум 8 символов';
        if (fullName.trim().length < 2) e.fullName = 'Укажите ваше ФИО';
        if (phone && !/^[+()\d\s\-]{7,}$/.test(phone)) e.phone = 'Проверьте формат телефона';
        if (!consent) e.consent = 'Требуется согласие на обработку персональных данных';
        return e;
    };

    const handleSignup = async (ev: React.FormEvent) => {
        ev.preventDefault();
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length > 0) return;

        setLoading(true);
        try {
            const res = await api.post<{ success: boolean; error?: string }>('/auth/signup', {
                email,
                password,
                fullName,
                phone: phone || undefined,
                companyName: companyName || undefined,
            });
            if (!res.success) {
                const message = res.error ?? 'Ошибка регистрации';
                if (/email|exist/i.test(message)) {
                    setErrors({ email: 'Этот e-mail уже зарегистрирован' });
                }
                toast({
                    variant: 'error',
                    title: 'Не удалось создать аккаунт',
                    description: message,
                });
                return;
            }
            toast({
                variant: 'success',
                title: 'Письмо отправлено',
                description: 'Проверьте почту и введите код подтверждения.',
            });
            router.push(`/signup/verify?email=${encodeURIComponent(email)}`);
        } catch (err: unknown) {
            toast({
                variant: 'error',
                title: 'Ошибка соединения',
                description: (err as Error).message ?? 'Попробуйте ещё раз',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex flex-col justify-center items-center p-4 bg-neutral-50 relative overflow-hidden"
            style={{
                backgroundImage:
                    'radial-gradient(900px 500px at 90% -10%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(700px 400px at 0% 110%, rgba(168,85,247,0.15), transparent 60%)',
            }}
        >
            <Link
                href="/landing"
                className="absolute top-6 left-6 inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900"
            >
                <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
                    <Truck className="w-4 h-4" />
                </div>
                <span className="font-bold">TMS</span>
            </Link>

            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden">
                <div className="p-8 pb-6">
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Регистрация в TMS</h1>
                    <p className="text-sm text-neutral-500 mt-1.5">
                        Создайте организацию за 5 минут — без банковской карты.
                    </p>
                </div>

                <form onSubmit={handleSignup} className="px-8 pb-8 space-y-4" noValidate>
                    <Input
                        label="Электронная почта"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        leftAddon={<Mail className="h-4 w-4" />}
                        error={errors.email}
                        placeholder="you@company.ru"
                    />

                    <div>
                        <Input
                            label="Пароль"
                            type="password"
                            required
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            leftAddon={<KeyRound className="h-4 w-4" />}
                            error={errors.password}
                            placeholder="Минимум 8 символов"
                            helperText="Используйте цифры и спецсимволы для надёжного пароля"
                        />
                        {password && (
                            <div className="mt-2 flex items-center gap-2">
                                <div className="flex-1 h-1 bg-neutral-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${pwScore.color} transition-all duration-200`}
                                        style={{ width: `${(pwScore.score / 4) * 100}%` }}
                                    />
                                </div>
                                <span className="text-xs font-medium text-neutral-600 w-16 text-right">
                                    {pwScore.label}
                                </span>
                            </div>
                        )}
                    </div>

                    <Input
                        label="ФИО"
                        type="text"
                        required
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        leftAddon={<User className="h-4 w-4" />}
                        error={errors.fullName}
                        placeholder="Иванов Иван Иванович"
                    />

                    <Input
                        label="Телефон"
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        leftAddon={<Phone className="h-4 w-4" />}
                        error={errors.phone}
                        helperText="Необязательно — пригодится для звонка от поддержки"
                        placeholder="+7 ___ ___-__-__"
                    />

                    <Input
                        label="Название компании"
                        type="text"
                        autoComplete="organization"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        leftAddon={<Building className="h-4 w-4" />}
                        error={errors.companyName}
                        helperText="Необязательно — можно ввести позже"
                        placeholder="ООО «...»"
                    />

                    <label className="flex items-start gap-3 pt-2 cursor-pointer group">
                        <span
                            className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border transition-colors shrink-0 ${
                                consent
                                    ? 'bg-brand-600 border-brand-600 text-white'
                                    : errors.consent
                                      ? 'border-red-300 bg-white'
                                      : 'border-neutral-300 bg-white group-hover:border-brand-400'
                            }`}
                        >
                            {consent ? <Check className="w-3.5 h-3.5" /> : null}
                        </span>
                        <input
                            type="checkbox"
                            className="sr-only"
                            checked={consent}
                            onChange={(e) => {
                                setConsent(e.target.checked);
                                if (e.target.checked) setErrors((p) => ({ ...p, consent: undefined }));
                            }}
                        />
                        <span className="text-xs text-neutral-600 leading-relaxed">
                            Согласен на обработку персональных данных в соответствии с{' '}
                            <Link
                                href="/legal/personal-data"
                                target="_blank"
                                className="text-brand-600 underline hover:text-brand-700"
                            >
                                152-ФЗ и Политикой
                            </Link>
                            . Регистрация — акцепт{' '}
                            <Link
                                href="/legal/terms"
                                target="_blank"
                                className="text-brand-600 underline hover:text-brand-700"
                            >
                                публичной оферты
                            </Link>
                            .
                        </span>
                    </label>
                    {errors.consent && (
                        <div className="flex items-center gap-1 text-xs text-red-600">
                            <X className="w-3 h-3" /> {errors.consent}
                        </div>
                    )}

                    <Button
                        type="submit"
                        variant="brand"
                        size="lg"
                        fullWidth
                        isLoading={loading}
                        rightIcon={!loading ? <ArrowRight className="w-4 h-4" /> : undefined}
                    >
                        {loading ? 'Создаём аккаунт...' : 'Создать аккаунт'}
                    </Button>

                    <div className="flex items-center gap-2 pt-3 text-xs text-neutral-500">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Данные на серверах в РФ. Без передачи третьим лицам.</span>
                    </div>

                    <p className="text-center text-sm text-neutral-600 pt-2 border-t border-neutral-100">
                        Уже есть аккаунт?{' '}
                        <Link href="/login" className="text-brand-600 font-semibold hover:underline">
                            Войти →
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
}
