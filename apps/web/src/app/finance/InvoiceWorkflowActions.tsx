"use client";

// ============================================================
// T-16 (2/2) — UI нового invoice-workflow (invoice-spec.md §2/§5/§6).
// Изолировано от монолитной /finance страницы: FSM-gated действия +
// модалки create-draft / issue(+просрочка) / register-payment / correction /
// cancel. Использует M-batch эндпоинты.
// ============================================================
import { useState, useCallback } from "react";
import type { Invoice } from "@tms/shared";
import { INVOICE_STATUS, label } from "@tms/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Plus, Trash2, FileCheck2, Banknote, FileWarning, XCircle } from "lucide-react";

interface ContractorOption { id: string; name: string; inn: string }
interface OrderOption { id: string; number: string; customerPrice: number | null }
interface Allocation { orderId: string; allocatedAmount: string }

const ISSUABLE_TYPES = [
    { value: "payment", label: "Счёт на оплату" },
    { value: "advance", label: "Аванс СФ" },
    { value: "sf", label: "Счёт-фактура (СФ)" },
    { value: "upd", label: "УПД" },
    { value: "act", label: "Акт" },
];

const VAT_DOC_TYPES = ["sf", "upd", "corrective_sf", "corrective_upd"];

const ORDERS_PAGE_LIMIT = 200;

// R-2: фильтр был status=delivered — отсекал заявки в терминальном статусе
// returned, хотя выставить счёт по доставленной-и-возвращённой заявке законно.
// Бэкенд /orders теперь поддерживает список статусов через запятую (inArray),
// поэтому возвращаем delivered,returned — только эти терминальные статусы
// выставляемы (не draft/in_transit/cancelled). Возвращаем total для индикатора
// усечения «показано N из M» (заявки сверх лимита иначе невыпускаемы).
async function loadDeliveredOrders(): Promise<{ data: OrderOption[]; total: number }> {
    try {
        const res = await api.get<{ success: boolean; data: OrderOption[]; total?: number }>(
            `/orders?status=delivered,returned&limit=${ORDERS_PAGE_LIMIT}`,
        );
        const data = res.data || [];
        return { data, total: res.total ?? data.length };
    } catch { return { data: [], total: 0 }; }
}

// ============================================================
// Создать черновик счёта (entry point в шапке /finance)
// ============================================================
export function CreateInvoiceButton({ contractors, onDone }: { contractors: ContractorOption[]; onDone: () => void }) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [invoiceType, setInvoiceType] = useState("sf");
    const [payerId, setPayerId] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!payerId) { toast({ variant: "warning", title: "Плательщик", description: "Выберите контрагента" }); return; }
        setBusy(true);
        try {
            await api.post("/finance/invoices/draft", { invoiceType, payerId });
            toast({ variant: "success", title: "Черновик создан", description: "Дальше — выпуск (draft → issued)" });
            setOpen(false); setPayerId("");
            onDone();
        } catch (err: any) {
            toast({ variant: "error", title: "Ошибка", description: err?.message });
        } finally { setBusy(false); }
    };

    return (
        <>
            <Button variant="brand" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setOpen(true)}>
                Создать счёт
            </Button>
            <Dialog open={open} onClose={() => setOpen(false)} title="Новый счёт (черновик)">
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Тип документа</label>
                        <Select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)} options={ISSUABLE_TYPES} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Плательщик (контрагент)</label>
                        <Select
                            value={payerId} onChange={(e) => setPayerId(e.target.value)}
                            placeholder="Выберите контрагента"
                            options={contractors.map((c) => ({ value: c.id, label: `${c.name} (${c.inn})` }))}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
                        <Button isLoading={busy} onClick={submit}>Создать черновик</Button>
                    </div>
                </div>
            </Dialog>
        </>
    );
}

// ============================================================
// FSM-действия по выбранному счёту
// ============================================================
type ModalKind = null | "issue" | "payment" | "correction" | "cancel";

