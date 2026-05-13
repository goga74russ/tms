import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardContent } from './card';

describe('Card', () => {
    it('composes CardHeader + CardTitle + CardContent', () => {
        render(
            <Card>
                <CardHeader>
                    <CardTitle>Заказ №1284</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Груз: помидоры</p>
                </CardContent>
            </Card>,
        );
        expect(screen.getByRole('heading', { name: 'Заказ №1284' })).toBeInTheDocument();
        expect(screen.getByText('Груз: помидоры')).toBeInTheDocument();
    });

    it('applies default border and padding classes', () => {
        const { container } = render(
            <Card>
                <CardHeader>
                    <CardTitle>Карточка</CardTitle>
                </CardHeader>
            </Card>,
        );
        const card = container.firstChild as HTMLElement;
        expect(card.className).toContain('rounded-xl');
        expect(card.className).toContain('border');
        // CardHeader has padding p-6
        const header = card.querySelector('h3')?.parentElement;
        expect(header?.className).toContain('p-6');
    });

    it('merges custom className into root', () => {
        const { container } = render(
            <Card className="custom-card-cls">
                <CardContent>Содержимое</CardContent>
            </Card>,
        );
        const card = container.firstChild as HTMLElement;
        expect(card.className).toContain('custom-card-cls');
        // Default classes still present
        expect(card.className).toContain('bg-white');
    });
});
