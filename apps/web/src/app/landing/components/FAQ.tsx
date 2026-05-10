'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const QUESTIONS: Array<{ q: string; a: string }> = [
    {
        q: 'Какие операторы ЭДО поддерживаются?',
        a: 'Контур.Диадок, СБИС, Калуга Астрал, Такском. Подключение через единый адаптер — переключиться можно без перенастройки документов.',
    },
    {
        q: 'Как настроить электронную подпись?',
        a: 'Для ИП можно использовать Госключ (бесплатно). Для ООО — КриптоПро CSP с КЭП на токене. Подробная инструкция в разделе документации «Интеграции».',
    },
    {
        q: 'Что входит в бесплатный режим?',
        a: 'До 5 машин, до 50 заказов в месяц, ручной ввод данных. Доступны все основные модули: заказы, рейсы, путевые листы, осмотры, базовый биллинг. ЭДО и ИИ-копилот — только в платных тарифах.',
    },
    {
        q: 'Когда нужна реальная интеграция Wialon?',
        a: 'В бесплатном режиме можно работать без неё — координаты вводятся вручную или загружаются CSV. Live-интеграция Wialon доступна на тарифе Business: автоматический GPS-трекинг, ETA и алерты отклонения от маршрута.',
    },
    {
        q: 'Где хранятся персональные данные?',
        a: 'Все данные хранятся на серверах в РФ. Соблюдается 152-ФЗ: журнал событий, разграничение доступа, удаление по запросу субъекта. Для on-premise развёртывания данные остаются в вашем периметре.',
    },
    {
        q: 'Можно ли импортировать данные из 1С / Excel?',
        a: 'Да. Поддерживается CSV/XLSX-импорт контрагентов, водителей, ТС, заказов. Двусторонняя интеграция с 1С:Бухгалтерия по справочникам и документам — через xml/json-обмен.',
    },
    {
        q: 'Что с поддержкой?',
        a: 'Бесплатный тариф: e-mail и комьюнити. Pro: приоритетная e-mail и чат-поддержка, ответ в течение 4 рабочих часов. Business: выделенный аккаунт-менеджер и SLA 1 час.',
    },
    {
        q: 'Можно ли запустить on-premise?',
        a: 'Да — у нас есть Docker Compose-сборка для развёртывания в инфраструктуре заказчика. Условия и лицензирование — обсуждаются индивидуально (Enterprise).',
    },
];

export function FAQ() {
    const [open, setOpen] = useState<number | null>(0);

    return (
        <section className="bg-slate-50 border-y border-slate-200">
            <div className="max-w-3xl mx-auto px-6 py-20">
                <h2 className="text-3xl font-bold text-slate-900 mb-2">Частые вопросы</h2>
                <p className="text-slate-500 mb-12">Ещё что-то непонятно? Напишите на support@tms-prod.ru</p>

                <div className="space-y-3">
                    {QUESTIONS.map((item, idx) => {
                        const isOpen = open === idx;
                        return (
                            <div key={item.q} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setOpen(isOpen ? null : idx)}
                                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
                                >
                                    <span className="font-medium text-slate-900">{item.q}</span>
                                    <ChevronDown
                                        className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform ${
                                            isOpen ? 'rotate-180' : ''
                                        }`}
                                    />
                                </button>
                                {isOpen && (
                                    <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                                        {item.a}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
