import '@testing-library/jest-dom';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from './src/test/msw/server';

// ────────────────── Polyfills for jsdom ──────────────────
// Next.js + react-leaflet etc. may touch APIs jsdom doesn't ship with.
if (typeof window !== 'undefined') {
    if (!window.matchMedia) {
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: (query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }),
        });
    }
    if (!(globalThis as any).IntersectionObserver) {
        class IO {
            observe() { /* noop */ }
            unobserve() { /* noop */ }
            disconnect() { /* noop */ }
            takeRecords() { return []; }
            root = null;
            rootMargin = '';
            thresholds = [];
        }
        (globalThis as any).IntersectionObserver = IO;
        (window as any).IntersectionObserver = IO;
    }
    if (!(globalThis as any).ResizeObserver) {
        class RO {
            observe() { /* noop */ }
            unobserve() { /* noop */ }
            disconnect() { /* noop */ }
        }
        (globalThis as any).ResizeObserver = RO;
        (window as any).ResizeObserver = RO;
    }
    if (!window.scrollTo) {
        window.scrollTo = vi.fn() as any;
    }
}

// ────────────────── MSW lifecycle ──────────────────
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
