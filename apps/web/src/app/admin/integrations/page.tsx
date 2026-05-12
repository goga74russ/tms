'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plug, CheckCircle2, AlertTriangle, Power, Search, Filter, Lock, Activity, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ProviderType, ProviderName } from '@tms/shared';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';

interface CredentialRow {
    id: string;
    providerType: ProviderType;
    providerName: ProviderName;
    status: 'mock' | 'sandbox' | 'active' | 'disabled' | 'error';
    lastHealthCheckAt: string | null;
    lastError: string | null;
}

// B-31 — human-readable Russian labels per provider name.
const PROVIDER_LABEL_RU: Record<string, string> = {
    gosklyuch: 'Госключ',
    kontur_sign: 'Контур.Подпись',
    sbis_sign: 'СБИС.Подпись',
    cadesplugin: 'КриптоПро CADES',
    diadoc: 'Контур.Диадок',
    sbis: 'СБИС (ЭДО)',
    kontur: 'Контур.ЭДО',
    kaluga_astral: 'Калуга Астрал',
    taxcom: 'Такском',
    yookassa: 'ЮKassa',
    tinkoff: 'Тинькофф Касса',
    cloudpayments: 'CloudPayments',
    mailru_smtp: 'Mail.ru для бизнеса (SMTP)',
    unisender: 'Unisender',
    console: 'Консоль (dev)',
    smtp: 'SMTP',
    wialon: 'Wialon',
    omnicomm: 'Omnicomm',
    glonasssoft: 'GLONASSsoft',
    lukoil: 'Лукойл-Smart',
    rosneft: 'Роснефть',
    gazpromneft: 'Газпромнефть',
    autocode: 'Автокод',
    fssp: 'ФССП',
    gibdd: 'ГИБДД',
    crpt: 'Честный знак',
    mock: 'Mock (тест)',
};

const STATUS_LABEL: Record<CredentialRow['status'], string> = {
    active: 'Активно',
    sandbox: 'Песочница',
    mock: 'Mock',
    error: 'Ошибка',
    disabled: 'Выключено',
};

const STATUS_TONE: Record<CredentialRow['status'], string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    sandbox: 'bg-sky-50 text-sky-700 border-sky-200',
    mock: 'bg-neutral-100 text-neutral-700 border-neutral-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    disabled: 'bg-neutral-100 text-neutral-500 border-neutral-200',
};

function providerLabel(name: ProviderName | string): string {
    return PROVIDER_LABEL_RU[name as string] ?? String(name);
}

const PROVIDER_CATALOG: Array<{
    type: ProviderType;
    title: string;
    description: string;
    options: ProviderName[];
}> = [
    { type: 'signature', title: 'Электронная подпись', description: 'Госключ / Контур / СБИС / КриптоПро', options: ['gosklyuch', 'kontur_sign', 'sbis_sign', 'cadesplugin'] },
    { type: 'edi', title: 'ЭДО', description: 'Контур.Диадок / СБИС / Калуга Астрал / Такском', options: ['diadoc', 'sbis', 'kontur', 'kaluga_astral', 'taxcom'] },
    { type: 'telematics', title: 'Телематика (GPS)', description: 'Wialon / Omnicomm / GlonassSoft', options: ['wialon', 'omnicomm', 'glonasssoft'] },
    { type: 'fuel_card', title: 'Топливные карты', description: 'Лукойл / Роснефть / Газпромнефть', options: ['lukoil', 'rosneft', 'gazpromneft'] },
    { type: 'fines', title: 'Штрафы ГИБДД', description: 'Автокод / ФССП / ГИБДД', options: ['autocode', 'fssp', 'gibdd'] },
    { type: 'marking', title: 'Маркировка (ЧЗ)', description: 'Честный знак / ЦРПТ', options: ['crpt'] },
    { type: 'payment', title: 'Платежи', description: 'ЮKassa / Tinkoff / CloudPayments', options: ['yookassa', 'tinkoff', 'cloudpayments'] },
    { type: 'email', title: 'Почтовый шлюз', description: 'SMTP (Mail.ru) / Unisender', options: ['mailru_smtp', 'unisender', 'console'] },
];

type StatusFilter = 'all' | 'connected' | 'disconnected' | 'error';

