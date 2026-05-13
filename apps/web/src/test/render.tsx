// ============================================================
// Test render helper — wraps UI with the same providers used at runtime.
// MSW intercepts the /api/auth/me call inside UserProvider so by default
// the test user from handlers is loaded.
// ============================================================
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { UserProvider } from '@/lib/user-context';
import { ToastProvider } from '@/components/ui/toast';

interface ProvidersProps {
    children: ReactNode;
}

function AllProviders({ children }: ProvidersProps) {
    return (
        <UserProvider>
            <ToastProvider>{children}</ToastProvider>
        </UserProvider>
    );
}

export function renderWithProviders(
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
    return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export common testing-library bits so test files have a single import.
export { screen, waitFor, within, fireEvent } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
