'use client';

// ============================================================================
// Drivers tab on /fleet page.
//
// Round 5 audit v2: this used to be a hand-rolled table that diverged from
// `/drivers` (separate styling, separate row actions, no edit, no filters,
// no CSV). To stop the drift we now use the shared DataTable with the same
// columns + actions as `/drivers/page.tsx`, but kept self-contained so the
// fleet page can still mount it as a tab.
//
// Differences vs `/drivers` page (intentional, to fit a tab):
//   - No Stat cards (the parent fleet page already has its own header).
//   - No HOS column (would require N extra requests; the dedicated /drivers
//     page is the place for that detail). Power users still get the link.
//   - No bulk-deactivate (kept simple; lives on /drivers).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Plus, Users, Pencil, UserX, ExternalLink } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column, Pill } from '@/components/ui/data-table';

interface Driver {
    id: string;
    fullName: string;
    licenseNumber: string;
    licenseCategories: string[];
    licenseExpiry: string;
    medCertificateExpiry?: string;
    adrCertificateExpiry?: string;
    phone?: string;
    isActive: boolean;
    createdAt: string;
}

function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('ru-RU');
}

function expiryColor(d?: string) {
    if (!d) return '';
    const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'text-red-700 font-bold';
    if (diff < 7) return 'text-red-600';
    if (diff <= 30) return 'text-amber-600';
    return 'text-emerald-600';
}

