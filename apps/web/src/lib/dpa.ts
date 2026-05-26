// ============================================================
// DPA acceptance helpers (T-5 W2).
//
// Каждый внешний провайдер (Diadoc, Wialon, Госключ, …) опционально имеет
// DPA-документ в docs/legal/dpa/, который пользователь должен принять
// до отправки своих credentials. Бэкенд хранит accepted-факт в
// dpa_acceptances и возвращает GET /dpa/:id/acceptance с полем
// `accepted: boolean`.
//
// fail-open: если DPA для провайдера не найден (404) или сетевая ошибка —
// считаем accepted=true и не блокируем подключение. На пилоте не все
// провайдеры имеют файлы; CI-проверка docs/legal/dpa/ есть в E8.
// ============================================================
import { api } from '@/lib/api';

interface DpaAcceptanceResponse {
    success: boolean;
    data?: {
        accepted: boolean;
        requiresAcceptance?: boolean;
    };
}

/**
 * Returns true if the current user has already accepted the latest DPA
 * version for the given provider, or if no DPA is required at all.
 * Returns false only when a real DPA file exists, requires acceptance,
 * and no acceptance is on record yet.
 */
export async function checkDpaAcceptance(providerName: string): Promise<boolean> {
    try {
        const res = await api.get<DpaAcceptanceResponse>(
            `/dpa/${encodeURIComponent(providerName)}/acceptance`,
        );
        return res?.data?.accepted ?? true;
    } catch {
        // 404 (no DPA file for this provider) or network error — fail-open.
        // Per E7-E8 design: not every provider has a DPA. CI check-dpa-
        // consistency.ts enforces presence for providers we mark as DPA-
        // required in the catalog; missing ones legitimately 404.
        return true;
    }
}
