// ============================================================
// RBAC — Role-Based Access Control (Приложение А ТЗ)
// Использует CASL для гибких политик
// ============================================================
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { FastifyRequest, FastifyReply } from 'fastify';

// A-P1-6: canonical role list. The role names used in `defineAbilitiesFor`
// below are the ONLY values admin/onboarding endpoints should accept on user
// creation/update. Anything else was silently stored before and would have
// granted zero abilities — but the unbounded `z.array(z.string())` schemas
// gave attackers latitude to fingerprint or seed garbage roles. Use this list
// in `z.array(z.enum(APP_ROLES))` everywhere user roles are taken as input.
export const APP_ROLES = [
    'admin',
    'manager',
    'dispatcher',
    'logist',
    'accountant',
    'mechanic',
    'medic',
    'repair_service',
    'client',
    'driver',
] as const;
export type AppRole = typeof APP_ROLES[number];

type Actions = 'read' | 'create' | 'update' | 'delete' | 'manage';
type Subjects =
    | 'Order' | 'Trip' | 'Vehicle' | 'Driver' | 'Contractor'
    | 'TechInspection' | 'MedInspection' | 'MedInspectionDetails'
    | 'Waybill' | 'RepairRequest' | 'Permit' | 'Fine'
    | 'Tariff' | 'Contract' | 'Invoice'
    | 'KPI' | 'Settings' | 'ChecklistTemplate'
    | 'Incident' | 'Trailer' | 'WaybillExpense' | 'WaybillDriver' | 'WaybillAttachment'
    | 'DeliveryConfirmation' | 'DocumentReturn'
    | 'Claim'
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
                can('manage', 'Incident');
                can('manage', 'Trailer');
                can('read', 'WaybillExpense');
                can('read', 'WaybillDriver');
                can('read', 'WaybillAttachment');
                can('manage', 'WaybillAttachment');
                can('manage', 'Claim');
                break;

            case 'dispatcher':
                can('read', 'Order');
                can('manage', 'Trip');
                can('manage', 'Claim');
                can('read', 'Vehicle');
                can('read', 'Driver');
                can('manage', 'Waybill');
                can('manage', 'DeliveryConfirmation'); // Sprint 13: просмотр + force-close
                can('manage', 'DocumentReturn'); // Sprint 11: реестр оригиналов
                can('read', 'TechInspection');
                can('read', 'MedInspection'); // только факт допуска
                cannot('read', 'MedInspectionDetails'); // не видит показатели (§А.2)
                can('read', 'Permit');
                can('read', 'Fine');
                can('read', 'RepairRequest');
                can('read', 'ChecklistTemplate');
                can('manage', 'Incident');
                can('read', 'Trailer');
                can('manage', 'WaybillExpense');
                can('manage', 'WaybillDriver');
                can('manage', 'WaybillAttachment');
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
                can('read', 'Incident');
                can('read', 'Trailer');
                can('read', 'WaybillExpense');
                can('read', 'WaybillDriver');
                can('read', 'WaybillAttachment');
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
                can('manage', 'Incident');
                can('read', 'Trailer');
                can('read', 'WaybillDriver');
                break;

            case 'medic':
                can('manage', 'MedInspection');
                can('read', 'MedInspectionDetails');
                can('read', 'Driver');
                can('read', 'ChecklistTemplate');
                can('read', 'Incident');
                // Не видит: финансы, ремонты, заявки (§А.2)
                break;

            case 'repair_service':
                can('manage', 'RepairRequest');
                can('read', 'Vehicle');
                can('update', 'Vehicle');
                can('read', 'TechInspection');
                can('read', 'ChecklistTemplate');
                can('read', 'Incident');
                can('read', 'Trailer');
                break;

            case 'driver':
                // Только свои данные — фильтрация на уровне query
                can('read', 'Trip');
                can('read', 'Order');
                can('create', 'DeliveryConfirmation'); // Sprint 13: водитель создаёт подтверждение
                can('read', 'DocumentReturn'); // Sprint 11: водитель видит статус своих документов
                can('read', 'Waybill');
                can('create', 'RepairRequest');
                can('read', 'Vehicle');
                can('read', 'Driver');
                can('read', 'Incident');
                can('read', 'WaybillDriver');
                can('manage', 'WaybillExpense');
                can('manage', 'WaybillAttachment');
                break;

            case 'accountant':
                can('read', 'Order');
                can('read', 'Trip');
                can('manage', 'DocumentReturn'); // Sprint 11: реестр оригиналов
                can('manage', 'Claim');
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
                can('read', 'Trailer');
                can('manage', 'WaybillExpense');
                can('read', 'KPI');
                break;

            case 'admin':
                // Admin has full access to all resources
                can('manage', 'all');
                // §А.3 restrictions — медданные остаются закрытыми
                cannot('read', 'MedInspectionDetails');
                cannot('read', 'KPI');
                break;

            case 'client':
                // Только свои данные — фильтрация на уровне contractor_id
                can('read', 'Order');
                can('read', 'Trip');
                can('read', 'Invoice');
                can('read', 'Contract');
                can('read', 'Tariff');
                can('read', 'Claim'); // только свои (фильтр по contractorId)
                break;
        }
    }

    return build();
}

/**
 * Human-readable Russian labels for CASL actions and subjects.
 * Used by requireAbility() to produce user-facing 403 messages instead of
 * leaking the internal `read KPI`-style ability string.
 */
const ACTION_LABELS: Record<Actions, string> = {
    read: 'просмотр',
    create: 'создание',
    update: 'изменение',
    delete: 'удаление',
    manage: 'управление',
};

const SUBJECT_LABELS: Record<Subjects, string> = {
    Order: 'заявок',
    Trip: 'рейсов',
    Vehicle: 'автопарка',
    Driver: 'водителей',
    Contractor: 'контрагентов',
    TechInspection: 'технических осмотров',
    MedInspection: 'медосмотров',
    MedInspectionDetails: 'деталей медосмотров',
    Waybill: 'путевых листов',
    RepairRequest: 'заявок на ремонт',
    Permit: 'разрешений',
    Fine: 'штрафов',
    Tariff: 'тарифов',
    Contract: 'договоров',
    Invoice: 'счетов',
    KPI: 'панели KPI',
    Settings: 'настроек',
    ChecklistTemplate: 'шаблонов чек-листов',
    Incident: 'инцидентов',
    Trailer: 'прицепов',
    WaybillExpense: 'расходов по путевому листу',
    WaybillDriver: 'водителей путевого листа',
    WaybillAttachment: 'вложений путевого листа',
    DeliveryConfirmation: 'подтверждений доставки',
    DocumentReturn: 'возврата документов',
    Claim: 'претензий',
    all: 'системы',
};

/**
 * Fastify middleware — проверяет права на действие
 */
export function requireAbility(action: Actions, subject: Subjects) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = request.user as { userId: string; roles: string[] };
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Требуется авторизация' });
        }

        const ability = defineAbilitiesFor(user.roles, user.userId);
        if (!ability.can(action, subject)) {
            const actionLabel = ACTION_LABELS[action] ?? action;
            const subjectLabel = SUBJECT_LABELS[subject] ?? subject;
            return reply.status(403).send({
                success: false,
                error: `Недостаточно прав: ${actionLabel} ${subjectLabel}`,
                // Stable code for the frontend (e.g. to swap in a Paywall-style
                // explainer) while the `error` field carries the localized text.
                code: 'ABILITY_DENIED',
                action,
                subject,
            });
        }
    };
}