function DriverFormModal({
    onClose,
    onSaved,
    editingItem,
}: {
    onClose: () => void;
    onSaved: () => void;
    editingItem?: Driver | null;
}) {
    const { toast } = useToast();
    const isEdit = !!editingItem;
    const toDateInput = (s?: string) => (s ? s.slice(0, 10) : '');
    const [fullName, setFullName] = useState(editingItem?.fullName ?? '');
    const [licenseNumber, setLicenseNumber] = useState(editingItem?.licenseNumber ?? '');
    const [licenseCategories, setLicenseCategories] = useState(
        (editingItem?.licenseCategories ?? []).join(', '),
    );
    const [licenseExpiry, setLicenseExpiry] = useState(toDateInput(editingItem?.licenseExpiry));
    const [medCertExpiry, setMedCertExpiry] = useState(toDateInput(editingItem?.medCertificateExpiry));
    const [adrCertExpiry, setAdrCertExpiry] = useState(toDateInput(editingItem?.adrCertificateExpiry));
    const [phone, setPhone] = useState(editingItem?.phone ?? '');
    const [submitting, setSubmitting] = useState(false);
    const [fieldError, setFieldError] = useState<{ fullName?: string; licenseNumber?: string }>({});

    async function handleSubmit() {
        const errs: { fullName?: string; licenseNumber?: string } = {};
        if (!fullName.trim()) errs.fullName = 'Укажите ФИО';
        if (!licenseNumber.trim()) errs.licenseNumber = 'Укажите номер ВУ';
        setFieldError(errs);
        if (Object.keys(errs).length > 0) return;

        setSubmitting(true);
        try {
            const payload = {
                fullName,
                licenseNumber,
                licenseCategories: licenseCategories.split(',').map(s => s.trim()).filter(Boolean),
                licenseExpiry: licenseExpiry || undefined,
                medCertificateExpiry: medCertExpiry || undefined,
                adrCertificateExpiry: adrCertExpiry || undefined,
                phone: phone || undefined,
            };
            const result = isEdit
                ? await api.put<any>(`/fleet/drivers/${editingItem!.id}`, payload)
                : await api.post<any>('/fleet/drivers', payload);
            if (result.success) {
                toast({
                    variant: 'success',
                    title: 'Готово',
                    description: isEdit ? `Водитель ${fullName} обновлён` : `Водитель ${fullName} добавлен`,
                });
                onSaved();
            } else {
                throw new Error(result.error || 'Ошибка');
            }
        } catch (err: any) {
            toast({
                variant: 'error',
                title: 'Ошибка',
                description: err.message || (isEdit ? 'Не удалось обновить водителя' : 'Не удалось создать водителя'),
            });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={true} onClose={onClose} title={isEdit ? 'Редактировать водителя' : 'Новый водитель'} size="md">
            <div className="space-y-4">
                <Input
                    label="ФИО"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Иванов Иван Иванович"
                    error={fieldError.fullName}
                />
                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label="Номер ВУ"
                        required
                        value={licenseNumber}
                        onChange={e => setLicenseNumber(e.target.value)}
                        placeholder="77 01 123456"
                        error={fieldError.licenseNumber}
                    />
                    <Input
                        label="Категории"
                        value={licenseCategories}
                        onChange={e => setLicenseCategories(e.target.value)}
                        placeholder="B, C, CE"
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Input label="Срок ВУ" type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} />
                    <Input label="Медсправка до" type="date" value={medCertExpiry} onChange={e => setMedCertExpiry(e.target.value)} />
                </div>
                <Input
                    label="ADR-сертификат до"
                    type="date"
                    value={adrCertExpiry}
                    onChange={e => setAdrCertExpiry(e.target.value)}
                    helperText="Срок действия свидетельства о подготовке водителей ТС, перевозящих опасные грузы."
                />
                <FormField
                    format="phone"
                    label="Телефон"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                />
                <div className="flex gap-3 justify-end pt-2">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Отмена</Button>
                    <Button variant="brand" isLoading={submitting} onClick={handleSubmit}>
                        {submitting ? (isEdit ? 'Сохранение...' : 'Создание...') : (isEdit ? 'Сохранить' : 'Создать')}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}

export function DriversTable() {
    const { toast } = useToast();
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
    const [statusFilter, setStatusFilter] = useState('');

    const loadDrivers = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/drivers?limit=200`);
            setDrivers(result.data || []);
        } catch (err: any) {
            toast({
                variant: 'error',
                title: 'Не удалось загрузить водителей',
                description: err?.message || 'Сетевая ошибка',
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void loadDrivers();
    }, [loadDrivers]);

    const filtered = drivers.filter(d => {
        if (statusFilter === 'active' && !d.isActive) return false;
        if (statusFilter === 'archived' && d.isActive) return false;
        return true;
    });

    const columns: Column<Driver>[] = [
        {
            id: 'fullName',
            header: 'ФИО',
            accessor: (r) => r.fullName,
            cell: (r) => <span className="font-medium text-neutral-900">{r.fullName}</span>,
            sortable: true,
            sticky: 'left',
            minWidth: '200px',
        },
        {
            id: 'licenseNumber',
            header: 'Номер ВУ',
            accessor: (r) => r.licenseNumber,
            sortable: true,
            monospace: true,
            width: '140px',
        },
        {
            id: 'licenseCategories',
            header: 'Категории',
            cell: (r) => (
                <div className="flex gap-1 flex-wrap">
                    {r.licenseCategories.map(c => (
                        <span key={c} className="px-1.5 py-0.5 bg-neutral-100 rounded text-xs font-medium text-neutral-600">
                            {c}
                        </span>
                    ))}
                </div>
            ),
            accessor: (r) => r.licenseCategories.join(','),
            width: '160px',
        },
        {
            id: 'licenseExpiry',
            header: 'Срок ВУ',
            accessor: (r) => r.licenseExpiry,
            cell: (r) => <span className={expiryColor(r.licenseExpiry)}>{formatDate(r.licenseExpiry)}</span>,
            sortable: true,
            width: '120px',
            align: 'right',
            monospace: true,
        },
        {
            id: 'medCertificateExpiry',
            header: 'Медсправка',
            accessor: (r) => r.medCertificateExpiry,
            cell: (r) => <span className={expiryColor(r.medCertificateExpiry)}>{formatDate(r.medCertificateExpiry)}</span>,
            sortable: true,
            width: '120px',
            align: 'right',
            monospace: true,
        },
        {
            id: 'isActive',
            header: 'Статус',
            accessor: (r) => (r.isActive ? 1 : 0),
            cell: (r) => (
                <Pill tone={r.isActive ? 'success' : 'neutral'}>
                    {r.isActive ? 'Активен' : 'Неактивен'}
                </Pill>
            ),
            sortable: true,
            width: '110px',
        },
    ];

    async function toggleActive(row: Driver) {
        try {
            await api.put(`/fleet/drivers/${row.id}`, { isActive: !row.isActive });
            toast({ variant: 'success', title: row.isActive ? 'Деактивирован' : 'Активирован' });
            void loadDrivers();
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err?.message });
        }
    }

    return (
        <div className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <p className="text-sm text-neutral-500">
                    Краткий реестр водителей. Полный — на странице{' '}
                    <Link href="/drivers" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                        Водители <ExternalLink className="w-3 h-3" />
                    </Link>.
                </p>
                <Button variant="brand" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                    Добавить водителя
                </Button>
            </div>

            <DataTable<Driver>
                tableId="fleet-drivers"
                data={filtered}
                columns={columns}
                keyField="id"
                loading={loading}
                searchPlaceholder="Поиск по ФИО, номеру ВУ..."
                searchKeys={['fullName', 'licenseNumber', 'phone']}
                filters={[
                    {
                        id: 'status',
                        label: 'Статус',
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: [
                            { value: 'active', label: 'Активные' },
                            { value: 'archived', label: 'Неактивные' },
                        ],
                    },
                ]}
                rowActions={(row) => [
                    {
                        id: 'edit',
                        label: 'Редактировать',
                        icon: <Pencil className="w-4 h-4" />,
                        onClick: () => setEditingDriver(row),
                    },
                    {
                        id: 'toggle',
                        label: row.isActive ? 'Деактивировать' : 'Активировать',
                        icon: <UserX className="w-4 h-4" />,
                        onClick: () => toggleActive(row),
                        tone: row.isActive ? 'danger' : 'default',
                    },
                ]}
                emptyState={
                    <EmptyState
                        icon={Users}
                        title="Пока нет водителей"
                        description="Добавьте первого водителя, чтобы начать."
                        tone="brand"
                        action={
                            <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                                Добавить водителя
                            </Button>
                        }
                    />
                }
                pageSize={50}
            />

            {showCreateModal && (
                <DriverFormModal
                    onClose={() => setShowCreateModal(false)}
                    onSaved={() => { setShowCreateModal(false); void loadDrivers(); }}
                />
            )}

            {editingDriver && (
                <DriverFormModal
                    key={editingDriver.id}
                    editingItem={editingDriver}
                    onClose={() => setEditingDriver(null)}
                    onSaved={() => { setEditingDriver(null); void loadDrivers(); }}
                />
            )}
        </div>
    );
}
