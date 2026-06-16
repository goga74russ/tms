/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    darkMode: ['class', 'class'],
    theme: {
        extend: {
            // Design Блок 1.1 — единая z-index шкала (overlay-system.md).
            // Заменяет хаос z-50/z-[100]/z-[9998]. Порядок слоёв сверху вниз.
            zIndex: {
                base: '0',
                raised: '10',           // sticky headers/columns/footers
                fixed: '20',            // app header/sidebar
                overlay: '30',          // map controls, content overlays
                dropdown: '40',         // Combobox/Select вне модалок
                toast: '50',            // обычный toast
                modal: '60',            // Dialog, SideDrawer
                'modal-dropdown': '70', // Combobox/Select ВНУТРИ модалки
                'toast-priority': '75', // toast связанный с модалкой
                tooltip: '80',
                tour: '85',             // OnboardingTour
                critical: '100',        // session expired
            },
            colors: {
                // Design-plan Блок 2.1 — brand = navy (был indigo #6366f1, не бренд).
                // Знак ТрансПульт: navy корпус + teal маршрут. brand-600 = #111827
                // (primary navy: текст, шапки, кнопки). Светлые шкалы — нейтрально-
                // холодные (slate), цветовой «пульс» даёт accent-teal (ниже).
                brand: {
                    50: '#f1f5f9',
                    100: '#e2e8f0',
                    200: '#cbd5e1',
                    300: '#94a3b8',
                    400: '#475569',
                    500: '#1e293b',
                    600: '#111827',
                    700: '#0d1320',
                    800: '#080c15',
                    900: '#04060a',
                    950: '#020305',
                },
                // Design-plan Блок 2.2 — success = полная emerald-шкала, warning =
                // полная amber-шкала (значения 1:1 с Tailwind emerald/amber, чтобы
                // emerald-*→success-* и amber-*→warning-* были визуально идентичны).
                success: {
                    50: '#ecfdf5',
                    100: '#d1fae5',
                    200: '#a7f3d0',
                    300: '#6ee7b7',
                    400: '#34d399',
                    500: '#10b981',
                    600: '#059669',
                    700: '#047857',
                    800: '#065f46',
                    900: '#064e3b',
                },
                warning: {
                    50: '#fffbeb',
                    100: '#fef3c7',
                    200: '#fde68a',
                    300: '#fcd34d',
                    400: '#fbbf24',
                    500: '#f59e0b',
                    600: '#d97706',
                    700: '#b45309',
                    800: '#92400e',
                    900: '#78350f',
                    950: '#451a03',
                },
                // Design-plan Блок 2.2 — danger = полная red-шкала (1:1 с Tailwind red),
                // чтобы red-*→danger-* был визуально идентичен. red — статусный hue.
                danger: {
                    50: '#fef2f2',
                    100: '#fee2e2',
                    200: '#fecaca',
                    300: '#fca5a5',
                    400: '#f87171',
                    500: '#ef4444',
                    600: '#dc2626',
                    700: '#b91c1c',
                    800: '#991b1b',
                    900: '#7f1d1d',
                },
                // Design-plan Блок 2.2 — info = полная blue-шкала (1:1 с Tailwind blue),
                // чтобы blue-*→info-* был визуально идентичен. blue = информационный hue.
                info: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
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
                surface: {
                    DEFAULT: '#ffffff',
                    dark: '#0f172a',
                },
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))',
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))',
                },
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))',
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))',
                },
                // Design-plan Блок 2.1 — accent = teal (бренд-пульс: CTA, активное
                // состояние, выделение). DEFAULT/foreground (hsl-var) сохранены для
                // shadcn-компонентов; numeric-шкала добавлена для accent-* классов.
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))',
                    50: '#f0fdfa',
                    100: '#ccfbf1',
                    200: '#99f6e4',
                    300: '#5eead4',
                    400: '#2dd4bf',
                    500: '#14b8a6',
                    600: '#0d9488',
                    700: '#0f766e',
                    800: '#115e59',
                    900: '#134e4a',
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))',
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                chart: {
                    1: 'hsl(var(--chart-1))',
                    2: 'hsl(var(--chart-2))',
                    3: 'hsl(var(--chart-3))',
                    4: 'hsl(var(--chart-4))',
                    5: 'hsl(var(--chart-5))',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
                xl: '0.875rem',
            },
            boxShadow: {
                soft: '0 1px 3px rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
                'soft-md': '0 4px 12px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
                'soft-lg': '0 10px 30px rgb(0 0 0 / 0.08), 0 4px 8px -4px rgb(0 0 0 / 0.05)',
            },
            keyframes: {
                'slide-in-right': {
                    '0%': { transform: 'translateX(100%)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
                'slide-in-from-right-4': {
                    '0%': { transform: 'translateX(1rem)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '200% 0' },
                    '100%': { backgroundPosition: '-200% 0' },
                },
            },
            animation: {
                'slide-in-right': 'slide-in-right 250ms ease-out',
                'slide-in-from-right-4': 'slide-in-from-right-4 200ms ease-out',
                'fade-in': 'fade-in 200ms ease-out',
                shimmer: 'shimmer 1.6s linear infinite',
            },
        },
    },
    plugins: [require('tailwindcss-animate')],
};
