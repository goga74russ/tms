'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    FileText, Search, Filter, X, Eye, Lock, CheckCircle2,
    Clock, RotateCcw, ChevronDown, Truck, User, Download, FileDown, Printer, Paperclip, Upload, Trash2,
} from 'lucide-react';

const TOKEN_KEY = 'tms_token';

async function downloadPdfAuth(apiPath: string, filename: string) {
    const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    const res = await fetch(apiPath, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
    });
    if (!res.ok) throw new Error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё PDF');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function downloadAttachmentAuth(apiPath: string, filename: string) {
    const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    const res = await fetch(apiPath, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
    });
    if (!res.ok) throw new Error('Attachment download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ================================================================
// Types
// ================================================================
interface Waybill {
    id: string;
    number: string;
    tripId: string;
    vehicleId: string;
    driverId: string;
    techInspectionId: string;
    medInspectionId: string;
    status: string;
    odometerOut: number;
    odometerIn: number | null;
    fuelIn: number | null;
    departureAt: string | null;
    returnAt: string | null;
    issuedAt: string;
    closedAt: string | null;
    mechanicSignature: string | null;
    medicSignature: string | null;
}

interface WaybillDriverLink {
    id: string;
    driverId: string;
    driverName: string;
    licenseNumber: string;
    shiftStart?: string | null;
    shiftEnd?: string | null;
    isPrimary: boolean;
}

interface WaybillExpense {
    id: string;
    category: string;
    description?: string | null;
    plannedAmount?: number | null;
    actualAmount?: number | null;
    receiptUrl?: string | null;
}

interface WaybillAttachment {
    id: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    createdAt: string;
}

interface WaybillDetail extends Waybill {
    vehicle?: { plateNumber: string; make: string; model: string };
    driver?: { fullName: string; licenseNumber: string };
    trip?: { number: string; status: string };
    drivers?: WaybillDriverLink[];
    expenses?: WaybillExpense[];
    attachments?: WaybillAttachment[];
}

// ================================================================
// Status badge component
// ================================================================
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
        formed: {
            color: 'bg-slate-100 text-slate-600 border-slate-200',
            label: 'РЎС„РѕСЂРјРёСЂРѕРІР°РЅ',
            icon: <Clock className="w-3.5 h-3.5" />,
        },
        issued: {
            color: 'bg-blue-100 text-blue-700 border-blue-200',
            label: 'Р’С‹РґР°РЅ',
            icon: <FileText className="w-3.5 h-3.5" />,
        },
        closed: {
            color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
            label: 'Р—Р°РєСЂС‹С‚',
            icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        },
    };

    const c = config[status] || config.formed;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.color}`}>
            {c.icon}
            {c.label}
        </span>
    );
}

// ================================================================
// Close Waybill Modal
// ================================================================
function CloseWaybillModal({
    waybill,
    onClose,
    onSuccess,
}: {
    waybill: WaybillDetail;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [odometerIn, setOdometerIn] = useState('');
    const [fuelIn, setFuelIn] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!odometerIn) {
            setError('РЈРєР°Р¶РёС‚Рµ РїРѕРєР°Р·Р°РЅРёСЏ РѕРґРѕРјРµС‚СЂР°');
            return;
        }

        const odoValue = parseInt(odometerIn);
        if (odoValue < waybill.odometerOut) {
            setError(`РћРґРѕРјРµС‚СЂ РІРѕР·РІСЂР°С‚Р° (${odoValue}) РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РјРµРЅСЊС€Рµ РѕРґРѕРјРµС‚СЂР° РІС‹РµР·РґР° (${waybill.odometerOut})`);
            return;
        }

        try {
            setSubmitting(true);
            setError('');
            await api.post(`/waybills/${waybill.id}/close`, {
                odometerIn: odoValue,
                fuelIn: fuelIn ? parseFloat(fuelIn) : undefined,
            });
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'РћС€РёР±РєР° РїСЂРё Р·Р°РєСЂС‹С‚РёРё');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Card className="w-full max-w-md mx-4 shadow-xl">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5 text-emerald-600" />
                            Р—Р°РєСЂС‹С‚РёРµ РїСѓС‚РµРІРѕРіРѕ Р»РёСЃС‚Р°
                        </CardTitle>
                        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                        {waybill.number} вЂў {waybill.vehicle?.plateNumber}
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                        РћРґРѕРјРµС‚СЂ РїСЂРё РІС‹РµР·РґРµ: <strong>{waybill.odometerOut.toLocaleString()} РєРј</strong>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700">
                            РћРґРѕРјРµС‚СЂ РїСЂРё РІРѕР·РІСЂР°С‚Рµ (РєРј) *
                        </label>
                        <input
                            type="number"
                            placeholder="РџСЂРѕР±РµРі РїСЂРё РІРѕР·РІСЂР°С‚Рµ"
                            value={odometerIn}
                            onChange={e => setOdometerIn(e.target.value)}
                            className="w-full px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                            min={waybill.odometerOut}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-slate-700">
                            РћСЃС‚Р°С‚РѕРє С‚РѕРїР»РёРІР° (Р»)
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            placeholder="РќРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕРµ РїРѕР»Рµ"
                            value={fuelIn}
                            onChange={e => setFuelIn(e.target.value)}
                            className="w-full px-4 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" className="flex-1" onClick={onClose}>
                            РћС‚РјРµРЅР°
                        </Button>
                        <Button
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting ? 'Р—Р°РєСЂС‹РІР°СЋ...' : 'Р—Р°РєСЂС‹С‚СЊ РџР›'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ================================================================
// Detail Modal
// ================================================================
function DetailModal({
    waybill,
    onClose,
    onCloseWaybill,
    onUploadAttachment,
    onDeleteAttachment,
    onDownloadAttachment,
    uploadingAttachment,
}: {
    waybill: WaybillDetail;
    onClose: () => void;
    onCloseWaybill: () => void;
    onUploadAttachment: (file: File) => Promise<void>;
    onDeleteAttachment: (attachmentId: string) => Promise<void>;
    onDownloadAttachment: (attachment: WaybillAttachment) => Promise<void>;
    uploadingAttachment: boolean;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <Card className="w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            РџСѓС‚РµРІРѕР№ Р»РёСЃС‚ {waybill.number}
                        </CardTitle>
                        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                    <StatusBadge status={waybill.status} />
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Vehicle */}
                    {waybill.vehicle && (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                            <Truck className="w-5 h-5 text-slate-500" />
                            <div>
                                <p className="text-sm font-semibold text-slate-800">{waybill.vehicle.plateNumber}</p>
                                <p className="text-xs text-slate-500">{waybill.vehicle.make} {waybill.vehicle.model}</p>
                            </div>
                        </div>
                    )}

                    {/* Driver */}
                    {waybill.driver && (
                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                            <User className="w-5 h-5 text-slate-500" />
                            <div>
                                <p className="text-sm font-semibold text-slate-800">{waybill.driver.fullName}</p>
                                <p className="text-xs text-slate-500">Р’РЈ: {waybill.driver.licenseNumber}</p>
                            </div>
                        </div>
                    )}

                    {/* Trip */}
                    {waybill.trip && (
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <p className="text-sm text-slate-600">
                                Р РµР№СЃ: <strong>{waybill.trip.number}</strong>
                                <span className="ml-2 text-xs text-slate-400">({waybill.trip.status})</span>
                            </p>
                        </div>
                    )}

                    {/* Data grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-blue-50 rounded-xl">
                            <p className="text-xs text-blue-500 mb-1">РћРґРѕРјРµС‚СЂ РІС‹РµР·РґР°</p>
                            <p className="text-lg font-bold text-blue-700">{waybill.odometerOut.toLocaleString()} РєРј</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl">
                            <p className="text-xs text-emerald-500 mb-1">РћРґРѕРјРµС‚СЂ РІРѕР·РІСЂР°С‚Р°</p>
                            <p className="text-lg font-bold text-emerald-700">
                                {waybill.odometerIn ? `${waybill.odometerIn.toLocaleString()} РєРј` : 'вЂ”'}
                            </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <p className="text-xs text-slate-400 mb-1">Р’С‹РµР·Рґ</p>
                            <p className="text-sm font-medium text-slate-700">
                                {waybill.departureAt ? new Date(waybill.departureAt).toLocaleString('ru-RU') : 'вЂ”'}
                            </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                            <p className="text-xs text-slate-400 mb-1">Р’РѕР·РІСЂР°С‚</p>
                            <p className="text-sm font-medium text-slate-700">
                                {waybill.returnAt ? new Date(waybill.returnAt).toLocaleString('ru-RU') : 'вЂ”'}
                            </p>
                        </div>
                    </div>

                    {waybill.fuelIn !== null && waybill.fuelIn !== undefined && (
                        <div className="p-3 bg-amber-50 rounded-xl">
                            <p className="text-xs text-amber-500 mb-1">РћСЃС‚Р°С‚РѕРє С‚РѕРїР»РёРІР°</p>
                            <p className="text-lg font-bold text-amber-700">{waybill.fuelIn} Р»</p>
                        </div>
                    )}

                    {/* Signatures */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-orange-50 rounded-xl">
                            <p className="text-xs text-orange-500 mb-1">РџРѕРґРїРёСЃСЊ РјРµС…Р°РЅРёРєР°</p>
                            <p className="text-sm font-medium text-orange-700">
                                {waybill.mechanicSignature ? 'вњ“ РџР­Рџ' : 'вЂ”'}
                            </p>
                        </div>
                        <div className="p-3 bg-rose-50 rounded-xl">
                            <p className="text-xs text-rose-500 mb-1">РџРѕРґРїРёСЃСЊ РјРµРґРёРєР°</p>
                            <p className="text-sm font-medium text-rose-700">
                                {waybill.medicSignature ? 'вњ“ РџР­Рџ' : 'вЂ”'}
                            </p>
                        </div>
                    </div>

                    {waybill.drivers && waybill.drivers.length > 0 && (
                        <div className="p-3 bg-slate-50 rounded-xl space-y-2">
                            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Р’РѕРґРёС‚РµР»Рё РЅР° РїСѓС‚РµРІРѕРј</p>
                            <div className="space-y-2">
                                {waybill.drivers.map((link) => (
                                    <div key={link.id} className="flex items-center justify-between gap-3 text-sm">
                                        <div>
                                            <p className="font-medium text-slate-800">{link.driverName}</p>
                                            <p className="text-xs text-slate-500">Р’РЈ: {link.licenseNumber}</p>
                                        </div>
                                        <div className="text-right text-xs text-slate-500">
                                            {link.isPrimary && <p className="text-emerald-600 font-semibold">РћСЃРЅРѕРІРЅРѕР№</p>}
                                            {(link.shiftStart || link.shiftEnd) && (
                                                <p>
                                                    {link.shiftStart ? new Date(link.shiftStart).toLocaleString('ru-RU') : 'вЂ”'}
                                                    {' в†’ '}
                                                    {link.shiftEnd ? new Date(link.shiftEnd).toLocaleString('ru-RU') : 'вЂ”'}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {waybill.expenses && waybill.expenses.length > 0 && (
                        <div className="p-3 bg-slate-50 rounded-xl space-y-2">
                            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Р Р°СЃС…РѕРґС‹ РїРѕ РїСѓС‚РµРІРѕРјСѓ</p>
                            <div className="space-y-2">
                                {waybill.expenses.map((expense) => (
                                    <div key={expense.id} className="flex items-center justify-between gap-3 text-sm border-b border-slate-200 pb-2 last:border-b-0 last:pb-0">
                                        <div>
                                            <p className="font-medium text-slate-800">{expense.category}</p>
                                            <p className="text-xs text-slate-500">{expense.description || 'Р‘РµР· РѕРїРёСЃР°РЅРёСЏ'}</p>
                                        </div>
                                        <div className="text-right text-xs text-slate-600">
                                            <p>РџР»Р°РЅ: {expense.plannedAmount ?? 0} в‚Ѕ</p>
                                            <p>Р¤Р°РєС‚: {expense.actualAmount ?? 0} в‚Ѕ</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="p-3 bg-slate-50 rounded-xl space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Attachments</p>
                                <p className="text-sm text-slate-600">Files and scans attached to this waybill.</p>
                            </div>
                            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-100 cursor-pointer">
                                <Upload className="w-4 h-4" />
                                {uploadingAttachment ? 'Uploading...' : 'Upload'}
                                <input
                                    type="file"
                                    className="hidden"
                                    disabled={uploadingAttachment}
                                    onChange={async (event) => {
                                        const file = event.target.files?.[0];
                                        if (!file) return;
                                        await onUploadAttachment(file);
                                        event.target.value = '';
                                    }}
                                />
                            </label>
                        </div>
                        {waybill.attachments && waybill.attachments.length > 0 ? (
                            <div className="space-y-2">
                                {waybill.attachments.map((attachment) => (
                                    <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-200 px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-800 truncate">{attachment.originalName}</p>
                                            <p className="text-xs text-slate-500">{Math.max(1, Math.round(attachment.fileSize / 1024))} KB</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => onDownloadAttachment(attachment)}
                                                className="p-2 rounded-lg hover:bg-emerald-100 transition-colors"
                                                title="Download"
                                            >
                                                <Download className="w-4 h-4 text-emerald-600" />
                                            </button>
                                            <button
                                                onClick={() => onDeleteAttachment(attachment.id)}
                                                className="p-2 rounded-lg hover:bg-red-100 transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <Paperclip className="w-4 h-4" />
                                No attachments yet
                            </div>
                        )}
                    </div>

                    <div className="text-xs text-slate-400 pt-2">
                        Issued: {new Date(waybill.issuedAt).toLocaleString('ru-RU')}
                        {waybill.closedAt && ' Closed: ' + new Date(waybill.closedAt).toLocaleString('ru-RU')}
                    </div>
                    {/* Close button if not yet closed */}
                    {waybill.status !== 'closed' && (
                        <Button
                            className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            size="lg"
                            onClick={onCloseWaybill}
                        >
                            <Lock className="w-4 h-4 mr-2" />
                            Р—Р°РєСЂС‹С‚СЊ РїСѓС‚РµРІРѕР№ Р»РёСЃС‚
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ================================================================
// Main Page
// ================================================================
export default function WaybillsPage() {
    const [waybills, setWaybills] = useState<Waybill[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 20;

    // Lookup maps for resolving UUIDs to names
    const [vehicleMap, setVehicleMap] = useState<Record<string, string>>({});
    const [driverMap, setDriverMap] = useState<Record<string, string>>({});

    // Filters
    const [statusFilter, setStatusFilter] = useState('');
    const [searchFilter, setSearchFilter] = useState('');

    // Modals
    const [detailWaybill, setDetailWaybill] = useState<WaybillDetail | null>(null);
    const [closeWaybill, setCloseWaybill] = useState<WaybillDetail | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);

    const loadWaybills = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.get<{
                success: boolean;
                data: Waybill[];
                total: number;
                page: number;
            }>(`/waybills?page=${page}&limit=${limit}`);

            if (result.success) {
                setWaybills(result.data);
                setTotal(result.total);
            }
        } catch (err) {
            console.error('Failed to load waybills:', err);
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        loadWaybills();
    }, [loadWaybills]);

    // Load vehicles & drivers once to resolve UUIDs
    useEffect(() => {
        (async () => {
            try {
                const [vRes, dRes] = await Promise.all([
                    api.get<any>('/fleet/vehicles?limit=200'),
                    api.get<any>('/fleet/drivers?limit=200'),
                ]);
                const vm: Record<string, string> = {};
                for (const v of (vRes.data || [])) vm[v.id] = v.plateNumber;
                setVehicleMap(vm);
                const dm: Record<string, string> = {};
                for (const d of (dRes.data || [])) dm[d.id] = d.fullName;
                setDriverMap(dm);
            } catch { /* ignore */ }
        })();
    }, []);

    const openDetail = async (waybillId: string) => {
        try {
            const [detail, driversRes, expensesRes, attachmentsRes] = await Promise.all([
                api.get<{ success: boolean; data: WaybillDetail }>(`/waybills/${waybillId}`),
                api.get<{ success: boolean; data: WaybillDriverLink[] }>(`/waybills/${waybillId}/drivers`).catch(() => ({ success: false, data: [] })),
                api.get<{ success: boolean; data: WaybillExpense[] }>(`/waybills/${waybillId}/expenses`).catch(() => ({ success: false, data: [] })),
                api.get<{ success: boolean; data: WaybillAttachment[] }>(`/waybills/${waybillId}/attachments`).catch(() => ({ success: false, data: [] })),
            ]);
            if (detail.success) {
                setDetailWaybill({
                    ...detail.data,
                    drivers: driversRes.success ? driversRes.data : [],
                    expenses: expensesRes.success ? expensesRes.data : [],
                    attachments: attachmentsRes.success ? attachmentsRes.data : [],
                });
            }
        } catch (err) {
            console.error('Failed to load waybill detail:', err);
        }
    };

    const handleUploadAttachment = async (file: File) => {
        if (!detailWaybill) return;

        try {
            setUploadingAttachment(true);
            const formData = new FormData();
            formData.append('file', file);
            await api.post(`/waybills/${detailWaybill.id}/attachments`, formData);
            await openDetail(detailWaybill.id);
            setToast({ message: 'Attachment uploaded', type: 'success' });
        } catch (err: any) {
            setToast({ message: err.message || 'Attachment upload failed', type: 'error' });
        } finally {
            setUploadingAttachment(false);
        }
    };

    const handleDeleteAttachment = async (attachmentId: string) => {
        if (!detailWaybill) return;

        try {
            await api.delete(`/waybills/${detailWaybill.id}/attachments/${attachmentId}`);
            await openDetail(detailWaybill.id);
            setToast({ message: 'Attachment deleted', type: 'success' });
        } catch (err: any) {
            setToast({ message: err.message || 'Attachment delete failed', type: 'error' });
        }
    };

    const handleDownloadAttachment = async (attachment: WaybillAttachment) => {
        if (!detailWaybill) return;

        try {
            await downloadAttachmentAuth(`/api/waybills/${detailWaybill.id}/attachments/${attachment.id}/download`, attachment.originalName);
        } catch (err: any) {
            setToast({ message: err.message || 'Attachment download failed', type: 'error' });
        }
    };

    const handleCloseSuccess = () => {
        setCloseWaybill(null);
        setDetailWaybill(null);
        setToast({ message: 'вњ… РџСѓС‚РµРІРѕР№ Р»РёСЃС‚ Р·Р°РєСЂС‹С‚', type: 'success' });
        loadWaybills();
    };

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Client-side filtering (API handles pagination, we filter on current page)
    const filteredWaybills = waybills.filter(wb => {
        if (statusFilter && wb.status !== statusFilter) return false;
        if (searchFilter && !wb.number.toLowerCase().includes(searchFilter.toLowerCase())) return false;
        return true;
    });

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-6 py-4 -m-6 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">РџСѓС‚РµРІС‹Рµ Р»РёСЃС‚С‹</h1>
                            <p className="text-sm text-slate-500">РЈРїСЂР°РІР»РµРЅРёРµ РїСѓС‚РµРІС‹РјРё Р»РёСЃС‚Р°РјРё</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadWaybills}>
                        <RotateCcw className="w-4 h-4 mr-1.5" />
                        РћР±РЅРѕРІРёС‚СЊ
                    </Button>
                </div>
            </header>

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium text-sm ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="РџРѕРёСЃРє РїРѕ РЅРѕРјРµСЂСѓ (WB-...)"
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                    />
                </div>

                {/* Status filter */}
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="appearance-none pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 cursor-pointer"
                    >
                        <option value="">Р’СЃРµ СЃС‚Р°С‚СѓСЃС‹</option>
                        <option value="formed">РЎС„РѕСЂРјРёСЂРѕРІР°РЅ</option>
                        <option value="issued">Р’С‹РґР°РЅ</option>
                        <option value="closed">Р—Р°РєСЂС‹С‚</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                {(statusFilter || searchFilter) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setStatusFilter(''); setSearchFilter(''); }}
                        className="text-slate-500"
                    >
                        <X className="w-4 h-4 mr-1" />
                        РЎР±СЂРѕСЃРёС‚СЊ
                    </Button>
                )}
            </div>

            {/* Table */}
            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">РќРѕРјРµСЂ</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">РЎС‚Р°С‚СѓСЃ</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">РўРЎ</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Р’РѕРґРёС‚РµР»СЊ</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Р’С‹РµР·Рґ</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">РћРґРѕРјРµС‚СЂ</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Р”Р°С‚Р° РІС‹РґР°С‡Рё</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-16">
                                        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredWaybills.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-16 text-slate-400">
                                        {waybills.length === 0 ? 'РќРµС‚ РїСѓС‚РµРІС‹С… Р»РёСЃС‚РѕРІ' : 'РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ'}
                                    </td>
                                </tr>
                            ) : (
                                filteredWaybills.map((wb) => (
                                    <tr
                                        key={wb.id}
                                        onClick={() => openDetail(wb.id)}
                                        className="border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer transition"
                                    >
                                        <td className="px-4 py-3">
                                            <span className="font-mono font-semibold text-blue-700">{wb.number}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={wb.status} />
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 font-medium text-xs">{vehicleMap[wb.vehicleId] || wb.vehicleId.substring(0, 8)}</td>
                                        <td className="px-4 py-3 text-slate-700 text-xs">{driverMap[wb.driverId] || wb.driverId.substring(0, 8)}</td>
                                        <td className="px-4 py-3 text-slate-600 text-xs">
                                            {wb.departureAt ? new Date(wb.departureAt).toLocaleString('ru-RU', {
                                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                                            }) : 'вЂ”'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 text-xs">
                                            {wb.odometerOut.toLocaleString()} в†’{' '}
                                            {wb.odometerIn ? wb.odometerIn.toLocaleString() : '...'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">
                                            {new Date(wb.issuedAt).toLocaleDateString('ru-RU')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); openDetail(wb.id); }}
                                                    className="p-1 rounded hover:bg-blue-100 transition-colors" title="РџРѕРґСЂРѕР±РЅРѕСЃС‚Рё"
                                                >
                                                    <Eye className="w-4 h-4 text-slate-400" />
                                                </button>
                                                <a
                                                    href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/waybills/${wb.id}/etrn`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="p-1 rounded hover:bg-emerald-100 transition-colors" title="РЎРєР°С‡Р°С‚СЊ Р­РўСЂРќ XML"
                                                >
                                                    <Download className="w-4 h-4 text-emerald-600" />
                                                </a>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); downloadPdfAuth(`/api/waybills/${wb.id}/pdf`, `waybill_${wb.number}.pdf`); }}
                                                    className="p-1 rounded hover:bg-red-100 transition-colors" title="РЎРєР°С‡Р°С‚СЊ PDF (РџСѓС‚РµРІРѕР№ Р»РёСЃС‚)"
                                                >
                                                    <FileDown className="w-4 h-4 text-red-500" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); window.open(`/print/waybill/${wb.id}`, '_blank'); }}
                                                    className="p-1 rounded hover:bg-purple-100 transition-colors" title="РџРµС‡Р°С‚СЊ РїСѓС‚РµРІРѕРіРѕ Р»РёСЃС‚Р°"
                                                >
                                                    <Printer className="w-4 h-4 text-purple-500" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                        <p className="text-xs text-slate-500">
                            РџРѕРєР°Р·Р°РЅРѕ {((page - 1) * limit) + 1}вЂ“{Math.min(page * limit, total)} РёР· {total}
                        </p>
                        <div className="flex gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                в†ђ РќР°Р·Р°Рґ
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Р’РїРµСЂС‘Рґ в†’
                            </Button>
                        </div>
                    </div>
                )}
            </Card>

            {/* Detail Modal */}
            {detailWaybill && !closeWaybill && (
                <DetailModal
                    waybill={detailWaybill}
                    onClose={() => setDetailWaybill(null)}
                    onCloseWaybill={() => {
                        setCloseWaybill(detailWaybill);
                    }}
                    onUploadAttachment={handleUploadAttachment}
                    onDeleteAttachment={handleDeleteAttachment}
                    onDownloadAttachment={handleDownloadAttachment}
                    uploadingAttachment={uploadingAttachment}
                />
            )}

            {/* Close Waybill Modal */}
            {closeWaybill && (
                <CloseWaybillModal
                    waybill={closeWaybill}
                    onClose={() => setCloseWaybill(null)}
                    onSuccess={handleCloseSuccess}
                />
            )}
        </div>
    );
}

