'use client';

// M-16 FIX: Global Error Boundary for unhandled render errors
import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Unhandled error:', error);
    }, [error]);

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-4 max-w-md">
                <div className="text-6xl">⚠️</div>
                <h2 className="text-2xl font-bold text-slate-900">Что-то пошло не так</h2>
                <p className="text-slate-500">
                    Произошла непредвиденная ошибка. Попробуйте обновить страницу.
                </p>
                {error.digest && (
                    <p className="text-xs text-slate-400 font-mono">ID: {error.digest}</p>
                )}
                <button
                    onClick={reset}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    Попробовать снова
                </button>
            </div>
        </div>
    );
}
