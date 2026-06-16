import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Truck } from 'lucide-react';
import { Stat } from './stat';

describe('Stat', () => {
    it('renders label and value', () => {
        render(<Stat label="Активные рейсы" value={42} />);
        expect(screen.getByText('Активные рейсы')).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('shows trend with up arrow and emerald color when trendType="up" + trendIsGood', () => {
        const { container } = render(
            <Stat label="Выручка" value="1 200 000 ₽" trend="+12%" trendType="up" trendIsGood />,
        );
        const trendSpan = screen.getByText('+12%');
        expect(trendSpan).toBeInTheDocument();
        expect(trendSpan.className).toContain('text-success-600');
        // ArrowUpRight from lucide renders an svg
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
    });

    it('shows red color when trendType="up" but trendIsGood=false', () => {
        render(<Stat label="Просрочка" value="3 шт." trend="+2" trendType="up" trendIsGood={false} />);
        const trendSpan = screen.getByText('+2');
        expect(trendSpan.className).toContain('text-danger-600');
    });

    it('renders icon tile when icon prop is provided', () => {
        const { container } = render(
            <Stat label="Транспорт" value={18} icon={Truck} tone="brand" />,
        );
        // tone="brand" -> bg-brand-50 on the icon wrapper
        const iconWrap = container.querySelector('.bg-brand-50');
        expect(iconWrap).not.toBeNull();
    });
});
