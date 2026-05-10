'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface DaDataResult {
    inn: string;
    name: string;
    kpp: string;
    ogrn: string;
    legalAddress: string;
}

interface Props {
    initial: DaDataResult | null;
    onNext: () => void;
    onBack: () => void;
}

export function StepProfile({ initial, onNext, onBack }: Props) {
    const [name, setName] = useState(initial?.name ?? '');
    const [inn, setInn] = useState(initial?.inn ?? '');
    const [kpp, setKpp] = useState(initial?.kpp ?? '');
    const [ogrn, setOgrn] = useState(initial?.ogrn ?? '');
    const [legalAddress, setLegalAddress] = useState(initial?.legalAddress ?? '');
    const [bankBik, setBankBik] = useState('');
    const [bankAccount, setBankAccount] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setError(null);
        setSaving(true);
        try {
            const res = await api.post<{ success: boolean; error?: string }>('/onboarding/profile', {
                inn, name, kpp, ogrn, legalAddress, bankBik, bankAccount,
            });
            if (!res.success) {
                setError(res.error ?? 'Ошибка сохранения');
                return;
            }
            onNext();
        } catch (err: unknown) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-xl font-semibold text-slate-900">Шаг 2: Реквизиты компании</h2>
                <p className="text-sm text-slate-500 mt-1">Проверьте автозаполнение и добавьте банковские реквизиты.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Field label="Название *"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
                <Field label="ИНН *"><input value={inn} onChange={(e) => setInn(e.target.value)} className={inputCls} /></Field>
                <Field label="КПП"><input value={kpp} onChange={(e) => setKpp(e.target.value)} className={inputCls} /></Field>
                <Field label="ОГРН"><input value={ogrn} onChange={(e) => setOgrn(e.target.value)} className={inputCls} /></Field>
                <Field label="Юр. адрес" colspan={2}><input value={legalAddress} onChange={(e) => setLegalAddress(e.target.value)} className={inputCls} /></Field>
                <Field label="БИК банка"><input value={bankBik} onChange={(e) => setBankBik(e.target.value)} className={inputCls} /></Field>
                <Field label="Расчётный счёт"><input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className={inputCls} /></Field>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">{error}</div>}

            <div className="flex justify-between">
                <button onClick={onBack} className="text-sm text-slate-600 hover:underline">← Назад</button>
                <button
                    onClick={submit}
                    disabled={saving || !name || !inn}
                    className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                    {saving ? 'Сохраняем...' : 'Далее →'}
                </button>
            </div>
        </div>
    );
}

const inputCls = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500';

function Field({ label, children, colspan }: { label: string; children: React.ReactNode; colspan?: number }) {
    return (
        <div className={colspan === 2 ? 'col-span-2 space-y-1' : 'space-y-1'}>
            <label className="text-xs font-medium text-slate-600">{label}</label>
            {children}
        </div>
    );
}
