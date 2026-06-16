import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CheckCircle } from 'lucide-react';
import { Pill } from './data-table';

describe('Pill', () => {
    it('renders text content', () => {
        render(<Pill>Активен</Pill>);
        expect(screen.getByText('Активен')).toBeInTheDocument();
    });

    it('renders the optional icon when provided', () => {
        const { container } = render(<Pill icon={CheckCircle} tone="success">Готово</Pill>);
        // Lucide renders an <svg>; the icon span includes aria-hidden.
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(screen.getByText('Готово')).toBeInTheDocument();
    });

    it('applies success palette classes for tone="success"', () => {
        render(<Pill tone="success">Доставлен</Pill>);
        const el = screen.getByText('Доставлен');
        expect(el.className).toContain('bg-success-50');
        expect(el.className).toContain('text-success-700');
    });

    it('applies warning palette classes for tone="warning"', () => {
        render(<Pill tone="warning">В пути</Pill>);
        const el = screen.getByText('В пути');
        expect(el.className).toContain('bg-warning-50');
        expect(el.className).toContain('text-warning-700');
    });

    it('applies danger palette classes for tone="danger"', () => {
        render(<Pill tone="danger">Отменён</Pill>);
        const el = screen.getByText('Отменён');
        expect(el.className).toContain('bg-danger-50');
        expect(el.className).toContain('text-danger-700');
    });
});
