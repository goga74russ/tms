"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { type Invoice as SharedInvoice, INVOICE_STATUS, INVOICE_TYPE, ORDER_STATUS, label } from '@tms/shared';
import { api } from "@/lib/api";
import { downloadFromApi } from '@/lib/download';
import { CreateInvoiceButton, InvoiceWorkflowActions } from './InvoiceWorkflowActions';

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MetricCard } from "@/components/ui/metric-card";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { computeRange, type PeriodRange } from "@/components/ui/period-selector";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { BulkActionsBar } from "@/components/ui/bulk-actions-bar";
import { FileDown, Printer, Wallet, Receipt, AlertCircle, CheckCircle2, Banknote, FileSpreadsheet, Plus, Archive, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

async function downloadPdfAuth(apiPath: string, filename: string) {
    const res = await fetch(apiPath, {
        credentials: 'include', // httpOnly cookie sent automatically
    });
    if (!res.ok) throw new Error('Ошибка загрузки PDF');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ——— Types ———
type Invoice = SharedInvoice;

interface ContractorOption {
    id: string;
    name: string;
    inn: string;
}

interface DocReturn {
    id: string;
    tripId: string;
    docType: 'ttn' | 'upd' | 'act' | 'other';
    status: 'pending' | 'received' | 'overdue';
    receivedAt: string | null;
    notes: string | null;
}

type ApiResponse<T> = { success: boolean; data: T };

// ——— Status helpers ———
// T-16 — новая FSM статусов (invoice-spec.md §2).
const STATUS_OPTIONS = [
    { value: '', label: 'Все статусы' },
    ...Object.entries(INVOICE_STATUS).map(([value, label]) => ({ value, label })),
];

const getStatusColor = (status: string) => {
    switch (status) {
        case 'paid_full': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'paid_partial': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
        case 'issued': return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'corrected': return 'bg-purple-50 text-purple-700 border-purple-200';
        case 'cancelled': return 'bg-neutral-100 text-neutral-500 border-neutral-200';
        default: return 'bg-amber-50 text-amber-700 border-amber-200'; // draft
    }
};

const fmtMoney = (n: number | string) => Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';

/**
 * B-10: Сокращаем длинные номера счетов с timestamp-суффиксом для читаемости.
 * Полный номер остаётся в title= для подсказки при наведении.
 * Пример: "СЧ-2504-20260429205232193" → "СЧ-2504-20260429…2193"
 */
function shortInvoiceNo(num: string): string {
    if (!num) return num;
    return num.length > 20 ? num.slice(0, 16) + '…' + num.slice(-4) : num;
}

const ADDITIONAL_SERVICE_OPTIONS = [
    { value: 'loading', label: 'Погрузка' },
    { value: 'unloading', label: 'Разгрузка' },
    { value: 'permit', label: 'Пропуск' },
    { value: 'wash', label: 'Мойка' },
    { value: 'downtime', label: 'Простой' },
    { value: 'forwarding', label: 'Экспедирование' },
    { value: 'other', label: 'Другое' },
];

const SERVICE_RULES: Record<string, { unit: string; rate: number; quantity: number; coefficient: number; description: string }> = {
    loading: { unit: 'operation', rate: 2500, quantity: 1, coefficient: 1, description: 'Погрузочные работы' },
    unloading: { unit: 'operation', rate: 2500, quantity: 1, coefficient: 1, description: 'Разгрузочные работы' },
    permit: { unit: 'document', rate: 1500, quantity: 1, coefficient: 1, description: 'Пропуск / разрешение на территорию' },
    wash: { unit: 'operation', rate: 1800, quantity: 1, coefficient: 1, description: 'Мойка ТС после рейса' },
    downtime: { unit: 'hour', rate: 1200, quantity: 1, coefficient: 1, description: 'Простой сверх нормативного времени' },
    forwarding: { unit: 'hour', rate: 1800, quantity: 1, coefficient: 1, description: 'Экспедирование' },
    other: { unit: 'service', rate: 0, quantity: 1, coefficient: 1, description: 'Дополнительная услуга' },
};

const SERVICE_UNIT_LABELS: Record<string, string> = {
    operation: 'операция',
    document: 'документ',
    hour: 'час',
    service: 'услуга',
};

// ================================================================
export default function FinanceDashboard() {
    const { toast } = useToast();
    // State
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [filterStatus, setFilterStatus] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    // Sort state — UI P2: sortable headers
    type FinanceSortKey = 'number' | 'periodStart' | 'total' | 'status';
    const [sortBy, setSortBy] = useState<FinanceSortKey | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);
    function toggleSort(key: FinanceSortKey) {
        if (sortBy !== key) { setSortBy(key); setSortDir('asc'); return; }
        if (sortDir === 'asc') { setSortDir('desc'); return; }
        setSortBy(null); setSortDir(null);
    }
    const [period, setPeriod] = useState<PeriodRange>(() => computeRange('mtd'));

    // Invoice modal
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [docReturns, setDocReturns] = useState<DocReturn[]>([]);
    const [docReturnsLoading, setDocReturnsLoading] = useState(false);
    const [markingReceived, setMarkingReceived] = useState<string | null>(null);
    const [financeActionLoading, setFinanceActionLoading] = useState<string | null>(null);
    const [financeActionResult, setFinanceActionResult] = useState<string | null>(null);
    const [serviceForm, setServiceForm] = useState({
        serviceType: 'loading',
        description: SERVICE_RULES.loading.description,
        amount: String(SERVICE_RULES.loading.rate),
        vatRate: '20',
        quantity: String(SERVICE_RULES.loading.quantity),
        rate: String(SERVICE_RULES.loading.rate),
        coefficient: String(SERVICE_RULES.loading.coefficient),
        notes: '',
    });
    const [reconciliationForm, setReconciliationForm] = useState({
        externalDocumentId: '',
        externalStatus: '',
        externalTotal: '',
        externalVatAmount: '',
        notes: '',
    });

    const [contractors, setContractors] = useState<ContractorOption[]>([]);

    // Bulk row selection (for floating BulkActionsBar)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);

    // Bulk generate dialog
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkFrom, setBulkFrom] = useState(() => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
    const [bulkTo, setBulkTo] = useState(() => format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'yyyy-MM-dd'));
    const [bulkContractorId, setBulkContractorId] = useState('');
    const [bulkSubmitting, setBulkSubmitting] = useState(false);
    const [bulkResult, setBulkResult] = useState<string | null>(null);

    // ——— Load invoices ———
    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<ApiResponse<Invoice[]>>('/finance/invoices');
            setInvoices(res.data || []);
        } catch (err: any) {
            toast({ variant: 'error', title: 'Не удалось загрузить счета', description: err?.message });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    const fetchContractors = useCallback(async () => {
        try {
            const res = await api.get<{ success: boolean; data: ContractorOption[] }>('/fleet/contractors?limit=200');
            setContractors(res.data || []);
        } catch (err) {
            console.error('Failed to load contractors', err);
        }
    }, []);

    useEffect(() => {
        fetchInvoices();
        fetchContractors();
    }, [fetchInvoices, fetchContractors]);

    // Load document returns when invoice modal opens
    useEffect(() => {
        if (!selectedInvoice || !selectedInvoice.tripIds?.length) {
            setDocReturns([]);
            return;
        }
        setDocReturnsLoading(true);
        Promise.all(
            selectedInvoice.tripIds.map(tid =>
                api.get<{ success: boolean; data: DocReturn[] }>(`/trips/${tid}/document-returns`)
                    .then(r => r.data)
                    .catch(() => [] as DocReturn[])
            )
        ).then(results => {
            setDocReturns(results.flat());
        }).finally(() => setDocReturnsLoading(false));
    }, [selectedInvoice]);

    useEffect(() => {
        if (!selectedInvoice) return;
        setFinanceActionResult(null);
        setServiceForm({
            serviceType: 'loading',
            description: SERVICE_RULES.loading.description,
            amount: String(SERVICE_RULES.loading.rate),
            vatRate: '20',
            quantity: String(SERVICE_RULES.loading.quantity),
            rate: String(SERVICE_RULES.loading.rate),
            coefficient: String(SERVICE_RULES.loading.coefficient),
            notes: '',
        });
        setReconciliationForm({
            externalDocumentId: selectedInvoice.number ? `1C-${selectedInvoice.number}` : '',
            externalStatus: selectedInvoice.status,
            externalTotal: String(selectedInvoice.total || ''),
            externalVatAmount: String(selectedInvoice.vatAmount || ''),
            notes: '',
        });
    }, [selectedInvoice]);

    // ——— Period-scoped list ———
    const periodInvoices = useMemo(() => {
        const fromMs = period.from.getTime();
        const toMs = period.to.getTime();
        return invoices.filter(inv => {
            if (!inv.createdAt) return true;
            const t = new Date(inv.createdAt).getTime();
            if (!Number.isFinite(t)) return true;
            return t >= fromMs && t <= toMs;
        });
    }, [invoices, period.from, period.to]);

    // ——— Derived summary ———
    const summary = useMemo(() => {
        // К оплате — выпущенные и частично оплаченные (остаток).
        const pending = periodInvoices.filter(i => i.status === 'issued' || i.status === 'paid_partial')
            .reduce((sum, i) => sum + Math.max(Number(i.total) - Number(i.paidAmount ?? 0), 0), 0);
        const partial = periodInvoices.filter(i => i.status === 'paid_partial')
            .reduce((sum, i) => sum + Number(i.paidAmount ?? 0), 0);
        const totalPaid = periodInvoices.filter(i => i.status === 'paid_full')
            .reduce((sum, i) => sum + Number(i.total), 0);
        return { pending, partial, totalPaid };
    }, [periodInvoices]);

    // 30-day sparkline of "К оплате" amounts grouped by day.
    const pendingSparkline = useMemo(() => {
        const days = 30;
        const buckets = new Array<number>(days).fill(0);
        const todayMs = Date.now();
        invoices.forEach((inv) => {
            if (inv.status !== 'issued' && inv.status !== 'paid_partial') return;
            if (!inv.createdAt) return;
            const t = new Date(inv.createdAt).getTime();
            if (!Number.isFinite(t)) return;
            const ageDays = Math.floor((todayMs - t) / 86_400_000);
            if (ageDays < 0 || ageDays >= days) return;
            const idx = days - 1 - ageDays;
            buckets[idx] += Number(inv.total) || 0;
        });
        return buckets;
    }, [invoices]);

    // ——— Filtered list ———
    const filteredInvoices = useMemo(() => {
        const filtered = periodInvoices.filter(inv => {
            if (filterStatus && inv.status !== filterStatus) return false;
            if (filterSearch && !inv.number.toLowerCase().includes(filterSearch.toLowerCase())) return false;
            return true;
        });
        if (!sortBy || !sortDir) return filtered;
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            let aVal: string | number | null | undefined;
            let bVal: string | number | null | undefined;
            switch (sortBy) {
                case 'number':
                    aVal = a.number; bVal = b.number; break;
                case 'periodStart':
                    aVal = a.periodStart ? new Date(a.periodStart).getTime() : null;
                    bVal = b.periodStart ? new Date(b.periodStart).getTime() : null;
                    break;
                case 'total':
                    aVal = Number(a.total); bVal = Number(b.total); break;
                case 'status':
                    aVal = a.status; bVal = b.status; break;
            }
            if (aVal == null) return 1;
            if (bVal == null) return -1;
            const cmp = typeof aVal === 'string'
                ? aVal.localeCompare(String(bVal), 'ru')
                : (aVal as number) - (bVal as number);
            return cmp * dir;
        });
    }, [periodInvoices, filterStatus, filterSearch, sortBy, sortDir]);

    // ——— Actions ———

    const handleBulkGenerate = async () => {
        if (!bulkFrom || !bulkTo) {
            toast({ variant: 'warning', title: 'Период не задан', description: 'Укажите даты «с» и «по».' });
            return;
        }
        setBulkSubmitting(true);
        setBulkResult(null);
        try {
            setError(null);
            const body: Record<string, any> = {
                from: new Date(bulkFrom + 'T00:00:00').toISOString(),
                to: new Date(bulkTo + 'T23:59:59').toISOString(),
            };
            if (bulkContractorId) body.contractorId = bulkContractorId;
            const res = await api.post<{ success: boolean; data?: { created?: any[]; skipped?: any[] } }>(
                '/finance/invoices/bulk-generate',
                body,
            );
            const created = res.data?.created?.length ?? 0;
            const skipped = res.data?.skipped?.length ?? 0;
            setBulkResult(`Создано ${created}, пропущено ${skipped}`);
            toast({ variant: 'success', title: 'Счета сформированы', description: `Создано ${created}, пропущено ${skipped}` });
            await fetchInvoices();
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err.message || 'Не удалось сформировать счета пакетом' });
        } finally {
            setBulkSubmitting(false);
        }
    };

    const handleExport1C = async () => {
        try {
            // M-2 FIX: Use credentials:'include' instead of broken api.getToken()
            await downloadFromApi('/api/finance/export/1c', `1c_export_${format(new Date(), 'yyyy-MM-dd')}.xml`);
            toast({ variant: 'success', title: 'Экспорт', description: 'XML для 1С скачан' });
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка экспорта', description: err.message });
        }
    };

    const handleMarkDocReceived = async (docType: 'ttn' | 'upd' | 'act') => {
        if (!selectedInvoice?.tripIds?.length) return;
        setMarkingReceived(docType);
        try {
            await Promise.all(
                selectedInvoice.tripIds.map(tid =>
                    api.post(`/trips/${tid}/document-returns`, {
                        docType,
                        status: 'received',
                        receivedAt: new Date().toISOString(),
                    })
                )
            );
            // Reload doc returns
            const results = await Promise.all(
                selectedInvoice.tripIds.map(tid =>
                    api.get<{ success: boolean; data: DocReturn[] }>(`/trips/${tid}/document-returns`)
                        .then(r => r.data).catch(() => [] as DocReturn[])
                )
            );
            setDocReturns(results.flat());
            toast({ variant: 'success', title: 'Документ зафиксирован', description: `${docType.toUpperCase()} помечен как полученный` });
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err.message });
        } finally {
            setMarkingReceived(null);
        }
    };

    const parseMoneyInput = useCallback((value: string) => {
        const parsed = Number(value.replace(',', '.').trim());
        return Number.isFinite(parsed) ? parsed : NaN;
    }, []);

    // Pure, dep-free reducer reused by both the live preview and the form-patch path.
    const computeServiceAmount = useCallback((form: typeof serviceForm) => {
        const quantity = parseMoneyInput(form.quantity);
        const rate = parseMoneyInput(form.rate);
        const coefficient = parseMoneyInput(form.coefficient);
        if (!Number.isFinite(quantity) || !Number.isFinite(rate) || !Number.isFinite(coefficient)) return NaN;
        return Math.round(quantity * rate * coefficient * 100) / 100;
    }, [parseMoneyInput]);

    // Hot path: re-rendered on every keystroke inside the Payment modal "Доп. услуги" tab.
    // Memoize against serviceForm so we only recompute when q/rate/coefficient change.
    const currentServiceAmount = useMemo(() => computeServiceAmount(serviceForm), [computeServiceAmount, serviceForm]);

    const calculateServiceAmount = useCallback((form?: typeof serviceForm) => {
        return form ? computeServiceAmount(form) : currentServiceAmount;
    }, [computeServiceAmount, currentServiceAmount]);

    const handleServiceTypeChange = (serviceType: string) => {
        const rule = SERVICE_RULES[serviceType] || SERVICE_RULES.other;
        const amount = Math.round(rule.quantity * rule.rate * rule.coefficient * 100) / 100;
        setServiceForm({
            ...serviceForm,
            serviceType,
            description: rule.description,
            quantity: String(rule.quantity),
            rate: String(rule.rate),
            coefficient: String(rule.coefficient),
            amount: String(amount),
        });
    };

    const updateServiceCalc = (patch: Partial<typeof serviceForm>) => {
        const next = { ...serviceForm, ...patch };
        const amount = calculateServiceAmount(next);
        setServiceForm({
            ...next,
            amount: Number.isFinite(amount) ? String(amount) : next.amount,
        });
    };

    const handleAddService = async () => {
        if (!selectedInvoice) return;
        const calculatedAmount = calculateServiceAmount();
        const amount = Number.isFinite(calculatedAmount) ? calculatedAmount : parseMoneyInput(serviceForm.amount);
        if (!serviceForm.description.trim()) {
            toast({ variant: 'warning', title: 'Описание', description: 'Опишите допуслугу' });
            return;
        }
        if (!Number.isFinite(amount)) {
            toast({ variant: 'warning', title: 'Сумма', description: 'Укажите корректную сумму допуслуги' });
            return;
        }

        setFinanceActionLoading('service');
        try {
            setError(null);
            await api.post(`/finance/invoices/${selectedInvoice.id}/additional-services`, {
                serviceType: serviceForm.serviceType,
                description: serviceForm.description,
                amount,
                vatRate: serviceForm.vatRate ? parseMoneyInput(serviceForm.vatRate) : null,
                notes: serviceForm.notes || `rule=${serviceForm.serviceType}; qty=${serviceForm.quantity}; rate=${serviceForm.rate}; coeff=${serviceForm.coefficient}`,
            });
            await fetchInvoices();
            setFinanceActionResult('Допуслуга добавлена как финансовая корректировка');
            toast({ variant: 'success', title: 'Готово', description: 'Допуслуга добавлена' });
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err.message || 'Не удалось добавить допуслугу' });
        } finally {
            setFinanceActionLoading(null);
        }
    };

    const handleReconcile1C = async () => {
        if (!selectedInvoice) return;
        if (!reconciliationForm.externalDocumentId.trim()) {
            toast({ variant: 'warning', title: 'Документ 1С', description: 'Укажите внешний документ' });
            return;
        }

        setFinanceActionLoading('reconciliation');
        try {
            setError(null);
            const result = await api.post<{ success: boolean; data?: any }>(`/finance/invoices/${selectedInvoice.id}/1c-reconciliation`, {
                externalDocumentId: reconciliationForm.externalDocumentId,
                externalStatus: reconciliationForm.externalStatus || null,
                externalTotal: reconciliationForm.externalTotal ? parseMoneyInput(reconciliationForm.externalTotal) : null,
                externalVatAmount: reconciliationForm.externalVatAmount ? parseMoneyInput(reconciliationForm.externalVatAmount) : null,
                exportedAt: new Date().toISOString(),
                notes: reconciliationForm.notes || null,
            });
            const mismatchCount = Array.isArray(result?.data?.mismatches) ? result.data.mismatches.length : 0;
            const message = mismatchCount > 0 ? `Сверка записана, расхождений: ${mismatchCount}` : 'Сверка записана, расхождений нет';
            setFinanceActionResult(message);
            toast({ variant: mismatchCount > 0 ? 'warning' : 'success', title: 'Сверка 1С', description: message });
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка', description: err.message || 'Не удалось записать сверку с 1С' });
        } finally {
            setFinanceActionLoading(null);
        }
    };

    // ——— Bulk row-selection actions ———
    const toggleRowSelected = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAllVisible = () => {
        const visibleIds = filteredInvoices.map(i => i.id);
        const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) {
                visibleIds.forEach(id => next.delete(id));
            } else {
                visibleIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const allVisibleSelected =
        filteredInvoices.length > 0 && filteredInvoices.every(i => selectedIds.has(i.id));
    const someVisibleSelected =
        filteredInvoices.some(i => selectedIds.has(i.id)) && !allVisibleSelected;

    const handleBulkDownloadPdf = async () => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        if (ids.length > 50) {
            toast({ variant: 'warning', title: 'Слишком много счетов', description: 'Максимум 50 за один архив. Снимите часть выделения.' });
            return;
        }
        setBulkBusy(true);
        try {
            const response = await fetch('/api/finance/invoices/bulk-pdf', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            });
            if (!response.ok) {
                let message = `HTTP ${response.status}`;
                try {
                    const err = await response.json();
                    if (err?.error) message = err.error;
                } catch {
                    /* response is not JSON */
                }
                throw new Error(message);
            }
            const skippedHeader = response.headers.get('X-Bulk-Skipped');
            const skipped = skippedHeader ? Number(skippedHeader) : 0;
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `invoices-${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            const included = ids.length - skipped;
            toast({
                variant: skipped > 0 ? 'warning' : 'success',
                title: skipped > 0 ? 'Архив скачан частично' : 'Архив скачан',
                description: skipped > 0
                    ? `В архиве ${included} из ${ids.length} (пропущено: ${skipped})`
                    : `В архиве счетов: ${included}`,
            });
        } catch (err: any) {
            toast({ variant: 'error', title: 'Ошибка скачивания', description: err?.message ?? 'Не удалось собрать архив' });
        } finally {
            setBulkBusy(false);
        }
    };

    // P1-A: handleBulkMarkPaid / handleBulkDelete удалены — соответствующие
    // bulk-действия убраны (см. BulkActionsBar ниже). Оплата идёт через FSM
    // (register-payment в карточке), счета не удаляются (только cancel).

    // ================================================================
    const pendingCount = periodInvoices.filter(i => i.status === 'issued' || i.status === 'paid_partial').length;
    const paidCount = periodInvoices.filter(i => i.status === 'paid_full').length;
    const partialCount = periodInvoices.filter(i => i.status === 'paid_partial').length;

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-neutral-50 min-h-screen text-neutral-900">
            <DashboardHeader
                title="Финансы и Бухгалтерия"
                subtitle="Управление счетами, актами и тарификацией рейсов"
                icon={Wallet}
                iconTone="brand"
                period={period}
                onPeriodChange={setPeriod}
                onRefresh={() => void fetchInvoices()}
                refreshing={loading}
                actions={
                    <>
                        {/* T-16 — пакетная генерация по периоду (по завершённым рейсам). */}
                        <Button variant="outline" leftIcon={<FileSpreadsheet className="w-4 h-4" />} onClick={() => { setBulkResult(null); setBulkOpen(true); }}>
                            Пакетом
                        </Button>
                        {/* T-16 — новый workflow: создать черновик СФ/УПД. */}
                        <CreateInvoiceButton contractors={contractors} onDone={() => void fetchInvoices()} />
                    </>
                }
            />

            {/* Summary Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                    label="К оплате"
                    value={fmtMoney(summary.pending)}
                    hint={`${pendingCount} счетов`}
                    sparkline={pendingSparkline}
                    sparklineTone="brand"
                    icon={Receipt}
                    tone="info"
                />
                <MetricCard
                    label="Частично оплачено"
                    value={fmtMoney(summary.partial)}
                    hint={partialCount > 0 ? `${partialCount} счетов` : 'нет частичных'}
                    icon={AlertCircle}
                    tone={summary.partial > 0 ? 'warning' : 'neutral'}
                />
                <MetricCard
                    label="Оплачено"
                    value={fmtMoney(summary.totalPaid)}
                    hint={`${paidCount} счетов`}
                    icon={CheckCircle2}
                    tone="success"
                />
                <MetricCard
                    label="Всего счетов"
                    value={periodInvoices.length}
                    hint="за период"
                    icon={Banknote}
                    tone="neutral"
                />
            </div>

            {/* Filters + Table */}
            <Card>
                <div className="p-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <h2 className="text-xl font-semibold text-neutral-900">Реестр счетов</h2>
                        <div className="flex flex-wrap gap-3 items-center">
                            <Input
                                placeholder="Поиск по номеру..."
                                value={filterSearch}
                                onChange={e => setFilterSearch(e.target.value)}
                                className="w-48"
                            />
                            <Select
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value)}
                                options={STATUS_OPTIONS}
                                className="w-44"
                            />
                            <Button variant="outline" onClick={handleExport1C}>Экспорт 1С (XML)</Button>
                        </div>
                    </div>

                    {loading ? (
                        <SkeletonTable rows={6} columns={9} />
                    ) : filteredInvoices.length === 0 ? (
                        <EmptyState
                            icon={Receipt}
                            title={filterStatus || filterSearch ? 'Нет счетов по фильтру' : 'Пока нет счетов'}
                            description={filterStatus || filterSearch ? 'Попробуйте сбросить фильтры.' : 'Создайте счёт по рейсам или сформируйте пакет.'}
                            tone="brand"
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8">
                                            <input
                                                type="checkbox"
                                                aria-label="Выделить все"
                                                checked={allVisibleSelected}
                                                ref={el => { if (el) el.indeterminate = someVisibleSelected; }}
                                                onChange={toggleAllVisible}
                                                className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <button type="button" onClick={() => toggleSort('number')} className="inline-flex items-center gap-1 hover:text-neutral-900 transition-colors">
                                                <span>Номер</span>
                                                {sortBy !== 'number' && <ChevronsUpDown className="w-3 h-3 text-neutral-400" />}
                                                {sortBy === 'number' && sortDir === 'asc' && <ChevronUp className="w-3 h-3 text-brand-600" />}
                                                {sortBy === 'number' && sortDir === 'desc' && <ChevronDown className="w-3 h-3 text-brand-600" />}
                                            </button>
                                        </TableHead>
                                        <TableHead>Тип</TableHead>
                                        <TableHead>
                                            <button type="button" onClick={() => toggleSort('periodStart')} className="inline-flex items-center gap-1 hover:text-neutral-900 transition-colors">
                                                <span>Период</span>
                                                {sortBy !== 'periodStart' && <ChevronsUpDown className="w-3 h-3 text-neutral-400" />}
                                                {sortBy === 'periodStart' && sortDir === 'asc' && <ChevronUp className="w-3 h-3 text-brand-600" />}
                                                {sortBy === 'periodStart' && sortDir === 'desc' && <ChevronDown className="w-3 h-3 text-brand-600" />}
                                            </button>
                                        </TableHead>
                                        <TableHead>Сумма</TableHead>
                                        <TableHead>НДС</TableHead>
                                        <TableHead>
                                            <button type="button" onClick={() => toggleSort('total')} className="inline-flex items-center gap-1 hover:text-neutral-900 transition-colors">
                                                <span>Итого</span>
                                                {sortBy !== 'total' && <ChevronsUpDown className="w-3 h-3 text-neutral-400" />}
                                                {sortBy === 'total' && sortDir === 'asc' && <ChevronUp className="w-3 h-3 text-brand-600" />}
                                                {sortBy === 'total' && sortDir === 'desc' && <ChevronDown className="w-3 h-3 text-brand-600" />}
                                            </button>
                                        </TableHead>
                                        <TableHead>
                                            <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-neutral-900 transition-colors">
                                                <span>Статус</span>
                                                {sortBy !== 'status' && <ChevronsUpDown className="w-3 h-3 text-neutral-400" />}
                                                {sortBy === 'status' && sortDir === 'asc' && <ChevronUp className="w-3 h-3 text-brand-600" />}
                                                {sortBy === 'status' && sortDir === 'desc' && <ChevronDown className="w-3 h-3 text-brand-600" />}
                                            </button>
                                        </TableHead>
                                        <TableHead className="text-right">Действия</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredInvoices.map(inv => (
                                        <TableRow key={inv.id} className="cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                                            <TableCell className="w-8" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Выделить счёт ${inv.number}`}
                                                    checked={selectedIds.has(inv.id)}
                                                    onChange={() => toggleRowSelected(inv.id)}
                                                    className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium text-blue-600" title={inv.number}>{shortInvoiceNo(inv.number)}</TableCell>
                                            <TableCell className="text-neutral-500">{label(INVOICE_TYPE, inv.type)}</TableCell>
                                            <TableCell className="text-neutral-500">
                                                {inv.periodStart && format(new Date(inv.periodStart), 'dd.MM', { locale: ru })}
                                                {' — '}
                                                {inv.periodEnd && format(new Date(inv.periodEnd), 'dd.MM.yy', { locale: ru })}
                                            </TableCell>
                                            <TableCell>{fmtMoney(inv.subtotal)}</TableCell>
                                            <TableCell className="text-neutral-400">{fmtMoney(inv.vatAmount)}</TableCell>
                                            <TableCell className="font-semibold">{fmtMoney(inv.total)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={getStatusColor(inv.status)}>
                                                    {label(INVOICE_STATUS, inv.status)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); void downloadFromApi(`/api/finance/invoices/${inv.id}/pdf`, `${inv.type}_${inv.number}.pdf`); }}
                                                        className="p-1 rounded hover:bg-red-100 transition-colors" title="Скачать PDF"
                                                    >
                                                        <FileDown className="w-4 h-4 text-red-500" />
                                                    </button>
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            // Юр-аудит §1.1/§5.5: печать по ПОЛНОМУ типу документа,
                                                            // иначе УПД/СФ/корректировки уходили в /print/invoice (act),
                                                            // где legacy-таблица пуста и заголовок не тот.
                                                            const seg =
                                                                inv.type === 'act' ? 'act' :
                                                                inv.type === 'sf' ? 'sf' :
                                                                inv.type === 'upd' ? 'upd' :
                                                                inv.type === 'corrective_upd' ? 'corrective-upd' : // P1-5
                                                                inv.type === 'corrective_sf' ? 'corrective-sf' :
                                                                'invoice'; // payment, advance
                                                            window.open(`/print/${seg}/${inv.id}`, '_blank');
                                                        }}
                                                        className="p-1 rounded hover:bg-purple-100 transition-colors" title="Печать"
                                                    >
                                                        <Printer className="w-4 h-4 text-purple-500" />
                                                    </button>
                                                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setSelectedInvoice(inv); }}>
                                                        ⋮
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </Card>

            {/* Invoice Detail Modal */}
            <Dialog
                open={!!selectedInvoice}
                onClose={() => setSelectedInvoice(null)}
                title={selectedInvoice ? `Счёт ${shortInvoiceNo(selectedInvoice.number)}` : ''}
            >
                {selectedInvoice && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div><span className="text-neutral-500">Тип:</span> <span className="font-medium">{label(INVOICE_TYPE, selectedInvoice.type)}</span></div>
                            <div><span className="text-neutral-500">Статус:</span> <Badge variant="outline" className={getStatusColor(selectedInvoice.status)}>{label(INVOICE_STATUS, selectedInvoice.status)}</Badge></div>
                            <div><span className="text-neutral-500">Подитог:</span> <span className="font-medium">{fmtMoney(selectedInvoice.subtotal)}</span></div>
                            <div><span className="text-neutral-500">НДС:</span> <span className="font-medium">{fmtMoney(selectedInvoice.vatAmount)}</span></div>
                            <div className="col-span-2"><span className="text-neutral-500">Итого:</span> <span className="text-2xl font-bold">{fmtMoney(selectedInvoice.total)}</span></div>
                            <div><span className="text-neutral-500">Период:</span> {selectedInvoice.periodStart && format(new Date(selectedInvoice.periodStart), 'dd.MM.yyyy')} — {selectedInvoice.periodEnd && format(new Date(selectedInvoice.periodEnd), 'dd.MM.yyyy')}</div>
                            <div><span className="text-neutral-500">Создан:</span> {selectedInvoice.createdAt && format(new Date(selectedInvoice.createdAt), 'd MMM yyyy, HH:mm', { locale: ru })}</div>
                            {selectedInvoice.tripIds && selectedInvoice.tripIds.length > 0 && (
                                <div className="col-span-2"><span className="text-neutral-500">Рейсов:</span> <span className="font-medium">{selectedInvoice.tripIds.length}</span></div>
                            )}
                        </div>

                        {/* N2 (Этап 5) — раздел «Связанные заявки» через invoice_orders junction.
                            Spec §3 «basis_text» + §10 «invoice_orders с allocated_amount». */}
                        {Array.isArray((selectedInvoice as any).orders) && (selectedInvoice as any).orders.length > 0 && (
                            <div className="border-t border-neutral-200 pt-4">
                                <p className="text-sm font-medium text-neutral-700 mb-3">Связанные заявки:</p>
                                <div className="space-y-1.5">
                                    {((selectedInvoice as any).orders as Array<{ id: string; number: string; status: string; cargoDescription: string; loadingAddress: string; unloadingAddress: string; allocatedAmount: number }>).map((row) => (
                                        <div key={row.id} className="rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-neutral-900 truncate">
                                                    {row.number}
                                                    <span className="text-[10px] text-neutral-500 ml-2">{label(ORDER_STATUS, row.status)}</span>
                                                </div>
                                                <div className="text-xs text-neutral-600 truncate">
                                                    {row.cargoDescription}
                                                </div>
                                                <div className="text-[11px] text-neutral-500 truncate">
                                                    {row.loadingAddress?.split(',')[0]} → {row.unloadingAddress?.split(',')[0]}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="text-sm font-semibold text-emerald-700">
                                                    {new Intl.NumberFormat('ru-RU', {
                                                        style: 'currency',
                                                        currency: 'RUB',
                                                        maximumFractionDigits: 0,
                                                    }).format(row.allocatedAmount)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-2 text-[11px] text-neutral-500">
                                    Σ allocated_amount = {new Intl.NumberFormat('ru-RU', {
                                        style: 'currency',
                                        currency: 'RUB',
                                        maximumFractionDigits: 0,
                                    }).format(((selectedInvoice as any).orders as Array<{ allocatedAmount: number }>).reduce((s, r) => s + r.allocatedAmount, 0))}
                                </div>
                            </div>
                        )}

                        {financeActionResult && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                                {financeActionResult}
                            </div>
                        )}

                        {/* Document returns section */}
                        {selectedInvoice.tripIds && selectedInvoice.tripIds.length > 0 && (
                            <div className="border-t border-neutral-200 pt-4">
                                <p className="text-sm font-medium text-neutral-700 mb-3">Оригиналы документов:</p>
                                {docReturnsLoading ? (
                                    <p className="text-xs text-neutral-400">Загрузка...</p>
                                ) : (
                                    <div className="flex flex-wrap gap-3">
                                        {(['ttn', 'upd', 'act'] as const).map(dt => {
                                            const rows = docReturns.filter(r => r.docType === dt);
                                            const allReceived = rows.length > 0 && rows.every(r => r.status === 'received');
                                            const anyOverdue = rows.some(r => r.status === 'overdue');
                                            const label = dt === 'ttn' ? 'ТТН' : dt === 'upd' ? 'УПД' : 'Акт';
                                            const color = allReceived
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : anyOverdue
                                                    ? 'bg-red-50 text-red-700 border-red-200'
                                                    : 'bg-neutral-100 text-neutral-500 border-neutral-200';
                                            return (
                                                <div key={dt} className="flex items-center gap-2">
                                                    <Badge variant="outline" className={color + ' px-3 py-1'}>
                                                        {allReceived ? '✓ ' : anyOverdue ? '⚠ ' : '○ '}{label}
                                                    </Badge>
                                                    {!allReceived && (
                                                        <button
                                                            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                                                            disabled={markingReceived === dt}
                                                            onClick={() => handleMarkDocReceived(dt)}
                                                        >
                                                            {markingReceived === dt ? '...' : 'Получен'}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="border-t border-neutral-200 pt-4">
                            {/* T-16: «Оплата» убрана — оплата теперь через FSM-workflow выше
                                (register-payment). Остаются доп.услуги и сверка 1С. */}
                            <Tabs defaultValue="service" className="space-y-3">
                                <TabsList>
                                    <TabsTrigger value="service">Доп. услуги</TabsTrigger>
                                    <TabsTrigger value="reconciliation">Сверка 1С</TabsTrigger>
                                </TabsList>

                                <TabsContent value="service">
                                    <div className="rounded-lg border border-neutral-200 p-3 space-y-2">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Добавить допуслугу</p>
                                        <Select value={serviceForm.serviceType} onChange={(e) => handleServiceTypeChange(e.target.value)} options={ADDITIONAL_SERVICE_OPTIONS} />
                                        <Input placeholder="Описание" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} />
                                        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-neutral-700">
                                            <div className="flex items-center justify-between gap-2">
                                                <span>Расчет: {SERVICE_UNIT_LABELS[SERVICE_RULES[serviceForm.serviceType]?.unit || 'service']}</span>
                                                <span className="font-semibold">{fmtMoney(currentServiceAmount || 0)}</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            <Input type="number" step="0.01" placeholder="Кол-во" value={serviceForm.quantity} onChange={(e) => updateServiceCalc({ quantity: e.target.value })} />
                                            <Input type="number" step="0.01" placeholder="Ставка" value={serviceForm.rate} onChange={(e) => updateServiceCalc({ rate: e.target.value })} />
                                            <Input type="number" step="0.01" placeholder="Коэфф." value={serviceForm.coefficient} onChange={(e) => updateServiceCalc({ coefficient: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input type="number" step="0.01" placeholder="Сумма" value={serviceForm.amount} onChange={(e) => setServiceForm({ ...serviceForm, amount: e.target.value })} />
                                            <Input type="number" step="0.01" placeholder="НДС %" value={serviceForm.vatRate} onChange={(e) => setServiceForm({ ...serviceForm, vatRate: e.target.value })} />
                                        </div>
                                        <Input placeholder="Примечание к правилу" value={serviceForm.notes} onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })} />
                                        <Button size="sm" variant="outline" className="w-full" disabled={financeActionLoading === 'service'} onClick={handleAddService}>
                                            {financeActionLoading === 'service' ? 'Добавление...' : 'Добавить допуслугу'}
                                        </Button>
                                    </div>
                                </TabsContent>

                                <TabsContent value="reconciliation">
                                    <div className="rounded-lg border border-neutral-200 p-3 space-y-2">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Сверка с 1С</p>
                                        <Input placeholder="Документ 1С" value={reconciliationForm.externalDocumentId} onChange={(e) => setReconciliationForm({ ...reconciliationForm, externalDocumentId: e.target.value })} />
                                        <Input placeholder="Статус 1С" value={reconciliationForm.externalStatus} onChange={(e) => setReconciliationForm({ ...reconciliationForm, externalStatus: e.target.value })} />
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input type="number" step="0.01" placeholder="Итого 1С" value={reconciliationForm.externalTotal} onChange={(e) => setReconciliationForm({ ...reconciliationForm, externalTotal: e.target.value })} />
                                            <Input type="number" step="0.01" placeholder="НДС 1С" value={reconciliationForm.externalVatAmount} onChange={(e) => setReconciliationForm({ ...reconciliationForm, externalVatAmount: e.target.value })} />
                                        </div>
                                        <Button size="sm" variant="outline" className="w-full" disabled={financeActionLoading === 'reconciliation'} onClick={handleReconcile1C}>
                                            {financeActionLoading === 'reconciliation' ? 'Сверка...' : 'Записать сверку'}
                                        </Button>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>

                        {/* T-16 — FSM workflow вместо легаси «сменить статус» */}
                        <InvoiceWorkflowActions
                            invoice={selectedInvoice}
                            onDone={() => { void fetchInvoices(); setSelectedInvoice(null); }}
                        />
                    </div>
                )}
            </Dialog>

            {/* Bulk generate dialog */}
            <Dialog
                open={bulkOpen}
                onClose={() => { setBulkOpen(false); setBulkResult(null); }}
                title="Сформировать счета пакетом"
            >
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500">
                        Создаст счета по завершённым рейсам за период. Можно ограничить одним контрагентом.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">С</label>
                            <Input type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">По</label>
                            <Input type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Контрагент (необязательно)</label>
                        <Select
                            value={bulkContractorId}
                            onChange={(e) => setBulkContractorId(e.target.value)}
                            placeholder="Все контрагенты"
                            options={contractors.map((c) => ({ value: c.id, label: `${c.name} (${c.inn})` }))}
                        />
                    </div>

                    {bulkResult && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            {bulkResult}
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => { setBulkOpen(false); setBulkResult(null); }}>
                            Закрыть
                        </Button>
                        <Button disabled={bulkSubmitting} onClick={handleBulkGenerate}>
                            {bulkSubmitting ? 'Формирование...' : 'Сформировать'}
                        </Button>
                    </div>
                </div>
            </Dialog>

            <BulkActionsBar
                selectedCount={selectedIds.size}
                onClear={() => setSelectedIds(new Set())}
                actions={[
                    {
                        label: 'Скачать PDF архив',
                        onClick: handleBulkDownloadPdf,
                        icon: Archive,
                        variant: 'primary',
                        disabled: bulkBusy,
                    },
                    // P1-A: bulk «Отметить оплаченными» (писал несуществующий status:'paid')
                    // и bulk «Удалить» (DELETE /finance/invoices/:id не существует, счёт —
                    // неизменяемый юр-документ) удалены. Оплата — через FSM register-payment
                    // в карточке счёта; удаление счетов недопустимо (только cancel).
                ]}
            />
        </div>
    );
}
