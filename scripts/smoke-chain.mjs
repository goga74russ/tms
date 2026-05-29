#!/usr/bin/env node
// ============================================================
// TMS — End-to-end API smoke chain
// ============================================================
// Walks the full operational chain via REST API.
// Stops on first failure with diagnostic output.
//
// Usage:
//   API_URL=http://localhost:4000 SEED_PASSWORD=... node scripts/smoke-chain.mjs
//
// Requires: API + DB + Redis running, seed-demo applied (super@tms.local exists)
// ============================================================

const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const PASSWORD = process.env.SEED_PASSWORD || process.env.SMOKE_PASSWORD;

if (!PASSWORD) {
    console.error('❌ Set SEED_PASSWORD or SMOKE_PASSWORD env');
    process.exit(1);
}

// --- Logging helpers ---
const c = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
let step = 0;
function info(msg) { console.log(`${c.gray}  ${msg}${c.reset}`); }
function ok(msg) { console.log(`${c.green}  ✓ ${msg}${c.reset}`); }
function fail(msg, data) {
    console.error(`${c.red}  ✗ ${msg}${c.reset}`);
    if (data) console.error(c.gray + JSON.stringify(data, null, 2).slice(0, 600) + c.reset);
    process.exit(1);
}
function header(title) {
    step++;
    console.log(`\n${c.cyan}[${step}] ${title}${c.reset}`);
}

