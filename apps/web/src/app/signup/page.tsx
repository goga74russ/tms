'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Mail, KeyRound, User, Phone, Building } from 'lucide-react';
import { api } from '@/lib/api';

export default function SignupPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const passwordOk = password.length >= 8;
    const formValid = email.includes('@') && passwordOk && fullName.length > 0;

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!formValid) {
            setError('Заполните email, имя и пароль (минимум 8 символов).');
            return;
        }
        setLoading(true);
        try {
            const res = await api.post<{ success: boolean; error?: string }>('/auth/signup', {
                email, password, fullName,
                phone: phone || undefined,
                companyName: companyName || undefined,
            });
            if (!res.success) {
                setError(res.error ?? 'Ошибка регистрации');
                return;
            }
            router.push(`/signup/verify?email=${encodeURIComponent(email)}`);
        } catch (err: unknown) {
            setError((err as Error).message ?? 'Ошибка соединения');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-8 text-center text-white">
                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm border border-white/30">
                        <Truck className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">Регистрация в TMS</h1>
                    <p className="text-indigo-100 mt-2 text-sm">Создайте организацию за 5 минут</p>
                </div>

                <form onSubmit={handleSignup} className="p-8 space-y-4">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">{error}</div>
                    )}

                    <FieldWithIcon icon={<Mail className="h-5 w-5" />} label="Электронная почта *">
                        <input
                            type="email" required value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                            placeholder="you@company.ru"
                        />
                    </FieldWithIcon>

                    <FieldWithIcon icon={<KeyRound className="h-5 w-5" />} label="Пароль (минимум 8 символов) *">
                        <input
                            type="password" required value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`block w-full pl-10 pr-3 py-2.5 bg-slate-50 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 ${
                                password && !passwordOk ? 'border-red-300' : 'border-slate-200'
                            }`}
                            placeholder="••••••••"
                        />
                    </FieldWithIcon>

                    <FieldWithIcon icon={<User className="h-5 w-5" />} label="ФИО *">
                        <input
                            type="text" required value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                            placeholder="Иванов Иван Иванович"
                        />
                    </FieldWithIcon>

                    <FieldWithIcon icon={<Phone className="h-5 w-5" />} label="Телефон">
                        <input
                            type="tel" value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                            placeholder="+7 ..."
                        />
                    </FieldWithIcon>

                    <FieldWithIcon icon={<Building className="h-5 w-5" />} label="Название компании">
                        <input
                            type="text" value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                            placeholder="ООО ..."
                        />
                    </FieldWithIcon>

                    <button
                        type="submit"
                        disabled={loading || !formValid}
                        className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 transition-all"
                    >
                        {loading ? 'Создаём...' : 'Создать аккаунт'}
                    </button>

                    <p className="text-center text-sm text-slate-500">
                        Уже есть аккаунт? <a href="/login" className="text-indigo-600 hover:underline">Войти</a>
                    </p>
                </form>
            </div>
        </div>
    );
}

function FieldWithIcon({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 block">{label}</label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    {icon}
                </div>
                {children}
            </div>
        </div>
    );
}
