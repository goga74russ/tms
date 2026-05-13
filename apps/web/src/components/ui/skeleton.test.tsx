import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton, SkeletonRow, SkeletonTable } from './skeleton';

describe('Skeleton', () => {
    it('renders a shimmer box with animate-pulse', () => {
        const { container } = render(<Skeleton className="h-4 w-32" />);
        const el = container.firstChild as HTMLElement;
        expect(el).not.toBeNull();
        expect(el.getAttribute('aria-hidden')).toBe('true');
        expect(el.className).toContain('animate-pulse');
    });

    it('merges custom className with default classes', () => {
        const { container } = render(<Skeleton className="h-10 w-10 rounded-full" />);
        const el = container.firstChild as HTMLElement;
        expect(el.className).toContain('h-10');
        expect(el.className).toContain('w-10');
        // default still applied
        expect(el.className).toContain('bg-gradient-to-r');
    });

    it('SkeletonRow renders the correct number of cells', () => {
        const { container } = render(
            <table>
                <tbody>
                    <SkeletonRow columns={5} />
                </tbody>
            </table>,
        );
        expect(container.querySelectorAll('td').length).toBe(5);
    });

    it('SkeletonTable renders rows × columns', () => {
        const { container } = render(<SkeletonTable rows={3} columns={4} />);
        expect(container.querySelectorAll('tr').length).toBe(3);
        expect(container.querySelectorAll('td').length).toBe(12);
    });
});
