import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
    it('renders text content with default variant', () => {
        render(<Badge>Новый</Badge>);
        const badge = screen.getByText('Новый');
        expect(badge).toBeInTheDocument();
        // default variant uses blue background
        expect(badge.className).toContain('bg-blue-600');
    });

    it('variant="destructive" applies red palette', () => {
        render(<Badge variant="destructive">Отменён</Badge>);
        const badge = screen.getByText('Отменён');
        expect(badge.className).toContain('bg-red-600');
        expect(badge.className).toContain('text-white');
    });

    it('merges custom className with variant classes', () => {
        render(<Badge variant="secondary" className="my-custom-badge">В пути</Badge>);
        const badge = screen.getByText('В пути');
        expect(badge.className).toContain('my-custom-badge');
        expect(badge.className).toContain('bg-neutral-100');
    });
});
