import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodSelector, computeRange, type PeriodRange } from './period-selector';

function initialRange(): PeriodRange {
    return computeRange('1w', new Date('2026-05-13T12:00:00Z'));
}

describe('PeriodSelector', () => {
    it('renders all preset buttons (1w, 4w, mtd, qtd, ytd, all) + custom', () => {
        render(<PeriodSelector value={initialRange()} onChange={() => {}} />);
        expect(screen.getByRole('button', { name: 'Неделя' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '4 недели' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Месяц' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Квартал' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Год' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Всё' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Свой период/ })).toBeInTheDocument();
    });

    it('marks the active preset with aria-pressed=true', () => {
        render(<PeriodSelector value={initialRange()} onChange={() => {}} />);
        const weekBtn = screen.getByRole('button', { name: 'Неделя' });
        expect(weekBtn).toHaveAttribute('aria-pressed', 'true');
        const monthBtn = screen.getByRole('button', { name: 'Месяц' });
        expect(monthBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('clicking a preset fires onChange with a PeriodRange object', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<PeriodSelector value={initialRange()} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: 'Квартал' }));
        expect(onChange).toHaveBeenCalledTimes(1);
        const range = onChange.mock.calls[0][0];
        expect(range).toMatchObject({ preset: 'qtd', label: 'Квартал' });
        expect(range.from).toBeInstanceOf(Date);
        expect(range.to).toBeInstanceOf(Date);
    });

    it('clicking "Свой период" reveals the date picker inputs', async () => {
        const user = userEvent.setup();
        render(<PeriodSelector value={initialRange()} onChange={() => {}} />);
        const customBtn = screen.getByRole('button', { name: /Свой период/ });
        expect(customBtn).toHaveAttribute('aria-expanded', 'false');
        await user.click(customBtn);
        expect(customBtn).toHaveAttribute('aria-expanded', 'true');
        // Date inputs labelled "С" and "По"
        expect(screen.getByLabelText('С')).toBeInTheDocument();
        expect(screen.getByLabelText('По')).toBeInTheDocument();
    });
});
