'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Activity, CheckCircle2, XCircle, RefreshCw, Clock, ExternalLink, ArrowLeft } from 'lucide-react';
import { StickyHeader } from '../landing/components/StickyHeader';
import { Footer } from '../landing/components/Footer';

export const dynamic = 'force-dynamic';

interface HealthResponse {
    status?: string;
    timestamp?: string;
    version?: string;
}

type CheckState = 'idle' | 'loading' | 'up' | 'down';

interface SystemCheck {
    label: string;
    description: string;
    state: CheckState;
    detail?: string;
    latencyMs?: number;
}

export default function StatusPage() {
    const [checks, setChecks] = useState<Record<string, SystemCheck>>({
        web: {
            label: 'Веб-приложение',
            description: 'Лендинг, кабинет пользователя, формы регистрации',
            state: 'up',
            detail: 'Эта страница загрузилась — значит работает.',
        },
        api: {
            label: 'API (Fastify)',
            description: 'Бизнес-логика, авторизация, операции с рейсами и документами',
            state: 'idle',
        },
        database: {
            label: 'База данных',
            description: 'PostgreSQL — хранит заявки, рейсы, документы, пользователей',
            state: 'idle',
            detail: 'Проверяется косвенно — если /api/health отвечает, БД доступна',
        },
    });
    const [lastChecked, setLastChecked] = useState<Date | null>(null);
    const [version, setVersion] = useState<string>('—');

    const probe = useCallback(async () => {
        setChecks((p) => ({
            ...p,
            api: { ...p.api, state: 'loading' },
            database: { ...p.database, state: 'loading' },
        }));

        const t0 = performance.now();
        try {
            const res = await fetch('/api/health', { cache: 'no-store' });
            const elapsed = Math.round(performance.now() - t0);
            if (res.ok) {
                const json: HealthResponse = await res.json();
                setVersion(json.version ?? '—');
                setChecks((p) => ({
                    ...p,
                    api: {
                        ...p.api,
                        state: 'up',
                        latencyMs: elapsed,
                        detail: `HTTP ${res.status}, ответил за ${elapsed} мс`,
                    },
                    database: {
                        ...p.database,
                        state: 'up',
                        detail: 'API отвечает 200 OK — соединение с БД работает',
                    },
                }));
            } else {
                setChecks((p) => ({
                    ...p,
                    api: {
                        ...p.api,
                        state: 'down',
                        detail: `HTTP ${res.status}`,
                    },
                    database: {
                        ...p.database,
                        state: 'down',
                        detail: 'API недоступен — статус БД неизвестен',
                    },
                }));
            }
        } catch (err) {
            setChecks((p) => ({
                ...p,
                api: {
                    ...p.api,
                    state: 'down',
                    detail: (err as Error).message,
                },
                database: {
                    ...p.database,
                    state: 'down',
                    detail: 'API недоступен — статус БД неизвестен',
                },
            }));
        } finally {
            setLastChecked(new Date());
        }
    }, []);

    useEffect(() => {
        probe();
        const t = setInterval(probe, 30_000);
        return () => clearInterval(t);
    }, [probe]);

    const overall: CheckState = Object.values(checks).every((c) => c.state === 'up')
        ? 'up'
        : Object.values(checks).some((c) => c.state === 'down')
            ? 'down'
            : 'loading';

    return (
        <div className="min-h-screen bg-white">
            <StickyHeader />
            <main className="pt-24 pb-20">
                <div className="max-w-4xl mx-auto px-4 sm:px-6">
                    <Link
                        href="/landing"
                        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        На главную
                    </Link>

                    {/* Overall status banner */}
                    <div
                        className={`rounded-2xl border p-6 mb-8 ${
                            overall === 'up'
                                ? 'border-emerald-200 bg-emerald-50'
                                : overall === 'down'
                                    ? 'border-red-200 bg-red-50'
                                    : 'border-neutral-200 bg-neutral-50'
                        }`}
                    >
                        <div className="flex items-start gap-4">
                            <div
                                className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                                    overall === 'up'
                                        ? 'bg-emerald-500 text-white'
                                        : overall === 'down'
                                            ? 'bg-red-500 text-white'
                                            : 'bg-neutral-300 text-white'
                                }`}
                            >
                                {overall === 'up' ? (
                                    <CheckCircle2 className="w-6 h-6" />
                                ) : overall === 'down' ? (
                                    <XCircle className="w-6 h-6" />
                                ) : (
                                    <Activity className="w-6 h-6 animate-pulse" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
                                    {overall === 'up'
                                        ? 'Все системы работают'
                                        : overall === 'down'
                                            ? 'Есть проблемы'
                                            : 'Проверяем…'}
                                </h1>
                                <p className="text-sm text-neutral-600 mt-1">
                                    Страница автоматически обновляется каждые 30 секунд
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-500">
                                    {lastChecked && (
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Последняя проверка: {lastChecked.toLocaleTimeString('ru-RU')}
                                        </span>
                                    )}
                                    <span>API версия: <span className="font-mono">{version}</span></span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={probe}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 shrink-0"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Обновить
                            </button>
                        </div>
                    </div>

                    {/* Individual checks */}
                    <h2 className="text-lg font-semibold text-neutral-900 mb-4">Компоненты</h2>
                    <div className="space-y-2">
                        {Object.entries(checks).map(([key, c]) => (
                            <div
                                key={key}
                                className="flex items-start gap-4 p-4 rounded-xl border border-neutral-200 bg-white"
                            >
                                <div
                                    className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${
                                        c.state === 'up'
                                            ? 'bg-emerald-500'
                                            : c.state === 'down'
                                                ? 'bg-red-500'
                                                : 'bg-neutral-300 animate-pulse'
                                    }`}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="font-semibold text-neutral-900">{c.label}</div>
                                        <span
                                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                                c.state === 'up'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : c.state === 'down'
                                                        ? 'bg-red-100 text-red-700'
                                                        : 'bg-neutral-100 text-neutral-600'
                                            }`}
                                        >
                                            {c.state === 'up' ? 'Работает' : c.state === 'down' ? 'Проблема' : 'Проверка…'}
                                        </span>
                                        {typeof c.latencyMs === 'number' && (
                                            <span className="text-xs text-neutral-500 font-mono">{c.latencyMs} мс</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-neutral-600 mt-0.5">{c.description}</p>
                                    {c.detail && (
                                        <p className="text-xs text-neutral-500 mt-1 font-mono">{c.detail}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Infrastructure info */}
                    <h2 className="text-lg font-semibold text-neutral-900 mt-10 mb-4">Инфраструктура</h2>
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 space-y-3 text-sm">
                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                            <div>
                                <div className="text-xs uppercase tracking-wider text-neutral-500 mb-0.5">Хостинг</div>
                                <div className="text-neutral-800">Selectel · Москва · ru-6a</div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wider text-neutral-500 mb-0.5">TLS</div>
                                <div className="text-neutral-800">Let&apos;s Encrypt · авто-продление</div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wider text-neutral-500 mb-0.5">Резервные копии БД</div>
                                <div className="text-neutral-800">Ежедневно в 06:00 МСК · хранение 14 дней</div>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-wider text-neutral-500 mb-0.5">Соответствие</div>
                                <div className="text-neutral-800">152-ФЗ · серверы в РФ</div>
                            </div>
                        </div>
                    </div>

                    {/* SLA reminder */}
                    <h2 className="text-lg font-semibold text-neutral-900 mt-10 mb-4">SLA по тарифам</h2>
                    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="text-left p-3 font-semibold">Тариф</th>
                                    <th className="text-left p-3 font-semibold">Доступность</th>
                                    <th className="text-left p-3 font-semibold">Поддержка</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                <tr>
                                    <td className="p-3 font-medium text-neutral-900">Free</td>
                                    <td className="p-3 text-neutral-700">Best effort</td>
                                    <td className="p-3 text-neutral-700">Email — 2 рабочих дня</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium text-neutral-900">Pro</td>
                                    <td className="p-3 text-neutral-700">99,5% / месяц</td>
                                    <td className="p-3 text-neutral-700">Email — 1 рабочий день</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium text-neutral-900">Business</td>
                                    <td className="p-3 text-neutral-700">99,9% / месяц</td>
                                    <td className="p-3 text-neutral-700">Email + Telegram — 4 часа</td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium text-neutral-900">Enterprise</td>
                                    <td className="p-3 text-neutral-700">по соглашению</td>
                                    <td className="p-3 text-neutral-700">персональный менеджер</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Incident reporting */}
                    <h2 className="text-lg font-semibold text-neutral-900 mt-10 mb-4">Сообщить о проблеме</h2>
                    <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3 text-sm">
                        <p className="text-neutral-700">
                            Если у вас не работает что-то, что должно — напишите нам, опишите проблему и приложите ID сессии (если есть). Постараемся ответить быстрее SLA.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <a
                                href="mailto:support@transpult.ru"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700"
                            >
                                support@transpult.ru
                            </a>
                            <a
                                href="https://t.me/BardinGD"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-700 font-medium hover:bg-neutral-50"
                            >
                                Telegram основателя
                                <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
