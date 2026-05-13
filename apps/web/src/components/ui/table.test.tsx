import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './table';

describe('Table', () => {
    it('renders headers and rows', () => {
        render(
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Заказ</TableHead>
                        <TableHead>Статус</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow>
                        <TableCell>№1284</TableCell>
                        <TableCell>В пути</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell>№1285</TableCell>
                        <TableCell>Доставлен</TableCell>
                    </TableRow>
                </TableBody>
            </Table>,
        );
        expect(screen.getByRole('columnheader', { name: 'Заказ' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Статус' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: '№1284' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Доставлен' })).toBeInTheDocument();
    });

    it('renders empty body when no rows are provided', () => {
        render(
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Колонка</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody />
            </Table>,
        );
        expect(screen.queryAllByRole('cell')).toHaveLength(0);
    });

    it('TableRow fires onClick when clicked', async () => {
        const user = userEvent.setup();
        const onRowClick = vi.fn();
        render(
            <Table>
                <TableBody>
                    <TableRow onClick={onRowClick}>
                        <TableCell>Кликни меня</TableCell>
                    </TableRow>
                </TableBody>
            </Table>,
        );
        await user.click(screen.getByRole('cell', { name: 'Кликни меня' }));
        expect(onRowClick).toHaveBeenCalledTimes(1);
    });
});
