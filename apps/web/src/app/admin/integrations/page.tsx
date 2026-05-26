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
import { DpaStepModal } from './DpaStepModal';

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
    gibdd: 'ГИБДД (устарел)',
    gis_gmp: 'ГИС ГМП (штрафы)',
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

// Каталог провайдеров для UI. Согласован с Jurist'ом 2026-05-24.
//
// MVP (видимы по дефолту, 6 провайдеров):
//   • signature: gosklyuch, kontur_sign
//   • edi:       diadoc (через него — ГИС ЭПД, ФЗ-140)
//   • telematics: wialon
//   • payment:   yookassa
//   • email:     mailru_smtp
//
// «Расширенные» (под expand-toggle, отмечены meta='extended'):
//   • signature: sbis_sign, cadesplugin
//   • edi:       sbis
//   • telematics: omnicomm, glonasssoft
//
// Скрыто из видимого UI (НО enum'ы оставлены в @tms/shared!):
//   • edi: kontur (путаница с Диадоком — Контур.ЭДО ≠ Диадок; Jurist флаг)
//   • payment: tinkoff, cloudpayments (мы как vendor — один PSP)
//   • email: console (dev-only), unisender (после маркетинг-согласия)
//   • fuel_card: все 3 (после 01.09.2026, не блокирует ЭТрН-compliance)
//   • fines: все 3 (после 01.09, gibdd → переименован в gis_gmp)
//   • marking: crpt (только если первый пилот из маркируемых)
//
// Причина «удалить из UI, оставить в enum»: provider_credentials строки
// уже могут существовать в БД у клиентов на demo-стенде. Если убрать
// enum — теряется audit trail (152-ФЗ ст. 18.1).
type CatalogEntry = {
    type: ProviderType;
    title: string;
    description: string;
    options: ProviderName[];
    /** 'mvp' — видим всегда; 'extended' — под expand-toggle. */
    visibility: 'mvp' | 'extended';
};

const PROVIDER_CATALOG: CatalogEntry[] = [
    // MVP
    { type: 'signature', title: 'Электронная подпись', description: 'Госключ для водителей + облачная КЭП юр-лица (Контур.Подпись)', options: ['gosklyuch', 'kontur_sign'], visibility: 'mvp' },
    { type: 'edi', title: 'ЭДО', description: 'Контур.Диадок — через него документы попадают в ГИС ЭПД (Минтранс, ФЗ-140)', options: ['diadoc'], visibility: 'mvp' },
    { type: 'telematics', title: 'Телематика (GPS)', description: 'Wialon — GPS-трекинг, доказательство маршрута, контроль РТО (ст. 11.23 КоАП). Юрисдикция: РФ. Для зарубежных рейсов используйте резервный источник GPS.', options: ['wialon'], visibility: 'mvp' },
    { type: 'payment', title: 'Платежи', description: 'ЮKassa — приём подписки от клиентов TMS', options: ['yookassa'], visibility: 'mvp' },
    { type: 'email', title: 'Почтовый шлюз', description: 'SMTP Mail.ru — транзакционные email (верификация, уведомления)', options: ['mailru_smtp'], visibility: 'mvp' },

    // Расширенные — по запросу, активируются после первых пилотов
    { type: 'signature', title: 'Электронная подпись (расширенные)', description: 'СБИС.Подпись / КриптоПро CADES — для клиентов с СБИС-экосистемой или существующими КЭП-токенами', options: ['sbis_sign', 'cadesplugin'], visibility: 'extended' },
    { type: 'edi', title: 'ЭДО (расширенные)', description: 'СБИС — recommended-secondary, если бухгалтерия клиента в СБИС', options: ['sbis'], visibility: 'extended' },
    { type: 'telematics', title: 'Телематика (расширенные)', description: 'Omnicomm / GLONASSsoft — нативная интеграция с уже установленным оборудованием', options: ['omnicomm', 'glonasssoft'], visibility: 'extended' },
];

