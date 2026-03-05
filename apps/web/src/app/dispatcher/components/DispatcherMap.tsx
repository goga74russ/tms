'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type { Vehicle } from '../page';
import { TripRouteLayer, type RoutePoint } from './TripRouteLayer';

// Simple HTML escaper to prevent XSS
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

interface DispatcherMapProps {
    vehicles: Vehicle[];
    selectedVehicle: string | null;
    onSelectVehicle: (id: string | null) => void;
    tripRoutePoints?: RoutePoint[];
}

const STATUS_COLORS: Record<string, string> = {
    available: '#22c55e',
    assigned: '#f59e0b',
    in_trip: '#3b82f6',
    broken: '#ef4444',
    maintenance: '#6b7280',
    blocked: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
    available: 'Свободен',
    assigned: 'Назначен',
    in_trip: 'В рейсе',
    broken: 'Неисправен',
    maintenance: 'На ТО',
    blocked: 'Заблокирован',
};

function createVehicleIcon(status: string, isSelected: boolean) {
    const color = STATUS_COLORS[status] || '#6b7280';
    const size = isSelected ? 18 : 14;
    const border = isSelected ? 3 : 2;

    return L.divIcon({
        className: 'custom-vehicle-marker',
        html: `
            <div style="
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                background: ${color};
                border: ${border}px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                cursor: pointer;
                transition: transform 0.2s;
                ${isSelected ? 'transform: scale(1.4);' : ''}
            "></div>
        `,
        iconSize: [size + border * 2, size + border * 2],
        iconAnchor: [(size + border * 2) / 2, (size + border * 2) / 2],
    });
}

export function DispatcherMap({ vehicles, selectedVehicle, onSelectVehicle, tripRoutePoints = [] }: DispatcherMapProps) {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const markersRef = useRef<L.Marker[]>([]);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        mapRef.current = L.map(containerRef.current, {
            center: [55.751, 37.617],
            zoom: 11,
            zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 18,
        }).addTo(mapRef.current);

        return () => {
            mapRef.current?.remove();
            mapRef.current = null;
        };
    }, []);

    // Update markers on data/selection change
    useEffect(() => {
        if (!mapRef.current) return;

        // Remove old markers
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        vehicles.forEach(v => {
            if (!v.lat || !v.lon) return;

            const isSelected = v.id === selectedVehicle;
            const icon = createVehicleIcon(v.status, isSelected);

            const marker = L.marker([v.lat, v.lon], { icon })
                .addTo(mapRef.current!);

            marker.bindTooltip(`
                <div style="font-family: system-ui, sans-serif; min-width: 160px;">
                    <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px;">
                        ${escapeHtml(v.plateNumber)}
                    </div>
                    <div style="font-size: 11px; color: #64748b; margin-bottom: 2px;">
                        ${escapeHtml(v.make)} ${escapeHtml(v.model)}
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; margin-top: 6px;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${STATUS_COLORS[v.status]};"></div>
                        <span style="font-size: 11px; font-weight: 500; color: ${STATUS_COLORS[v.status]};">
                            ${STATUS_LABELS[v.status]}
                        </span>
                    </div>
                    ${v.driverName ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">🧑 ${escapeHtml(v.driverName)}</div>` : ''}
                    <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
                        Грузоподъёмность: ${(v.payloadCapacityKg / 1000).toFixed(0)}т
                    </div>
                </div>
            `, { direction: 'top', offset: [0, -10] });

            marker.on('click', () => {
                onSelectVehicle(isSelected ? null : v.id);
            });

            markersRef.current.push(marker);
        });
    }, [vehicles, selectedVehicle, onSelectVehicle]);

    // Render trip route layer
    return (
        <>
            <div
                ref={containerRef}
                className="h-[500px] rounded-xl overflow-hidden border border-slate-200 shadow-sm"
                style={{ zIndex: 0 }}
            />
            <TripRouteLayer
                map={mapRef.current}
                points={tripRoutePoints}
                visible={tripRoutePoints.length > 0}
            />
        </>
    );
}
