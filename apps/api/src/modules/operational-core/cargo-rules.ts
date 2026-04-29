import type { CompatibilityCheck, CompatibilityStatus } from './compatibility-service.js';

export type CargoRuleAssignment = {
    assignmentId: string;
    orderId: string;
    shipmentLotId: string;
    cargoDescription?: string | null;
    cargoType?: string | null;
    assignedWeightKg?: unknown;
    assignedVolumeM3?: unknown;
    assignedPlaces?: unknown;
    requirementsSnapshot?: Record<string, unknown> | null;
    vehicleRequirements?: string | null;
};

export type CargoRuleTrip = {
    vehicleBodyType?: string | null;
};

function toNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value: unknown) {
    return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function snapshotText(snapshot: Record<string, unknown> | null | undefined) {
    if (!snapshot) return '';
    return Object.entries(snapshot)
        .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        .map(([key, value]) => `${key}:${String(value)}`)
        .join(' ');
}

function assignmentText(assignment: CargoRuleAssignment) {
    return normalize([
        assignment.cargoDescription,
        assignment.cargoType,
        assignment.vehicleRequirements,
        snapshotText(assignment.requirementsSnapshot),
    ].filter(Boolean).join(' '));
}

function hasAny(text: string, tokens: string[]) {
    return tokens.some((token) => text.includes(token));
}

function hasExplicitPermit(text: string) {
    return hasAny(text, ['permit', 'allowed', 'approved', 'dopog permit', 'adr permit', 'разреш', 'допуск', 'допог', 'adr']);
}

function bodyHasAny(bodyType: string, tokens: string[]) {
    return hasAny(normalize(bodyType), tokens);
}

function check(status: CompatibilityStatus, code: string, message: string, details?: Record<string, unknown>): CompatibilityCheck {
    return { status, code, message, details };
}

export function evaluateCargoRules(assignments: CargoRuleAssignment[], trip: CargoRuleTrip): CompatibilityCheck[] {
    const checks: CompatibilityCheck[] = [];
    const bodyType = trip.vehicleBodyType ?? '';
    const classified = assignments.map((assignment) => {
        const text = assignmentText(assignment);
        const assignedWeightKg = toNumber(assignment.assignedWeightKg);
        return {
            assignment,
            text,
            assignedWeightKg,
            hazardous: hasAny(text, ['hazard', 'danger', 'adr', 'dopog', 'опас', 'допог', 'химикат', 'chemical']),
            food: hasAny(text, ['food', 'продукт', 'пищ', 'молок', 'meat', 'fish']),
            chemical: hasAny(text, ['chemical', 'химикат', 'реагент', 'acid', 'кислот']),
            oversized: hasAny(text, ['oversize', 'oversized', 'heavyweight', 'heavy weight', 'крупногабарит', 'кгт', 'тяжеловес', 'негабарит'])
                || (assignedWeightKg !== null && assignedWeightKg > 40000),
            valuable: hasAny(text, ['valuable', 'high value', 'declared value', 'ценн', 'дорог', 'страхован', 'пломб']),
            bulk: hasAny(text, ['bulk', 'сыпуч', 'grain', 'cement', 'powder', 'sand']),
            liquid: hasAny(text, ['liquid', 'налив', 'fuel', 'oil', 'milk', 'цистерн', 'tank']),
        };
    });

    for (const item of classified) {
        const base = {
            assignmentId: item.assignment.assignmentId,
            orderId: item.assignment.orderId,
            shipmentLotId: item.assignment.shipmentLotId,
            cargoType: item.assignment.cargoType ?? null,
            vehicleBodyType: bodyType,
        };

        if (item.hazardous) {
            checks.push(check(
                hasExplicitPermit(item.text) ? 'warning' : 'blocking',
                'hazardous_cargo',
                hasExplicitPermit(item.text)
                    ? 'Hazardous cargo markers detected; dispatcher must verify ADR/DOPОG documents and driver/vehicle admission.'
                    : 'Hazardous cargo markers detected without explicit ADR/DOPОG permit/admission markers.',
                base,
            ));
        }

        if (item.oversized) {
            checks.push(check(
                hasExplicitPermit(item.text) ? 'warning' : 'blocking',
                'oversized_or_heavyweight',
                hasExplicitPermit(item.text)
                    ? 'Oversized/heavyweight cargo markers detected; route permit must be verified.'
                    : 'Oversized/heavyweight cargo markers detected without explicit route permit markers.',
                { ...base, assignedWeightKg: item.assignedWeightKg },
            ));
        }

        if (item.valuable) {
            const hasEvidenceMarkers = hasAny(item.text, ['insurance', 'insured', 'seal', 'sealed', 'страх', 'пломб', 'охрана']);
            checks.push(check(
                hasEvidenceMarkers ? 'warning' : 'blocking',
                'valuable_cargo',
                hasEvidenceMarkers
                    ? 'Valuable cargo markers detected; insurance/seal/security evidence should be attached.'
                    : 'Valuable cargo markers detected without insurance/seal/security evidence markers.',
                base,
            ));
        }

        if (item.bulk || item.liquid) {
            const compatibleBody = item.liquid
                ? bodyHasAny(bodyType, ['cistern', 'tank', 'цистерн'])
                : bodyHasAny(bodyType, ['silo', 'hopper', 'bulk', 'самосвал', 'зерновоз']);
            checks.push(check(
                compatibleBody ? 'warning' : 'blocking',
                item.liquid ? 'liquid_cargo_body' : 'bulk_cargo_body',
                compatibleBody
                    ? 'Bulk/liquid cargo body marker matches the cargo category; cleaning/tare evidence still must be verified.'
                    : 'Bulk/liquid cargo is assigned to a vehicle without a matching body marker.',
                base,
            ));
        }
    }

    const hasFood = classified.some((item) => item.food);
    const hasHazardousOrChemical = classified.some((item) => item.hazardous || item.chemical);
    if (assignments.length > 1 && hasFood && hasHazardousOrChemical) {
        checks.push(check(
            'blocking',
            'cargo_incompatibility',
            'Food cargo is combined with hazardous/chemical cargo in one trip; товарное соседство must be reviewed.',
            {
                assignmentCount: assignments.length,
                foodAssignments: classified.filter((item) => item.food).map((item) => item.assignment.assignmentId),
                hazardousOrChemicalAssignments: classified.filter((item) => item.hazardous || item.chemical).map((item) => item.assignment.assignmentId),
            },
        ));
    }

    if (checks.length === 0) {
        checks.push(check('ok', 'cargo_rules', 'No special cargo rule markers were detected.'));
    }

    return checks;
}
