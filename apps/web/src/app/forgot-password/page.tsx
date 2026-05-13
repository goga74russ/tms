'use client';

import Link from 'next/link';
import { Mail, ArrowLeft, Clock } from 'lucide-react';
import { AuthSplitLayout } from '@/components/auth-split-layout';

export default function ForgotPasswordPage() {
    return (
        <AuthSplitLayout
            title="Восстановление пароля"
            subtitle="Функция в активной разработке. Пока обратитесь к администратору вашей организации или поддержке."
            topRightLink={{ href: '/login', label: 'К входу' }}
            rightPanel={
                <div className="space-y-4 text-center">
                    <div className="mx-auto w-32 h-32 rounded-3xl bg-white/80 backdrop-blur flex items-center justify-center shadow-soft-lg border border-white/60">
                        <Clock className="w-16 h-16 text-brand-600" strokeWidth={1.6} />
                    </div>
                    <div>
                        <div className="text-neutral-900 font-bold text-lg">Скоро будет</div>
                        <p className="text-sm text-neutral-600 mt-1.5 max-w-xs mx-auto leading-relaxed">
                            Самостоятельное восстановление пароля включат после интеграции с почтовым шлюзом.
                        </p>
                    </div>
                </div>
            }
        >
            <div className="space-y-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-semibold mb-1">Пока вручную</p>
                    <p className="leading-relaxed">
                        Напишите администратору организации — он сбросит пароль из админки.
                        Если у вас нет связи с админом, напишите на{' '}
                        <a href="mailto:support@tms.local" className="underline font-medium text-amber-900 hover:text-amber-700">
                            support@tms.local
                        </a>
                        {' '}с темой «Сброс пароля».
                    </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700 space-y-2">
                    <div className="flex items-center gap-2 text-neutral-900 font-semibold">
                        <Mail className="w-4 h-4 text-brand-600" />
                        Что приложить к письму
                    </div>
                    <ul className="space-y-1 text-xs text-neutral-600 list-disc pl-5">
                        <li>e-mail, под которым вы регистрировались</li>
                        <li>название организации (ИНН — если знаете)</li>
                        <li>краткое описание того, что произошло</li>
                    </ul>
                </div>

                <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline font-medium"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Вернуться к входу
                </Link>
            </div>
        </AuthSplitLayout>
    );
}
