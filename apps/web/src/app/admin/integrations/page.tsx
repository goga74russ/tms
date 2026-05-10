'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plug, CheckCircle2, AlertTriangle, Power } from 'lucide-react';
import { api } from '@/lib/api';
import type { ProviderType, ProviderName } from '@tms/shared';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

interface CredentialRow {
    id: string;
    providerType: ProviderType;
    providerName: ProviderName;
    status: 'mock' | 'sandbox' | 'active' | 'disabled' | 'error';
    lastHealthCheckAt: string | null;
    lastError: string | null;
}

// All 8 provider domains the framework supports + the canonical list of
// adapter names the UI offers per type. Mirrors `apps/api/src/providers/`.
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

export default function AdminIntegrationsPage() {
    const [rows, setRows] = useState<CredentialRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modal, setModal] = useState<{ type: ProviderType; name: ProviderName } | null>(null);

    const refresh = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data: CredentialRow[]; error?: string }>('/integrations/credentials');
            if (res.success) {
                setRows(res.data ?? []);
                setError(null);
            } else {
                setError(res.error ?? 'Ошибка загрузки');
            }
        } catch (err: unknown) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const findRow = (type: ProviderType, name: ProviderName): CredentialRow | undefined =>
        rows.find((r) => r.providerType === type && r.providerName === name);

    const test = async (id: string) => {
        try {
            await api.post(`/integrations/credentials/${id}/test`, {});
        } catch (err: unknown) {
            setError((err as Error).message);
        } finally {
            await refresh();
        }
    };

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Plug className="w-6 h-6 text-indigo-600" />
                    Кабинет интеграций
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Управление подключениями к ЭДО, телематике, ГИС и платёжным шлюзам. Ключи API хранятся в зашифрованном виде (AES-256-GCM).
                </p>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">{error}</div>}

            {loading ? (
                <p className="text-slate-500">Загружаем...</p>
            ) : (
                <div className="space-y-6">
                    {PROVIDER_CATALOG.map((cat) => (
                        <Card key={cat.type} className="p-5">
                            <div className="mb-3">
                                <h2 className="text-lg font-semibold text-slate-900">{cat.title}</h2>
                                <p className="text-xs text-slate-500">{cat.description}</p>
                            </div>
                            <div className="space-y-2">
                                {cat.options.map((name) => {
                                    const row = findRow(cat.type, name);
                                    return (
                                        <div key={name} className="flex items-center justify-between border border-slate-100 rounded-lg p-3">
                                            <div className="flex items-center gap-3">
                                                <StatusIcon status={row?.status ?? null} />
                                                <div>
                                                    <div className="font-medium text-slate-800">{name}</div>
                                                    {row?.lastError && <div className="text-xs text-red-500">{row.lastError}</div>}
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setModal({ type: cat.type, name })}
                                                >
                                                    {row ? 'Изменить' : 'Подключить'}
                                                </Button>
                                                {row && (
                                                    <Button variant="ghost" size="sm" onClick={() => test(row.id)}>
                                                        Тест
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
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

function StatusIcon({ status }: { status: CredentialRow['status'] | null }) {
    if (!status) return <Power className="w-4 h-4 text-slate-300" />;
    if (status === 'active' || status === 'sandbox') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === 'error') return <AlertTriangle className="w-4 h-4 text-red-500" />;
    return <Power className="w-4 h-4 text-slate-400" />;
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

    // SMTP/email needs host+user+password; other providers usually want apiKey.
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
        <Dialog open onClose={onClose} title={`Подключение: ${name}`}>
            <div className="space-y-3">
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
            <label className="text-xs font-medium text-slate-600">{label}</label>
            {children}
        </div>
    );
}
