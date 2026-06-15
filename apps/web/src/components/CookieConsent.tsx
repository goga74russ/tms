'use client';

// Cookie-баннер согласия (152-ФЗ + cookie-policy §5.3). Показывается при первом
// визите, пока пользователь не сделал выбор; решение сохраняется в localStorage
// (строго необходимая категория — хранение самого согласия). Аналитика/функц.
// cookie на момент внедрения не подключены — баннер фиксирует выбор на будущее
// (будущая интеграция аналитики обязана читать этот consent перед загрузкой).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const COOKIE_CONSENT_KEY = 'tms_cookie_consent_v1';

export interface CookieConsentValue {
    necessary: true; // всегда включены
    functional: boolean;
    analytics: boolean;
    decidedAt: string; // ISO
    version: 1;
}

/** Текущий сохранённый выбор (или null, если пользователь ещё не решал). */
export function readCookieConsent(): CookieConsentValue | null {
    try {
        const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
        return raw ? (JSON.parse(raw) as CookieConsentValue) : null;
    } catch {
        return null;
    }
}

export function CookieConsent() {
    const [visible, setVisible] = useState(false);
    const [configuring, setConfiguring] = useState(false);
    const [functional, setFunctional] = useState(true);
    const [analytics, setAnalytics] = useState(false);

    // Решение принимается только на клиенте — на SSR баннер не рендерим (нет
    // мерцания/гидрационного рассинхрона): показываем после эффекта, если
    // сохранённого выбора нет.
    useEffect(() => {
        if (!readCookieConsent()) setVisible(true);
    }, []);

    function persist(choice: { functional: boolean; analytics: boolean }) {
        const value: CookieConsentValue = {
            necessary: true,
            functional: choice.functional,
            analytics: choice.analytics,
            decidedAt: new Date().toISOString(),
            version: 1,
        };
        try {
            localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(value));
        } catch {
            // localStorage недоступен (приватный режим) — просто скрываем баннер
            // на эту сессию, при следующем визите спросим снова.
        }
        setVisible(false);
    }

    if (!visible) return null;

    return (
        <div
            role="dialog"
            aria-label="Уведомление об использовании файлов cookie"
            aria-live="polite"
            className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4 print:hidden"
        >
            <div className="mx-auto max-w-3xl rounded-xl border border-neutral-200 bg-white shadow-lg p-4 sm:p-5">
                <div className="flex items-start gap-3">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                        <Cookie className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-neutral-900">Мы используем файлы cookie</div>
                        <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
                            Строго необходимые cookie обеспечивают работу сервиса (вход, безопасность).
                            Функциональные и аналитические подключаются только с вашего согласия. Подробнее — в{' '}
                            <Link href="/legal/cookies" className="text-brand-600 underline hover:text-brand-700">
                                Политике использования cookie
                            </Link>
                            .
                        </p>

                        {configuring && (
                            <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                                <label className="flex items-start gap-2.5 text-sm text-neutral-500">
                                    <input type="checkbox" checked disabled className="mt-0.5 accent-brand-600" />
                                    <span>
                                        <span className="font-medium text-neutral-700">Строго необходимые</span> — всегда включены
                                        (сессия, защита от CSRF). Без них вход в сервис невозможен.
                                    </span>
                                </label>
                                <label className="flex items-start gap-2.5 text-sm text-neutral-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={functional}
                                        onChange={(e) => setFunctional(e.target.checked)}
                                        className="mt-0.5 accent-brand-600"
                                    />
                                    <span>
                                        <span className="font-medium">Функциональные</span> — «Запомнить меня», языковые и
                                        интерфейсные предпочтения.
                                    </span>
                                </label>
                                <label className="flex items-start gap-2.5 text-sm text-neutral-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={analytics}
                                        onChange={(e) => setAnalytics(e.target.checked)}
                                        className="mt-0.5 accent-brand-600"
                                    />
                                    <span>
                                        <span className="font-medium">Аналитические</span> — обезличенная статистика посещаемости
                                        (на момент редакции не подключены).
                                    </span>
                                </label>
                            </div>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                            {configuring ? (
                                <>
                                    <Button variant="brand" size="sm" onClick={() => persist({ functional, analytics })}>
                                        Сохранить выбор
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setConfiguring(false)}>
                                        Назад
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button variant="brand" size="sm" onClick={() => persist({ functional: true, analytics: true })}>
                                        Принять
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => persist({ functional: false, analytics: false })}>
                                        Только необходимые
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setConfiguring(true)}>
                                        Настроить
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
