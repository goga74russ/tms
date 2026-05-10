'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';

interface DaDataResult {
    inn: string;
    name: string;
    fullName: string;
    kpp: string;
    ogrn: string;
    legalAddress: string;
    actualAddress: string;
    managementName: string;
}

interface Props {
    onNext: (result: DaDataResult) => void;
}

export function StepInn({ onNext }: Props) {
    const [inn, setInn] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<DaDataResult | null>(null);

    const lookup = async () => {
        if (!/^\d{10}(\d{2})?$/.test(inn)) {
            setError('ИНН должен содержать 10 или 12 цифр');
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const res = await api.post<{ success: boolean; data?: DaDataResult; error?: string }>('/onboarding/inn-lookup', { inn });
            if (res.success && res.data) {
                setResult(res.data);
            } else {
                setError(res.error ?? 'Компания не найдена');
            }
        } catch (err: unknown) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-xl font-semibold text-slate-900">Шаг 1: Найдите вашу компанию</h2>
                <p className="text-sm text-slate-500 mt-1">Введите ИНН — мы автоматически подгрузим реквизиты из DaData.</p>
            </div>

            <div className="flex gap-2">
                <input
                    type="text" inputMode="numeric" maxLength={12}
                    value={inn}
                    onChange={(e) => setInn(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="ИНН (10 или 12 цифр)"
                />
                <button
                    onClick={lookup}
                    disabled={loading || inn.length < 10}
                    className="inline-flex items-center gap-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                    <Search className="w-4 h-4" />
                    {loading ? 'Ищем...' : 'Найти'}
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">{error}</div>
            )}

            {result && (
                <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                    <div><span className="text-slate-500">Название:</span> <strong>{result.name}</strong></div>
                    <div><span className="text-slate-500">Полное:</span> {result.fullName}</div>
                    <div><span className="text-slate-500">КПП:</span> {result.kpp}</div>
                    <div><span className="text-slate-500">ОГРН:</span> {result.ogrn}</div>
                    <div><span className="text-slate-500">Адрес:</span> {result.legalAddress}</div>
                    <div><span className="text-slate-500">Руководитель:</span> {result.managementName}</div>
                    <button
                        onClick={() => onNext(result)}
                        className="mt-3 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
                    >
                        Это моя компания → продолжить
                    </button>
                </div>
            )}
        </div>
    );
}
