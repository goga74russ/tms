import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button', () => {
    it('renders children text', () => {
        render(<Button>Сохранить</Button>);
        expect(screen.getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();
    });

    it('fires onClick when clicked', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Создать</Button>);
        await user.click(screen.getByRole('button', { name: 'Создать' }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not fire onClick when disabled', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Button disabled onClick={onClick}>Отправить</Button>);
        const btn = screen.getByRole('button', { name: 'Отправить' });
        expect(btn).toBeDisabled();
        await user.click(btn);
        expect(onClick).not.toHaveBeenCalled();
    });

    it('renders spinner and sets aria-busy when isLoading', () => {
        render(<Button isLoading>Загрузка</Button>);
        const btn = screen.getByRole('button', { name: 'Загрузка' });
        expect(btn).toHaveAttribute('aria-busy', 'true');
        expect(btn).toBeDisabled();
        // Loader2 from lucide-react renders an SVG. aria-hidden on the spinner span.
        const svg = btn.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg).toHaveClass('animate-spin');
    });

    it('applies brand variant class when variant="brand"', () => {
        render(<Button variant="brand">Подтвердить</Button>);
        const btn = screen.getByRole('button', { name: 'Подтвердить' });
        expect(btn.className).toContain('bg-brand-600');
    });
});