export function InvoiceWorkflowActions({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
    const { toast } = useToast();
    const [modal, setModal] = useState<ModalKind>(null);
    const [busy, setBusy] = useState(false);
    const [orders, setOrders] = useState<OrderOption[]>([]);
    const [ordersTotal, setOrdersTotal] = useState(0);

    // issue form
    const [basisText, setBasisText] = useState("");
    const [vatRate, setVatRate] = useState("20");
    const [includesVat, setIncludesVat] = useState(true);
    const [allocs, setAllocs] = useState<Allocation[]>([{ orderId: "", allocatedAmount: "" }]);
    const [overdueReason, setOverdueReason] = useState("");
    const [overdueInfo, setOverdueInfo] = useState<{ daysLate: number; deadlineDate: string | null } | null>(null);

    // payment form
    const [payAmount, setPayAmount] = useState("");
    const [payRef, setPayRef] = useState("");

    // correction form
    const [corrKind, setCorrKind] = useState<"adjustment" | "replacement">("adjustment");
    const [corrReason, setCorrReason] = useState("");

    // cancel form
    const [cancelReason, setCancelReason] = useState("");

    const openModal = useCallback(async (kind: ModalKind) => {
        setModal(kind);
        setOverdueInfo(null); setOverdueReason("");
        if (kind === "issue" || kind === "correction") {
            const loaded = await loadDeliveredOrders();
            setOrders(loaded.data);
            setOrdersTotal(loaded.total);
            if (kind === "issue") { setBasisText(""); setAllocs([{ orderId: "", allocatedAmount: "" }]); }
        }
        if (kind === "payment") { setPayAmount(String(Math.max(Number(invoice.total) - Number(invoice.paidAmount ?? 0), 0))); setPayRef(""); }
        if (kind === "cancel") setCancelReason("");
    }, [invoice]);

    const buildInvoiceOrders = () => allocs
        .filter((a) => a.orderId && Number(a.allocatedAmount) > 0)
        .map((a) => ({ orderId: a.orderId, allocatedAmount: Number(a.allocatedAmount) }));

    // raw fetch — нужен code/details для SF_OVERDUE_WARNING (api.post их теряет)
    // F-09: единый чек-лист недостающего перед выпуском — раньше ошибки шли по
    // одной (основание → fix → заявки → fix → НДС из бэкенда), бухгалтер тратил
    // время. Считаем всё разом и показываем список.
    const issueProblems = () => {
        const invoiceOrders = buildInvoiceOrders();
        const p: string[] = [];
        if (!basisText || basisText.trim().length < 5) p.push("основание (≥5 символов)");
        if (invoiceOrders.length === 0) p.push("хотя бы одна заявка с суммой > 0");
        if (VAT_DOC_TYPES.includes(invoice.type) && (!vatRate || Number(vatRate) <= 0)) p.push("ставка НДС");
        return p;
    };

    const submitIssue = async () => {
        const invoiceOrders = buildInvoiceOrders();
        const problems = issueProblems();
        if (problems.length) {
            toast({ variant: "warning", title: "Заполните перед выпуском", description: problems.join("; ") });
            return;
        }
        setBusy(true);
        try {
            const payload: Record<string, unknown> = { basisText, invoiceOrders };
            if (VAT_DOC_TYPES.includes(invoice.type)) payload.vatRate = Number(vatRate);
            payload.includesVat = includesVat;
            if (overdueReason.trim()) payload.overdueReason = overdueReason.trim();

            const res = await fetch(`/api/finance/invoices/${invoice.id}/issue`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (body?.code === "SF_OVERDUE_WARNING") {
                    // 5-дневная просрочка — показываем поле причины (T-14).
                    setOverdueInfo({ daysLate: body?.details?.daysLate ?? 0, deadlineDate: body?.details?.deadlineDate ?? null });
                    toast({ variant: "warning", title: "Просрочка выпуска", description: body?.error });
                    return;
                }
                throw new Error(body?.error || `HTTP ${res.status}`);
            }
            toast({ variant: "success", title: "Счёт выпущен", description: body?.data?.overdue ? `С просрочкой ${body.data.daysLate} дн.` : undefined });
            setModal(null); onDone();
        } catch (err: any) {
            toast({ variant: "error", title: "Ошибка выпуска", description: err?.message });
        } finally { setBusy(false); }
    };

    const submitPayment = async () => {
        const amount = Number(payAmount);
        if (!amount || amount <= 0) { toast({ variant: "warning", title: "Сумма", description: "Укажите сумму оплаты" }); return; }
        // Запрет переплаты на UI: остаток = total − уже оплачено (та же формула, что и при предзаполнении).
        const remaining = Math.max(Number(invoice.total) - Number(invoice.paidAmount ?? 0), 0);
        if (amount > remaining + 0.005) {
            toast({ variant: "error", title: "Переплата", description: `Сумма больше остатка по счёту (${remaining.toFixed(2)})` });
            return;
        }
        setBusy(true);
        try {
            await api.post(`/finance/invoices/${invoice.id}/register-payment`, {
                amount,
                paymentDate: new Date().toISOString(),
                ...(payRef.trim() ? { paymentReference: payRef.trim() } : {}),
            });
            toast({ variant: "success", title: "Оплата зафиксирована" });
            setModal(null); onDone();
        } catch (err: any) {
            toast({ variant: "error", title: "Ошибка", description: err?.message });
        } finally { setBusy(false); }
    };

    const submitCorrection = async () => {
        const invoiceOrders = buildInvoiceOrders();
        if (corrReason.trim().length < 5) { toast({ variant: "warning", title: "Обоснование", description: "Укажите причину корректировки (≥5 симв.)" }); return; }
        if (invoiceOrders.length === 0) { toast({ variant: "warning", title: "Заявки", description: "Добавьте строки корректировки" }); return; }
        const total = invoiceOrders.reduce((s, o) => s + o.allocatedAmount, 0);
        // C2: корректировка считает НДС по ставке ОРИГИНАЛА (invoice.vatRate),
        // а не по дефолту формы "20" — иначе КСФ/ИСФ под 10% считались как 20%.
        const corrRate = invoice.vatRate ?? Number(vatRate);
        const vat = VAT_DOC_TYPES.includes(invoice.type) ? Math.round((total - total / (1 + corrRate / 100)) * 100) / 100 : 0;
        setBusy(true);
        try {
            await api.post(`/finance/invoices/${invoice.id}/corrections`, {
                correctionKind: corrKind, correctionReason: corrReason,
                subtotal: total - vat, vatAmount: vat, total,
                invoiceOrders,
            });
            toast({ variant: "success", title: corrKind === "adjustment" ? "КСФ выпущен" : "ИСФ выпущен" });
            setModal(null); onDone();
        } catch (err: any) {
            toast({ variant: "error", title: "Ошибка", description: err?.message });
        } finally { setBusy(false); }
    };

    const submitCancel = async () => {
        if (cancelReason.trim().length < 5) { toast({ variant: "warning", title: "Причина", description: "Укажите причину отмены (≥5 симв.)" }); return; }
        setBusy(true);
        try {
            await api.post(`/finance/invoices/${invoice.id}/cancel`, { cancellationReason: cancelReason.trim() });
            toast({ variant: "success", title: "Счёт отменён" });
            setModal(null); onDone();
        } catch (err: any) {
            toast({ variant: "error", title: "Ошибка", description: err?.message });
        } finally { setBusy(false); }
    };

    const st = invoice.status;
    const canIssue = st === "draft";
    const canPay = st === "issued" || st === "paid_partial";
    const canCorrect = (st === "issued" || st === "paid_partial" || st === "paid_full") && !invoice.hasCorrections;
    const canCancel = st === "issued" || st === "paid_partial";

    // Аллокатор строк (issue/correction)
    const allocator = (
        <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-600">Заявки и распределение суммы</p>
            {ordersTotal > orders.length && (
                <p className="text-xs text-amber-600">
                    Показано {orders.length} из {ordersTotal} заявок — уточните поиск, остальные не загружены.
                </p>
            )}
            {allocs.map((a, i) => (
                <div key={i} className="flex gap-2 items-center">
                    <Select
                        className="flex-1"
                        value={a.orderId}
                        onChange={(e) => {
                            const order = orders.find((o) => o.id === e.target.value);
                            setAllocs((prev) => prev.map((x, j) => j === i
                                ? { orderId: e.target.value, allocatedAmount: x.allocatedAmount || String(order?.customerPrice ?? "") }
                                : x));
                        }}
                        placeholder="Заявка"
                        options={orders.map((o) => ({ value: o.id, label: o.number }))}
                    />
                    <Input
                        type="number" step="0.01" placeholder="Сумма" className="w-32"
                        value={a.allocatedAmount}
                        onChange={(e) => setAllocs((prev) => prev.map((x, j) => j === i ? { ...x, allocatedAmount: e.target.value } : x))}
                    />
                    <button type="button" className="p-1 text-neutral-400 hover:text-red-500"
                        onClick={() => setAllocs((prev) => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}>
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            ))}
            <Button size="sm" variant="ghost" leftIcon={<Plus className="w-3 h-3" />}
                onClick={() => setAllocs((prev) => [...prev, { orderId: "", allocatedAmount: "" }])}>
                Добавить заявку
            </Button>
        </div>
    );

    return (
        <div className="border-t border-neutral-200 pt-4">
            <p className="text-sm font-medium text-neutral-700 mb-3">Документооборот</p>
            <div className="flex flex-wrap gap-2">
                {canIssue && <Button size="sm" leftIcon={<FileCheck2 className="w-4 h-4" />} onClick={() => openModal("issue")}>Выпустить</Button>}
                {canPay && <Button size="sm" variant="outline" leftIcon={<Banknote className="w-4 h-4" />} onClick={() => openModal("payment")}>Оплата</Button>}
                {canCorrect && <Button size="sm" variant="outline" leftIcon={<FileWarning className="w-4 h-4" />} onClick={() => openModal("correction")}>Корректировка</Button>}
                {canCancel && <Button size="sm" variant="outline" className="text-red-600 border-red-200" leftIcon={<XCircle className="w-4 h-4" />} onClick={() => openModal("cancel")}>Отменить</Button>}
                {!canIssue && !canPay && !canCorrect && !canCancel && (
                    <span className="text-xs text-neutral-400">Действия недоступны для статуса «{label(INVOICE_STATUS, st)}»</span>
                )}
            </div>

            {/* Issue */}
            <Dialog open={modal === "issue"} onClose={() => setModal(null)} title="Выпуск счёта (draft → issued)">
                <div className="space-y-3">
                    <Input placeholder="Основание (договор № ... от ...)" value={basisText} onChange={(e) => setBasisText(e.target.value)} />
                    {VAT_DOC_TYPES.includes(invoice.type) && (
                        <div className="flex items-center gap-3">
                            <Input type="number" step="0.01" placeholder="Ставка НДС %" className="w-32" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
                            <label className="flex items-center gap-2 text-sm text-neutral-600">
                                <input type="checkbox" checked={includesVat} onChange={(e) => setIncludesVat(e.target.checked)} /> НДС в сумме
                            </label>
                        </div>
                    )}
                    {allocator}
                    {overdueInfo && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 space-y-2">
                            <p className="text-sm text-red-700">Просрочка выпуска: <b>{overdueInfo.daysLate} дн.</b> сверх 5-дневного срока (ст. 168 НК). Укажите причину для подтверждения.</p>
                            <Input placeholder="Причина просрочки" value={overdueReason} onChange={(e) => setOverdueReason(e.target.value)} />
                        </div>
                    )}
                    {/* F-09: persistent чек-лист «осталось заполнить» — видно всё разом
                        до нажатия, а не по одной ошибке после. */}
                    {issueProblems().length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            <span className="font-semibold">Осталось заполнить:</span>
                            <ul className="list-disc pl-4 mt-0.5">
                                {issueProblems().map((p, i) => <li key={i}>{p}</li>)}
                            </ul>
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" onClick={() => setModal(null)}>Отмена</Button>
                        <Button isLoading={busy} onClick={submitIssue}>
                            {overdueInfo ? "Подтвердить выпуск с просрочкой" : "Выпустить"}
                        </Button>
                    </div>
                </div>
            </Dialog>

            {/* Payment */}
            <Dialog open={modal === "payment"} onClose={() => setModal(null)} title="Регистрация оплаты">
                <div className="space-y-3">
                    <Input type="number" step="0.01" placeholder="Сумма" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                    <Input placeholder="Платёжное поручение (опц.)" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" onClick={() => setModal(null)}>Отмена</Button>
                        <Button isLoading={busy} onClick={submitPayment}>Зафиксировать</Button>
                    </div>
                </div>
            </Dialog>

            {/* Correction */}
            <Dialog open={modal === "correction"} onClose={() => setModal(null)} title="Корректировка (КСФ / ИСФ)">
                <div className="space-y-3">
                    <Select
                        value={corrKind} onChange={(e) => setCorrKind(e.target.value as "adjustment" | "replacement")}
                        options={[{ value: "adjustment", label: "КСФ — корректировочный (разница)" }, { value: "replacement", label: "ИСФ — исправленный (полная сумма)" }]}
                    />
                    <Input placeholder="Обоснование корректировки" value={corrReason} onChange={(e) => setCorrReason(e.target.value)} />
                    {allocator}
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" onClick={() => setModal(null)}>Отмена</Button>
                        <Button isLoading={busy} onClick={submitCorrection}>Выпустить корректировку</Button>
                    </div>
                </div>
            </Dialog>

            {/* Cancel */}
            <Dialog open={modal === "cancel"} onClose={() => setModal(null)} title="Отмена счёта">
                <div className="space-y-3">
                    <Input placeholder="Причина отмены" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" onClick={() => setModal(null)}>Закрыть</Button>
                        <Button variant="destructive" isLoading={busy} onClick={submitCancel}>Отменить счёт</Button>
                    </div>
                </div>
            </Dialog>
        </div>
    );
}
