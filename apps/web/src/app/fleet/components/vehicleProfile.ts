export interface VehicleProfile {
    classLabel: string;
    bodyLabel: string;
    displayLabel: string;
}

export interface VehicleWaybillCue {
    tone: 'ready' | 'attention' | 'warning';
    title: string;
    description: string;
    markers: string[];
    requirements: string[];
    warnings: string[];
    impactLabel: string;
    modeLabel: string;
    profileLabel: string;
}

export interface VehicleWaybillReadinessItem {
    key: string;
    label: string;
    state: 'done' | 'warn' | 'blocked' | 'optional';
    hint: string;
}

export const VEHICLE_BODY_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'седан', label: 'Легковой / седан' },
    { value: 'универсал', label: 'Легковой / универсал' },
    { value: 'кроссовер', label: 'Легковой / кроссовер' },
    { value: 'минивэн', label: 'Легковой / минивэн' },
    { value: 'тент', label: 'Грузовой / тент' },
    { value: 'борт', label: 'Грузовой / борт' },
    { value: 'фургон', label: 'Грузовой / фургон' },
    { value: 'рефрижератор', label: 'Грузовой / рефрижератор' },
    { value: 'цистерна', label: 'Грузовой / цистерна' },
    { value: 'контейнеровоз', label: 'Грузовой / контейнеровоз' },
    { value: 'самосвал', label: 'Грузовой / самосвал' },
    { value: 'эвакуатор', label: 'Спецтехника / эвакуатор' },
    { value: 'манипулятор', label: 'Спецтехника / манипулятор' },
    { value: 'кран', label: 'Спецтехника / кран' },
    { value: 'полуприцеп', label: 'Прицеп / полуприцеп' },
    { value: 'other', label: 'Другое / иной кузов' },
];

