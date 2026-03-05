'use client';
import React, { createContext, useContext, useState } from 'react';

// Simple Tabs component matching shadcn/ui API
const TabsContext = createContext<{
    value: string;
    onChange: (v: string) => void;
}>({ value: '', onChange: () => { } });

export function Tabs({
    defaultValue,
    value: controlledValue,
    onValueChange,
    children,
    className = '',
}: {
    defaultValue?: string;
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
    className?: string;
}) {
    const [internal, setInternal] = useState(defaultValue || '');
    const value = controlledValue ?? internal;
    const onChange = (v: string) => {
        setInternal(v);
        onValueChange?.(v);
    };

    return (
        <TabsContext.Provider value={{ value, onChange }}>
            <div className={className}>{children}</div>
        </TabsContext.Provider>
    );
}

export function TabsList({
    children,
    className = '',
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`inline-flex items-center gap-1 rounded-lg bg-gray-100 p-1 ${className}`}
        >
            {children}
        </div>
    );
}

export function TabsTrigger({
    value,
    children,
    className = '',
}: {
    value: string;
    children: React.ReactNode;
    className?: string;
}) {
    const ctx = useContext(TabsContext);
    const active = ctx.value === value;

    return (
        <button
            onClick={() => ctx.onChange(value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
                } ${className}`}
        >
            {children}
        </button>
    );
}

export function TabsContent({
    value,
    children,
    className = '',
}: {
    value: string;
    children: React.ReactNode;
    className?: string;
}) {
    const ctx = useContext(TabsContext);
    if (ctx.value !== value) return null;

    return <div className={className}>{children}</div>;
}
