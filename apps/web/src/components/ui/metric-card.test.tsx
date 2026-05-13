import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricCard } from './metric-card';

// Mock next/link so href variant renders a plain anchor without Next.js runtime.
vi.mock('next/link', () => ({
    default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
        <a href={href} className={className}>{children}</a>
    ),
}));

// Mock the Sparkline (recharts ResponsiveContainer doesn't size well in jsdom).
vi.mock('./sparkline', () => ({
    Sparkline: ({ data }: { data: number[] }) => (
        <div data-testid="sparkline" data-points={data.length} />
    ),
}));

describe('MetricCard', () => {
    it('renders label and value', () => {
        render(<MetricCard label="Заказы за месяц" value="128" />);
        expect(screen.getByText('Заказы за месяц')).toBeInTheDocument();
        expect(screen.getByText('128')).toBeInTheDocument();
    });

    it('renders the change percentage with arrow icon', () => {
        const { container } = render(
            <MetricCard
                label="Выручка"
                value="1.2 млн ₽"
                change={{ value: 15, direction: 'up' }}
            />,
        );
        // The change span shows "15%"
        expect(screen.getByText('15%')).toBeInTheDocument();
        // Arrow icon (ArrowUp from lucide) renders as svg
        const svgs = container.querySelectorAll('svg');
        expect(svgs.length).toBeGreaterThan(0);
    });

    it('renders Sparkline slot when sparkline data is provided', () => {
        render(
            <MetricCard
                label="Динамика"
                value="42"
                sparkline={[1, 2, 3, 4, 5]}
            />,
        );
        const sl = screen.getByTestId('sparkline');
        expect(sl).toBeInTheDocument();
        expect(sl.getAttribute('data-points')).toBe('5');
    });

    it('renders as button and fires onClick when onClick prop is set', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<MetricCard label="Кликабельно" value="7" onClick={onClick} />);
        const btn = screen.getByRole('button');
        await user.click(btn);
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