export default function AdminIntegrationsPage() {
    const { toast } = useToast();
    const [rows, setRows] = useState<CredentialRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [modal, setModal] = useState<{ type: ProviderType; name: ProviderName } | null>(null);

    const [search, setSearch] = useState('');
    const [activeType, setActiveType] = useState<ProviderType | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

    const refresh = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data: CredentialRow[]; error?: string; note?: string }>('/integrations/credentials');
            if (res.success) {
                setRows(res.data ?? []);
                setError(null);
                if (res.note === 'no_organization_in_token') {
                    setInfo('Подключения настраиваются после регистрации организации.');
                } else {
                    setInfo(null);
                }
            } else {
                if ((res.error ?? '').includes('no organization')) {
                    setInfo('Подключения настраиваются после регистрации организации.');
                    setError(null);
                } else {
                    setError(res.error ?? 'Ошибка загрузки');
                }
            }
        } catch (err: unknown) {
            const msg = (err as Error).message ?? '';
            if (msg.includes('no organization')) {
                setInfo('Подключения настраиваются после регистрации организации.');
            } else {
                setError(msg || 'Ошибка загрузки');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const findRow = useCallback(
        (type: ProviderType, name: ProviderName): CredentialRow | undefined =>
            rows.find((r) => r.providerType === type && r.providerName === name),
        [rows],
    );

    const test = async (id: string) => {
        try {
            await api.post(`/integrations/credentials/${id}/test`, {});
            toast({ variant: 'success', title: 'Тест успешен' });
        } catch (err: unknown) {
            const msg = (err as Error).message;
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка теста', description: msg });
        } finally {
            await refresh();
        }
    };

    // Aggregate counts for the header strip.
    const counts = useMemo(() => {
        const c = { active: 0, sandbox: 0, error: 0, total: 0 };
        for (const r of rows) {
            c.total++;
            if (r.status === 'active') c.active++;
            else if (r.status === 'sandbox') c.sandbox++;
            else if (r.status === 'error') c.error++;
        }
        return c;
    }, [rows]);

    const visibleCatalog = useMemo(() => {
        const q = search.trim().toLowerCase();
        return PROVIDER_CATALOG
            .filter((cat) => activeType === 'all' || cat.type === activeType)
            .map((cat) => {
                const options = cat.options.filter((name) => {
                    if (q) {
                        const label = providerLabel(name).toLowerCase();
                        if (!label.includes(q) && !cat.title.toLowerCase().includes(q)) return false;
                    }
                    if (statusFilter !== 'all') {
                        const row = findRow(cat.type, name);
                        if (statusFilter === 'connected' && !row) return false;
                        if (statusFilter === 'connected' && row && !['active', 'sandbox'].includes(row.status)) return false;
                        if (statusFilter === 'disconnected' && row && ['active', 'sandbox'].includes(row.status)) return false;
                        if (statusFilter === 'error' && (!row || row.status !== 'error')) return false;
                    }
                    return true;
                });
                return { ...cat, options };
            })
            .filter((cat) => cat.options.length > 0);
    }, [activeType, search, statusFilter, findRow]);

    const filtersActive = search.trim() || activeType !== 'all' || statusFilter !== 'all';
    const resetFilters = () => {
        setSearch('');
        setActiveType('all');
        setStatusFilter('all');
    };

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Plug}
                iconTone="brand"
                title="Кабинет интеграций"
                description="Подключения к ЭДО, телематике, ГИС и платёжным шлюзам. Ключи API хранятся в зашифрованном виде (AES-256-GCM)."
                meta={
                    !loading && rows.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <CountChip tone="emerald" icon={CheckCircle2} label="Активны" value={counts.active} />
                            <CountChip tone="sky" icon={Activity} label="Sandbox" value={counts.sandbox} />
                            <CountChip tone="red" icon={AlertTriangle} label="Ошибки" value={counts.error} />
                            <CountChip tone="neutral" icon={Lock} label="Всего шифр-ключей" value={counts.total} />
                        </div>
                    )
                }
            />

            {info && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 flex items-start gap-2">
                    <Activity className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{info}</span>
                </div>
            )}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Toolbar */}
            <div className="rounded-xl border border-neutral-200 bg-white p-3 flex flex-col gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <Input
                            placeholder="Найти провайдера..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                        {(['all', 'connected', 'disconnected', 'error'] as StatusFilter[]).map((s) => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${statusFilter === s
                                    ? 'bg-neutral-900 text-white'
                                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                                    }`}
                            >
                                {s === 'all' ? 'Все' : s === 'connected' ? 'Подключены' : s === 'disconnected' ? 'Не подключены' : 'С ошибкой'}
                            </button>
                        ))}
                    </div>
                    {filtersActive && (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"
                        >
                            <X className="w-3 h-3" /> Сбросить
                        </button>
                    )}
                </div>

                {/* Category pills */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-neutral-100">
                    <Filter className="w-3.5 h-3.5 text-neutral-400 mr-1" />
                    <CategoryPill active={activeType === 'all'} onClick={() => setActiveType('all')} label="Все категории" />
                    {PROVIDER_CATALOG.map((cat) => (
                        <CategoryPill
                            key={cat.type}
                            active={activeType === cat.type}
                            onClick={() => setActiveType(cat.type)}
                            label={cat.title}
                        />
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-48" />
                            <Skeleton className="h-12 w-full" />
                        </div>
                    ))}
                </div>
            ) : visibleCatalog.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-12 text-center">
                    <Search className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
                    <div className="text-sm text-neutral-600 font-medium">Ничего не найдено</div>
                    <div className="text-xs text-neutral-400 mt-1">Попробуйте сбросить фильтры</div>
                </div>
            ) : (
                <div className="space-y-6">
                    {visibleCatalog.map((cat) => (
                        <section key={cat.type}>
                            <div className="flex items-baseline gap-2 mb-2">
                                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">{cat.title}</h2>
                                <span className="text-[11px] text-neutral-400">·</span>
                                <span className="text-xs text-neutral-500">{cat.description}</span>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                {cat.options.map((name) => {
                                    const row = findRow(cat.type, name);
                                    return (
                                        <ProviderCard
                                            key={name}
                                            name={name}
                                            row={row}
                                            onConnect={() => setModal({ type: cat.type, name })}
                                            onTest={row ? () => test(row.id) : undefined}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            {modal && (
                <CredentialModal
                    type={modal.type}
                    name={modal.name}
                    onClose={() => setModal(null)}
                    onSaved={() => { setModal(null); refresh(); }}
                />
            )}
        </div>
    );
}

function CountChip({ tone, icon: Icon, label, value }: { tone: 'emerald' | 'sky' | 'red' | 'neutral'; icon: typeof CheckCircle2; label: string; value: number }) {
    const cls: Record<typeof tone, string> = {
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        sky: 'bg-sky-50 text-sky-700 border-sky-200',
        red: 'bg-red-50 text-red-700 border-red-200',
        neutral: 'bg-neutral-50 text-neutral-700 border-neutral-200',
    };
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cls[tone]}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}: <span className="font-bold tabular-nums">{value}</span>
        </span>
    );
}

function CategoryPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${active
                ? 'bg-brand-50 text-brand-700 border border-brand-200'
                : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
                }`}
        >
            {label}
        </button>
    );
}

