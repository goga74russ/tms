import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Search } from 'lucide-react';
import { Input } from './input';

describe('Input', () => {
    it('renders label and placeholder', () => {
        render(<Input label="Номер заказа" placeholder="Введите номер" />);
        expect(screen.getByText('Номер заказа')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Введите номер')).toBeInTheDocument();
    });

    it('fires onChange when the user types', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Input label="ФИО" placeholder="Иванов" onChange={onChange} />);
        await user.type(screen.getByPlaceholderText('Иванов'), 'А');
        expect(onChange).toHaveBeenCalled();
    });

    it('shows error text and aria-invalid when error prop is set', () => {
        render(<Input label="ИНН" error="Неверный ИНН" defaultValue="123" />);
        const input = screen.getByLabelText('ИНН');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        const err = screen.getByRole('alert');
        expect(err).toHaveTextContent('Неверный ИНН');
    });

    it('renders leftAddon inside the input wrapper', () => {
        const { container } = render(
            <Input
                label="Поиск"
                placeholder="Найти..."
                leftAddon={<Search data-testid="left-icon" className="w-4 h-4" />}
            />,
        );
        expect(screen.getByTestId('left-icon')).toBeInTheDocument();
        // when leftAddon is set, input gets pl-10 class
        const input = container.querySelector('input');
        expect(input?.className).toContain('pl-10');
    });

    it('disabled prop blocks input and applies disabled style', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Input label="Заблокировано" placeholder="..." disabled onChange={onChange} />);
        const input = screen.getByLabelText('Заблокировано') as HTMLInputElement;
        expect(input).toBeDisabled();
        expect(input.className).toContain('disabled:cursor-not-allowed');
        await user.type(input, 'тест');
        expect(onChange).not.toHaveBeenCalled();
    });
});
