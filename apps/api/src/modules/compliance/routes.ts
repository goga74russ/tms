// ============================================================
// Round 2A — compliance breadth: tachograph DDD, ОСАГО, ЦРПТ, ADR strict.
// Single registration plugin so server.ts only adds one line.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import tachographRoutes from './tachograph/routes.js';
import osagoRoutes from './osago/routes.js';
import markingRoutes from './marking/routes.js';
import adrComplianceRoutes from './adr/routes.js';

const complianceRoutes: FastifyPluginAsync = async (app) => {
    await app.register(tachographRoutes);
    await app.register(osagoRoutes);
    await app.register(markingRoutes);
    await app.register(adrComplianceRoutes);
};

export default complianceRoutes;
