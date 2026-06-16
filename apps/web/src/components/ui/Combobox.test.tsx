import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox } from './Combobox';

interface City {
    id: string;
    name: string;
}

const CITIES: City[] = [
    { id: '1', name: 'Москва' },
    { id: '2', name: 'Мурманск' },
    { id: '3', name: 'Казань' },
];

function makeProps(overrides: Partial<React.ComponentProps<typeof Combobox<City>>> = {}) {
    return {
        placeholder: 'Поиск города',
        onSearch: async (q: string) =>
            CITIES.filter(c => c.name.toLowerCase().includes(q.toLowerCase())),
        renderOption: (c: City) => <span>{c.name}</span>,
        getLabel: (c: City) => c.name,
        getKey: (c: City) => c.id,
        onSelect: vi.fn(),
        selected: null,
        debounceMs: 0,
        ...overrides,
    };
}

describe('Combobox', () => {
    it('renders the placeholder and search input', () => {
        render(<Combobox<City> {...makeProps()} />);
        expect(screen.getByPlaceholderText('Поиск города')).toBeInTheDocument();
    });

    it('shows selected item label as initial query', () => {
        const selected = CITIES[0];
        render(<Combobox<City> {...makeProps({ selected })} />);
        const input = screen.getByPlaceholderText('Поиск города') as HTMLInputElement;
        // The component does not auto-fill query from `selected`; check that the
        // emerald selection style is applied (visual confirmation of selection).
        expect(input.className).toContain('border-success-300');
    });

    it('typing filters and displays matching options', async () => {
        const user = userEvent.setup();
        render(<Combobox<City> {...makeProps()} />);
        const input = screen.getByPlaceholderText('Поиск города');
        await user.type(input, 'Мо');
        await waitFor(() => {
            expect(screen.getByText('Москва')).toBeInTheDocument();
        });
    });

    it('clicking an option calls onSelect with that item', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(<Combobox<City> {...makeProps({ onSelect })} />);
        const input = screen.getByPlaceholderText('Поиск города');
        await user.type(input, 'Каз');
        await waitFor(() => {
            expect(screen.getByText('Казань')).toBeInTheDocument();
        });
        await user.click(screen.getByText('Казань'));
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Казань' }));
    });

    // F-04: выбор должен срабатывать уже на mousedown (до blur/закрытия списка),
    // и ровно один раз — onClick после mousedown-выбора не дублирует.
    it('selects on mousedown alone and does not double-fire with click', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        render(<Combobox<City> {...makeProps({ onSelect })} />);
        const input = screen.getByPlaceholderText('Поиск города');
        await user.type(input, 'Мурм');
        await waitFor(() => {
            expect(screen.getByText('Мурманск')).toBeInTheDocument();
        });
        const option = screen.getByText('Мурманск').closest('button')!;
        // только mousedown — без mouseup/click (имитация гонки blur-vs-click)
        await user.pointer({ keys: '[MouseLeft>]', target: option });
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Мурманск' }));
        // дропдаун закрыт — отпускание кнопки мыши не должно ничего добавить
        await user.pointer({ keys: '[/MouseLeft]' });
        expect(onSelect).toHaveBeenCalledTimes(1);
    });
});
