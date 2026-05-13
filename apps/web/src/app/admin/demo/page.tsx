'use client';

// ============================================================
// Round 3B — D8: Demo data generator UI
// ============================================================
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
    Sparkles, Trash2, CheckCircle2, AlertCircle, Info,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

interface GenerateResult {
    contractorIds: string[];
    contractIds: string[];
    tariffIds: string[];
    vehicleIds: string[];
    trailerIds: string[];
    driverIds: string[];
    tripIds: string[];
    orderIds: string[];
    alreadyExisted: boolean;
}

interface CleanupResult {
    deleted: Record<string, number>;
}

export default function AdminDemoPage() {
    const { toast } = useToast();
    const [busy, setBusy] = useState<'generate' | 'cleanup' | null>(null);
    const [progress, setProgress] = useState(0);
    const [generated, setGenerated] = useState<GenerateResult | null>(null);
    const [cleanup, setCleanup] = useState<CleanupResult | null>(null);
    const [error, setError] = useState('');
    const [confirmAction, setConfirmAction] = useState<null | { run: () => Promise<void> | void; title: string; description?: string; destructive?: boolean; confirmLabel?: string }>(null);

    async function handleGenerate() {
        setBusy('generate');
        setError('');
        setCleanup(null);
        setGenerated(null);
        // Simple visual progress while we wait for the request
        setProgress(10);
        const interval = setInterval(() => {
            setProgress((p) => Math.min(90, p + 7));
        }, 250);
        try {
            const res = await api.post<{ success: boolean; data: GenerateResult }>('/demo/generate');
            setProgress(100);
            setGenerated(res.data);
            toast({ variant: 'success', title: res.data.alreadyExisted ? 'Демо уже создано' : 'Демо-данные созданы' });
        } catch (err: any) {
            const msg = err?.message ?? 'Не удалось создать демо-данные';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            clearInterval(interval);
            setTimeout(() => {
                setProgress(0);
                setBusy(null);
            }, 400);
        }
    }

    async function handleCleanup() {
        setConfirmAction({
            run: async () => {
                setBusy('cleanup');
                setError('');
                setGenerated(null);
                setCleanup(null);
                try {
                    const res = await api.delete<{ success: boolean; data: CleanupResult }>('/demo/cleanup');
                    setCleanup(res.data);
                    toast({ variant: 'success', title: 'Демо удалено' });
                } catch (err: any) {
                    const msg = err?.message ?? 'Не удалось удалить демо-данные';
                    setError(msg);
                    toast({ variant: 'error', title: 'Ошибка', description: msg });
                } finally {
                    setBusy(null);
                }
            },
            title: 'Удалить все демо-данные?',
            description: 'Будут удалены все объекты с пометкой [ДЕМО] в рамках вашей организации.',
            destructive: true,
            confirmLabel: 'Удалить',
        });
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Sparkles}
                iconTone="brand"
                title="Демо-данные"
                description="Минимальный набор данных для знакомства с системой: 1 контрагент, 2 ТС, 2 водителя, завершённый и активный рейсы, заявка с холодильной цепью."
            />

            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800 flex gap-3">
                <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-medium mb-1">Безопасно для пробы.</p>
                    <p>Все объекты создаются с пометкой <code className="px-1 py-0.5 rounded bg-blue-100 text-xs font-mono">[ДЕМО]</code> — их можно удалить одной кнопкой. Реальные данные не затрагиваются.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Sparkles className="w-5 h-5 text-indigo-600" />
                            Создать демо-данные
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <ul className="text-sm text-neutral-600 space-y-1 list-disc pl-5">
                            <li>1 контрагент с договором и тарифом 25 ₽/км</li>
                            <li>2 ТС (тент + рефрижератор) и 1 прицеп</li>
                            <li>2 водителя с действующими ВУ</li>
                            <li>Завершённый рейс Москва → Тверь</li>
                            <li>Активный рейс на маршруте Москва → СПб</li>
                            <li>Заявка с требованием холодильной цепи</li>
                        </ul>
                        <Button
                            onClick={handleGenerate}
                            variant="brand"
                            fullWidth
                            isLoading={busy === 'generate'}
                            disabled={busy !== null && busy !== 'generate'}
                            leftIcon={<Sparkles className="w-4 h-4" />}
                        >
                            Создать демо-данные
                        </Button>
                        {busy === 'generate' && progress > 0 && (
                            <div className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden">
                                <div
                                    className="bg-indigo-500 h-2 transition-all duration-200"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Trash2 className="w-5 h-5 text-rose-600" />
                            Очистить демо
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-neutral-600">
                            Удалит все объекты с пометкой <code className="px-1 py-0.5 rounded bg-neutral-100 text-xs font-mono">[ДЕМО]</code> в рамках вашей организации.
                        </p>
                        <Button
                            onClick={handleCleanup}
                            variant="destructive"
                            fullWidth
                            isLoading={busy === 'cleanup'}
                            disabled={busy !== null && busy !== 'cleanup'}
                            leftIcon={<Trash2 className="w-4 h-4" />}
                        >
                            Удалить демо
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {error && (
                <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
                </div>
            )}

            {generated && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
                            <CheckCircle2 className="w-5 h-5" />
                            {generated.alreadyExisted ? 'Демо-данные уже существуют' : 'Демо-данные созданы'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <SummaryItem label="Контрагенты" count={generated.contractorIds.length} href="/contractors" />
                            <SummaryItem label="ТС" count={generated.vehicleIds.length} href="/fleet/vehicles" />
                            <SummaryItem label="Водители" count={generated.driverIds.length} href="/fleet/drivers" />
                            <SummaryItem label="Прицепы" count={generated.trailerIds.length} href="/fleet/trailers" />
                            <SummaryItem label="Заявки" count={generated.orderIds.length} href="/orders" />
                            <SummaryItem label="Рейсы" count={generated.tripIds.length} href="/trips" />
                            <SummaryItem label="Договоры" count={generated.contractIds.length} href="/contracts" />
                            <SummaryItem label="Тарифы" count={generated.tariffIds.length} href="/tariffs" />
                        </div>
                        <div className="mt-4 flex gap-2 flex-wrap">
                            <Link href="/dispatcher" className="text-sm text-indigo-600 hover:underline">Открыть диспетчерскую →</Link>
                            <Link href="/analytics" className="text-sm text-indigo-600 hover:underline">Открыть аналитику →</Link>
                        </div>
                    </CardContent>
                </Card>
            )}

            {cleanup && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
                            <CheckCircle2 className="w-5 h-5" />
                            Удалено
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {Object.entries(cleanup.deleted).map(([k, v]) => (
                                <div key={k} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
                                    <div className="text-xs text-neutral-500">{k}</div>
                                    <div className="text-lg font-semibold text-neutral-900">{v}</div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <ConfirmDialog
                open={!!confirmAction}
                onClose={() => setConfirmAction(null)}
                onConfirm={async () => { await confirmAction?.run(); setConfirmAction(null); }}
                title={confirmAction?.title ?? ''}
                description={confirmAction?.description}
                destructive={confirmAction?.destructive}
                confirmLabel={confirmAction?.confirmLabel}
            />
        </div>
    );
}

function SummaryItem({ label, count, href }: { label: string; count: number; href: string }) {
    return (
        <a
            href={href}
            className="block rounded-lg border border-neutral-200 bg-white px-3 py-2 hover:border-indigo-400 hover:shadow-sm transition-all"
        >
            <div className="text-xs text-neutral-500">{label}</div>
            <div className="text-lg font-semibold text-neutral-900">{count}</div>
        </a>
    );
}
