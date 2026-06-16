'use client';

// ============================================================
// OrganizationSetupBanner
// ------------------------------------------------------------
// Показывается на admin-страницах, когда у текущего пользователя
// organizationId=null (super-admin / seed-admin / legacy). Без
// организации tenant-scoped endpoints (демо, fleet, trips, …)
// возвращают «У пользователя не указана организация».
//
// После создания организации:
//   • backend выдаёт новый JWT с organizationId
//   • мы перезагружаем страницу, чтобы UI подтянул новый /auth/me
// ============================================================
import { useEffect, useState } from 'react';
import { AlertCircle, Building2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface Me {
    id: string;
    email: string;
    fullName: string;
    roles: string[];
    organizationId: string | null;
    isSuperAdmin?: boolean;
}

export function OrganizationSetupBanner() {
    const { toast } = useToast();
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [inn, setInn] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await api.get<{ success: boolean; data: Me }>('/auth/me');
                if (!cancelled) setMe((res as any).data ?? null);
            } catch {
                // silent — banner просто не покажется
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading || !me) return null;

    const hasOrg = Boolean(me.organizationId);

    // Баннер показываем ТОЛЬКО super-admin'у без организации (форма создания org).
    // Для всех, у кого организация уже есть (в т.ч. org-admin'ов), баннер скрыт:
    // самостоятельную «отвязку в super-admin» тенант-админам не предлагаем —
    // это платформенное действие, не self-service для арендатора.
    if (hasOrg) return null;

    const innValid = inn === '' || /^\d{10}$|^\d{12}$/.test(inn);
    const canSubmit = name.trim().length > 0 && innValid && !submitting;

    async function handleSubmit() {
        if (!canSubmit) return;
        setSubmitting(true);
        setError('');
        try {
            const body: Record<string, string> = { name: name.trim() };
            if (inn) body.inn = inn;
            await api.post('/auth/me/organization', body);
            toast({ variant: 'success', title: 'Организация создана' });
            // Reload to pull fresh /auth/me and unlock tenant-scoped UI.
            window.location.reload();
        } catch (err: any) {
            const msg = err?.message ?? 'Не удалось создать организацию';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            setSubmitting(false);
        }
    }

    // ---- Только super-admin без org: форма создания организации ----

    return (
        <div className="rounded-xl border border-warning-300 bg-warning-50 p-4">
            <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-warning-900 mb-1">
                        У вас не указана организация
                    </div>
                    <p className="text-sm text-warning-800 mb-3">
                        Вы вошли как super-admin без привязки к тенанту. Все данные системы
                        (рейсы, ТС, водители, демо) хранятся в разрезе организации — без неё
                        большинство функций недоступно. Создайте свою организацию ниже.
                    </p>
                    {!open ? (
                        <Button
                            variant="brand"
                            size="sm"
                            onClick={() => setOpen(true)}
                            leftIcon={<Building2 className="w-4 h-4" />}
                        >
                            Создать организацию
                        </Button>
                    ) : (
                        <div className="space-y-3 max-w-md">
                            <label className="block">
                                <span className="text-xs font-medium text-warning-900">
                                    Название организации<span className="text-brand-600"> *</span>
                                </span>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="ООО «Моя Логистика» или ИП Иванов И.И."
                                    className="mt-1 w-full rounded-md border border-warning-300 bg-white px-2.5 py-1.5 text-sm focus:border-warning-500 focus:outline-none"
                                    disabled={submitting}
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-medium text-warning-900">
                                    ИНН (опционально — 10 или 12 цифр)
                                </span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={inn}
                                    onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                                    placeholder="7701234567"
                                    className={`mt-1 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm focus:outline-none ${innValid
                                        ? 'border-warning-300 focus:border-warning-500'
                                        : 'border-danger-400 focus:border-danger-500'
                                        }`}
                                    disabled={submitting}
                                />
                                {!innValid && (
                                    <span className="text-xs text-danger-600 mt-1 block">
                                        ИНН должен содержать 10 (юр.лицо) или 12 (ИП) цифр
                                    </span>
                                )}
                                <span className="text-xs text-warning-800 mt-1 block">
                                    Если ИНН уже зарегистрирован, форма вернёт ошибку — для
                                    присоединения к существующей организации попросите её admin’а
                                    отправить вам приглашение.
                                </span>
                            </label>
                            {error && (
                                <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-md px-2.5 py-2">
                                    {error}
                                </div>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    variant="brand"
                                    size="sm"
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                    leftIcon={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                                >
                                    Создать
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => { setOpen(false); setName(''); setInn(''); setError(''); }}
                                    disabled={submitting}
                                >
                                    Отмена
                                </Button>
                            </div>
                            <p className="text-xs text-warning-800">
                                После создания вы потеряете super-admin привилегии (доступ к
                                кросс-тенант видам) и станете admin своей организации.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default OrganizationSetupBanner;
