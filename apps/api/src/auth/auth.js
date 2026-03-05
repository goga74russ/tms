"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.registerAuthRoutes = registerAuthRoutes;
var bcryptjs_1 = __importDefault(require("bcryptjs"));
var cookie_1 = __importDefault(require("@fastify/cookie"));
var connection_js_1 = require("../db/connection.js");
var schema_js_1 = require("../db/schema.js");
var drizzle_orm_1 = require("drizzle-orm");
var shared_1 = require("@tms/shared");
// --- CRITICAL (C-1): No hardcoded fallback. Fail-fast if not set. ---
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
    process.exit(1);
}
var JWT_EXPIRES_IN = '24h';
var SALT_ROUNDS = 12;
var COOKIE_NAME = 'tms_token';
var COOKIE_MAX_AGE = 86400; // 24h in seconds
function hashPassword(password) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, bcryptjs_1.default.hash(password, SALT_ROUNDS)];
        });
    });
}
function verifyPassword(password, hash) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, bcryptjs_1.default.compare(password, hash)];
        });
    });
}
function registerAuthRoutes(app) {
    var _this = this;
    // Register cookie plugin
    app.register(cookie_1.default);
    // Register JWT plugin
    app.register(Promise.resolve().then(function () { return __importStar(require('@fastify/jwt')); }), {
        secret: JWT_SECRET,
        cookie: {
            cookieName: COOKIE_NAME,
            signed: false,
        },
    });
    // --- CRITICAL (C-2): Rate limiting on login ---
    app.register(Promise.resolve().then(function () { return __importStar(require('@fastify/rate-limit')); }), {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: function (request) {
            return request.ip;
        },
    });
    // H-15: authenticate decorator — cookie-first, header fallback (for mobile)
    app.decorate('authenticate', function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var cookieToken, authHeader, err_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 5, , 6]);
                    cookieToken = (_a = request.cookies) === null || _a === void 0 ? void 0 : _a[COOKIE_NAME];
                    if (!cookieToken) return [3 /*break*/, 2];
                    return [4 /*yield*/, request.jwtVerify({ onlyCookie: true })];
                case 1:
                    _b.sent();
                    return [2 /*return*/];
                case 2:
                    authHeader = request.headers.authorization;
                    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) return [3 /*break*/, 4];
                    return [4 /*yield*/, request.jwtVerify()];
                case 3:
                    _b.sent();
                    return [2 /*return*/];
                case 4:
                    reply.status(401).send({ success: false, error: 'Unauthorized' });
                    return [3 /*break*/, 6];
                case 5:
                    err_1 = _b.sent();
                    reply.status(401).send({ success: false, error: 'Unauthorized' });
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    }); });
    // Login — rate limited
    app.post('/api/auth/login', {
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '1 minute',
            },
        },
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var parseResult, _a, email, password, user, isValid, token;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    parseResult = shared_1.LoginSchema.safeParse(request.body);
                    if (!parseResult.success) {
                        return [2 /*return*/, reply.status(400).send({
                                success: false,
                                error: 'Validation failed',
                                details: parseResult.error.flatten(),
                            })];
                    }
                    _a = parseResult.data, email = _a.email, password = _a.password;
                    return [4 /*yield*/, connection_js_1.db
                            .select()
                            .from(schema_js_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_js_1.users.email, email))
                            .limit(1)];
                case 1:
                    user = (_b.sent())[0];
                    if (!user || !user.isActive) {
                        return [2 /*return*/, reply.status(401).send({ success: false, error: 'Invalid credentials' })];
                    }
                    return [4 /*yield*/, verifyPassword(password, user.passwordHash)];
                case 2:
                    isValid = _b.sent();
                    if (!isValid) {
                        return [2 /*return*/, reply.status(401).send({ success: false, error: 'Invalid credentials' })];
                    }
                    token = app.jwt.sign({ userId: user.id, roles: user.roles }, { expiresIn: JWT_EXPIRES_IN });
                    // H-15: Set httpOnly cookie instead of returning token in body
                    reply.setCookie(COOKIE_NAME, token, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'lax',
                        path: '/',
                        maxAge: COOKIE_MAX_AGE,
                    });
                    return [2 /*return*/, {
                            success: true,
                            data: {
                                token: token, // Keep for mobile app backward compat
                                user: {
                                    id: user.id,
                                    email: user.email,
                                    fullName: user.fullName,
                                    roles: user.roles,
                                },
                            },
                        }];
            }
        });
    }); });
    // H-15: Logout — clear cookie
    app.post('/api/auth/logout', {
        preHandler: [app.authenticate],
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            reply.clearCookie(COOKIE_NAME, { path: '/' });
            return [2 /*return*/, { success: true }];
        });
    }); });
    // Get current user
    app.get('/api/auth/me', {
        preHandler: [app.authenticate],
    }, function (request) { return __awaiter(_this, void 0, void 0, function () {
        var payload, user;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    payload = request.user;
                    return [4 /*yield*/, connection_js_1.db
                            .select({
                            id: schema_js_1.users.id,
                            email: schema_js_1.users.email,
                            fullName: schema_js_1.users.fullName,
                            phone: schema_js_1.users.phone,
                            roles: schema_js_1.users.roles,
                        })
                            .from(schema_js_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_js_1.users.id, payload.userId))
                            .limit(1)];
                case 1:
                    user = (_a.sent())[0];
                    return [2 /*return*/, { success: true, data: user }];
            }
        });
    }); });
    // --- Admin: User Management ---
    // GET /api/auth/users — list all users (admin only)
    app.get('/api/auth/users', {
        preHandler: [app.authenticate],
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var roles, allUsers;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    roles = request.user.roles;
                    if (!roles.includes('admin')) {
                        return [2 /*return*/, reply.status(403).send({ success: false, error: 'Admin access required' })];
                    }
                    return [4 /*yield*/, connection_js_1.db
                            .select({
                            id: schema_js_1.users.id,
                            email: schema_js_1.users.email,
                            fullName: schema_js_1.users.fullName,
                            phone: schema_js_1.users.phone,
                            roles: schema_js_1.users.roles,
                            isActive: schema_js_1.users.isActive,
                            contractorId: schema_js_1.users.contractorId,
                            organizationId: schema_js_1.users.organizationId,
                            createdAt: schema_js_1.users.createdAt,
                        })
                            .from(schema_js_1.users)
                            .orderBy(schema_js_1.users.fullName)];
                case 1:
                    allUsers = _a.sent();
                    return [2 /*return*/, { success: true, data: allUsers }];
            }
        });
    }); });
    // POST /api/auth/users — create user (admin only)
    app.post('/api/auth/users', {
        preHandler: [app.authenticate],
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var roles, body, existing, passwordHash, created;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    roles = request.user.roles;
                    if (!roles.includes('admin')) {
                        return [2 /*return*/, reply.status(403).send({ success: false, error: 'Admin access required' })];
                    }
                    body = request.body;
                    if (!body.email || !body.password || !body.fullName || !((_a = body.roles) === null || _a === void 0 ? void 0 : _a.length)) {
                        return [2 /*return*/, reply.status(400).send({
                                success: false,
                                error: 'email, password, fullName, and roles are required',
                            })];
                    }
                    return [4 /*yield*/, connection_js_1.db.select({ id: schema_js_1.users.id })
                            .from(schema_js_1.users).where((0, drizzle_orm_1.eq)(schema_js_1.users.email, body.email)).limit(1)];
                case 1:
                    existing = (_b.sent())[0];
                    if (existing) {
                        return [2 /*return*/, reply.status(409).send({ success: false, error: 'Email already exists' })];
                    }
                    return [4 /*yield*/, hashPassword(body.password)];
                case 2:
                    passwordHash = _b.sent();
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.users).values({
                            email: body.email,
                            passwordHash: passwordHash,
                            fullName: body.fullName,
                            phone: body.phone,
                            roles: body.roles,
                        }).returning({
                            id: schema_js_1.users.id,
                            email: schema_js_1.users.email,
                            fullName: schema_js_1.users.fullName,
                            roles: schema_js_1.users.roles,
                            isActive: schema_js_1.users.isActive,
                            createdAt: schema_js_1.users.createdAt,
                        })];
                case 3:
                    created = (_b.sent())[0];
                    return [2 /*return*/, reply.status(201).send({ success: true, data: created })];
            }
        });
    }); });
    // PUT /api/auth/users/:id — update user (admin only)
    app.put('/api/auth/users/:id', {
        preHandler: [app.authenticate],
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var roles, body, updateData, _a, updated;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    roles = request.user.roles;
                    if (!roles.includes('admin')) {
                        return [2 /*return*/, reply.status(403).send({ success: false, error: 'Admin access required' })];
                    }
                    body = request.body;
                    updateData = { updatedAt: new Date() };
                    if (body.fullName !== undefined)
                        updateData.fullName = body.fullName;
                    if (body.phone !== undefined)
                        updateData.phone = body.phone;
                    if (body.roles !== undefined)
                        updateData.roles = body.roles;
                    if (body.isActive !== undefined)
                        updateData.isActive = body.isActive;
                    if (!body.password) return [3 /*break*/, 2];
                    _a = updateData;
                    return [4 /*yield*/, hashPassword(body.password)];
                case 1:
                    _a.passwordHash = _b.sent();
                    _b.label = 2;
                case 2: return [4 /*yield*/, connection_js_1.db.update(schema_js_1.users)
                        .set(updateData)
                        .where((0, drizzle_orm_1.eq)(schema_js_1.users.id, request.params.id))
                        .returning({
                        id: schema_js_1.users.id,
                        email: schema_js_1.users.email,
                        fullName: schema_js_1.users.fullName,
                        roles: schema_js_1.users.roles,
                        isActive: schema_js_1.users.isActive,
                    })];
                case 3:
                    updated = (_b.sent())[0];
                    if (!updated) {
                        return [2 /*return*/, reply.status(404).send({ success: false, error: 'User not found' })];
                    }
                    return [2 /*return*/, { success: true, data: updated }];
            }
        });
    }); });
    // --- Admin: Tariff CRUD ---
    // GET /api/auth/tariffs — list all tariffs (admin only)
    app.get('/api/auth/tariffs', {
        preHandler: [app.authenticate],
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var roles, allTariffs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    roles = request.user.roles;
                    if (!roles.includes('admin') && !roles.includes('accountant') && !roles.includes('manager')) {
                        return [2 /*return*/, reply.status(403).send({ success: false, error: 'Access denied' })];
                    }
                    return [4 /*yield*/, connection_js_1.db
                            .select()
                            .from(schema_js_1.tariffs)
                            .orderBy(schema_js_1.tariffs.createdAt)];
                case 1:
                    allTariffs = _a.sent();
                    return [2 /*return*/, { success: true, data: allTariffs }];
            }
        });
    }); });
    // POST /api/auth/tariffs — create tariff (admin only)
    app.post('/api/auth/tariffs', {
        preHandler: [app.authenticate],
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var roles, body, created;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    roles = request.user.roles;
                    if (!roles.includes('admin') && !roles.includes('accountant')) {
                        return [2 /*return*/, reply.status(403).send({ success: false, error: 'Access denied' })];
                    }
                    body = request.body;
                    if (!body.contractId || !body.type) {
                        return [2 /*return*/, reply.status(400).send({ success: false, error: 'contractId and type are required' })];
                    }
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.tariffs).values(body).returning()];
                case 1:
                    created = (_a.sent())[0];
                    return [2 /*return*/, reply.status(201).send({ success: true, data: created })];
            }
        });
    }); });
    // PUT /api/auth/tariffs/:id — update tariff
    app.put('/api/auth/tariffs/:id', {
        preHandler: [app.authenticate],
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var roles, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    roles = request.user.roles;
                    if (!roles.includes('admin') && !roles.includes('accountant')) {
                        return [2 /*return*/, reply.status(403).send({ success: false, error: 'Access denied' })];
                    }
                    return [4 /*yield*/, connection_js_1.db.update(schema_js_1.tariffs)
                            .set(request.body)
                            .where((0, drizzle_orm_1.eq)(schema_js_1.tariffs.id, request.params.id))
                            .returning()];
                case 1:
                    updated = (_a.sent())[0];
                    if (!updated) {
                        return [2 /*return*/, reply.status(404).send({ success: false, error: 'Tariff not found' })];
                    }
                    return [2 /*return*/, { success: true, data: updated }];
            }
        });
    }); });
    // --- Admin: Checklist Templates CRUD ---
    // GET /api/auth/checklist-templates
    app.get('/api/auth/checklist-templates', {
        preHandler: [app.authenticate],
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var roles, templates;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    roles = request.user.roles;
                    if (!roles.includes('admin')) {
                        return [2 /*return*/, reply.status(403).send({ success: false, error: 'Admin access required' })];
                    }
                    return [4 /*yield*/, connection_js_1.db
                            .select()
                            .from(schema_js_1.checklistTemplates)
                            .orderBy(schema_js_1.checklistTemplates.createdAt)];
                case 1:
                    templates = _a.sent();
                    return [2 /*return*/, { success: true, data: templates }];
            }
        });
    }); });
    // POST /api/auth/checklist-templates
    app.post('/api/auth/checklist-templates', {
        preHandler: [app.authenticate],
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var roles, body, created;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    roles = request.user.roles;
                    if (!roles.includes('admin')) {
                        return [2 /*return*/, reply.status(403).send({ success: false, error: 'Admin access required' })];
                    }
                    body = request.body;
                    if (!body.type || !body.version || !body.name || !((_a = body.items) === null || _a === void 0 ? void 0 : _a.length)) {
                        return [2 /*return*/, reply.status(400).send({
                                success: false,
                                error: 'type, version, name, and items are required',
                            })];
                    }
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.checklistTemplates).values({
                            type: body.type,
                            version: body.version,
                            name: body.name,
                            items: body.items,
                        }).returning()];
                case 1:
                    created = (_b.sent())[0];
                    return [2 /*return*/, reply.status(201).send({ success: true, data: created })];
            }
        });
    }); });
    // PUT /api/auth/checklist-templates/:id
    app.put('/api/auth/checklist-templates/:id', {
        preHandler: [app.authenticate],
    }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
        var roles, body, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    roles = request.user.roles;
                    if (!roles.includes('admin')) {
                        return [2 /*return*/, reply.status(403).send({ success: false, error: 'Admin access required' })];
                    }
                    body = request.body;
                    return [4 /*yield*/, connection_js_1.db.update(schema_js_1.checklistTemplates)
                            .set(body)
                            .where((0, drizzle_orm_1.eq)(schema_js_1.checklistTemplates.id, request.params.id))
                            .returning()];
                case 1:
                    updated = (_a.sent())[0];
                    if (!updated) {
                        return [2 /*return*/, reply.status(404).send({ success: false, error: 'Template not found' })];
                    }
                    return [2 /*return*/, { success: true, data: updated }];
            }
        });
    }); });
}
