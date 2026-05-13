import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Truck } from 'lucide-react';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
    it('renders title and description', () => {
        render(
            <PageHeader
                title="Заказы"
                description="Управление активными заказами"
            />,
        );
        expect(screen.getByRole('heading', { name: 'Заказы', level: 1 })).toBeInTheDocument();
        expect(screen.getByText('Управление активными заказами')).toBeInTheDocument();
    });

    it('renders actions slot when provided', () => {
        render(
            <PageHeader
                title="Рейсы"
                actions={<button type="button">Создать рейс</button>}
            />,
        );
        expect(screen.getByRole('button', { name: 'Создать рейс' })).toBeInTheDocument();
    });

    it('applies the right tailwind class for iconTone="emerald"', () => {
        const { container } = render(
            <PageHeader
                icon={Truck}
                iconTone="emerald"
                title="Транспорт"
            />,
        );
        // The icon tile is the first sibling of the title block with the tone classes.
        const tile = container.querySelector('.bg-emerald-50');
        expect(tile).not.toBeNull();
        expect(tile?.className).toContain('text-emerald-600');
    });
});
