// ================================================================
// Geo API Routes — Geocoding & Distance Matrix
// ================================================================
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { geocodeAddress, geocodeBatch, reverseGeocode } from './geocoding.service.js';
import { haversineDistance, calculateDistanceMatrix, calculateRouteDistance, estimateDrivingDistance, findNearest } from './distance.service.js';
import type { GeoPoint } from './distance.service.js';

const GeoPointSchema = z.object({
    lat: z.number(),
    lon: z.number(),
    address: z.string().optional(),
    type: z.enum(['loading', 'unloading', 'waypoint']).optional(),
    status: z.enum(['pending', 'arrived', 'completed']).optional(),
});

const geoRoutes: FastifyPluginAsync = async (fastify) => {
    // 1. GET /geo/geocode?address=... — Geocode a single address
    fastify.get(
        '/geo/geocode',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const schema = z.object({ address: z.string().min(1) });
            const result = schema.safeParse(request.query);
            if (!result.success) {
                return reply.code(400).send({ success: false, error: 'address query parameter is required' });
            }

            const geoResult = geocodeAddress(result.data.address);
            return { success: true, data: geoResult };
        }
    );

    // 2. POST /geo/geocode/batch — Geocode multiple addresses
    fastify.post(
        '/geo/geocode/batch',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const schema = z.object({ addresses: z.array(z.string().min(1)).min(1).max(50) });
            const result = schema.safeParse(request.body);
            if (!result.success) {
                return reply.code(400).send({ success: false, error: 'Max 50 addresses per batch required in array' });
            }

            const results = geocodeBatch(result.data.addresses);
            return { success: true, data: results };
        }
    );

    // 3. GET /geo/reverse?lat=...&lon=... — Reverse geocode
    fastify.get(
        '/geo/reverse',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const schema = z.object({ lat: z.coerce.number(), lon: z.coerce.number() });
            const result = schema.safeParse(request.query);
            if (!result.success) {
                return reply.code(400).send({ success: false, error: 'Valid lat and lon are required' });
            }

            const { lat, lon } = result.data;
            const address = reverseGeocode(lat, lon);
            return { success: true, data: { lat, lon, address } };
        }
    );

    // 4. POST /geo/distance — Distance between two points
    fastify.post(
        '/geo/distance',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const schema = z.object({ from: GeoPointSchema, to: GeoPointSchema });
            const result = schema.safeParse(request.body);
            if (!result.success) {
                return reply.code(400).send({ success: false, error: 'from and to with lat/lon are required', details: result.error.format() });
            }

            const { from, to } = result.data;
            const straightLine = haversineDistance(from as GeoPoint, to as GeoPoint);
            const estimated = estimateDrivingDistance(straightLine);

            return {
                success: true,
                data: {
                    straightLineKm: Math.round(straightLine * 100) / 100,
                    estimatedDrivingKm: estimated,
                },
            };
        }
    );

    // 5. POST /geo/distance-matrix — NxN distance matrix
    fastify.post(
        '/geo/distance-matrix',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const schema = z.object({ points: z.array(GeoPointSchema).min(2).max(20) });
            const result = schema.safeParse(request.body);
            if (!result.success) {
                return reply.code(400).send({ success: false, error: 'At least 2 and max 20 points are required' });
            }

            const points = result.data.points as GeoPoint[];
            const matrix = calculateDistanceMatrix(points);
            const routeDistance = calculateRouteDistance(points);

            return {
                success: true,
                data: {
                    matrix,
                    routeDistanceKm: routeDistance,
                    pointCount: points.length,
                },
            };
        }
    );

    // 6. POST /geo/nearest — Find nearest point from candidates
    fastify.post(
        '/geo/nearest',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const schema = z.object({ reference: GeoPointSchema, candidates: z.array(GeoPointSchema).min(1) });
            const result = schema.safeParse(request.body);
            if (!result.success) {
                return reply.code(400).send({ success: false, error: 'reference and candidates array are required' });
            }

            const { reference, candidates } = result.data;
            const nearestResult = findNearest(reference as GeoPoint, candidates as GeoPoint[]);
            return { success: true, data: nearestResult };
        }
    );
};

export default geoRoutes;
