'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Mail,
    KeyRound,
    User,
    Phone,
    Building,
    ShieldCheck,
    ArrowRight,
    Check,
    X,
    Smartphone,
    Wallet,
    MapPin,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AuthSplitLayout } from '@/components/auth-split-layout';

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

const SHOWCASE_FRAMES = [
    {
        kind: 'cockpit' as const,
        caption: 'Все рейсы в одном кокпите',
        sub: 'Карта, статусы, AI-подсказки и алёрты SLA в реальном времени.',
    },
    {
        kind: 'mobile' as const,
        caption: 'Водитель работает офлайн',
        sub: 'Мобильное приложение синхронизируется когда появится сеть.',
    },
    {
        kind: 'pricing' as const,
        caption: 'Бесплатно до 5 машин',
        sub: 'Без банковской карты. Платите только когда вырастете.',
    },
];

function ShowcaseFrame({ kind }: { kind: 'cockpit' | 'mobile' | 'pricing' }) {
    if (kind === 'cockpit') {
        return (
            <div className="rounded-2xl border border-white/60 bg-white shadow-soft-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-neutral-50 border-b border-neutral-200">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="ml-3 text-[11px] text-neutral-500 font-mono">transpult.ru/dispatcher</span>
                </div>
                <div className="p-5 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-brand-50 px-2.5 py-2 border border-brand-100">
                            <div className="text-[9px] uppercase font-semibold text-brand-700">Активные</div>
                            <div className="text-lg font-bold tabular-nums text-neutral-900">24</div>
                        </div>
                        <div className="rounded-lg bg-emerald-50 px-2.5 py-2 border border-emerald-100">
                            <div className="text-[9px] uppercase font-semibold text-emerald-700">SLA</div>
                            <div className="text-lg font-bold tabular-nums text-neutral-900">92%</div>
                        </div>
                        <div className="rounded-lg bg-amber-50 px-2.5 py-2 border border-amber-100">
                            <div className="text-[9px] uppercase font-semibold text-amber-700">Алёрты</div>
                            <div className="text-lg font-bold tabular-nums text-neutral-900">3</div>
                        </div>
                    </div>
                    <div className="rounded-lg bg-neutral-50 border border-neutral-100 h-24 relative overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(99,102,241,0.18),transparent_50%),radial-gradient(circle_at_75%_70%,rgba(16,185,129,0.18),transparent_50%)]" />
                        <MapPin className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-brand-600" />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-white px-3 py-2">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                            <MapPin className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-neutral-500 font-mono">TR-2841</div>
                            <div className="text-xs font-semibold text-neutral-900 truncate">Москва → Казань</div>
                        </div>
                        <span className="text-[9px] font-semibold uppercase px-2 py-1 rounded-full bg-brand-100 text-brand-700">В пути</span>
                    </div>
                </div>
            </div>
        );
    }
    if (kind === 'mobile') {
        return (
            <div className="flex justify-center">
                <div className="relative w-52 h-[340px] rounded-[2rem] border-4 border-neutral-900 bg-white shadow-2xl overflow-hidden">
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-1 rounded-full bg-neutral-700" />
                    <div className="pt-7 pb-3 px-3 space-y-2.5">
                        <div className="flex items-center gap-2 px-1">
                            <Smartphone className="w-4 h-4 text-brand-600" />
                            <div className="text-xs font-bold text-neutral-900">Мои рейсы</div>
                        </div>
                        {[
                            { id: 'TR-2841', route: 'Москва → Казань', status: 'В пути', tone: 'bg-brand-50 text-brand-700' },
                            { id: 'TR-2842', route: 'СПб → Новгород', status: 'Погрузка', tone: 'bg-amber-50 text-amber-700' },
                            { id: 'TR-2843', route: 'Сочи → Краснодар', status: 'Планируется', tone: 'bg-neutral-100 text-neutral-600' },
                        ].map((t) => (
                            <div key={t.id} className="rounded-xl border border-neutral-100 bg-white p-2.5">
                                <div className="text-[10px] text-neutral-500 font-mono">{t.id}</div>
                                <div className="text-[11px] font-semibold text-neutral-900">{t.route}</div>
                                <div className={`mt-1 inline-block text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded ${t.tone}`}>
                                    {t.status}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="rounded-2xl border border-white/60 bg-white shadow-soft-lg p-6 space-y-4">
            <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-brand-600" />
                <span className="text-sm font-bold text-neutral-900">Бесплатный старт</span>
            </div>
            <div>
                <span className="text-4xl font-bold text-neutral-900">0 ₽</span>
                <span className="text-sm text-neutral-500 ml-1">/ месяц</span>
            </div>
            <ul className="space-y-2 text-sm text-neutral-700">
                {['До 5 машин', 'Безлимит рейсов', 'AI-помощник', 'Интеграция ЭДО'].map((f) => (
                    <li key={f} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500" />
                        {f}
                    </li>
                ))}
            </ul>
            <div className="pt-2 text-xs text-neutral-500">Pro — от 4 990 ₽/мес за 30 машин</div>
        </div>
    );
}

function ShowcaseCarousel() {
    const [idx, setIdx] = useState(0);
    const [autoplayPaused, setAutoplayPaused] = useState(false);
    useEffect(() => {
        if (autoplayPaused) return;
        const t = setInterval(() => setIdx((i) => (i + 1) % SHOWCASE_FRAMES.length), 4000);
        return () => clearInterval(t);
    }, [autoplayPaused]);
    const frame = SHOWCASE_FRAMES[idx];
    return (
        <div className="space-y-5">
            <div key={idx} className="animate-in fade-in duration-500">
                <ShowcaseFrame kind={frame.kind} />
            </div>
            <div className="text-center">
                <div className="text-neutral-800 font-semibold">{frame.caption}</div>
                <p className="text-xs text-neutral-500 mt-1 max-w-xs mx-auto">{frame.sub}</p>
            </div>
            <div className="flex items-center justify-center gap-2">
                {SHOWCASE_FRAMES.map((f, i) => (
                    <button
                        key={f.kind}
                        type="button"
                        aria-label={`Слайд ${i + 1}`}
                        onClick={() => {
                            setIdx(i);
                            setAutoplayPaused(true);
                        }}
                        className={`h-1.5 rounded-full transition-all ${i === idx ? 'bg-brand-600 w-6' : 'bg-neutral-300 w-1.5 hover:bg-neutral-400'}`}
                    />
                ))}
            </div>
        </div>
    );
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
                // Enumeration-safe: бэкенд на существующий email возвращает
                // success (А-P2), поэтому сюда попадают только настоящие сбои.
                // Не парсим res.error на «email занят» и не показываем серверное
                // message — это раскрывало бы существование адреса. Нейтральный текст.
                toast({
                    variant: 'error',
                    title: 'Не удалось создать аккаунт',
                    description: 'Проверьте введённые данные и попробуйте ещё раз.',
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
        <AuthSplitLayout
            title="Создайте аккаунт"
            subtitle="Запустите свою компанию в ТрансПульт за 5 минут — без банковской карты."
            topRightLink={{ href: '/login', label: 'Уже есть аккаунт?' }}
            rightPanel={<ShowcaseCarousel />}
        >
            <form onSubmit={handleSignup} className="space-y-4" noValidate>
                <FormField
                    format="email"
                    label="Электронная почта"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    leftAddon={<Mail className="h-4 w-4" />}
                    externalError={errors.email}
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

                <FormField
                    format="phone"
                    label="Телефон"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    leftAddon={<Phone className="h-4 w-4" />}
                    externalError={errors.phone}
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

                <p className="text-center text-sm text-neutral-600 pt-3 border-t border-neutral-100">
                    Уже зарегистрированы?{' '}
                    <Link href="/login" className="text-brand-600 font-semibold hover:underline">
                        Войти
                    </Link>
                </p>
            </form>
        </AuthSplitLayout>
    );
}
