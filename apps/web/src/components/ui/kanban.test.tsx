import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanBoard, KanbanColumn, KanbanCard } from './kanban';

describe('Kanban', () => {
    it('renders provided columns with titles and counts', () => {
        render(
            <KanbanBoard onMove={() => {}}>
                <KanbanColumn id="new" title="Новые" count={2} tone="brand">
                    <KanbanCard id="o1" fromCol="new">Заказ №1</KanbanCard>
                    <KanbanCard id="o2" fromCol="new">Заказ №2</KanbanCard>
                </KanbanColumn>
                <KanbanColumn id="done" title="Доставлены" count={0} tone="success" />
            </KanbanBoard>,
        );
        expect(screen.getByText('Новые')).toBeInTheDocument();
        expect(screen.getByText('Доставлены')).toBeInTheDocument();
        // count badges
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('renders default empty-state placeholder when count is 0', () => {
        render(
            <KanbanBoard onMove={() => {}}>
                <KanbanColumn id="archive" title="Архив" count={0} />
            </KanbanBoard>,
        );
        expect(screen.getByText('Перетащите карточку сюда')).toBeInTheDocument();
    });

    it('renders custom emptyState when provided', () => {
        render(
            <KanbanBoard onMove={() => {}}>
                <KanbanColumn
                    id="urgent"
                    title="Срочные"
                    count={0}
                    emptyState={<div>Срочных заказов нет</div>}
                />
            </KanbanBoard>,
        );
        expect(screen.getByText('Срочных заказов нет')).toBeInTheDocument();
        expect(screen.queryByText('Перетащите карточку сюда')).not.toBeInTheDocument();
    });

    it('renders card content via children', () => {
        render(
            <KanbanBoard onMove={() => {}}>
                <KanbanColumn id="new" title="Новые" count={1}>
                    <KanbanCard id="o1" fromCol="new">
                        <div>Груз: помидоры</div>
                    </KanbanCard>
                </KanbanColumn>
            </KanbanBoard>,
        );
        expect(screen.getByText('Груз: помидоры')).toBeInTheDocument();
    });

    it('clicking a KanbanCard fires its onClick handler', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(
            <KanbanBoard onMove={() => {}}>
                <KanbanColumn id="new" title="Новые" count={1}>
                    <KanbanCard id="o1" fromCol="new" onClick={onClick}>
                        Открыть заказ
                    </KanbanCard>
                </KanbanColumn>
            </KanbanBoard>,
        );
        await user.click(screen.getByText('Открыть заказ'));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
