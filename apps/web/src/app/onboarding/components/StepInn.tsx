'use client';

import { useState } from 'react';
import { Search, Building2, Pencil, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

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
    const { toast } = useToast();

    const validInn = /^\d{10}(\d{2})?$/.test(inn);

    const lookup = async () => {
        if (!validInn) {
            setError('ИНН должен содержать 10 (юрлицо) или 12 (ИП) цифр');
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const res = await api.post<{ success: boolean; data?: DaDataResult; error?: string }>(
                '/onboarding/inn-lookup',
                { inn },
            );
            if (res.success && res.data) {
                setResult(res.data);
                toast({
                    variant: 'success',
                    title: 'Компания найдена',
                    description: res.data.name,
                });
            } else {
                const msg = res.error ?? 'Компания не найдена в базе DaData';
                setError(msg);
                toast({ variant: 'warning', title: 'Не найдено', description: msg });
            }
        } catch (err: unknown) {
            const msg = (err as Error).message ?? 'Ошибка запроса к DaData';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-5">
            <p className="text-sm text-neutral-600">
                Введите ИНН — мы автоматически подгрузим реквизиты компании из DaData (ФНС).
            </p>

            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                <div className="flex-1">
                    <Input
                        label="ИНН"
                        type="text"
                        inputMode="numeric"
                        maxLength={12}
                        value={inn}
                        onChange={(e) => {
                            setInn(e.target.value.replace(/\D/g, ''));
                            if (error) setError(null);
                        }}
                        leftAddon={<Building2 className="h-4 w-4" />}
                        placeholder="10 или 12 цифр"
                        error={error}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && validInn && !loading) {
                                e.preventDefault();
                                void lookup();
                            }
                        }}
                    />
                </div>
                <Button
                    variant="brand"
                    size="lg"
                    isLoading={loading}
                    disabled={!validInn || loading}
                    onClick={lookup}
                    leftIcon={!loading ? <Search className="w-4 h-4" /> : undefined}
                >
                    Проверить
                </Button>
            </div>

            {result && (
                <div className="rounded-xl border-2 border-success-200 bg-success-50/40 p-5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-success-100 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-success-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-success-800 mb-1">
                                Компания найдена
                            </div>
                            <div className="text-base font-semibold text-neutral-900 mb-3 truncate">
                                {result.name}
                            </div>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                                <Row label="Полное" value={result.fullName} />
                                <Row label="КПП" value={result.kpp} />
                                <Row label="ОГРН" value={result.ogrn} />
                                <Row label="Руководитель" value={result.managementName} />
                                <Row label="Адрес" value={result.legalAddress} wide />
                            </dl>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                    variant="brand"
                                    onClick={() => onNext(result)}
                                    rightIcon={<CheckCircle2 className="w-4 h-4" />}
                                >
                                    Это моя компания
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setResult(null);
                                        setInn('');
                                    }}
                                    leftIcon={<Pencil className="w-4 h-4" />}
                                >
                                    Изменить
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!result && (
                <div className="flex items-start gap-2 text-xs text-neutral-500 leading-relaxed">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                        Данные подгружаются из открытой базы ФНС через DaData. Реквизиты можно отредактировать на следующем шаге.
                    </span>
                </div>
            )}
        </div>
    );
}

function Row({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
    return (
        <div className={wide ? 'sm:col-span-2' : ''}>
            <dt className="text-neutral-500 text-xs uppercase tracking-wide">{label}</dt>
            <dd className="text-neutral-800 mt-0.5">{value || '—'}</dd>
        </div>
    );
}
