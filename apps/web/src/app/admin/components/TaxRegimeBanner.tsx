'use client';

// ============================================================
// J1.5 — Banner про tax_regime=unspecified.
//
// Юр-обоснование: пока режим не выбран — функционал выпуска СФ
// заблокирован (см. invoice-spec.md). Banner ведёт админа в
// /admin/settings, где он явно выбирает режим.
//
// Скрыт:
//   - для super-admin (organizationId null) — у них нет своей org
//   - если режим уже задан (taxRegime !== 'unspecified')
//   - для не-admin ролей (они не могут менять режим всё равно)
// ============================================================
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useUser } from '@/lib/user-context';

export function TaxRegimeBanner() {
    const { user, loading } = useUser();

    if (loading || !user) return null;
    if (user.isSuperAdmin) return null;
    if (!user.organization) return null;
    if (user.organization.taxRegime !== 'unspecified') return null;
    if (!user.roles.includes('admin')) return null;

    return (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-amber-900">
                    Заполните налоговый режим организации
                </div>
                <div className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                    Выпуск счетов и счетов-фактур заблокирован до явного выбора режима
                    (ОСНО / УСН / АУСН / Патент / НПД). От этого зависит логика НДС.
                </div>
            </div>
            <Link
                href="/admin/settings#tax-regime"
                className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
                Выбрать режим
                <ArrowRight className="w-3.5 h-3.5" />
            </Link>
        </div>
    );
}