// Известные deprecated provider_name значения, на которые могут ссылаться
// исторические credentials в БД (был активен на demo-стенде, в каталоге
// больше не предлагается). Рисуем red badge «deprecated» если такая
// запись встретится в данных от API.
const DEPRECATED_PROVIDERS: Record<string, { reason: string; migrateTo?: string }> = {
    kontur: { reason: 'Контур.ЭДО — другой продукт, не Диадок. Юр-риск введения в заблуждение.', migrateTo: 'diadoc' },
    tinkoff: { reason: 'Дубль ЮKassa, один PSP в MVP.' },
    cloudpayments: { reason: 'Дубль ЮKassa, один PSP в MVP.' },
    gibdd: { reason: 'У ГИБДД нет публичного API для юр-лиц. Используйте gis_gmp.', migrateTo: 'gis_gmp' },
    unisender: { reason: 'После маркетинг-согласия (38-ФЗ + 152-ФЗ).' },
    console: { reason: 'Только для dev-окружения.' },
};

type StatusFilter = 'all' | 'connected' | 'disconnected' | 'error';

export default function AdminIntegrationsPage() {
    const { toast } = useToast();
    const [rows, setRows] = useState<CredentialRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [modal, setModal] = useState<{ type: ProviderType; name: ProviderName } | null>(null);
    // E7: DPA-step перед CredentialModal. Когда пользователь жмёт «Подключить»,
    // мы сначала проверяем accepted ли уже DPA текущей версии. Если нет —
    // показываем DPA-модал, иначе сразу CredentialModal.
    const [pendingConnect, setPendingConnect] = useState<{ type: ProviderType; name: ProviderName } | null>(null);
    const [dpaModal, setDpaModal] = useState<{ type: ProviderType; name: ProviderName } | null>(null);

    const [search, setSearch] = useState('');
    const [activeType, setActiveType] = useState<ProviderType | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    // C4.1: toggle для показа extended-провайдеров. По дефолту скрыты,
    // чтобы новый клиент не путался в 30+ кнопках.
    const [showExtended, setShowExtended] = useState(false);

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

    // E7: открытие подключения — сначала проверяем accepted DPA, если нет —
    // открываем DPA-step, иначе сразу CredentialModal. На ошибке загрузки
    // acceptance — fallback на CredentialModal (не блокируем подключение).
    async function handleConnect(type: ProviderType, name: ProviderName) {
        setPendingConnect({ type, name });
        try {
            const res = await api.get<{
                success: boolean;
                data?: { accepted: boolean; requiresAcceptance: boolean };
            }>(`/dpa/${encodeURIComponent(String(name))}/acceptance`);
            const accepted = res?.data?.accepted ?? true;
            if (!accepted) {
                setDpaModal({ type, name });
                setPendingConnect(null);
                return;
            }
        } catch {
            // 404 DPA-not-found или сетевой сбой — не блокируем подключение,
            // сразу открываем CredentialModal. На пилоте — не все провайдеры
            // имеют DPA-файл, для них acceptance-check вернёт 404.
        }
        setModal({ type, name });
        setPendingConnect(null);
    }

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
            // Visibility-фильтр: extended показываем только если включён toggle
            // или явно выбрана конкретная категория (activeType !== 'all').
            .filter((cat) => cat.visibility === 'mvp' || showExtended || activeType !== 'all')
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
    }, [activeType, search, statusFilter, findRow, showExtended]);

    // C4.2: deprecated credentials — historical записи из БД для имён,
    // которые мы удалили из каталога. Показываем с red badge «deprecated».
    const deprecatedRows = useMemo(
        () => rows.filter((r) => DEPRECATED_PROVIDERS[String(r.providerName)] !== undefined),
        [rows],
    );

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
                    {Array.from(new Set(PROVIDER_CATALOG.filter(c => c.visibility === 'mvp' || showExtended).map(c => c.type))).map((catType) => {
                        const firstCat = PROVIDER_CATALOG.find(c => c.type === catType);
                        if (!firstCat) return null;
                        // Берём «базовое» имя категории (без «(расширенные)»)
                        const baseTitle = firstCat.title.replace(/\s*\(расширенные\)/i, '');
                        return (
                            <CategoryPill
                                key={catType}
                                active={activeType === catType}
                                onClick={() => setActiveType(catType)}
                                label={baseTitle}
                            />
                        );
                    })}
                    {/* C4.1: toggle показа extended-провайдеров */}
                    <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showExtended}
                            onChange={(e) => setShowExtended(e.target.checked)}
                            className="w-3.5 h-3.5 accent-brand-600"
                        />
                        Показать расширенные
                    </label>
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
                    {visibleCatalog.map((cat, idx) => (
                        <section key={`${cat.type}-${cat.visibility}-${idx}`}>
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
                                            onConnect={() => handleConnect(cat.type, name)}
                                            onTest={row ? () => test(row.id) : undefined}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    ))}

                    {/* C4.2: Deprecated section — отображается только если в БД
                        реально есть записи на удалённые из каталога имена. */}
                    {deprecatedRows.length > 0 && (
                        <section>
                            <div className="flex items-baseline gap-2 mb-2">
                                <h2 className="text-sm font-semibold uppercase tracking-wide text-red-700">Устаревшие интеграции</h2>
                                <span className="text-[11px] text-neutral-400">·</span>
                                <span className="text-xs text-neutral-500">Эти провайдеры больше не предлагаются. Существующие подключения остаются — мигрируйте на актуальный аналог.</span>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                {deprecatedRows.map((row) => {
                                    const info = DEPRECATED_PROVIDERS[String(row.providerName)];
                                    if (!info) return null;
                                    return (
                                        <DeprecatedProviderCard
                                            key={row.id}
                                            row={row}
                                            reason={info.reason}
                                            migrateTo={info.migrateTo ? providerLabel(info.migrateTo as ProviderName) : undefined}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    )}
                </div>
            )}

            {/* E7: DPA-step modal (показывается перед CredentialModal). */}
            {dpaModal && (
                <DpaStepModal
                    providerId={String(dpaModal.name)}
                    onClose={() => setDpaModal(null)}
                    onAccepted={() => {
                        // accept прошёл — открываем CredentialModal.
                        const next = dpaModal;
                        setDpaModal(null);
                        setModal(next);
                    }}
                />
            )}

            {modal && (
                <CredentialModal
                    type={modal.type}
                    name={modal.name}
                    onClose={() => setModal(null)}
                    onSaved={() => { setModal(null); refresh(); }}
                />
            )}

            {/* Loading indicator пока проверяем acceptance */}
            {pendingConnect && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-900/20 pointer-events-none">
                    <div className="rounded-lg bg-white px-4 py-3 shadow-lg flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                        <span className="text-sm text-neutral-700">Проверка согласия…</span>
                    </div>
                </div>
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

/**
 * C4.2: карточка для исторической записи credentials на провайдере,
 * который мы убрали из каталога. Red badge, причина, рекомендация по
 * миграции. Кнопок «Подключить»/«Тест» нет — это read-only history.
 */
function DeprecatedProviderCard({
    row,
    reason,
    migrateTo,
}: {
    row: CredentialRow;
    reason: string;
    migrateTo?: string;
}) {
    return (
        <div className="rounded-xl border border-red-300 bg-red-50/40 p-4">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-neutral-900 truncate leading-tight">{providerLabel(row.providerName)}</span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            Устарел
                        </span>
                    </div>
                    <div className="mt-1 text-[11px] text-red-700">{reason}</div>
                    {migrateTo && (
                        <div className="mt-1.5 text-[11px] text-neutral-700">
                            Рекомендуется перейти на: <strong>{migrateTo}</strong>
                        </div>
                    )}
                </div>
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
                {/* T-23 (sprint W1): Wialon — российский поставщик, юрисдикция РФ.
                    Для рейсов за пределы РФ (Беларусь / Казахстан / прочие) сервис
                    может не покрывать треккинг, и доказательство маршрута придётся
                    собирать другим источником. */}
                {name === 'wialon' && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                        <span aria-hidden className="text-amber-600">⚠</span>
                        <span>
                            <strong>Юрисдикция: РФ.</strong> Wialon оптимизирован под российскую территорию.
                            Для зарубежных рейсов (Беларусь, Казахстан, Армения, прочие) уточните покрытие
                            у провайдера и подготовьте резервный источник GPS-данных (например, Omnicomm
                            или собственный бортовой тахограф).
                        </span>
                    </div>
                )}
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
