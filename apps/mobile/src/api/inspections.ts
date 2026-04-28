// ============================================================
// Inspections API Client — Mobile App (mechanic tech inspections)
// ============================================================
import { getToken } from './auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

async function authFetch(path: string, options: RequestInit = {}) {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...options.headers,
        },
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API error: ${res.status}`);
    }

    return res.json();
}

export interface QueueItem {
    trip: {
        id: string;
        number: string;
        plannedDepartureAt: string | null;
    };
    vehicle: {
        id: string;
        plateNumber: string;
        make: string;
        model: string;
    };
    documentExpiry: {
        osago?: string | null;
        techPassport?: string | null;
    };
}

export interface ChecklistTemplate {
    id: string;
    name: string;
    version: string;
    items: Array<{
        name: string;
        responseType?: string;
        required: boolean;
    }>;
}

export interface TechInspectionItem {
    name: string;
    result: 'ok' | 'fault';
    comment?: string;
    photoUrl?: string;
}

export interface TechInspectionPayload {
    vehicleId: string;
    tripId?: string;
    inspectionType: 'pre_trip' | 'periodic';
    checklistVersion: string;
    items: TechInspectionItem[];
    decision: 'approved' | 'rejected';
    comment?: string;
    signature: string;
}

export async function getTechQueue(): Promise<QueueItem[]> {
    const data = await authFetch('/inspections/tech/queue');
    return data.data || [];
}

export async function getTechChecklist(): Promise<ChecklistTemplate | null> {
    try {
        const data = await authFetch('/inspections/tech/checklist');
        return data.data || null;
    } catch {
        return null;
    }
}

export async function submitTechInspection(payload: TechInspectionPayload): Promise<any> {
    return authFetch('/inspections/tech', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

