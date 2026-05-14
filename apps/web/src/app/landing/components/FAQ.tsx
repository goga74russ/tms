'use client';

import { useState } from 'react';
import { ChevronDown, Mail } from 'lucide-react';

const QUESTIONS: Array<{ q: string; a: string }> = [
    {
        q: 'Какие операторы ЭДО поддерживаются?',
        a: 'Контур.Диадок, СБИС, Калуга Астрал, Такском. Подключение через единый адаптер — переключиться можно без перенастройки документов.',
    },
    {
        q: 'Как настроить электронную подпись?',
        a: 'Для ИП — Госключ (бесплатно). Для ООО — КриптоПро CSP с КЭП на токене или Контур.Подпись / СБИС.Подпись. Пошаговая инструкция в разделе «Интеграции» документации.',
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
        a: 'Все данные хранятся на серверах в РФ. Соблюдается 152-ФЗ: журнал событий, разграничение доступа, удаление по запросу субъекта. Для on-premise развёртывания данные остаются в вашем периметре — у нас есть Docker Compose-сборка.',
    },
    {
        q: 'Можно ли импортировать данные из 1С / Excel?',
        a: 'Да. Поддерживается CSV/XLSX-импорт контрагентов, водителей, ТС, заказов. Двусторонняя интеграция с 1С:Бухгалтерия по справочникам и документам — через xml/json-обмен.',
    },
    {
        q: 'Сколько стоит сверх тарифа?',
        a: 'Тариф включает указанное число машин и заказов. Сверх лимита — фиксированная цена за каждую дополнительную машину или 100 заказов. Без скрытых платежей: всё видно в кабинете биллинга в реальном времени.',
    },
    {
        q: 'Какой формат договора и есть ли НДС?',
        a: 'С юрлицами и ИП работаем по публичной оферте + счёту. Возможна закрывающая документация: счёт-фактура, акт. НДС не включён в цены (УСН). Возврат — в течение 14 дней с даты оплаты при отсутствии активного использования.',
    },
    {
        q: 'Что с поддержкой и часами работы?',
        a: 'Бесплатный тариф: e-mail и комьюнити, 1 рабочий день. Pro: приоритетная e-mail и чат-поддержка, ответ в течение 4 рабочих часов. Business: выделенный аккаунт-менеджер и SLA 1 час, 24/7 для критичных инцидентов.',
    },
    {
        q: 'Можно ли запустить on-premise?',
        a: 'Да — у нас есть Docker Compose-сборка для развёртывания в инфраструктуре заказчика. Условия и лицензирование — обсуждаются индивидуально (Enterprise).',
    },
    {
        q: 'Подойдёт ли для перевозок продуктов с режимом температуры?',
        a: 'Да. Контроль температуры — нативная функция: контроль температуры в пути, алерты при выходе за коридор, журнал нарушений с привязкой к рейсу и водителю. Логирование с мобильного приложения и интеграция с термодатчиками.',
    },
    {
        q: 'А что насчёт стройки — КС-2, КС-3?',
        a: 'Да, на тарифе Business. Формы КС-2 (акт о приёмке выполненных работ) и КС-3 (справка о стоимости) генерируются автоматически по выполненным рейсам и расценкам контрагентов. Выгрузка в 1С — в один клик.',
    },
];

export function FAQ() {
    const [open, setOpen] = useState<number | null>(0);

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="text-center mb-10">
                <div className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-2">FAQ</div>
                <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight mb-3">
                    Частые вопросы
                </h2>
                <p className="text-neutral-600 leading-relaxed">
                    Не нашли ответа? Напишите нам — отвечаем в рабочие часы за пару часов.
                </p>
            </div>

            <div className="space-y-2">
                {QUESTIONS.map((item, idx) => {
                    const isOpen = open === idx;
                    return (
                        <div
                            key={item.q}
                            className={`bg-white rounded-xl border overflow-hidden transition-all ${
                                isOpen ? 'border-brand-200 shadow-sm' : 'border-neutral-200'
                            }`}
                        >
                            <button
                                type="button"
                                aria-expanded={isOpen}
                                onClick={() => setOpen(isOpen ? null : idx)}
                                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-neutral-50/60"
                            >
                                <span className="font-medium text-neutral-900">{item.q}</span>
                                <ChevronDown
                                    className={`w-4 h-4 text-neutral-500 flex-shrink-0 transition-transform duration-200 ${
                                        isOpen ? 'rotate-180 text-brand-600' : ''
                                    }`}
                                />
                            </button>
                            <div
                                className={`grid transition-all duration-200 ease-out ${
                                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                                }`}
                            >
                                <div className="overflow-hidden">
                                    <div className="px-5 pb-5 text-sm text-neutral-600 leading-relaxed border-t border-neutral-100 pt-3">
                                        {item.a}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-10 bg-white rounded-2xl border border-neutral-200 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-brand-600" />
                </div>
                <div className="flex-1">
                    <div className="font-semibold text-neutral-900">Остались вопросы?</div>
                    <div className="text-sm text-neutral-600 mt-0.5">
                        Напишите на{' '}
                        <a href="mailto:support@transpult.ru" className="text-brand-600 font-semibold underline">
                            support@transpult.ru
                        </a>{' '}
                        — ответим в течение рабочего дня.
                    </div>
                </div>
            </div>
        </div>
    );
}
