// ============================================================
// WebSocket — Real-time Vehicle Positions (Sprint 6)
// Streams GPS positions to dispatcher map via @fastify/websocket
// ============================================================
import { FastifyPluginAsync, type FastifyBaseLogger } from 'fastify';
import websocket from '@fastify/websocket';
import { db } from '../db/connection.js';
import { vehicles } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import * as WialonMock from './mocks/wialon.mock.js';
import { filterPositionsForSubscription, shouldDeliverEvent } from './websocket-filters.js';

// ================================================================
// Connected clients registry
// ================================================================
const connectedClients = new Map<any, { organizationId?: string | null }>();

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
    organizationId?: string | null;
}

// ================================================================
// Broadcast positions to all connected clients
// ================================================================
function broadcastPositions(positions: VehiclePosition[]) {
    for (const [client, meta] of connectedClients.entries()) {
        if (client.readyState === 1) { // WebSocket.OPEN
            const scopedData = filterPositionsForSubscription(positions, meta);
            const message = JSON.stringify({
                type: 'vehicle_positions',
                data: scopedData,
                timestamp: new Date().toISOString(),
            });
            client.send(message);
        }
    }
}

// ================================================================
// Position polling interval (simulates Wialon push)
// ================================================================
let positionInterval: ReturnType<typeof setInterval> | null = null;
// Logger captured by startPositionBroadcast for use inside the polling closure.
let broadcastLogger: FastifyBaseLogger | null = null;

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
            organizationId: vehicles.organizationId,
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
                organizationId: v.organizationId,
            });
        }

        broadcastPositions(positions);
    } catch (err: any) {
        if (broadcastLogger) {
            broadcastLogger.error({ err }, 'Position broadcast error');
        }
    }
}

export function startPositionBroadcast(logger: FastifyBaseLogger, intervalMs = 10000) {
    if (positionInterval) return;
    broadcastLogger = logger;
    positionInterval = setInterval(fetchAndBroadcastPositions, intervalMs);
    // Initial broadcast
    fetchAndBroadcastPositions();
    logger.info({ intervalSec: intervalMs / 1000 }, 'Vehicle position broadcast started');
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
    const allowedRoles = ['admin', 'dispatcher', 'logist', 'manager'];
    // Register WebSocket plugin
    await app.register(websocket);

    // WebSocket endpoint: /ws/vehicles (JWT auth via Sec-WebSocket-Protocol, query token as legacy fallback)
    app.get('/ws/vehicles', { websocket: true }, (socket, request) => {
        // --- JWT Auth ---
        const url = new URL(request.url, `http://${request.headers.host}`);
        const protocolHeader = request.headers['sec-websocket-protocol'];
        const protocolTokens = Array.isArray(protocolHeader)
            ? protocolHeader.flatMap((value) => value.split(',').map((part: string) => part.trim()))
            : (protocolHeader || '').split(',').map((part: string) => part.trim());
        const protocolToken = protocolTokens.find((value) => value && value !== 'jwt');
        const token = protocolToken || url.searchParams.get('token');

        if (!token) {
            socket.send(JSON.stringify({ type: 'error', message: 'Missing token' }));
            socket.close(4401, 'Unauthorized');
            return;
        }

        let organizationId: string | null = null;
        try {
            const payload = (app as any).jwt.verify(token) as { roles?: string[]; organizationId?: string | null };
            if (!payload.roles?.some((role) => allowedRoles.includes(role))) {
                throw new Error('Forbidden');
            }
            organizationId = payload.organizationId ?? null;
        } catch {
            socket.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
            socket.close(4401, 'Unauthorized');
            return;
        }
        // --- End Auth ---

        connectedClients.set(socket, { organizationId });
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
    app.get('/vehicles/positions', {
        schema: { tags: ['GPS-трекинг'], summary: 'Позиции ТС', description: 'Текущие GPS-координаты всех транспортных средств (REST-фоллбэк для WebSocket).' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { roles: string[]; organizationId?: string | null };
        if (!user.roles.some((role) => allowedRoles.includes(role))) {
            return reply.status(403).send({ success: false, error: '??? ??????? ? GPS-??????' });
        }

        const where = user.organizationId
            ? and(eq(vehicles.isArchived, false), eq(vehicles.organizationId, user.organizationId))
            : eq(vehicles.isArchived, false);

        const vehicleList = await db.select({
            id: vehicles.id,
            plateNumber: vehicles.plateNumber,
            make: vehicles.make,
            model: vehicles.model,
            status: vehicles.status,
            currentOdometerKm: vehicles.currentOdometerKm,
        })
            .from(vehicles)
            .where(where);

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

// ================================================================
// Wave 4: общий broadcast события произвольного типа
// (например, trip.eta_updated). Сообщение получают все
// подключенные клиенты с учётом их organizationId, если оно есть.
// ================================================================
export function broadcastEvent(eventType: string, payload: Record<string, unknown> & { organizationId?: string | null }) {
    const baseMessage = JSON.stringify({
        type: eventType,
        data: payload,
        timestamp: new Date().toISOString(),
    });
    for (const [client, meta] of connectedClients.entries()) {
        if (client.readyState !== 1) continue;
        if (!shouldDeliverEvent(payload.organizationId ?? null, meta.organizationId ?? null)) {
            continue;
        }
        try {
            client.send(baseMessage);
        } catch {
            /* ignore individual send errors */
        }
    }
}


