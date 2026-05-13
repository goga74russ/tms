import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './select';

const OPTIONS = [
    { value: 'moscow', label: 'Москва' },
    { value: 'spb', label: 'Санкт-Петербург' },
    { value: 'kazan', label: 'Казань' },
];

describe('Select', () => {
    it('renders all options with labels', () => {
        render(<Select aria-label="Город" options={OPTIONS} defaultValue="moscow" />);
        expect(screen.getByRole('option', { name: 'Москва' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Санкт-Петербург' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Казань' })).toBeInTheDocument();
    });

    it('fires onChange with new value when an option is selected', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Select aria-label="Город" options={OPTIONS} defaultValue="moscow" onChange={onChange} />);
        await user.selectOptions(screen.getByRole('combobox', { name: 'Город' }), 'kazan');
        expect(onChange).toHaveBeenCalled();
        const select = screen.getByRole('combobox', { name: 'Город' }) as HTMLSelectElement;
        expect(select.value).toBe('kazan');
    });

    it('renders placeholder option when placeholder prop is set', () => {
        render(<Select aria-label="Регион" options={OPTIONS} placeholder="Выберите регион" />);
        const placeholder = screen.getByRole('option', { name: 'Выберите регион' }) as HTMLOptionElement;
        expect(placeholder).toBeInTheDocument();
        expect(placeholder.value).toBe('');
    });

    it('disabled prop disables the select', () => {
        render(<Select aria-label="Город" options={OPTIONS} disabled />);
        expect(screen.getByRole('combobox', { name: 'Город' })).toBeDisabled();
    });
});
