'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface VehiclePosition {
    vehicleId: string;
    plateNumber: string;
    make: string;
    model: string;
    status: string;
    lat: number;
    lon: number;
    speed: number;
    fuelLevel: number;
    odometerKm: number;
    engineOn: boolean;
    driverName?: string;
    timestamp: string;
}

interface UseVehiclePositionsOptions {
    /** Auto-reconnect on disconnect (default: true) */
    autoReconnect?: boolean;
    /** Reconnect delay in ms (default: 3000) */
    reconnectDelay?: number;
}

/**
 * Hook: Real-time vehicle positions via WebSocket.
 * Connects to /api/ws/vehicles and streams positions.
 * Falls back to REST polling if WS unavailable.
 */
export function useVehiclePositions(options: UseVehiclePositionsOptions = {}) {
    const { autoReconnect = true, reconnectDelay = 3000 } = options;
    const [positions, setPositions] = useState<VehiclePosition[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
        const wsUrl = apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '/api/ws/vehicles');

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!mountedRef.current) return;
                setIsConnected(true);
                setError(null);
                console.log('📡 WS connected to vehicle positions');
            };

            ws.onmessage = (event) => {
                if (!mountedRef.current) return;
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'vehicle_positions' && Array.isArray(msg.data)) {
                        setPositions(msg.data);
                    }
                } catch { /* ignore parse errors */ }
            };

            ws.onclose = () => {
                if (!mountedRef.current) return;
                setIsConnected(false);
                wsRef.current = null;

                if (autoReconnect) {
                    reconnectTimerRef.current = setTimeout(connect, reconnectDelay);
                }
            };

            ws.onerror = () => {
                if (!mountedRef.current) return;
                setError('WebSocket connection failed');
                ws.close();
            };
        } catch (err: any) {
            setError(err.message);
            // Fallback to REST polling
            fallbackPoll();
        }
    }, [autoReconnect, reconnectDelay]);

    // REST fallback: poll every 10s if WS fails
    const fallbackPoll = useCallback(async () => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
            const res = await fetch(`${apiUrl}/vehicles/positions`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (mountedRef.current) {
                    setPositions(data.data || []);
                }
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        connect();

        return () => {
            mountedRef.current = false;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]);

    return { positions, isConnected, error };
}
