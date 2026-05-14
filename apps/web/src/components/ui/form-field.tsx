import * as React from 'react';
import { Input, type InputProps } from './input';

// ============================================================
// FormField — Input + format-aware inline validation
// ============================================================
//
// Wraps the base Input component with built-in validators for the most
// common Russian business formats: ИНН (10/12-digit with checksum),
// ГРЗ (license plate, Cyrillic+Latin), VIN, телефон (+7), email.
//
// Validation runs on blur (so users aren't yelled at while typing) and
// on every change AFTER the first error appears (so they get instant
// feedback once they know what's expected). The component is fully
// controlled — pass `value` + `onChange` like a normal Input. The error
// message is computed internally and surfaced both as the standard
// red-ring + helper text AND via the optional `onValidityChange`
// callback so parent forms can disable the submit button.
//
// Usage:
//     <FormField
//         format="inn"
//         label="ИНН"
//         required
//         value={inn}
//         onChange={(e) => setInn(e.target.value)}
//         onValidityChange={(valid) => setInnValid(valid)}
//     />
// ============================================================

export type FormFieldFormat =
    | 'inn'         // 10 digits (ЮЛ) or 12 digits (ИП) with Минфин checksum
    | 'plate'       // ГРЗ: А000АА00 or А000АА000 (Cyrillic+Latin acceptable)
    | 'vin'         // 17 chars, no I/O/Q
    | 'phone'       // +7XXXXXXXXXX (11 digits total)
    | 'email'       // standard email
    | 'ogrn'        // 13 or 15 digits (ЮЛ / ИП)
    | 'bik'         // 9 digits
    | 'kpp';        // 9 digits

export interface FormFieldProps extends Omit<InputProps, 'error'> {
    /** Format key — selects the validator. Omit for free-form text. */
    format?: FormFieldFormat;
    /** External error (e.g. server-side rejection) — overrides built-in validator. */
    externalError?: string | null;
    /** Called with current validity AFTER each validation run. */
    onValidityChange?: (valid: boolean) => void;
    /** Override the default validation message. */
    customError?: string;
}

// ---------- Validators ----------

function validateInn(raw: string): string | null {
    const v = raw.trim();
    if (!v) return null;
    if (!/^\d{10}$|^\d{12}$/.test(v)) {
        return 'ИНН должен содержать 10 или 12 цифр';
    }
    const digits = v.split('').map(Number);
    if (digits.length === 10) {
        const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8];
        const sum = weights.reduce((acc, w, i) => acc + w * digits[i]!, 0);
        const check = (sum % 11) % 10;
        if (check !== digits[9]) return 'Неверная контрольная сумма ИНН';
    } else {
        const w1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
        const w2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
        const c1 = (w1.reduce((a, w, i) => a + w * digits[i]!, 0) % 11) % 10;
        const c2 = (w2.reduce((a, w, i) => a + w * digits[i]!, 0) % 11) % 10;
        if (c1 !== digits[10] || c2 !== digits[11]) return 'Неверная контрольная сумма ИНН';
    }
    return null;
}

const PLATE_RE = /^[АВЕКМНОРСТУХABEKMHOPCTYX]\d{3}[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\d{2,3}$/i;
function validatePlate(raw: string): string | null {
    const v = raw.trim().toUpperCase();
    if (!v) return null;
    if (!PLATE_RE.test(v)) {
        return 'Формат: А000АА00 или А000АА000 (только буквы АВЕКМНОРСТУХ)';
    }
    return null;
}

function validateVin(raw: string): string | null {
    const v = raw.trim().toUpperCase();
    if (!v) return null;
    if (v.length !== 17) return 'VIN должен содержать ровно 17 символов';
    if (/[IOQ]/i.test(v)) return 'VIN не может содержать I, O, Q';
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(v)) return 'VIN содержит недопустимые символы';
    return null;
}

