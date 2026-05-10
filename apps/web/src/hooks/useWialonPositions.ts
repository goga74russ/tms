'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface WialonPosition {
    recordedAt: string;
    latitude: number;
    longitude: number;
    speedKmh: number;
    headingDeg: number;
}

export interface ActiveVehicleSubscription {
    vehicleId: string;
    plateNumber?: string;
}

export interface LiveVehicleMarker {
    vehicleId: string;
    plateNumber?: string;
    position: WialonPosition;
}

/**
 * Polls /integrations/wialon-mock/positions every `intervalMs` (default 15s)
 * for each subscribed vehicle and returns latest positions per vehicle.
 */
export function useWialonPositions(
    subscriptions: ActiveVehicleSubscription[],
    intervalMs = 15000,
) {
    const [markers, setMarkers] = useState<Record<string, LiveVehicleMarker>>({});
    const sinceRef = useRef<Record<string, string>>({});
    // Stable JSON key so the polling effect only restarts when the actual subscription set changes
    const subsKey = JSON.stringify(subscriptions.map(s => `${s.vehicleId}|${s.plateNumber ?? ''}`).sort());

    useEffect(() => {
        if (subscriptions.length === 0) {
            setMarkers({});
            return;
        }

        let cancelled = false;

        async function pollOnce() {
            await Promise.all(
                subscriptions.map(async (sub) => {
                    try {
                        const since = sinceRef.current[sub.vehicleId];
                        const qs = new URLSearchParams({ vehicleId: sub.vehicleId });
                        if (since) qs.set('since', since);
                        const res = await api.get<{ success: boolean; data: WialonPosition[] }>(
                            `/integrations/wialon-mock/positions?${qs.toString()}`,
                        );
                        if (cancelled || !res?.success || !Array.isArray(res.data) || res.data.length === 0) return;
                        const last = res.data[res.data.length - 1];
                        sinceRef.current[sub.vehicleId] = last.recordedAt;
                        setMarkers(prev => ({
                            ...prev,
                            [sub.vehicleId]: {
                                vehicleId: sub.vehicleId,
                                plateNumber: sub.plateNumber,
                                position: last,
                            },
                        }));
                    } catch {
                        // silent — server may be unavailable
                    }
                }),
            );
        }

        pollOnce();
        const id = setInterval(pollOnce, intervalMs);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subsKey, intervalMs]);

    return markers;
}
