'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

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
    const [errors, setErrors] = useState<Record<string, string>>({});
    const { toast } = useToast();

    const validate = () => {
        const e: Record<string, string> = {};
        if (!name.trim()) e.name = 'Укажите название';
        if (!/^\d{10}(\d{2})?$/.test(inn)) e.inn = 'ИНН: 10 или 12 цифр';
        if (kpp && !/^\d{9}$/.test(kpp)) e.kpp = 'КПП: 9 цифр';
        if (ogrn && !/^\d{13,15}$/.test(ogrn)) e.ogrn = 'ОГРН: 13 или 15 цифр';
        if (bankBik && !/^\d{9}$/.test(bankBik)) e.bankBik = 'БИК: 9 цифр';
        if (bankAccount && !/^\d{20}$/.test(bankAccount)) e.bankAccount = 'Счёт: 20 цифр';
        return e;
    };

    const submit = async () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length > 0) {
            toast({
                variant: 'warning',
                title: 'Проверьте поля',
                description: 'Заполните обязательные поля корректно.',
            });
            return;
        }
        setSaving(true);
        try {
            const res = await api.post<{ success: boolean; error?: string }>('/onboarding/profile', {
                inn,
                name,
                kpp,
                ogrn,
                legalAddress,
                bankBik,
                bankAccount,
            });
            if (!res.success) {
                toast({
                    variant: 'error',
                    title: 'Не удалось сохранить',
                    description: res.error ?? 'Попробуйте ещё раз.',
                });
                return;
            }
            toast({ variant: 'success', title: 'Реквизиты сохранены' });
            onNext();
        } catch (err: unknown) {
            toast({
                variant: 'error',
                title: 'Ошибка соединения',
                description: (err as Error).message ?? 'Попробуйте ещё раз',
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-5">
            <p className="text-sm text-neutral-600">
                Проверьте автозаполнение и добавьте банковские реквизиты для исходящих счетов.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                    <Input
                        label="Название организации"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        error={errors.name}
                    />
                </div>
                <Input
                    label="ИНН"
                    required
                    inputMode="numeric"
                    maxLength={12}
                    value={inn}
                    onChange={(e) => setInn(e.target.value.replace(/\D/g, ''))}
                    error={errors.inn}
                />
                <Input
                    label="КПП"
                    inputMode="numeric"
                    maxLength={9}
                    value={kpp}
                    onChange={(e) => setKpp(e.target.value.replace(/\D/g, ''))}
                    error={errors.kpp}
                    helperText="Не требуется для ИП"
                />
                <div className="sm:col-span-2">
                    <Input
                        label="ОГРН / ОГРНИП"
                        inputMode="numeric"
                        maxLength={15}
                        value={ogrn}
                        onChange={(e) => setOgrn(e.target.value.replace(/\D/g, ''))}
                        error={errors.ogrn}
                    />
                </div>
                <div className="sm:col-span-2">
                    <Input
                        label="Юридический адрес"
                        value={legalAddress}
                        onChange={(e) => setLegalAddress(e.target.value)}
                    />
                </div>
                <Input
                    label="БИК банка"
                    inputMode="numeric"
                    maxLength={9}
                    value={bankBik}
                    onChange={(e) => setBankBik(e.target.value.replace(/\D/g, ''))}
                    error={errors.bankBik}
                />
                <Input
                    label="Расчётный счёт"
                    inputMode="numeric"
                    maxLength={20}
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, ''))}
                    error={errors.bankAccount}
                />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                <Button variant="ghost" onClick={onBack} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                    Назад
                </Button>
                <Button
                    variant="brand"
                    onClick={submit}
                    isLoading={saving}
                    rightIcon={!saving ? <ArrowRight className="w-4 h-4" /> : undefined}
                >
                    Далее
                </Button>
            </div>
        </div>
    );
}
