import * as React from "react";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const variantStyles: Record<BadgeVariant, string> = {
    default: "bg-blue-600 text-white border-transparent",
    secondary: "bg-slate-100 text-slate-900 border-transparent",
    destructive: "bg-red-600 text-white border-transparent",
    outline: "bg-transparent border-slate-200 text-slate-700",
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
