'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Search, Plus, Users, X, Loader2 } from 'lucide-react';

interface Driver {
    id: string;
    fullName: string;
    licenseNumber: string;
    licenseCategories: string[];
    licenseExpiry: string;
    medCertificateExpiry?: string;
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

function CreateDriverModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [fullName, setFullName] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [licenseCategories, setLicenseCategories] = useState('');
    const [licenseExpiry, setLicenseExpiry] = useState('');
    const [medCertExpiry, setMedCertExpiry] = useState('');
    const [phone, setPhone] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit() {
        if (!fullName || !licenseNumber) {
            setError('Укажите ФИО и номер ВУ');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const result = await api.post<any>('/fleet/drivers', {
                fullName,
                licenseNumber,
                licenseCategories: licenseCategories.split(',').map(s => s.trim()).filter(Boolean),
                licenseExpiry: licenseExpiry || undefined,
                medCertificateExpiry: medCertExpiry || undefined,
                phone: phone || undefined,
            });
            if (result.success) {
                onCreated();
            } else {
                throw new Error(result.error || 'Ошибка');
            }
        } catch (err: any) {
            setError(err.message || 'Ошибка сервера');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-900">Новый водитель</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">ФИО *</label>
                        <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Иванов Иван Иванович" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Номер ВУ *</label>
                            <input type="text" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="77 01 123456" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Категории</label>
                            <input type="text" value={licenseCategories} onChange={e => setLicenseCategories(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="B, C, CE" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Срок ВУ</label>
                            <input type="date" value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Медсправка до</label>
                            <input type="date" value={medCertExpiry} onChange={e => setMedCertExpiry(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1.5 block">Телефон</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="+7 (999) 123-45-67" />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
                    <button onClick={onClose} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Отмена</button>
                    <button onClick={handleSubmit} disabled={submitting}
                        className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {submitting ? 'Создание...' : 'Создать'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function DriversPage() {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        loadDrivers();
    }, [debouncedSearch]);

    async function loadDrivers() {
        setLoading(true);
        try {
            const result = await api.get<any>(`/fleet/drivers?search=${debouncedSearch}&limit=100`);
            setDrivers(result.data || []);
        } catch (err) {
            console.error('Failed to load drivers:', err);
        } finally {
            setLoading(false);
        }
    }

    const activeCount = drivers.filter(d => d.isActive).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Водители</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Реестр водителей • {activeCount} активных из {drivers.length}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg
                    text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
                    <Plus className="w-4 h-4" />
                    Добавить водителя
                </button>
            </div>

            {/* Content Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                {/* Search */}
                <div className="p-4 border-b border-slate-200">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Поиск по ФИО, номеру ВУ..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm
                                focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                ) : drivers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Users className="w-12 h-12 mb-3" />
                        <p className="text-sm">Водители не найдены</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-left">
                                    <th className="px-4 py-3 font-medium">ФИО</th>
                                    <th className="px-4 py-3 font-medium">Номер ВУ</th>
                                    <th className="px-4 py-3 font-medium">Категории</th>
                                    <th className="px-4 py-3 font-medium">Срок ВУ</th>
                                    <th className="px-4 py-3 font-medium">Медсправка</th>
                                    <th className="px-4 py-3 font-medium">Статус</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {drivers.map(d => (
                                    <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-900">{d.fullName}</td>
                                        <td className="px-4 py-3 font-mono text-slate-600">{d.licenseNumber}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-1">
                                                {d.licenseCategories.map(c => (
                                                    <span key={c} className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-600">
                                                        {c}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className={`px-4 py-3 text-sm ${expiryColor(d.licenseExpiry)}`}>
                                            {formatDate(d.licenseExpiry)}
                                        </td>
                                        <td className={`px-4 py-3 text-sm ${expiryColor(d.medCertificateExpiry)}`}>
                                            {formatDate(d.medCertificateExpiry)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                                                ${d.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {d.isActive ? 'Активен' : 'Неактивен'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showCreateModal && (
                <CreateDriverModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => { setShowCreateModal(false); loadDrivers(); }}
                />
            )}
        </div>
    );
}