function ProviderCard({
    name,
    row,
    onConnect,
    onTest,
}: {
    name: ProviderName;
    row?: CredentialRow;
    onConnect: () => void;
    onTest?: () => void;
}) {
    const initial = providerLabel(name).slice(0, 2).toUpperCase();
    return (
        <div className="group rounded-xl border border-neutral-200 bg-white p-4 hover:border-brand-300 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-50 border border-neutral-200 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-neutral-600 tracking-tight">{initial}</span>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="font-medium text-neutral-900 truncate leading-tight">{providerLabel(name)}</div>
                    <div className="mt-1.5">
                        {row ? (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[row.status]}`}>
                                <StatusDot status={row.status} />
                                {STATUS_LABEL[row.status]}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                                <Power className="w-2.5 h-2.5" />
                                Не подключено
                            </span>
                        )}
                    </div>
                    {row?.lastError && (
                        <div className="mt-1.5 text-[10px] text-red-600 line-clamp-2" title={row.lastError}>
                            {row.lastError}
                        </div>
                    )}
                </div>
            </div>
            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    onClick={onConnect}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-50 text-neutral-700 border border-neutral-200 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 transition-colors"
                >
                    {row ? 'Изменить' : 'Подключить'}
                </button>
                {onTest && (
                    <button
                        type="button"
                        onClick={onTest}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                    >
                        Тест
                    </button>
                )}
            </div>
        </div>
    );
}

function StatusDot({ status }: { status: CredentialRow['status'] }) {
    const cls: Record<CredentialRow['status'], string> = {
        active: 'bg-emerald-500',
        sandbox: 'bg-sky-500',
        mock: 'bg-neutral-400',
        error: 'bg-red-500',
        disabled: 'bg-neutral-300',
    };
    return <span className={`w-1.5 h-1.5 rounded-full ${cls[status]}`} />;
}

function CredentialModal({
    type, name, onClose, onSaved,
}: {
    type: ProviderType;
    name: ProviderName;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [host, setHost] = useState('');
    const [user, setUser] = useState('');
    const [password, setPassword] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isSmtp = type === 'email' && name === 'mailru_smtp';

    const submit = async () => {
        setError(null);
        setSaving(true);
        try {
            const credentials: Record<string, string> = {};
            if (isSmtp) {
                if (host) credentials.host = host;
                if (user) credentials.user = user;
                if (password) credentials.password = password;
            } else {
                if (apiKey) credentials.apiKey = apiKey;
            }
            const res = await api.post<{ success: boolean; error?: string }>('/integrations/credentials', {
                providerType: type,
                providerName: name,
                credentials,
                status: 'sandbox',
            });
            if (!res.success) {
                setError(res.error ?? 'Ошибка сохранения');
                return;
            }
            onSaved();
        } catch (err: unknown) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onClose={onClose} title={`Подключение: ${providerLabel(name)}`}>
            <div className="space-y-3">
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 flex items-start gap-2">
                    <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>Ключи шифруются AES-256-GCM. После сохранения вы не сможете прочитать их обратно.</span>
                </div>
                {isSmtp ? (
                    <>
                        <Field label="SMTP host"><Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.mail.ru" /></Field>
                        <Field label="Пользователь"><Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="user@mail.ru" /></Field>
                        <Field label="Пароль"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
                    </>
                ) : (
                    <Field label="API ключ"><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key / token" /></Field>
                )}
                {error && <div className="bg-red-50 text-red-600 p-2 rounded text-sm border border-red-100">{error}</div>}
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={onClose}>Отмена</Button>
                    <Button onClick={submit} disabled={saving}>{saving ? 'Сохраняем...' : 'Сохранить'}</Button>
                </div>
            </div>
        </Dialog>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-600">{label}</label>
            {children}
        </div>
    );
}
