"use client";

// ============================================================
// T-14 (3/3) — Дашборд «СФ/УПД выпущенные с просрочкой» (invoice-spec.md §6).
// Для бухгалтера/руководителя: контроль 5-дневного срока выпуска
// счетов-фактур (ст. 168 ч. 3 НК). Данные — GET /finance/invoices/overdue.
// ============================================================
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DashboardHeader } from "@/components/ui/dashboard-header";
import { SkeletonTable } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { Clock, CheckCircle2 } from "lucide-react";

interface OverdueRow {
    id: string;
    number: string;
    type: string;
    status: string;
    total: number;
    issuedAt: string;
    realizationDate: string | null;
    deadlineDate: string | null;
    daysLate: number;
    overdueReason: string | null;
}

const typeLabels: Record<string, string> = {
    sf: "СФ", upd: "УПД", corrective_sf: "КСФ", advance: "Аванс СФ",
};

const fmtDate = (d: string | null) => (d ? format(new Date(d), "dd.MM.yyyy", { locale: ru }) : "—");
const fmtMoney = (n: number) => Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽";

export default function SfOverduePage() {
    const { toast } = useToast();
    const [rows, setRows] = useState<OverdueRow[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<{ success: boolean; data: OverdueRow[] }>("/finance/invoices/overdue");
            setRows(res.data || []);
        } catch (err: any) {
            toast({ variant: "error", title: "Не удалось загрузить отчёт", description: err?.message });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-neutral-50 min-h-screen text-neutral-900">
            <DashboardHeader
                title="СФ/УПД с просрочкой выпуска"
                subtitle="Счета-фактуры, выпущенные позже 5 календарных дней от даты реализации (ст. 168 ч. 3 НК)"
                icon={Clock}
                iconTone="danger"
                onRefresh={() => void fetchRows()}
                refreshing={loading}
            />

            <Card>
                <div className="p-6">
                    {loading ? (
                        <SkeletonTable rows={6} columns={7} />
                    ) : rows.length === 0 ? (
                        <EmptyState
                            icon={CheckCircle2}
                            title="Просрочек нет"
                            description="Все СФ/УПД выпущены в пределах 5-дневного срока. Так держать."
                            tone="success"
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Номер</TableHead>
                                        <TableHead>Тип</TableHead>
                                        <TableHead>Реализация</TableHead>
                                        <TableHead>Крайний срок</TableHead>
                                        <TableHead>Выпущен</TableHead>
                                        <TableHead>Просрочка</TableHead>
                                        <TableHead>Сумма</TableHead>
                                        <TableHead>Причина</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell className="font-medium" title={r.number}>{r.number}</TableCell>
                                            <TableCell className="text-neutral-500">{typeLabels[r.type] || r.type}</TableCell>
                                            <TableCell className="text-neutral-500">{fmtDate(r.realizationDate)}</TableCell>
                                            <TableCell className="text-neutral-500">{fmtDate(r.deadlineDate)}</TableCell>
                                            <TableCell className="text-neutral-500">{fmtDate(r.issuedAt)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="bg-danger-50 text-danger-700 border-danger-200">
                                                    +{r.daysLate} дн.
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-semibold">{fmtMoney(r.total)}</TableCell>
                                            <TableCell className="max-w-xs text-xs text-neutral-600 truncate" title={r.overdueReason || undefined}>
                                                {r.overdueReason || <span className="text-neutral-400">—</span>}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
