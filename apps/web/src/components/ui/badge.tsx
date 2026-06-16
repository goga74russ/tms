import * as React from "react";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const variantStyles: Record<BadgeVariant, string> = {
    default: "bg-info-600 text-white border-transparent",
    secondary: "bg-neutral-100 text-neutral-900 border-transparent",
    destructive: "bg-danger-600 text-white border-transparent",
    outline: "bg-transparent border-neutral-200 text-neutral-700",
};

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: BadgeVariant;
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
    return (
        <div
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${variantStyles[variant]} ${className || ''}`}
            {...props}
        />
    );
}

export { Badge };
export type { BadgeProps };