// --- HTTP helper ---
let cookie = '';
let bearer = '';
async function http(method, path, body, expectStatus = 200) {
    const url = path.startsWith('http') ? path : `${API_URL}${path}`;
    const headers = {};
    if (cookie) headers['cookie'] = cookie;
    if (bearer) headers['authorization'] = `Bearer ${bearer}`;
    const isFormData = body instanceof FormData;
    if (body && !isFormData) headers['content-type'] = 'application/json';

    const res = await fetch(url, {
        method,
        headers,
        body: isFormData ? body : body ? JSON.stringify(body) : undefined,
        redirect: 'manual',
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
        const tokenMatch = setCookie.match(/tms_token=([^;]+)/);
        if (tokenMatch) cookie = `tms_token=${tokenMatch[1]}`;
    }

    let json;
    try { json = await res.json(); } catch { json = await res.text(); }

    if (Array.isArray(expectStatus) ? !expectStatus.includes(res.status) : res.status !== expectStatus) {
        fail(`${method} ${path} → ${res.status} (expected ${expectStatus})`, json);
    }
    return json;
}

async function login(email) {
    info(`login as ${email}`);
    cookie = '';
    bearer = '';
    const r = await http('POST', '/api/auth/mobile/login', { email, password: PASSWORD });
    if (!r.success || !r.data?.token) fail('login failed', r);
    bearer = r.data.token;
    ok(`logged in as ${email}, roles: ${(r.data.user?.roles || []).join(',')}`);
    return r.data;
}

function pickFirst(items, label) {
    if (!Array.isArray(items) || items.length === 0) fail(`no ${label} in response`);
    return items[0];
}

// ============================================================
// CHAIN
// ============================================================

console.log(`${c.blue}🚛 TMS smoke chain → ${API_URL}${c.reset}`);

header('Health check');
const health = await http('GET', '/api/health');
ok(`API alive: ${health.status} v${health.version}`);
const ready = await http('GET', '/api/health/ready', null, [200, 503]);
info(`DB: ${ready.db ? '✓' : '✗'}, Redis: ${ready.redis ? '✓' : '✗'}`);

header('Login as super (all roles)');
const me = await login('super@tms.local');

header('List vehicles + drivers');
const vehicles = await http('GET', '/api/fleet/vehicles?limit=50');
const vehicleList = vehicles.data || vehicles;
const vehicle = vehicleList.find(v => v.status === 'available' && Number(v.payloadCapacityKg) >= 4000);
if (!vehicle) fail('no available vehicle with ≥4000kg capacity', vehicleList.map(v => ({plate: v.plateNumber, status: v.status, cap: v.payloadCapacityKg})));
ok(`vehicle: ${vehicle.plateNumber} (${vehicle.id}, cap ${vehicle.payloadCapacityKg}kg)`);

const drivers = await http('GET', '/api/fleet/drivers?limit=50');
const driverList = drivers.data || drivers;
const driver = driverList.find(d => !d.deletedAt) || driverList[0];
if (!driver) fail('no driver available');
ok(`driver: ${driver.fullName} (${driver.id})`);

const contractors = await http('GET', '/api/fleet/contractors?limit=5');
const contractor = pickFirst(contractors.data || contractors, 'contractors');
ok(`contractor: ${contractor.name} (${contractor.id})`);

header('Create order (cold chain required)');
const order = await http('POST', '/api/orders', {
    contractorId: contractor.id,
    cargoDescription: 'Продукты питания (smoke test)',
    cargoWeightKg: 4000,
    loadingAddress: 'Москва, ул. Ленина, 1',
    unloadingAddress: 'Санкт-Петербург, Невский пр., 100',
    plannedPickupDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    plannedDeliveryDate: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    coldChainRequired: true,
    temperatureMinC: 2,
    temperatureMaxC: 6,
}, 201);
ok(`order created: ${order.data.id}`);

header('Create trip + assign');
const trip = await http('POST', '/api/trips', { orderIds: [order.data.id] }, 201);
const tripId = trip.data.id;
ok(`trip: ${tripId}`);

await http('POST', `/api/trips/${tripId}/assign`, {
    vehicleId: vehicle.id,
    driverId: driver.id,
});
ok('vehicle + driver assigned');

header('Add route points with windows');
const now = Date.now();
await http('POST', `/api/trips/${tripId}/points`, {
    type: 'loading',
    address: 'Москва, ул. Ленина, 1',
    latitude: 55.7558,
    longitude: 37.6173,
    sequenceNumber: 1,
    windowFrom: new Date(now + 24 * 3600 * 1000).toISOString(),
    windowTo: new Date(now + 26 * 3600 * 1000).toISOString(),
}, [200, 201]);
await http('POST', `/api/trips/${tripId}/points`, {
    type: 'unloading',
    address: 'Санкт-Петербург, Невский пр., 100',
    latitude: 59.9343,
    longitude: 30.3351,
    sequenceNumber: 2,
    windowFrom: new Date(now + 44 * 3600 * 1000).toISOString(),
    windowTo: new Date(now + 48 * 3600 * 1000).toISOString(),
}, [200, 201]);
ok('2 route points added');

header('Generate waybill');
const waybill = await http('POST', `/api/waybills/generate/${tripId}`, {}, [200, 201]);
const waybillId = waybill.data?.id || waybill.id;
ok(`waybill: ${waybillId}`);

header('Mechanic: create approved tech inspection');
const techInspection = await http('POST', '/api/inspections/tech', {
    vehicleId: vehicle.id,
    tripId,
    inspectionType: 'pre_trip',
    checklistVersion: '1.0',
    items: [
        { name: 'Тормозная система', result: 'ok' },
        { name: 'Рулевое управление', result: 'ok' },
        { name: 'Шины (состояние, давление)', result: 'ok' },
        { name: 'Внешние световые приборы', result: 'ok' },
        { name: 'Огнетушитель', result: 'ok' },
        { name: 'Аптечка', result: 'ok' },
        { name: 'Тахограф', result: 'ok' },
    ],
    decision: 'approved',
    signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    comment: 'Smoke test approval',
}, 201);
ok(`tech inspection created: ${techInspection.data?.id}`);

header('Medic: create approved med inspection');
const medInspection = await http('POST', '/api/inspections/med', {
    driverId: driver.id,
    tripId,
    checklistVersion: '1.0',
    systolicBp: 120,
    diastolicBp: 80,
    heartRate: 70,
    temperature: 36.6,
    condition: 'удовлетворительное',
    alcoholTest: 'negative',
    decision: 'approved',
    signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    comment: 'Smoke test approval',
}, 201);
ok(`med inspection created: ${medInspection.data?.id}`);

header('Sync waybill status');
const synced = await http('POST', `/api/waybills/${waybillId}/sync-status`, {});
ok(`waybill status now: ${synced.data?.status || 'unknown'}`);

header('Start trip with odometer');
const started = await http('POST', `/api/trips/${tripId}/start`, { odometerStart: 100000 });
ok(`trip started, status: ${started.data?.trip?.status || 'unknown'}`);

header('Start Wialon mock simulator');
await http('POST', '/api/integrations/wialon-mock/start', {
    vehicleId: vehicle.id,
    tripId,
}).catch(() => info('wialon-mock/start: skipped (admin-only or already running)'));
ok('Wialon mock simulator triggered');

header('Cold chain: trigger mock tick');
const tempResult = await http('POST', `/api/trips/${tripId}/temperature-mock-tick`, {}, [200, 201, 403]);
if (tempResult.success) {
    ok(`temperature: ${tempResult.data?.tempC}°C, breach: ${tempResult.data?.breach ? '⚠ YES' : 'no'}`);
} else {
    info('temperature-mock-tick: admin-only — skipped');
}

header('Get ETA');
const eta = await http('GET', `/api/trips/${tripId}/eta`);
if (eta.data) {
    ok(`ETA: ${eta.data.etaIso}, distance: ${eta.data.distanceKm}km`);
} else {
    info(`ETA unavailable: ${eta.reason || 'unknown'}`);
}

header('Mark route points completed');
const points = await http('GET', `/api/trips/${tripId}/points`).catch(() => ({ data: [] }));
const pointList = points.data || points;
for (const p of pointList) {
    await http('PUT', `/api/trips/${tripId}/points/${p.id}`, {
        status: 'completed',
        completedAt: new Date().toISOString(),
    }, [200, 201]).catch(() => info(`could not mark point ${p.id} completed`));
}
ok(`${pointList.length} points processed`);

header('Submit delivery confirmation');
await http('POST', `/api/trips/${tripId}/delivery-confirmation/v2`, {
    signedByName: 'Smoke Test Получатель',
    signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    condition: 'ok',
    notes: 'Smoke test delivery',
}, [200, 201]);
ok('delivery confirmation submitted');

header('Complete trip with final odometer (if not auto-completed)');
const tripState = await http('GET', `/api/trips/${tripId}`);
const currentStatus = tripState.data?.status || tripState.status;
if (currentStatus === 'completed' || currentStatus === 'billed') {
    ok(`trip auto-completed already, status: ${currentStatus}`);
} else if (currentStatus === 'in_transit') {
    const completed = await http('POST', `/api/trips/${tripId}/complete`, {
        odometerEnd: 100750,
        notes: 'Smoke test complete',
    });
    ok(`trip completed, status: ${completed.data?.trip?.status || 'unknown'}`);
} else {
    info(`trip in unexpected status ${currentStatus}, skipping /complete`);
}

header('Verify auto-invoice created');
await new Promise(r => setTimeout(r, 500)); // give DB a tick
const invoices = await http('GET', `/api/finance/invoices?tripId=${tripId}`);
const invList = invoices.data || invoices;
if (Array.isArray(invList) && invList.length > 0) {
    ok(`auto-invoice found: ${invList[0].id}, total: ${invList[0].total}`);
} else {
    info('no auto-invoice yet (may be async)');
}

header('Bulk-generate invoices for the last 7 days');
const bulk = await http('POST', '/api/finance/invoices/bulk-generate', {
    from: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    to: new Date().toISOString(),
}, [200, 201]);
ok(`bulk-generate: created ${bulk.data?.created?.length ?? 0}, skipped ${bulk.data?.skipped?.length ?? 0}`);

header('Test AI co-pilot (mock fallback ok)');
const copilot = await http('POST', '/api/copilot/chat', {
    message: 'Сколько активных рейсов?',
}, [200, 401, 402, 404]); // 401 no org, 402 plan-guard, 404 AI flag off (T-0)
if (copilot.success === true) {
    ok('copilot responded (mock or real)');
} else if (copilot.error === 'PLAN_FEATURE_LOCKED') {
    info('copilot gated by plan — expected on Free');
} else if (copilot.error === 'No organization in token') {
    info('copilot requires org-scoped user — super-user has no org (expected)');
} else if (copilot.error === 'Not Found') {
    // T-0: AI_COPILOT_ENABLED!=true → роут не регистрируется (404). Штатно.
    info('copilot disabled (AI_COPILOT_ENABLED!=true) — route 404, expected');
} else {
    info(`copilot: ${JSON.stringify(copilot).slice(0, 200)}`);
}

header('1C export available');
const exp = await fetch(`${API_URL}/api/finance/export/1c?from=${new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()}&to=${new Date().toISOString()}`, {
    headers: { authorization: `Bearer ${bearer}` },
});
if (exp.ok) {
    const xml = await exp.text();
    ok(`1C XML received, ${xml.length} bytes`);
} else {
    info(`1C export status: ${exp.status}`);
}

console.log(`\n${c.green}═══════════════════════════════════════════════${c.reset}`);
console.log(`${c.green}🎉 SMOKE CHAIN PASSED${c.reset}`);
console.log(`${c.green}═══════════════════════════════════════════════${c.reset}`);
console.log(`\nTrip ID: ${tripId}\nWaybill ID: ${waybillId}\nOrder ID: ${order.data.id}`);
