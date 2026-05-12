import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, ConfirmDialog } from './dialog';

// jsdom prior to recent versions may not implement HTMLDialogElement methods.
// Provide light shims so the component's open/close effect doesn't throw.
beforeAll(() => {
    const proto = (globalThis as any).HTMLDialogElement?.prototype;
    if (proto) {
        if (typeof proto.showModal !== 'function') {
            proto.showModal = function () {
                this.open = true;
            };
        }
        if (typeof proto.close !== 'function') {
            proto.close = function () {
                this.open = false;
            };
        }
    }
});

describe('Dialog', () => {
    it('renders title and children when open', () => {
        render(
            <Dialog open onClose={() => {}} title="Удалить заказ">
                <p>Содержимое окна</p>
            </Dialog>,
        );
        expect(screen.getByRole('heading', { name: 'Удалить заказ' })).toBeInTheDocument();
        expect(screen.getByText('Содержимое окна')).toBeInTheDocument();
    });

    it('close button (aria-label="Закрыть") fires onClose', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(
            <Dialog open onClose={onClose} title="Окно">
                <p>Тело</p>
            </Dialog>,
        );
        await user.click(screen.getByRole('button', { name: 'Закрыть' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('native <dialog> is closed when open=false', () => {
        const { container } = render(
            <Dialog open={false} onClose={() => {}} title="Скрытое">
                <p>Контент</p>
            </Dialog>,
        );
        const dlg = container.querySelector('dialog');
        expect(dlg).not.toBeNull();
        // Native <dialog> with no `open` attribute is hidden by the UA stylesheet.
        expect((dlg as HTMLDialogElement).open).toBe(false);
    });

    it('ConfirmDialog destructive=true uses destructive (red) confirm button', () => {
        render(
            <ConfirmDialog
                open
                onClose={() => {}}
                onConfirm={() => {}}
                title="Удалить рейс"
                destructive
                confirmLabel="Удалить"
            />,
        );
        const confirmBtn = screen.getByRole('button', { name: 'Удалить' });
        expect(confirmBtn.className).toContain('bg-red-600');
    });

    it('ConfirmDialog onConfirm fires when confirm button clicked', async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        render(
            <ConfirmDialog
                open
                onClose={() => {}}
                onConfirm={onConfirm}
                title="Подтверждение"
                confirmLabel="Подтвердить"
            />,
        );
        await user.click(screen.getByRole('button', { name: 'Подтвердить' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});