function validatePhone(raw: string): string | null {
    const v = raw.replace(/[\s()\-]/g, '');
    if (!v) return null;
    if (!/^\+?[78]\d{10}$/.test(v)) return 'Введите номер в формате +7 9XX XXX-XX-XX';
    return null;
}

function validateEmail(raw: string): string | null {
    const v = raw.trim();
    if (!v) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Введите корректный e-mail';
    return null;
}

function validateOgrn(raw: string): string | null {
    const v = raw.trim();
    if (!v) return null;
    if (!/^\d{13}$|^\d{15}$/.test(v)) return 'ОГРН — 13 цифр, ОГРНИП — 15 цифр';
    return null;
}

function validateBik(raw: string): string | null {
    const v = raw.trim();
    if (!v) return null;
    if (!/^\d{9}$/.test(v)) return 'БИК должен содержать 9 цифр';
    return null;
}

function validateKpp(raw: string): string | null {
    const v = raw.trim();
    if (!v) return null;
    if (!/^\d{9}$/.test(v)) return 'КПП должен содержать 9 цифр';
    return null;
}

const VALIDATORS: Record<FormFieldFormat, (raw: string) => string | null> = {
    inn: validateInn,
    plate: validatePlate,
    vin: validateVin,
    phone: validatePhone,
    email: validateEmail,
    ogrn: validateOgrn,
    bik: validateBik,
    kpp: validateKpp,
};

const FORMAT_TYPE: Record<FormFieldFormat, React.HTMLInputTypeAttribute> = {
    inn: 'text',
    plate: 'text',
    vin: 'text',
    phone: 'tel',
    email: 'email',
    ogrn: 'text',
    bik: 'text',
    kpp: 'text',
};

const FORMAT_PLACEHOLDER: Record<FormFieldFormat, string> = {
    inn: '7707083893',
    plate: 'А000АА00',
    vin: 'XW8ZZZ7HZBG000000',
    phone: '+7 9XX XXX-XX-XX',
    email: 'your@company.ru',
    ogrn: '1027700132195',
    bik: '044525225',
    kpp: '770101001',
};

// ---------- Component ----------

export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
    (
        {
            format,
            externalError,
            onValidityChange,
            customError,
            onBlur,
            onChange,
            value,
            placeholder,
            type,
            ...rest
        },
        ref,
    ) => {
        const [touched, setTouched] = React.useState(false);
        const [internalError, setInternalError] = React.useState<string | null>(null);
        const lastValidityRef = React.useRef<boolean | null>(null);

        const validate = React.useCallback(
            (v: string) => {
                if (!format) return null;
                if (customError) return customError;
                const validator = VALIDATORS[format];
                return validator(v);
            },
            [format, customError],
        );

        // Re-validate when value changes AFTER first blur. Avoids yelling at
        // users mid-keystroke before they've finished entering anything.
        React.useEffect(() => {
            if (!touched) return;
            const err = validate(String(value ?? ''));
            setInternalError(err);
            const valid = err === null;
            if (lastValidityRef.current !== valid) {
                lastValidityRef.current = valid;
                onValidityChange?.(valid);
            }
        }, [value, touched, validate, onValidityChange]);

        const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
            if (!touched) setTouched(true);
            const err = validate(e.target.value);
            setInternalError(err);
            const valid = err === null;
            if (lastValidityRef.current !== valid) {
                lastValidityRef.current = valid;
                onValidityChange?.(valid);
            }
            onBlur?.(e);
        };

        const error = externalError ?? internalError;
        const resolvedType = type ?? (format ? FORMAT_TYPE[format] : 'text');
        const resolvedPlaceholder = placeholder ?? (format ? FORMAT_PLACEHOLDER[format] : undefined);

        return (
            <Input
                ref={ref}
                type={resolvedType}
                value={value}
                placeholder={resolvedPlaceholder}
                onChange={onChange}
                onBlur={handleBlur}
                error={error}
                {...rest}
            />
        );
    },
);
FormField.displayName = 'FormField';
