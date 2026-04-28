type FleetReadinessVehicleSnapshot = {
    id: string;
    plateNumber: string;
    status?: string | null;
    currentOdometerKm?: number | null;
    lastOdometerKm?: number | null;
    maintenanceNextKm?: number | null;
    maintenanceNextDate?: Date | string | null;
    techInspectionExpiry?: Date | string | null;
    osagoExpiry?: Date | string | null;
    tachographCalibrationExpiry?: Date | string | null;
};

export type FleetReadinessIssue = {
    key: string;
    label: string;
    severity: 'critical' | 'warning';
    count: number;
};

export type FleetReadinessVehicle = {
    vehicleId: string;
    plateNumber: string;
    severity: 'critical' | 'warning' | 'ready';
    reasons: FleetReadinessIssue[];
};

export type FleetReadinessSnapshot = {
    readyCount: number;
    attentionCount: number;
    blockedCount: number;
    totalCount: number;
    issues: FleetReadinessIssue[];
    vehicles: FleetReadinessVehicle[];
};

const CRITICAL_STATUSES = new Set(['blocked', 'broken', 'maintenance']);

function daysUntil(value: Date | string | null | undefined, now: Date) {
    if (!value) return null;
    const expiry = new Date(value);
    if (Number.isNaN(expiry.getTime())) return null;
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function pushReason(
    reasons: FleetReadinessIssue[],
    key: string,
    label: string,
    severity: 'critical' | 'warning',
) {
    reasons.push({ key, label, severity, count: 1 });
}

export function buildFleetReadinessSnapshot(
    fleet: FleetReadinessVehicleSnapshot[],
    now = new Date(),
): FleetReadinessSnapshot {
    const issueMap = new Map<string, FleetReadinessIssue>();
    const vehicles: FleetReadinessVehicle[] = fleet.map((vehicle) => {
        const reasons: FleetReadinessIssue[] = [];
        const currentOdometerKm = vehicle.lastOdometerKm ?? vehicle.currentOdometerKm ?? null;
        const status = (vehicle.status ?? '').toLowerCase();

        if (CRITICAL_STATUSES.has(status)) {
            pushReason(reasons, `status:${status}`, `Статус: ${vehicle.status}`, 'critical');
        } else if (status === 'in_trip') {
            pushReason(reasons, 'status:in_trip', 'ТС в рейсе', 'warning');
        }

        const docChecks = [
            { key: 'doc:tech_inspection', label: 'Техосмотр', value: vehicle.techInspectionExpiry },
            { key: 'doc:osago', label: 'ОСАГО', value: vehicle.osagoExpiry },
            { key: 'doc:tachograph', label: 'Тахограф', value: vehicle.tachographCalibrationExpiry },
        ] as const;

        for (const check of docChecks) {
            const daysLeft = daysUntil(check.value, now);
            if (daysLeft === null) continue;
            if (daysLeft < 0) {
                pushReason(reasons, `${check.key}:expired`, `${check.label} просрочен`, 'critical');
            } else if (daysLeft <= 7) {
                pushReason(reasons, `${check.key}:due_7`, `${check.label} скоро истекает`, 'critical');
            } else if (daysLeft <= 30) {
                pushReason(reasons, `${check.key}:due_30`, `${check.label} истекает в течение 30 дней`, 'warning');
            }
        }

        const maintenanceDaysLeft = daysUntil(vehicle.maintenanceNextDate, now);
        if (maintenanceDaysLeft !== null) {
            if (maintenanceDaysLeft < 0) {
                pushReason(reasons, 'maintenance:date_overdue', 'Плановое ТО просрочено', 'critical');
            } else if (maintenanceDaysLeft <= 7) {
                pushReason(reasons, 'maintenance:date_due_7', 'Плановое ТО скоро', 'critical');
            } else if (maintenanceDaysLeft <= 30) {
                pushReason(reasons, 'maintenance:date_due_30', 'Плановое ТО в ближайшие 30 дней', 'warning');
            }
        }

        if (
            typeof vehicle.maintenanceNextKm === 'number' &&
            typeof currentOdometerKm === 'number'
        ) {
            const kmLeft = vehicle.maintenanceNextKm - currentOdometerKm;
            if (kmLeft <= 0) {
                pushReason(reasons, 'maintenance:km_overdue', 'Пробег до ТО уже превышен', 'critical');
            } else if (kmLeft <= 2000) {
                pushReason(reasons, 'maintenance:km_due_2000', 'До ТО осталось меньше 2000 км', 'warning');
            }
        }

        for (const reason of reasons) {
            const existing = issueMap.get(reason.key);
            if (existing) {
                existing.count += 1;
            } else {
                issueMap.set(reason.key, { ...reason, count: 1 });
            }
        }

        return {
            vehicleId: vehicle.id,
            plateNumber: vehicle.plateNumber,
            severity: reasons.length === 0
                ? 'ready'
                : reasons.some((item) => item.severity === 'critical')
                    ? 'critical'
                    : 'warning',
            reasons,
        };
    });

    const blockedCount = vehicles.filter((vehicle) => vehicle.severity === 'critical').length;
    const attentionCount = vehicles.filter((vehicle) => vehicle.severity === 'warning').length;
    const readyCount = Math.max(fleet.length - blockedCount - attentionCount, 0);

    const issues = [...issueMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
    const vehiclesWithIssues = vehicles
        .filter((vehicle) => vehicle.reasons.length > 0)
        .sort((a, b) => {
            if (a.severity !== b.severity) {
                return a.severity === 'critical' ? -1 : 1;
            }
            return b.reasons.length - a.reasons.length;
        });

    return {
        readyCount,
        attentionCount,
        blockedCount,
        totalCount: fleet.length,
        issues,
        vehicles: vehiclesWithIssues,
    };
}
