import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

type CnArg = string | undefined | false | null;
function cn(...inputs: CnArg[]) {
    return twMerge(clsx(inputs));
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    /** When set, renders red border + the message below the input. */
    error?: string | null | false;
    /** Helper text shown in gray below the input (hidden if `error` is set). */
    helperText?: React.ReactNode;
    /** Optional element rendered inside the input on the left (e.g. icon). */
    leftAddon?: React.ReactNode;
    /** Optional element rendered inside the input on the right (e.g. icon). */
    rightAddon?: React.ReactNode;
    /** Label rendered above input. If omitted, no label is shown. */
    label?: React.ReactNode;
    /** Visually hide the label (still rendered for screen readers). */
    hideLabel?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    (
        {
            className,
            type,
            error,
            helperText,
            leftAddon,
            rightAddon,
            label,
            hideLabel,
            id,
            required,
            disabled,
            ...props
        },
        ref,
    ) => {
        const reactId = React.useId();
        const inputId = id ?? `inp_${reactId}`;
        const helperId = helperText ? `${inputId}_help` : undefined;
        const errorId = error ? `${inputId}_err` : undefined;
        const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;
        const hasError = Boolean(error);

        return (
            <div className="w-full">
                {label && (
                    <label
                        htmlFor={inputId}
                        className={cn(
                            'block text-sm font-medium text-neutral-700 mb-1.5',
                            hideLabel && 'sr-only',
                        )}
                    >
                        {label}
                        {required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                )}
                <div className="relative">
                    {leftAddon && (
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                            {leftAddon}
                        </div>
                    )}
                    <input
                        id={inputId}
                        type={type}
                        ref={ref}
                        required={required}
                        disabled={disabled}
                        aria-invalid={hasError || undefined}
                        aria-describedby={describedBy}
                        className={cn(
                            'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition-colors',
                            'placeholder:text-neutral-400',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
                            'disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:opacity-60',
                            'file:border-0 file:bg-transparent file:text-sm file:font-medium',
                            Boolean(leftAddon) && 'pl-10',
                            Boolean(rightAddon) && 'pr-10',
                            hasError
                                ? 'border-red-300 focus-visible:ring-red-400 focus-visible:border-red-400'
                                : 'border-neutral-200 focus-visible:ring-brand-400 focus-visible:border-brand-400',
                            className,
                        )}
                        {...props}
                    />
                    {rightAddon && (
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-neutral-400">
                            {rightAddon}
                        </div>
                    )}
                </div>
                {hasError ? (
                    <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-red-600">
                        {error}
                    </p>
                ) : helperText ? (
                    <p id={helperId} className="mt-1.5 text-xs text-neutral-500">
                        {helperText}
                    </p>
                ) : null}
            </div>
        );
    },
);
Input.displayName = 'Input';

export { Input };
