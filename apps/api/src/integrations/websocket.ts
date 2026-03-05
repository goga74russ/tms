// ============================================================
// WebSocket — Real-time Vehicle Positions (Sprint 6)
// Streams GPS positions to dispatcher map via @fastify/websocket
// ============================================================
import { FastifyPluginAsync } from 'fastify';
import websocket from '@fastify/websocket';
import { db } from '../db/connection.js';
import { vehicles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import * as WialonMock from './mocks/wialon.mock.js';

// ================================================================
// Connected clients registry
// ================================================================
const connectedClients = new Set<any>();

// ================================================================
// Vehicle position type
// ================================================================
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

// ================================================================
// Broadcast positions to all connected clients
// ================================================================
function broadcastPositions(positions: VehiclePosition[]) {
    const message = JSON.stringify({
        type: 'vehicle_positions',
        data: positions,
        timestamp: new Date().toISOString(),
    });

    for (const client of connectedClients) {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
        }
    }
}

// ================================================================
// Position polling interval (simulates Wialon push)
// ================================================================
let positionInterval: ReturnType<typeof setInterval> | null = null;

async function fetchAndBroadcastPositions() {
    try {
        // Fetch all active vehicles with their positions
        const vehicleList = await db.select({
            id: vehicles.id,
            plateNumber: vehicles.plateNumber,
            make: vehicles.make,
            model: vehicles.model,
            status: vehicles.status,
            currentOdometerKm: vehicles.currentOdometerKm,
        })
            .from(vehicles)
            .where(eq(vehicles.isArchived, false));

        const positions: VehiclePosition[] = [];

        for (const v of vehicleList) {
            // Get mock telemetry (in production: real Wialon API)
            const telemetry = WialonMock.getVehicleTelemetry(
                v.plateNumber,
                v.currentOdometerKm,
            );

            positions.push({
                vehicleId: v.id,
                plateNumber: v.plateNumber,
                make: v.make,
                model: v.model,
                status: v.status,
                lat: telemetry.lat,
                lon: telemetry.lon,
                speed: telemetry.speed,
                fuelLevel: telemetry.fuelLevelLiters,
                odometerKm: telemetry.odometerKm,
                engineOn: telemetry.engineOn,
                timestamp: telemetry.timestamp,
            });
        }

        broadcastPositions(positions);
    } catch (err: any) {
        console.error('❌ Position broadcast error:', err.message);
    }
}

export function startPositionBroadcast(intervalMs = 10000) {
    if (positionInterval) return;
    positionInterval = setInterval(fetchAndBroadcastPositions, intervalMs);
    // Initial broadcast
    fetchAndBroadcastPositions();
    console.log(`📡 Vehicle position broadcast started (every ${intervalMs / 1000}s)`);
}

export function stopPositionBroadcast() {
    if (positionInterval) {
        clearInterval(positionInterval);
        positionInterval = null;
    }
}

// ================================================================
// Fastify WebSocket Routes
// ================================================================
const websocketRoutes: FastifyPluginAsync = async (app) => {
    // Register WebSocket plugin
    await app.register(websocket);

    // WebSocket endpoint: /ws/vehicles
    app.get('/ws/vehicles', { websocket: true }, (socket, request) => {
        connectedClients.add(socket);
        app.log.info(`📡 WS client connected (total: ${connectedClients.size})`);

        // Send initial positions immediately
        fetchAndBroadcastPositions();

        // Handle client messages (optional: filters, ping)
        socket.on('message', (raw: any) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'ping') {
                    socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
                }
            } catch { /* ignore invalid messages */ }
        });

        // Cleanup on disconnect
        socket.on('close', () => {
            connectedClients.delete(socket);
            app.log.info(`📡 WS client disconnected (total: ${connectedClients.size})`);
        });

        socket.on('error', () => {
            connectedClients.delete(socket);
        });
    });

    // REST endpoint: get current positions (fallback for non-WS clients)
    app.get('/vehicles/positions', async () => {
        const vehicleList = await db.select({
            id: vehicles.id,
            plateNumber: vehicles.plateNumber,
            make: vehicles.make,
            model: vehicles.model,
            status: vehicles.status,
            currentOdometerKm: vehicles.currentOdometerKm,
        })
            .from(vehicles)
            .where(eq(vehicles.isArchived, false));

        const positions = vehicleList.map((v: any) => {
            const telemetry = WialonMock.getVehicleTelemetry(v.plateNumber, v.currentOdometerKm);
            return {
                vehicleId: v.id,
                plateNumber: v.plateNumber,
                make: v.make,
                model: v.model,
                status: v.status,
                lat: telemetry.lat,
                lon: telemetry.lon,
                speed: telemetry.speed,
                fuelLevel: telemetry.fuelLevelLiters,
                odometerKm: telemetry.odometerKm,
                engineOn: telemetry.engineOn,
                timestamp: telemetry.timestamp,
            };
        });

        return { success: true, data: positions };
    });
};

export default websocketRoutes;

// Export for client count monitoring
export function getConnectedClientsCount(): number {
    return connectedClients.size;
}
