'use client';

// Публичная страница «Связаться» — лид-форма с лендинга.
// Отправляет POST /api/public/contact (без авторизации). Founder смотрит лиды
// в /admin/contacts.
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Phone, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

const FLEET_OPTIONS = [
    { value: '', label: 'Размер парка (необязательно)' },
    { value: '1-5', label: '1–5 машин' },
    { value: '5-15', label: '5–15 машин' },
    { value: '15-30', label: '15–30 машин' },
    { value: '30+', label: 'больше 30 машин' },
];

const fieldClass =
    'h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400';

export default function ContactsPage() {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [fleetSize, setFleetSize] = useState('');
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (name.trim().length < 1 || phone.trim().length < 3) {
            setError('Заполните имя и телефон');
            return;
        }
        try {
            setSubmitting(true);
            await api.post('/public/contact', {
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim() || undefined,
                fleetSize: fleetSize || undefined,
                comment: comment.trim() || undefined,
            });
            setDone(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось отправить. Попробуйте ещё раз или позвоните нам.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-[100dvh] bg-neutral-50 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-lg">
                <Link href="/landing" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 mb-5">
                    <ArrowLeft className="w-4 h-4" /> На главную
                </Link>

                <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 sm:p-8">
                    {done ? (
                        <div className="text-center py-6">
                            <div className="mx-auto w-12 h-12 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-6 h-6" />
                            </div>
                            <h1 className="text-xl font-semibold text-neutral-900">Заявка отправлена</h1>
                            <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                                Спасибо! Мы свяжемся с вами по указанному телефону в ближайшее время.
                            </p>
                            <Link href="/landing" className="inline-block mt-6 text-sm text-brand-600 hover:text-brand-700 underline">
                                Вернуться на главную
                            </Link>
                        </div>
                    ) : (
                        <>
                            <h1 className="text-2xl font-semibold text-neutral-900">Связаться с нами</h1>
                            <p className="text-sm text-neutral-600 mt-1.5 leading-relaxed">
                                Оставьте контакты — расскажем про ЭТрН-2026, покажем продукт и поможем подключиться. Перезвоним сами.
                            </p>

                            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                                <Input
                                    label="Ваше имя *"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Иван Петров"
                                    autoComplete="name"
                                    maxLength={200}
                                />
                                <Input
                                    label="Телефон *"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="+7 900 000-00-00"
                                    type="tel"
                                    autoComplete="tel"
                                    maxLength={50}
                                />
                                <Input
                                    label="E-mail"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@company.ru"
                                    type="email"
                                    autoComplete="email"
                                    maxLength={255}
                                />
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">Размер парка</label>
                                    <select
                                        value={fleetSize}
                                        onChange={(e) => setFleetSize(e.target.value)}
                                        className={fieldClass}
                                    >
                                        {FLEET_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-700 mb-1.5">Комментарий</label>
                                    <textarea
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder="Что хотите узнать или с чем помочь?"
                                        rows={3}
                                        maxLength={2000}
                                        className={`${fieldClass} h-auto py-2 resize-y leading-relaxed`}
                                    />
                                </div>

                                {error && (
                                    <div className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-3 py-2">
                                        {error}
                                    </div>
                                )}

                                <Button type="submit" variant="brand" fullWidth isLoading={submitting} rightIcon={<Send className="w-4 h-4" />}>
                                    Отправить заявку
                                </Button>
                            </form>

                            <div className="mt-6 pt-5 border-t border-neutral-200 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-500">
                                <a href="tel:+79193246582" className="inline-flex items-center gap-1.5 hover:text-neutral-900">
                                    <Phone className="w-3.5 h-3.5" /> +7 919 324-65-82
                                </a>
                                <a href="https://t.me/BardinGD" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-neutral-900">
                                    <Send className="w-3.5 h-3.5" /> @BardinGD
                                </a>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
