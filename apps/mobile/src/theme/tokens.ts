// ============================================================
// Design tokens — driver mobile app
// Inspired by Uber Driver / DoorDash / Zeo PoS visual systems.
// ============================================================
import { TextStyle, ViewStyle } from 'react-native';

export const colors = {
    // Primary brand — blue-violet (Indigo/Violet blend, energetic but trustworthy)
    brand: {
        50: '#eef2ff',
        100: '#e0e7ff',
        500: '#6366f1',
        600: '#4f46e5',
        700: '#4338ca',
        800: '#3730a3',
    },
    success: {
        50: '#ecfdf5',
        500: '#10b981',
        600: '#059669',
        700: '#047857',
    },
    warning: {
        50: '#fffbeb',
        500: '#f59e0b',
        600: '#d97706',
        700: '#b45309',
    },
    danger: {
        50: '#fef2f2',
        500: '#ef4444',
        600: '#dc2626',
        700: '#b91c1c',
    },
    neutral: {
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
        300: '#cbd5e1',
        400: '#94a3b8',
        500: '#64748b',
        600: '#475569',
        700: '#334155',
        800: '#1e293b',
        900: '#0f172a',
    },
    // Dark mode surfaces (used for camera overlays, hero sections)
    dark: {
        bg: '#0F172A',
        surface: '#1E293B',
        surfaceElevated: '#334155',
        border: '#475569',
    },
    // Pure white / black
    white: '#ffffff',
    black: '#000000',
    // Transparent overlays
    overlay: {
        scrim: 'rgba(15, 23, 42, 0.55)',
        scrimDark: 'rgba(0, 0, 0, 0.72)',
    },
} as const;

export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
} as const;

export const radius = {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    pill: 999,
} as const;

export const typography: Record<string, TextStyle> = {
    display: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
    title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
    headline: { fontSize: 18, fontWeight: '600' },
    body: { fontSize: 16, fontWeight: '400' },
    bodyBold: { fontSize: 16, fontWeight: '600' },
    caption: { fontSize: 13, fontWeight: '400' },
    captionBold: { fontSize: 13, fontWeight: '600' },
    micro: { fontSize: 11, fontWeight: '500' },
};

export const shadow: Record<string, ViewStyle> = {
    sm: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
        elevation: 2,
    },
    md: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 4,
    },
    lg: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 16,
        elevation: 8,
    },
};

// Minimum touch target per Material/iOS HIG
export const touchTarget = {
    min: 44,
    primary: 56,
    hero: 64,
} as const;

export type ColorTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
