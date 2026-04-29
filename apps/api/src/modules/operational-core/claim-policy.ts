export type ClaimType = 'damage' | 'delay' | 'loss' | 'other';
export type ClaimStatus = 'open' | 'investigating' | 'resolved' | 'rejected';
export type ClaimCause = 'shortage' | 'damage' | 'delay' | 'downtime' | 'refusal' | 'overage' | 'wrong_docs' | 'other';

export type ClaimMetadataInput = {
    cause?: ClaimCause | string | null;
    reserveAmount?: number | string | null;
    estimatedAmount?: number | string | null;
    settlementNote?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type ClaimLike = {
    amount?: string | number | null;
    resolvedAmount?: string | number | null;
    description?: string | null;
    resolution?: string | null;
    attachments?: unknown;
    status?: ClaimStatus | string;
    type?: ClaimType | string;
};

export type ClaimClassification = {
    type: ClaimType;
    cause: ClaimCause;
};

export type ClaimExposure = {
    claimedAmount: number | null;
    reserveAmount: number | null;
    estimatedAmount: number | null;
    resolvedAmount: number | null;
    effectiveExposureAmount: number;
    exposureBasis: 'amount' | 'reserve' | 'estimated' | 'none';
    cause: ClaimCause;
    settlementNote: string | null;
};

export const CLAIM_METADATA_KIND = 'claim_policy_metadata';

const causeToType: Record<ClaimCause, ClaimType> = {
    shortage: 'loss',
    damage: 'damage',
    delay: 'delay',
    downtime: 'delay',
    refusal: 'loss',
    overage: 'other',
    wrong_docs: 'other',
    other: 'other',
};

function toFiniteAmount(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const normalized = typeof value === 'string'
        ? value.replace(/\s/g, '').replace(',', '.')
        : value;
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount < 0) return null;
    return amount;
}

function normalizeCause(value: unknown): ClaimCause | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase().replace(/-/g, '_');
    if (normalized === 'loss') return 'shortage';
    if (normalized in causeToType) return normalized as ClaimCause;
    return null;
}

function normalizeType(value: unknown): ClaimType | null {
    if (value === 'damage' || value === 'delay' || value === 'loss' || value === 'other') return value;
    return null;
}

function metadataObjects(attachments: unknown): Record<string, unknown>[] {
    if (!Array.isArray(attachments)) return [];
    return attachments.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
}

function findMetadata(attachments: unknown): Record<string, unknown> | null {
    return metadataObjects(attachments).find((item) => item.kind === CLAIM_METADATA_KIND || item.kind === 'claim_metadata') ?? null;
}

function parseDescriptionAmount(description: string | null | undefined, key: string): number | null {
    if (!description) return null;
    const pattern = new RegExp(`(?:${key})\\s*[:=]\\s*([0-9]+(?:[\\s.,][0-9]+)?)`, 'i');
    const match = description.match(pattern);
    return toFiniteAmount(match?.[1]);
}

function parseDescriptionCause(description: string | null | undefined): ClaimCause | null {
    if (!description) return null;
    const lower = description.toLowerCase();
    for (const cause of Object.keys(causeToType) as ClaimCause[]) {
        if (lower.includes(cause)) return cause;
    }
    if (lower.includes('discrepancycode=shortage')) return 'shortage';
    if (lower.includes('discrepancycode=refusal')) return 'refusal';
    return null;
}

export function classifyClaim(input: { type?: ClaimType | string | null; cause?: ClaimCause | string | null; description?: string | null }): ClaimClassification {
    const cause = normalizeCause(input.cause) ?? parseDescriptionCause(input.description) ?? 'other';
    const type = normalizeType(input.type) ?? causeToType[cause] ?? 'other';
    return { type, cause };
}

export function buildClaimAttachments(attachments: unknown[] | undefined, input: ClaimMetadataInput): unknown[] {
    const base = Array.isArray(attachments) ? [...attachments] : [];
    const reserveAmount = toFiniteAmount(input.reserveAmount);
    const estimatedAmount = toFiniteAmount(input.estimatedAmount);
    const cause = normalizeCause(input.cause);
    const settlementNote = typeof input.settlementNote === 'string' && input.settlementNote.trim()
        ? input.settlementNote.trim()
        : null;
    const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : null;

    if (reserveAmount === null && estimatedAmount === null && !cause && !settlementNote && !metadata) {
        return base;
    }

    base.push({
        kind: CLAIM_METADATA_KIND,
        version: 1,
        ...(cause ? { cause } : {}),
        ...(reserveAmount !== null ? { reserveAmount } : {}),
        ...(estimatedAmount !== null ? { estimatedAmount } : {}),
        ...(settlementNote ? { settlementNote } : {}),
        ...(metadata ? { metadata } : {}),
    });

    return base;
}

export function appendSettlementNote(existing: string | null | undefined, note: string | null | undefined): string | null {
    const trimmed = typeof note === 'string' ? note.trim() : '';
    if (!trimmed) return existing ?? null;
    if (!existing) return `Settlement note: ${trimmed}`;
    return `${existing}\nSettlement note: ${trimmed}`;
}

export function getClaimExposure(claim: ClaimLike): ClaimExposure {
    const metadata = findMetadata(claim.attachments);
    const classification = classifyClaim({
        type: claim.type,
        cause: metadata?.cause as string | undefined,
        description: claim.description,
    });

    const claimedAmount = toFiniteAmount(claim.amount);
    const reserveAmount = toFiniteAmount(metadata?.reserveAmount) ?? parseDescriptionAmount(claim.description, 'reserveAmount|reserve');
    const estimatedAmount = toFiniteAmount(metadata?.estimatedAmount) ?? parseDescriptionAmount(claim.description, 'estimatedAmount|estimated');
    const resolvedAmount = toFiniteAmount(claim.resolvedAmount);
    const settlementNote = typeof metadata?.settlementNote === 'string'
        ? metadata.settlementNote
        : null;

    if (claimedAmount !== null) {
        return { claimedAmount, reserveAmount, estimatedAmount, resolvedAmount, effectiveExposureAmount: claimedAmount, exposureBasis: 'amount', cause: classification.cause, settlementNote };
    }
    if (reserveAmount !== null) {
        return { claimedAmount, reserveAmount, estimatedAmount, resolvedAmount, effectiveExposureAmount: reserveAmount, exposureBasis: 'reserve', cause: classification.cause, settlementNote };
    }
    if (estimatedAmount !== null) {
        return { claimedAmount, reserveAmount, estimatedAmount, resolvedAmount, effectiveExposureAmount: estimatedAmount, exposureBasis: 'estimated', cause: classification.cause, settlementNote };
    }
    return { claimedAmount, reserveAmount, estimatedAmount, resolvedAmount, effectiveExposureAmount: 0, exposureBasis: 'none', cause: classification.cause, settlementNote };
}

export function enrichClaim<T extends ClaimLike>(claim: T): T & { exposure: ClaimExposure; reserveAmount: number | null; estimatedAmount: number | null; effectiveExposureAmount: number; exposureBasis: ClaimExposure['exposureBasis']; cause: ClaimCause; settlementNote: string | null } {
    const exposure = getClaimExposure(claim);
    return {
        ...claim,
        exposure,
        reserveAmount: exposure.reserveAmount,
        estimatedAmount: exposure.estimatedAmount,
        effectiveExposureAmount: exposure.effectiveExposureAmount,
        exposureBasis: exposure.exposureBasis,
        cause: exposure.cause,
        settlementNote: exposure.settlementNote,
    };
}
