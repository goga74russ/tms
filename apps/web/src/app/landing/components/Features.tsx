import { ShieldCheck, Sparkles, Smartphone, Thermometer, Database, Lock, ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Tone = 'brand' | 'success' | 'info' | 'warning' | 'danger' | 'neutral';

interface Feature {
    icon: LucideIcon;
    title: string;
    desc: string;
    tone: Tone;
    badge?: string;
}

const TONE_STYLES: Record<Tone, { circle: string; icon: string; text: string }> = {
    brand: { circle: 'bg-brand-50', icon: 'text-brand-600', text: 'text-brand-700' },
    success: { circle: 'bg-success-50', icon: 'text-success-600', text: 'text-success-700' },
    info: { circle: 'bg-info-50', icon: 'text-info-600', text: 'text-info-700' },
    warning: { circle: 'bg-warning-50', icon: 'text-warning-600', text: 'text-warning-700' },
    danger: { circle: 'bg-info-50', icon: 'text-info-600', text: 'text-info-700' },
    neutral: { circle: 'bg-neutral-100', icon: 'text-neutral-700', text: 'text-neutral-700' },
};

// Порядок и формулировки — ТЗ landing-rework §2 + claims-review колонка B.
// Приоритет под compliance-боль: ЭТрН → 1С/ЭДО → Android → Безопасность →
// Температура → ИИ-копилот. Формулировки менять только синхронно с claims-review.
const FEATURES: Feature[] = [
    {
        icon: ShieldCheck,
        title: 'ЭТрН и путевые листы',
        desc: 'Формируем XML транспортных накладных по форматам Минтранса (в рамках ПП РФ №2200 «Правила перевозок грузов»). Электронные путевые листы по составу Приказа Минтранса №390, предрейсовые тех- и медосмотры через мобильное приложение. Архив с подписями и штампами времени — в кабинете.',
        tone: 'success',
    },
    {
        icon: Database,
        title: 'Экспорт в 1С и подключение к ЭДО',
        desc: 'Экспорт документов в 1С (XML) для бухгалтерии. Маркировка «Честный знак», ОСАГО-мониторинг. Сейчас подключаем Диадок-sandbox. К 1 сентября планируем продакшн-подключение и поддержку СБИС, Калуга-Астрал, Такском.',
        tone: 'neutral',
    },
    {
        icon: Smartphone,
        title: 'Приложение водителя (Android)',
        desc: 'Маршрут, чек-лист осмотра, фотофиксация документов, подпись приёмки. Работает offline — синхронизация при появлении связи. iOS — в дорожной карте.',
        tone: 'warning',
    },
    {
        icon: Lock,
        title: 'Серверы в РФ + журнал событий',
        desc: 'Все действия пишутся в журнал для внутреннего аудита и разбора инцидентов. Серверы и данные — в РФ, 152-ФЗ. On-premise (Docker Compose) — по запросу для Enterprise.',
        tone: 'brand',
    },
    {
        icon: Thermometer,
        title: 'Контроль температуры в пути',
        desc: 'Алерты при выходе за коридор, журнал нарушений с привязкой к рейсу и водителю. Логирование с мобильного приложения и термодатчиков (интеграция в разработке).',
        tone: 'danger',
    },
    {
        icon: Sparkles,
        title: 'ИИ-копилот диспетчера (Beta)',
        desc: 'Подсказывает оптимальный маршрут, помогает заполнить документы по тексту или голосу. Не принимает решений за вас — оставляем финальный шаг человеку. Появится в Pro и Business.',
        tone: 'info',
        badge: 'Beta',
    },
];

export function Features() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <div className="max-w-2xl mb-12">
                <div className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-2">Возможности</div>
                <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight mb-3">
                    Закрывает весь операционный цикл
                </h2>
                <p className="text-neutral-600 leading-relaxed">
                    От заявки до акта — без двойного ввода и Excel-таблиц. Российские стандарты, российские интеграции,
                    российские серверы.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {FEATURES.map((f) => {
                    const Icon = f.icon;
                    const t = TONE_STYLES[f.tone];
                    return (
                        <div
                            key={f.title}
                            className="group bg-white rounded-2xl border border-neutral-200 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-neutral-300"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${t.circle}`}>
                                    <Icon className={`w-6 h-6 ${t.icon}`} />
                                </div>
                                {f.badge && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-info-700 bg-info-50 border border-info-100 px-2 py-1 rounded-full">
                                        {f.badge}
                                    </span>
                                )}
                            </div>
                            <h3 className="text-lg font-semibold text-neutral-900 mb-1.5">{f.title}</h3>
                            <p className="text-sm text-neutral-600 leading-relaxed mb-4">{f.desc}</p>
                            <div className={`inline-flex items-center gap-1 text-xs font-semibold ${t.text} opacity-0 group-hover:opacity-100 transition-opacity`}>
                                Узнать больше <ArrowUpRight className="w-3 h-3" />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
