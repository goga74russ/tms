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
    const isAdmin = Array.isArray(me.roles) && me.roles.includes('admin');

    // Скрываем баннер для обычных tenant-пользователей (есть org И не admin —
    // им вообще не нужно ничего менять).
    if (hasOrg && !isAdmin) return null;

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

    async function handleRevert() {
        if (!confirm('Сбросить вашу привязку к организации и вернуться в super-admin?\n\nТенант-данные не удаляются — только меняется ваша роль в системе. Вы снова сможете видеть пользователей и объекты всех тенантов.')) return;
        setSubmitting(true);
        setError('');
        try {
            await api.delete('/auth/me/organization');
            toast({ variant: 'success', title: 'Super-admin восстановлен' });
            window.location.reload();
        } catch (err: any) {
            const msg = err?.message ?? 'Не удалось отвязать организацию';
            setError(msg);
            toast({ variant: 'error', title: 'Ошибка', description: msg });
        } finally {
            setSubmitting(false);
        }
    }

    // ---- Вариант B: уже есть org и роль admin — показываем кнопку «Вернуть super-admin» ----
    if (hasOrg && isAdmin) {
        return (
            <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 mb-1">
                            Вы — admin своей организации
                        </div>
                        <p className="text-sm text-slate-700 mb-3">
                            Если нужна кросс-тенант видимость (видеть пользователей и объекты всех
                            тенантов), можно отвязать организацию и вернуться в super-admin.
                            Тенант-данные не удаляются.
                        </p>
                        {error && (
                            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-2 mb-3">
                                {error}
                            </div>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRevert}
                            disabled={submitting}
                            leftIcon={submitting
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Building2 className="w-4 h-4" />}
                        >
                            Отвязать организацию и вернуть super-admin
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // ---- Вариант A: нет org — показываем форму создания (как было) ----

    return (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-amber-900 mb-1">
                        У вас не указана организация
                    </div>
                    <p className="text-sm text-amber-800 mb-3">
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
                                <span className="text-xs font-medium text-amber-900">
                                    Название организации<span className="text-rose-600"> *</span>
                                </span>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="ООО «Моя Логистика» или ИП Иванов И.И."
                                    className="mt-1 w-full rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
                                    disabled={submitting}
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-medium text-amber-900">
                                    ИНН (опционально — 10 или 12 цифр)
                                </span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={inn}
                                    onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                                    placeholder="7701234567"
                                    className={`mt-1 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm focus:outline-none ${innValid
                                        ? 'border-amber-300 focus:border-amber-500'
                                        : 'border-rose-400 focus:border-rose-500'
                                        }`}
                                    disabled={submitting}
                                />
                                {!innValid && (
                                    <span className="text-xs text-rose-600 mt-1 block">
                                        ИНН должен содержать 10 (юр.лицо) или 12 (ИП) цифр
                                    </span>
                                )}
                                <span className="text-xs text-amber-700 mt-1 block">
                                    Если ИНН совпадёт с существующей организацией, вы будете
                                    добавлены в неё, а не создана новая.
                                </span>
                            </label>
                            {error && (
                                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-2">
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
                            <p className="text-xs text-amber-700">
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
