// ============================================================
// RBAC — Role-Based Access Control (Приложение А ТЗ)
// Использует CASL для гибких политик
// ============================================================
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { FastifyRequest, FastifyReply } from 'fastify';

type Actions = 'read' | 'create' | 'update' | 'delete' | 'manage';
type Subjects =
    | 'Order' | 'Trip' | 'Vehicle' | 'Driver' | 'Contractor'
    | 'TechInspection' | 'MedInspection' | 'MedInspectionDetails'
    | 'Waybill' | 'RepairRequest' | 'Permit' | 'Fine'
    | 'Tariff' | 'Contract' | 'Invoice'
    | 'KPI' | 'Settings' | 'ChecklistTemplate'
    | 'all';

export type AppAbility = MongoAbility<[Actions, Subjects]>;

/**
 * Определяет права доступа для роли (Приложение А ТЗ)
 */
export function defineAbilitiesFor(roles: string[], userId: string): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    for (const role of roles) {
        switch (role) {
            case 'logist':
                can('manage', 'Order');
                can('read', 'Trip');
                can('manage', 'Vehicle');
                can('manage', 'Driver');
                can('manage', 'Contractor');
                can('read', 'Waybill');
                can('read', 'Permit');
                can('read', 'Tariff');
                can('read', 'Contract');
                can('read', 'Invoice');
                can('read', 'ChecklistTemplate');
                break;

            case 'dispatcher':
                can('read', 'Order');
                can('manage', 'Trip');
                can('read', 'Vehicle');
                can('read', 'Driver');
                can('manage', 'Waybill');
                can('read', 'TechInspection');
                can('read', 'MedInspection'); // только факт допуска
                cannot('read', 'MedInspectionDetails'); // не видит показатели (§А.2)
                can('read', 'Permit');
                can('read', 'Fine');
                can('read', 'RepairRequest');
                can('read', 'ChecklistTemplate');
                break;

            case 'manager':
                can('read', 'Order');
                can('read', 'Trip');
                can('read', 'Vehicle');
                can('read', 'Driver');
                can('read', 'Waybill');
                can('read', 'TechInspection');
                can('read', 'MedInspection'); // агрегированная статистика (§А.2)
                can('read', 'RepairRequest');
                can('read', 'Permit');
                can('read', 'Fine');
                can('read', 'Tariff');
                can('read', 'Contract');
                can('read', 'Invoice');
                can('read', 'KPI');
                can('read', 'ChecklistTemplate');
                break;

            case 'mechanic':
                can('read', 'Vehicle');
                can('update', 'Vehicle');
                can('manage', 'TechInspection');
                can('manage', 'RepairRequest');
                can('read', 'Trip');
                can('read', 'Waybill');
                can('read', 'Permit');
                can('read', 'ChecklistTemplate');
                break;

            case 'medic':
                can('manage', 'MedInspection');
                can('read', 'MedInspectionDetails');
                can('read', 'Driver');
                can('read', 'ChecklistTemplate');
                // Не видит: финансы, ремонты, заявки (§А.2)
                break;

            case 'repair_service':
                can('manage', 'RepairRequest');
                can('read', 'Vehicle');
                can('update', 'Vehicle');
                can('read', 'TechInspection');
                can('read', 'ChecklistTemplate');
                break;

            case 'driver':
                // Только свои данные — фильтрация на уровне query
                can('read', 'Trip');
                can('read', 'Order');
                can('read', 'Waybill');
                can('create', 'RepairRequest');
                can('read', 'Vehicle');
                can('read', 'Driver');
                break;

            case 'accountant':
                can('read', 'Order');
                can('read', 'Trip');
                can('read', 'Vehicle');
                can('read', 'Driver');
                can('read', 'Contractor');
                can('manage', 'Contractor');
                can('read', 'Waybill');
                can('manage', 'Tariff');
                can('manage', 'Contract');
                can('manage', 'Invoice');
                can('manage', 'Fine');
                can('read', 'RepairRequest');
                can('read', 'Permit');
                break;

            case 'admin':
                // Admin has full access to all resources
                can('manage', 'all');
                // §А.3 restrictions — медданные остаются закрытыми
                cannot('read', 'MedInspectionDetails');
                break;

            case 'client':
                // Только свои данные — фильтрация на уровне contractor_id
                can('manage', 'Order');
                can('read', 'Trip');
                can('read', 'Invoice');
                can('read', 'Contract');
                can('read', 'Tariff');
                break;
        }
    }

    return build();
}

/**
 * Fastify middleware — проверяет права на действие
 */
export function requireAbility(action: Actions, subject: Subjects) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = request.user as { userId: string; roles: string[] };
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        const ability = defineAbilitiesFor(user.roles, user.userId);
        if (!ability.can(action, subject)) {
            return reply.status(403).send({
                success: false,
                error: `Нет доступа: ${action} ${subject}`,
            });
        }
    };
}
