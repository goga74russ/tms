'use client';

import * as React from 'react';
import { Area, AreaChart, Line, LineChart, ResponsiveContainer } from 'recharts';

export type SparklineTone = 'brand' | 'success' | 'danger' | 'neutral' | 'warning';

const TONE_COLOR: Record<SparklineTone, string> = {
    brand: '#3b82f6',
    success: '#10b981',
    danger: '#ef4444',
    neutral: '#64748b',
    warning: '#f59e0b',
};

export interface SparklineProps {
    data: number[];
    tone?: SparklineTone;
    width?: number | string;
    height?: number;
    showArea?: boolean;
    className?: string;
}

export function Sparkline({
    data,
    tone = 'brand',
    width = '100%',
    height = 32,
    showArea = false,
    className,
}: SparklineProps) {
    const color = TONE_COLOR[tone];
    // C9: id градиента был `spark-grad-${tone}` — НЕ уникален. Несколько спарклайнов
    // одного тона на странице делили один SVG-id → ломалась заливка. useId() даёт
    // per-instance уникальность (двоеточия убираем — невалидны в url(#...)).
    const gradId = `spark-grad-${React.useId().replace(/:/g, '')}`;
    if (!data || data.length === 0) {
        return <div className={className} style={{ width, height }} aria-hidden="true" />;
    }
    const chartData = data.map((v, i) => ({ i, v }));
    return (
        <div className={className} style={{ width, height }} aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
                {showArea ? (
                    <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                        <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                                <stop offset="100%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone"
                            dataKey="v"
                            stroke={color}
                            strokeWidth={1.5}
                            fill={`url(#${gradId})`}
                            isAnimationActive={false}
                            dot={false}
                        />
                    </AreaChart>
                ) : (
                    <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                        <Line
                            type="monotone"
                            dataKey="v"
                            stroke={color}
                            strokeWidth={1.5}
                            dot={false}
                            isAnimationActive={false}
                        />
                    </LineChart>
                )}
            </ResponsiveContainer>
        </div>
    );
}
