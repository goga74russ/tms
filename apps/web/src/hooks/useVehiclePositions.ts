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
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mountedRef = useRef(true);

    const getApiBase = useCallback(() => '/api', []);

    const getWsUrl = useCallback(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/api/ws/vehicles`;
    }, []);

    const fallbackPoll = useCallback(async () => {
        try {
            const res = await fetch(`${getApiBase()}/vehicles/positions`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (mountedRef.current) {
                    setPositions(data.data || []);
                }
            }
        } catch { /* silent */ }
    }, [getApiBase]);

    const startFallbackPolling = useCallback(() => {
        if (pollTimerRef.current) return;
        fallbackPoll();
        pollTimerRef.current = setInterval(fallbackPoll, 10000);
    }, [fallbackPoll]);

    const connect = useCallback(async () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        // Fetch WS auth token via cookie-authenticated endpoint
        let token = '';
        try {
            const res = await fetch(`${getApiBase()}/auth/ws-token`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                token = data.token || '';
            }
        } catch { /* will fail to connect below */ }

        if (!token) {
            setError('Failed to get WS token');
            startFallbackPolling();
            return;
        }

        try {
            const ws = new WebSocket(getWsUrl(), ['jwt', token]);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!mountedRef.current) return;
                setIsConnected(true);
                setError(null);
                if (pollTimerRef.current) {
                    clearInterval(pollTimerRef.current);
                    pollTimerRef.current = null;
                }
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
            startFallbackPolling();
        }
    }, [autoReconnect, reconnectDelay, getApiBase, getWsUrl, startFallbackPolling]);

    useEffect(() => {
        mountedRef.current = true;
        connect();

        return () => {
            mountedRef.current = false;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]);

    return { positions, isConnected, error };
}
