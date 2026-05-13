// ============================================================
// Shared vi.mock factories. Test files do:
//   vi.mock('next/navigation', () => navigationMock());
//   vi.mock('next/link', () => linkMock());
// ============================================================
import * as React from 'react';
import { vi } from 'vitest';

export function navigationMock(): Record<string, unknown> {
    return {
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            back: vi.fn(),
            forward: vi.fn(),
            refresh: vi.fn(),
            prefetch: vi.fn(),
        }),
        useSearchParams: () => new URLSearchParams(),
        usePathname: () => '/',
        useParams: () => ({}),
        redirect: vi.fn(),
        notFound: vi.fn(),
    };
}

export function linkMock(): Record<string, unknown> {
    return {
        default: ({ href, children, ...rest }: any) =>
            React.createElement('a', { href, ...rest }, children),
    };
}

export function dynamicMock(): Record<string, unknown> {
    // next/dynamic returns a component that renders nothing in tests.
    return {
        default: (_loader: any, _opts?: any) => () =>
            React.createElement('div', { 'data-testid': 'next-dynamic-stub' }),
    };
}
