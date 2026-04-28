import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { appSettings } from '../../db/schema.js';

export const COST_SETTING_KEYS = {
    fuelPricePerLiter: 'cost.fuel_price_per_liter',
    driverSalaryPerHour: 'cost.driver_salary_per_hour',
    amortizationPerKm: 'cost.amortization_per_km',
} as const;

type CostSettingField = keyof typeof COST_SETTING_KEYS;

const DEFAULT_COST_SETTINGS = {
    fuelPricePerLiter: 60,
    driverSalaryPerHour: 350,
    amortizationPerKm: 3,
} as const satisfies Record<CostSettingField, number>;

const COST_SETTING_DESCRIPTIONS: Record<CostSettingField, string> = {
    fuelPricePerLiter: 'Цена топлива, ₽/л',
    driverSalaryPerHour: 'Ставка водителя, ₽/час',
    amortizationPerKm: 'Амортизация, ₽/км',
};

function toFiniteNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getCostModelSettings() {
    const rows = await db.select()
        .from(appSettings)
        .where(inArray(appSettings.key, Object.values(COST_SETTING_KEYS)));

    const map = new Map(rows.map((row) => [row.key, row]));

    const readSetting = (field: CostSettingField, envName: string) => {
        const dbRow = map.get(COST_SETTING_KEYS[field]);
        if (dbRow) {
            return {
                key: COST_SETTING_KEYS[field],
                value: toFiniteNumber(dbRow.value, DEFAULT_COST_SETTINGS[field]),
                source: 'database' as const,
                description: dbRow.description ?? COST_SETTING_DESCRIPTIONS[field],
                updatedAt: dbRow.updatedAt,
            };
        }

        if (process.env[envName]) {
            return {
                key: COST_SETTING_KEYS[field],
                value: toFiniteNumber(process.env[envName], DEFAULT_COST_SETTINGS[field]),
                source: 'env' as const,
                description: COST_SETTING_DESCRIPTIONS[field],
                updatedAt: null,
            };
        }

        return {
            key: COST_SETTING_KEYS[field],
            value: DEFAULT_COST_SETTINGS[field],
            source: 'default' as const,
            description: COST_SETTING_DESCRIPTIONS[field],
            updatedAt: null,
        };
    };

    const fuelPricePerLiter = readSetting('fuelPricePerLiter', 'FUEL_PRICE_PER_LITER');
    const driverSalaryPerHour = readSetting('driverSalaryPerHour', 'DRIVER_SALARY_PER_HOUR');
    const amortizationPerKm = readSetting('amortizationPerKm', 'AMORTIZATION_PER_KM');

    return {
        fuelPricePerLiter,
        driverSalaryPerHour,
        amortizationPerKm,
    };
}

export async function updateCostModelSettings(
    input: Partial<Record<CostSettingField, number>>,
    updatedBy?: string,
) {
    const patches = (Object.keys(input) as CostSettingField[])
        .filter((field) => input[field] !== undefined)
        .map((field) => ({
            field,
            key: COST_SETTING_KEYS[field],
            value: String(input[field]!),
            description: COST_SETTING_DESCRIPTIONS[field],
        }));

    for (const patch of patches) {
        const [existing] = await db.select({ id: appSettings.id })
            .from(appSettings)
            .where(eq(appSettings.key, patch.key))
            .limit(1);

        if (existing) {
            await db.update(appSettings)
                .set({
                    value: patch.value,
                    description: patch.description,
                    updatedBy: updatedBy ?? null,
                    updatedAt: new Date(),
                })
                .where(eq(appSettings.id, existing.id));
        } else {
            await db.insert(appSettings).values({
                key: patch.key,
                value: patch.value,
                description: patch.description,
                updatedBy: updatedBy ?? null,
            });
        }
    }

    return getCostModelSettings();
}

export async function listRecentSettings() {
    return db.select()
        .from(appSettings)
        .orderBy(desc(appSettings.updatedAt))
        .limit(20);
}
