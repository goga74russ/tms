'use client';

import { useEffect, useRef } from 'react';

// Simple HTML escaper to prevent XSS in Leaflet Tooltips
function escapeHtml(unsafe: string) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let L: any = null;
if (typeof window !== 'undefined') {
    L = require('leaflet');
}

export interface RoutePoint {
    lat: number;
    lon: number;
    address: string;
    type: 'loading' | 'unloading';
    status: 'pending' | 'arrived' | 'completed' | 'skipped';
    sequenceNumber: number;
}

interface TripRouteLayerProps {
    map: L.Map | null;
    points: RoutePoint[];
    visible: boolean;
}

const STATUS_COLORS: Record<string, string> = {
    pending: '#94a3b8',
    arrived: '#3b82f6',
    completed: '#22c55e',
    skipped: '#ef4444',
};

const POINT_ICONS: Record<string, string> = {
    loading: '📦',
    unloading: '🏁',
};

function createRoutePointIcon(point: RoutePoint) {
    const color = STATUS_COLORS[point.status] || '#94a3b8';
    const emoji = POINT_ICONS[point.type] || '📍';

    return L.divIcon({
        className: 'route-point-marker',
        html: `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: ${color};
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                font-size: 14px;
                cursor: pointer;
                position: relative;
            ">
                ${emoji}
                <div style="
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    background: white;
                    border: 2px solid ${color};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 9px;
                    font-weight: 700;
                    color: ${color};
                ">${point.sequenceNumber}</div>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
}

/**
 * TripRouteLayer — renders route polylines and point markers on a Leaflet map.
 * 
 * Uses direct polylines between route points (no OSRM dependency).
 * Points are color-coded by status and labeled with sequence numbers.
 */
export function TripRouteLayer({ map, points, visible }: TripRouteLayerProps) {
    const layerGroupRef = useRef<L.LayerGroup | null>(null);

    useEffect(() => {
        if (!map) return;

        // Clean up previous layers
        if (layerGroupRef.current) {
            layerGroupRef.current.clearLayers();
            map.removeLayer(layerGroupRef.current);
            layerGroupRef.current = null;
        }

        if (!visible || points.length === 0) return;

        const group = L.layerGroup();

        // Sort points by sequence 
        const sorted = [...points].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

        // Draw polyline connecting all points
        if (sorted.length >= 2) {
            const latLngs = sorted.map(p => [p.lat, p.lon] as L.LatLngExpression);

            // Background line (wider, semi-transparent)
            const bgLine = L.polyline(latLngs, {
                color: '#1e40af',
                weight: 6,
                opacity: 0.2,
                dashArray: undefined,
            });
            group.addLayer(bgLine);

            // Foreground line (thinner, dashed for pending segments)
            for (let i = 1; i < sorted.length; i++) {
                const from = sorted[i - 1];
                const to = sorted[i];
                const segColor = to.status === 'completed' ? '#22c55e' :
                    to.status === 'arrived' ? '#3b82f6' : '#94a3b8';
                const isDashed = to.status === 'pending';

                const segment = L.polyline(
                    [[from.lat, from.lon], [to.lat, to.lon]],
                    {
                        color: segColor,
                        weight: 4,
                        opacity: 0.8,
                        dashArray: isDashed ? '8, 12' : undefined,
                    }
                );
                group.addLayer(segment);
            }
        }

        // Draw markers for each point
        sorted.forEach(point => {
            const icon = createRoutePointIcon(point);
            const marker = L.marker([point.lat, point.lon], { icon });

            const statusLabels: Record<string, string> = {
                pending: 'Ожидание',
                arrived: 'Прибыл',
                completed: 'Завершено',
                skipped: 'Пропущено',
            };

            const typeLabels: Record<string, string> = {
                loading: 'Погрузка',
                unloading: 'Выгрузка',
            };

            marker.bindTooltip(`
                <div style="font-family: system-ui; min-width: 180px; padding: 4px;">
                    <div style="font-weight: 700; font-size: 12px; margin-bottom: 4px;">
                        #${point.sequenceNumber} — ${typeLabels[point.type] || point.type}
                    </div>
                    <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">
                        ${escapeHtml(point.address)}
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${STATUS_COLORS[point.status]};"></div>
                        <span style="font-size: 11px; font-weight: 500; color: ${STATUS_COLORS[point.status]};">
                            ${statusLabels[point.status] || point.status}
                        </span>
                    </div>
                </div>
            `, { direction: 'top', offset: [0, -16] });

            group.addLayer(marker);
        });

        group.addTo(map);
        layerGroupRef.current = group;

        // Fit map to route bounds
        if (sorted.length >= 2) {
            const bounds = L.latLngBounds(sorted.map(p => [p.lat, p.lon] as L.LatLngExpression));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }

        return () => {
            if (layerGroupRef.current) {
                layerGroupRef.current.clearLayers();
                map.removeLayer(layerGroupRef.current);
                layerGroupRef.current = null;
            }
        };
    }, [map, points, visible]);

    return null; // This component manages Leaflet layers imperatively
}
