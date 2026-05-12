import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | false | null)[]) {
    return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link' | 'brand';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    asChild?: boolean;
    /** Show spinner + disable button. Children stay visible (or "Загрузка..." in sm/lg). */
    isLoading?: boolean;
    /** Optional icon to render before children. */
    leftIcon?: React.ReactNode;
    /** Optional icon to render after children. */
    rightIcon?: React.ReactNode;
    /** When true, button takes full width of its container. */
    fullWidth?: boolean;
}

const variantStyles: Record<string, string> = {
    default: 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-sm focus-visible:ring-neutral-500',
    brand: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm focus-visible:ring-brand-500',
    outline: 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:ring-neutral-400',
    ghost: 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-neutral-400',
    destructive: 'bg-red-600 text-white hover:bg-red-700 shadow-sm focus-visible:ring-red-500',
    secondary: 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 focus-visible:ring-neutral-400',
    link: 'text-brand-600 underline-offset-4 hover:underline focus-visible:ring-brand-500',
};

const sizeStyles: Record<string, string> = {
    default: 'h-9 px-4 py-2 text-sm gap-2',
    sm: 'h-8 px-3 text-xs gap-1.5',
    lg: 'h-11 px-6 text-base gap-2',
    icon: 'h-9 w-9',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({
        className,
        variant = 'default',
        size = 'default',
        isLoading = false,
        leftIcon,
        rightIcon,
        fullWidth,
        disabled,
        children,
        type,
        ...props
    }, ref) => {
        const finalDisabled = disabled || isLoading;
        return (
            <button
                type={type ?? 'button'}
                ref={ref}
                disabled={finalDisabled}
                aria-busy={isLoading || undefined}
                className={cn(
                    'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                    'disabled:pointer-events-none disabled:opacity-50',
                    variantStyles[variant],
                    sizeStyles[size],
                    fullWidth && 'w-full',
                    className,
                )}
                {...props}
            >
                {isLoading ? (
                    <Loader2 className={cn('animate-spin', size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4')} aria-hidden="true" />
                ) : (
                    leftIcon && <span className="shrink-0 inline-flex" aria-hidden="true">{leftIcon}</span>
                )}
                {size !== 'icon' && children}
                {!isLoading && rightIcon && <span className="shrink-0 inline-flex" aria-hidden="true">{rightIcon}</span>}
            </button>
        );
    },
);
Button.displayName = 'Button';

export { Button };