function titleCase(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function repairLegacyText(value: string) {
    const normalized = value.trim();
    const legacyMap: Record<string, string> = {
        'тент': 'тент',
        'борт': 'борт',
        'рефрижератор': 'рефрижератор',
        'фургон': 'фургон',
        'цистерна': 'цистерна',
        'контейнеровоз': 'контейнеровоз',
        'самосвал': 'самосвал',
        'седан': 'седан',
        'универсал': 'универсал',
        'кроссовер': 'кроссовер',
        'минивэн': 'минивэн',
        'спецтехника': 'спецтехника',
        'эвакуатор': 'эвакуатор',
        'манипулятор': 'манипулятор',
        'кран': 'кран',
        'полуприцеп': 'полуприцеп',
        'other': 'other',
    };

    return legacyMap[normalized] || normalized;
}

function normalizeClassLabel(value: string) {
    const lower = repairLegacyText(value).trim().toLowerCase();
    if (!lower) return 'Грузовой';
    if (lower === 'other' || lower.includes('другое')) {
        return 'Другое';
    }

    if (lower.includes('легк') || lower.includes('sedan') || lower.includes('седан') || lower.includes('универсал') || lower.includes('кроссовер') || lower.includes('минивэн')) {
        return 'Легковой';
    }
    if (lower.includes('спец') || lower.includes('эвакуатор') || lower.includes('манипулятор') || lower.includes('кран') || lower.includes('погрузчик')) {
        return 'Спецтехника';
    }
    if (lower.includes('прицеп') || lower.includes('полуприцеп')) {
        return 'Прицеп';
    }
    return 'Грузовой';
}

function normalizeBodyLabel(value: string) {
    const normalized = repairLegacyText(value).trim();
    if (!normalized) return '—';
    if (normalized.toLowerCase() === 'other') return 'Иной кузов';
    if (normalized.toLowerCase().includes('другое')) return 'Иной кузов';
    return titleCase(normalized);
}

function buildWaybillProfileMeta(
    profile: VehicleProfile,
    options?: {
        trailerPlate?: string | null;
        isBlocked?: boolean;
        hasBodyTypeHint?: boolean;
    },
) {
    const hasTrailer = Boolean(options?.trailerPlate);
    const isLight = profile.classLabel === 'Легковой';
    const isSpecial = profile.classLabel === 'Спецтехника';

    if (options?.isBlocked) {
        return {
            requirements: ['снять блокировку', 'проверить причину', 'сверить допуск'],
            warnings: ['Блокировка останавливает выпуск ПЛ'],
            impactLabel: 'Пока ТС заблокировано, профиль ПЛ нельзя считать готовым.',
        };
    }

    if (!profile.bodyLabel || profile.bodyLabel === '—') {
        return {
            requirements: ['заполнить вид ТС', 'проверить форму ПЛ', 'сверить водителя и осмотры'],
            warnings: ['Без вида ТС ПЛ остаётся общим профилем'],
            impactLabel: 'Вид ТС определяет форму ПЛ, обязательные поля и readiness-check.',
        };
    }

    if (isSpecial) {
        return {
            requirements: ['проверить допуск спецтехники', 'сверить назначение рейса', 'проверить состав рейса'],
            warnings: ['Спецтехника требует ручной проверки перед выпуском'],
            impactLabel: 'Для спецтехники ПЛ зависит от допуска, назначения рейса и состава.',
        };
    }

    if (isLight) {
        if (hasTrailer) {
            return {
                requirements: ['сверить прицеп', 'проверить автопоезд', 'проверить водителя'],
                warnings: ['Легковой профиль с прицепом лучше отмечать как автопоезд'],
                impactLabel: 'Легковой ПЛ остаётся стандартным, но при прицепе нужен отдельный контроль состава.',
            };
        }

        return {
            requirements: ['проверить водителя', 'проверить осмотры', 'сверить форму ПЛ'],
            warnings: ['Для легкового ПЛ важно не терять связку с водителем'],
            impactLabel: 'Легковой профиль ведёт стандартную форму ПЛ и завязан на водителя.',
        };
    }

    if (hasTrailer) {
        return {
            requirements: ['сверить прицеп', 'проверить автопоезд', 'проверить водителя'],
            warnings: ['Автопоезд нужно показывать как состав, а не как одиночное ТС'],
            impactLabel: 'Грузовой ПЛ должен явно видеть состав автопоезда.',
        };
    }

    return {
        requirements: ['проверить водителя', 'проверить осмотры', 'сверить кузов'],
        warnings: ['Грузовой профиль зависит от типа кузова и назначения рейса'],
        impactLabel: 'Грузовой ПЛ показывает тип кузова, водителя и осмотры как базовые обязательности.',
    };
}

export function getVehicleProfile(bodyType?: string | null, payloadCapacityKg?: number | null): VehicleProfile {
    const raw = repairLegacyText(bodyType || '').trim();
    if (!raw) {
        const classLabel = payloadCapacityKg && payloadCapacityKg <= 1500 ? 'Легковой' : 'Грузовой';
        return {
            classLabel,
            bodyLabel: '—',
            displayLabel: `${classLabel} / —`,
        };
    }

    if (raw.includes('/')) {
        const [classPart, bodyPart] = raw.split('/').map(part => part.trim()).filter(Boolean);
        const classLabel = normalizeClassLabel(classPart || raw);
        const bodyLabel = normalizeBodyLabel(bodyPart || '');
        return {
            classLabel,
            bodyLabel,
            displayLabel: `${classLabel} / ${bodyLabel}`,
        };
    }

    const bodyLabel = normalizeBodyLabel(raw);
    const classLabel = normalizeClassLabel(raw);

    if (classLabel === 'Грузовой' && payloadCapacityKg && payloadCapacityKg <= 1500) {
        return {
            classLabel: 'Легковой',
            bodyLabel,
            displayLabel: `Легковой / ${bodyLabel}`,
        };
    }

    return {
        classLabel,
        bodyLabel,
        displayLabel: `${classLabel} / ${bodyLabel}`,
    };
}

export function getVehicleWaybillCue(
    bodyType?: string | null,
    payloadCapacityKg?: number | null,
    options?: {
        trailerPlate?: string | null;
        isBlocked?: boolean;
        hasBodyTypeHint?: boolean;
    },
): VehicleWaybillCue {
    const profile = getVehicleProfile(bodyType, payloadCapacityKg);
    const markers: string[] = [`ПЛ: ${profile.displayLabel}`];
    const profileMeta = buildWaybillProfileMeta(profile, options);

    if (options?.trailerPlate) {
        markers.push(`Прицеп: ${options.trailerPlate}`);
    }

    if (options?.isBlocked) {
        return {
            tone: 'warning',
            title: 'ТС заблокировано',
            description: 'Для ПЛ лучше снять блокировку или проверить основания перед выпуском.',
            markers: [...markers, 'Нужна проверка выпуска'],
            requirements: profileMeta.requirements,
            warnings: profileMeta.warnings,
            impactLabel: profileMeta.impactLabel,
            modeLabel: 'Режим: блокировка',
            profileLabel: `ПЛ: ${profile.displayLabel}`,
        };
    }

    if (!bodyType) {
        return {
            tone: 'attention',
            title: 'Тип ТС для ПЛ не задан',
            description: 'Без вида ТС система показывает общий профиль, но форма ПЛ менее точная.',
            markers: ['Нужно заполнить вид ТС', ...markers],
            requirements: profileMeta.requirements,
            warnings: profileMeta.warnings,
            impactLabel: profileMeta.impactLabel,
            modeLabel: 'Режим: не определён',
            profileLabel: 'ПЛ: общий профиль',
        };
    }

    const isLight = profile.classLabel === 'Легковой';
    const isSpecial = profile.classLabel === 'Спецтехника';
    const hasTrailer = Boolean(options?.trailerPlate);

    if (isSpecial) {
        return {
            tone: 'attention',
            title: 'Спецтехника требует отдельного внимания',
            description: 'На ПЛ важнее сверять допуск, назначение рейса и состав автопоезда.',
            markers: [...markers, 'Допуск и состав рейса'],
            requirements: profileMeta.requirements,
            warnings: profileMeta.warnings,
            impactLabel: profileMeta.impactLabel,
            modeLabel: 'Режим: спецтехника',
            profileLabel: `ПЛ: ${profile.displayLabel}`,
        };
    }

    if (isLight) {
        return {
            tone: hasTrailer ? 'attention' : 'ready',
            title: hasTrailer ? 'Легковой профиль с прицепом' : 'Легковой профиль ПЛ готов',
            description: hasTrailer
                ? 'Проверьте, что прицеп действительно участвует в рейсе.'
                : 'Профиль подходит для стандартной формы путевого листа.',
            markers: hasTrailer ? [...markers, 'Проверьте автопоезд'] : [...markers, 'Стандартный ПЛ'],
            requirements: profileMeta.requirements,
            warnings: profileMeta.warnings,
            impactLabel: profileMeta.impactLabel,
            modeLabel: hasTrailer ? 'Режим: легковой + прицеп' : 'Режим: легковой',
            profileLabel: hasTrailer ? `ПЛ: ${profile.displayLabel} + прицеп` : `ПЛ: ${profile.displayLabel}`,
        };
    }

    return {
        tone: hasTrailer ? 'ready' : 'attention',
        title: hasTrailer ? 'Грузовой профиль с прицепом' : 'Грузовой профиль ПЛ готов',
        description: hasTrailer
            ? 'Путевой лист уже видит состав автопоезда и его можно показывать на выпуске.'
            : 'Для грузового ТС важно сразу видеть форму ПЛ и тип кузова.',
        markers: hasTrailer ? [...markers, 'Автопоезд сформирован'] : [...markers, 'Грузовой ПЛ'],
        requirements: profileMeta.requirements,
        warnings: profileMeta.warnings,
        impactLabel: profileMeta.impactLabel,
        modeLabel: hasTrailer ? 'Режим: грузовой + прицеп' : 'Режим: грузовой',
        profileLabel: hasTrailer ? `ПЛ: ${profile.displayLabel} + прицеп` : `ПЛ: ${profile.displayLabel}`,
    };
}

export function getVehicleWaybillReadiness(input: {
    bodyType?: string | null;
    payloadCapacityKg?: number | null;
    trailerPlate?: string | null;
    isBlocked?: boolean;
    hasDriver?: boolean;
    hasMechanicSignature?: boolean;
    hasMedicSignature?: boolean;
    hasWaybill?: boolean;
    hasOrders?: boolean;
    hasDossier?: boolean;
}): {
    title: string;
    tone: 'ready' | 'attention' | 'warning';
    doneCount: number;
    totalCount: number;
    items: VehicleWaybillReadinessItem[];
} {
    const cue = getVehicleWaybillCue(input.bodyType, input.payloadCapacityKg, {
        trailerPlate: input.trailerPlate || null,
        isBlocked: input.isBlocked,
    });

    const items: VehicleWaybillReadinessItem[] = [
        {
            key: 'profile',
            label: 'Тип ТС для ПЛ',
            state: input.bodyType ? 'done' : 'warn',
            hint: input.bodyType ? cue.profileLabel : 'Нужно заполнить вид ТС, чтобы профиль ПЛ был точнее.',
        },
        {
            key: 'driver',
            label: 'Водитель',
            state: input.hasDriver === undefined ? 'optional' : (input.hasDriver ? 'done' : 'warn'),
            hint: input.hasDriver === undefined
                ? 'Водитель не указан в контексте карточки.'
                : (input.hasDriver ? 'Водитель привязан к ПЛ.' : 'Для выпуска ПЛ лучше явно выбрать водителя.'),
        },
        {
            key: 'inspection',
            label: 'Осмотры',
            state: input.hasMechanicSignature === undefined && input.hasMedicSignature === undefined
                ? 'optional'
                : (input.hasMechanicSignature && input.hasMedicSignature ? 'done' : 'warn'),
            hint: input.hasMechanicSignature === undefined && input.hasMedicSignature === undefined
                ? 'Данные осмотров не подгружены в этом контексте.'
                : (input.hasMechanicSignature && input.hasMedicSignature
                    ? 'Тех- и медосмотр отмечены.'
                    : 'Проверьте отметки тех/медосмотра перед выпуском.'),
        },
        {
            key: 'waybill',
            label: 'ПЛ оформлен',
            state: input.hasWaybill === undefined ? 'optional' : (input.hasWaybill ? 'done' : 'warn'),
            hint: input.hasWaybill === undefined
                ? 'Статус ПЛ в этом контексте не передан.'
                : (input.hasWaybill ? 'Путевой лист уже сформирован.' : 'Путевой лист еще не сформирован.'),
        },
        {
            key: 'dossier',
            label: 'Досье рейса',
            state: input.hasDossier === undefined ? 'optional' : (input.hasDossier ? 'done' : 'optional'),
            hint: input.hasDossier ? 'Досье рейса доступно и можно открыть.' : 'Досье рейса пока не раскрыто в данных.',
        },
        {
            key: 'orders',
            label: 'Заявки в рейсе',
            state: input.hasOrders === undefined ? 'optional' : (input.hasOrders ? 'done' : 'warn'),
            hint: input.hasOrders ? 'Рейс содержит заявки и их можно проверить в досье.' : 'Сборный состав рейса не подтвержден данными.',
        },
        {
            key: 'trailer',
            label: 'Прицеп в составе',
            state: input.trailerPlate ? 'done' : 'optional',
            hint: input.trailerPlate
                ? `Прицеп ${input.trailerPlate} учтён в составе.`
                : 'Прицеп не назначен; это нормально для одиночного ТС или требует проверки по рейсу.',
        },
    ];

    const doneCount = items.filter(item => item.state === 'done').length;
    const blocked = input.isBlocked ? 1 : 0;
    const warnCount = items.filter(item => item.state === 'warn').length + blocked;
    const totalCount = items.filter(item => item.state !== 'optional').length;

    const tone: 'ready' | 'attention' | 'warning' = input.isBlocked
        ? 'warning'
        : warnCount > 0
            ? 'attention'
            : 'ready';

    return {
        title: input.isBlocked ? 'ПЛ требует проверки' : warnCount > 0 ? 'ПЛ готовится' : 'ПЛ готов к выпуску',
        tone,
        doneCount,
        totalCount,
        items,
    };
}
