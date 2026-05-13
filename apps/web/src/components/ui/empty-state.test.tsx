import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
    it('renders title and description', () => {
        render(
            <EmptyState
                title="Заказов пока нет"
                description="Создайте первый заказ, чтобы начать работу"
            />,
        );
        expect(screen.getByRole('heading', { name: 'Заказов пока нет' })).toBeInTheDocument();
        expect(screen.getByText('Создайте первый заказ, чтобы начать работу')).toBeInTheDocument();
    });

    it('renders icon when icon prop is provided', () => {
        const { container } = render(
            <EmptyState icon={Inbox} title="Пусто" tone="brand" />,
        );
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        // tone="brand" -> bg-brand-50 on icon wrapper
        const iconWrap = container.querySelector('.bg-brand-50');
        expect(iconWrap).not.toBeNull();
    });

    it('renders action button and fires its onClick', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(
            <EmptyState
                title="Нет данных"
                action={<button type="button" onClick={onClick}>Создать заказ</button>}
            />,
        );
        const btn = screen.getByRole('button', { name: 'Создать заказ' });
        await user.click(btn);
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
