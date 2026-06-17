'use client';

// ============================================================
// /driver-app — экран для роли «водитель» в веб-версии.
// Веб-кабинет водителю не нужен: вся работа (рейсы, маршруты,
// документы, подпись) — в мобильном приложении. Сюда «чистого»
// водителя направляет pickRouteForRoles (lib/routing.ts).
//
// APK раздаётся через MinIO: nginx `location /storage/` → бакет tms.
// Бакет приватный (presigned), поэтому APK кладётся в ОТДЕЛЬНЫЙ префикс
// `public/`, открытый на anonymous-download ТОЛЬКО для этого префикса
// (`mc anonymous set download local/tms/public`). Объект: public/tms-driver.apk
// → доступен по /storage/public/tms-driver.apk. Документы (uploads/) остаются
// приватными. QR кодирует абсолютный URL, чтобы открыться камерой телефона.
// ============================================================
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Download, LogOut } from 'lucide-react';
import { api } from '@/lib/api';

const APK_PATH = '/storage/public/tms-driver.apk';

export default function DriverAppPage() {
    const router = useRouter();
    const [apkUrl, setApkUrl] = useState(APK_PATH);

    useEffect(() => {
        // QR должен содержать абсолютный URL, иначе на телефоне не откроется.
        setApkUrl(`${window.location.origin}${APK_PATH}`);
    }, []);

    async function handleLogout() {
        try {
            await api.post('/auth/logout', {});
        } catch {
            // выходим в любом случае
        }
        router.push('/login');
    }

    return (
        <main className="min-h-screen bg-brand-800 text-white flex flex-col items-center justify-center px-6 py-12">
            <div className="w-full max-w-md text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-500/15 ring-1 ring-accent-500/30">
                    <Smartphone className="h-8 w-8 text-accent-400" />
                </div>

                <h1 className="text-2xl font-bold mb-3">Кабинет водителя — в приложении</h1>
                <p className="text-brand-100/90 mb-8 leading-relaxed">
                    Веб-версия для водителей не используется. Рейсы, маршруты, документы
                    и подписи — в мобильном приложении «ТрансПульт.Водитель».
                </p>

                <div className="mx-auto mb-4 inline-flex rounded-2xl bg-white p-4 shadow-lg">
                    <QRCodeSVG value={apkUrl} size={180} level="M" />
                </div>
                <p className="text-sm text-brand-100/70 mb-6">
                    Отсканируйте QR камерой телефона — откроется ссылка на установку.
                </p>

                <a
                    href={APK_PATH}
                    className="inline-flex items-center gap-2 bg-accent-500 text-white font-semibold px-6 py-3 rounded-xl shadow-lg shadow-accent-500/25 hover:bg-accent-600 transition-colors"
                >
                    <Download className="h-4 w-4" />
                    Скачать приложение (Android)
                </a>
                <p className="mt-3 text-xs text-brand-100/60">
                    После загрузки откройте APK и разрешите установку из этого источника.
                </p>

                <div className="mt-8 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-brand-100/70">
                    Версия для iPhone готовится.
                </div>

                <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-8 inline-flex items-center gap-1.5 text-sm text-brand-100/60 hover:text-white transition-colors"
                >
                    <LogOut className="h-4 w-4" />
                    Выйти
                </button>
            </div>
        </main>
    );
}
