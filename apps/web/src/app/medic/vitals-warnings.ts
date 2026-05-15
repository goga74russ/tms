// ================================================================
// Vital signs threshold checks for pre-trip medical inspection.
// Extracted from medic/page.tsx for readability and reuse.
// Thresholds align with Russian pre-trip медосмотр practice; criticals
// are values that force a "не допустить" outcome, attentions warrant
// clinical judgement.
// ================================================================

export type WarningLevel = 'attention' | 'critical';

export interface WarningResult {
    level: WarningLevel;
    message: string;
}

/**
 * Parses a possibly-empty numeric input. Returns null when the value is
 * blank or not parseable so callers can short-circuit cleanly.
 */
function parseIntOrNull(value: string): number | null {
    if (value === '' || value === null || value === undefined) return null;
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
}

function parseFloatOrNull(value: string): number | null {
    if (value === '' || value === null || value === undefined) return null;
    const n = parseFloat(value);
    return Number.isNaN(n) ? null : n;
}

/**
 * Systolic blood pressure check.
 *  >= 180  — hypertensive crisis, hard reject
 *  160-179 — elevated, дискуссионный допуск
 *  < 90    — hypotension, требует наблюдения
 */
export function checkSystolicBP(rawValue: string): WarningResult | null {
    const sys = parseIntOrNull(rawValue);
    if (sys === null) return null;
    if (sys >= 180) return { level: 'critical', message: `Сист. АД ${sys} — гипертонический криз, допуск запрещён` };
    if (sys >= 160) return { level: 'attention', message: `Сист. АД ${sys} — повышено, допуск под вопросом` };
    if (sys < 90) return { level: 'attention', message: `Сист. АД ${sys} — пониженное, требуется наблюдение` };
    return null;
}

/**
 * Diastolic blood pressure check.
 *  >= 110  — critically high, hard reject
 *  100-109 — elevated
 *  < 60    — hypotension
 */
export function checkDiastolicBP(rawValue: string): WarningResult | null {
    const dia = parseIntOrNull(rawValue);
    if (dia === null) return null;
    if (dia >= 110) return { level: 'critical', message: `Диаст. АД ${dia} — критически высокое, допуск запрещён` };
    if (dia >= 100) return { level: 'attention', message: `Диаст. АД ${dia} — повышено, допуск под вопросом` };
    if (dia < 60) return { level: 'attention', message: `Диаст. АД ${dia} — пониженное, требуется наблюдение` };
    return null;
}

/**
 * Pulse / heart-rate check.
 *  >= 120  — marked tachycardia, hard reject
 *  101-119 — elevated
 *  40-49   — slow, требует наблюдения
 *  < 40    — marked bradycardia, hard reject
 */
export function checkPulse(rawValue: string): WarningResult | null {
    const hr = parseIntOrNull(rawValue);
    if (hr === null) return null;
    if (hr >= 120) return { level: 'critical', message: `Пульс ${hr} — выраженная тахикардия, допуск запрещён` };
    if (hr > 100) return { level: 'attention', message: `Пульс ${hr} — учащённый, оцените состояние` };
    if (hr < 40) return { level: 'critical', message: `Пульс ${hr} — выраженная брадикардия, допуск запрещён` };
    if (hr < 50) return { level: 'attention', message: `Пульс ${hr} — редкий, требуется наблюдение` };
    return null;
}

/**
 * Body temperature check.
 *  >= 38.0  — high fever, hard reject
 *  37.5-37.9 — elevated
 *  37.1-37.4 — subfebrile
 *  35.0-35.4 — low, требует наблюдения
 *  < 35.0   — hypothermia, hard reject
 */
export function checkTemperature(rawValue: string): WarningResult | null {
    const t = parseFloatOrNull(rawValue);
    if (t === null) return null;
    const formatted = t.toFixed(1);
    if (t >= 38.0) return { level: 'critical', message: `Температура ${formatted}°C — высокая, допуск запрещён` };
    if (t >= 37.5) return { level: 'attention', message: `Температура ${formatted}°C — повышена, допуск под вопросом` };
    if (t > 37.0) return { level: 'attention', message: `Температура ${formatted}°C — субфебрильная, оцените состояние` };
    if (t < 35.0) return { level: 'critical', message: `Температура ${formatted}°C — гипотермия, допуск запрещён` };
    if (t < 35.5) return { level: 'attention', message: `Температура ${formatted}°C — понижена, требуется наблюдение` };
    return null;
}
