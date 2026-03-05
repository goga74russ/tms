"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
// ============================================================
// Seed Data — тестовые данные для разработки
// ============================================================
var connection_js_1 = require("./connection.js");
var schema_js_1 = require("./schema.js");
var auth_js_1 = require("../auth/auth.js");
var triggers_js_1 = require("./triggers.js");
function seed() {
    return __awaiter(this, void 0, void 0, function () {
        var seedPassword, passwordHash, admin, logist, dispatcher, mechanic, medic, manager, accountant, repairUser, driverUsers, client1, client2, client3, vehicleData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('🌱 Seeding database...');
                    // --- Применяем триггеры append-only ---
                    console.log('  → Creating append-only triggers...');
                    return [4 /*yield*/, connection_js_1.sql.unsafe(triggers_js_1.APPEND_ONLY_TRIGGER_SQL)];
                case 1:
                    _a.sent();
                    // --- Users ---
                    console.log('  → Creating users...');
                    seedPassword = process.env.SEED_PASSWORD;
                    if (!seedPassword) {
                        console.error('❌ SEED_PASSWORD environment variable is required');
                        process.exit(1);
                    }
                    return [4 /*yield*/, (0, auth_js_1.hashPassword)(seedPassword)];
                case 2:
                    passwordHash = _a.sent();
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.users).values({
                            email: 'admin@tms.local',
                            passwordHash: passwordHash,
                            fullName: 'Администратор',
                            roles: ['admin'],
                        }).returning()];
                case 3:
                    admin = (_a.sent())[0];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.users).values({
                            email: 'logist@tms.local',
                            passwordHash: passwordHash,
                            fullName: 'Иванов Пётр Сергеевич',
                            roles: ['logist'],
                        }).returning()];
                case 4:
                    logist = (_a.sent())[0];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.users).values({
                            email: 'dispatcher@tms.local',
                            passwordHash: passwordHash,
                            fullName: 'Сидорова Мария Александровна',
                            roles: ['dispatcher'],
                        }).returning()];
                case 5:
                    dispatcher = (_a.sent())[0];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.users).values({
                            email: 'mechanic@tms.local',
                            passwordHash: passwordHash,
                            fullName: 'Козлов Андрей Иванович',
                            roles: ['mechanic'],
                        }).returning()];
                case 6:
                    mechanic = (_a.sent())[0];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.users).values({
                            email: 'medic@tms.local',
                            passwordHash: passwordHash,
                            fullName: 'Белова Елена Викторовна',
                            roles: ['medic'],
                        }).returning()];
                case 7:
                    medic = (_a.sent())[0];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.users).values({
                            email: 'manager@tms.local',
                            passwordHash: passwordHash,
                            fullName: 'Петров Алексей Павлович',
                            roles: ['manager'],
                        }).returning()];
                case 8:
                    manager = (_a.sent())[0];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.users).values({
                            email: 'accountant@tms.local',
                            passwordHash: passwordHash,
                            fullName: 'Кузнецова Ольга Дмитриевна',
                            roles: ['accountant'],
                        }).returning()];
                case 9:
                    accountant = (_a.sent())[0];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.users).values({
                            email: 'repair@tms.local',
                            passwordHash: passwordHash,
                            fullName: 'Смирнов Дмитрий Анатольевич',
                            roles: ['repair_service'],
                        }).returning()];
                case 10:
                    repairUser = (_a.sent())[0];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.users).values([
                            { email: 'driver1@tms.local', passwordHash: passwordHash, fullName: 'Морозов Сергей Николаевич', roles: ['driver'] },
                            { email: 'driver2@tms.local', passwordHash: passwordHash, fullName: 'Волков Артём Дмитриевич', roles: ['driver'] },
                            { email: 'driver3@tms.local', passwordHash: passwordHash, fullName: 'Соколов Игорь Петрович', roles: ['driver'] },
                        ]).returning()];
                case 11:
                    driverUsers = _a.sent();
                    // --- Contractors ---
                    console.log('  → Creating contractors...');
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.contractors).values({
                            name: 'ООО "Строй Альянс"',
                            inn: '7701234567',
                            kpp: '770101001',
                            legalAddress: 'г. Москва, ул. Ленина, 1',
                            phone: '+7 (495) 123-45-67',
                            email: 'info@stroyalliance.ru',
                        }).returning()];
                case 12:
                    client1 = (_a.sent())[0];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.contractors).values({
                            name: 'ООО "ПродТорг"',
                            inn: '7709876543',
                            kpp: '770901001',
                            legalAddress: 'г. Москва, ул. Тверская, 15',
                            phone: '+7 (495) 987-65-43',
                            email: 'orders@prodtorg.ru',
                        }).returning()];
                case 13:
                    client2 = (_a.sent())[0];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.contractors).values({
                            name: 'ИП Никитин А.С.',
                            inn: '771234567890',
                            legalAddress: 'г. Москва, ул. Мира, 42',
                            phone: '+7 (926) 555-11-22',
                        }).returning()];
                case 14:
                    client3 = (_a.sent())[0];
                    // --- Contracts ---
                    console.log('  → Creating contracts...');
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.contracts).values([
                            {
                                contractorId: client1.id,
                                number: 'ДГ-2026/001',
                                startDate: new Date('2026-01-01'),
                                endDate: new Date('2026-12-31'),
                            },
                            {
                                contractorId: client2.id,
                                number: 'ДГ-2026/002',
                                startDate: new Date('2026-02-01'),
                                endDate: new Date('2026-12-31'),
                            },
                        ])];
                case 15:
                    _a.sent();
                    // --- Vehicles ---
                    console.log('  → Creating vehicles...');
                    vehicleData = [
                        { plateNumber: 'А123БВ77', vin: 'XTA21700080000001', make: 'ГАЗ', model: 'ГАЗон NEXT', year: 2023, bodyType: 'тент', payloadCapacityKg: 5000, payloadVolumeM3: 22, fuelTankLiters: 120, fuelNormPer100Km: 18 },
                        { plateNumber: 'В456ГД50', vin: 'XTA21700080000002', make: 'КАМАЗ', model: '65207', year: 2022, bodyType: 'борт', payloadCapacityKg: 15000, payloadVolumeM3: 45, fuelTankLiters: 350, fuelNormPer100Km: 32 },
                        { plateNumber: 'Е789ЖЗ99', vin: 'XTA21700080000003', make: 'MAN', model: 'TGX 18.510', year: 2024, bodyType: 'рефрижератор', payloadCapacityKg: 20000, payloadVolumeM3: 86, fuelTankLiters: 400, fuelNormPer100Km: 28 },
                        { plateNumber: 'К012ЛМ77', vin: 'XTA21700080000004', make: 'Hyundai', model: 'HD78', year: 2023, bodyType: 'фургон', payloadCapacityKg: 4500, payloadVolumeM3: 18, fuelTankLiters: 100, fuelNormPer100Km: 14 },
                        { plateNumber: 'Н345ОП50', vin: 'XTA21700080000005', make: 'ISUZU', model: 'ELF 7.5', year: 2024, bodyType: 'тент', payloadCapacityKg: 4200, payloadVolumeM3: 20, fuelTankLiters: 100, fuelNormPer100Km: 13 },
                    ];
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.vehicles).values(vehicleData)];
                case 16:
                    _a.sent();
                    // --- Drivers ---
                    console.log('  → Creating drivers...');
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.drivers).values([
                            {
                                userId: driverUsers[0].id,
                                fullName: 'Морозов Сергей Николаевич',
                                birthDate: new Date('1985-03-15'),
                                licenseNumber: '7700123456',
                                licenseCategories: ['B', 'C', 'CE'],
                                licenseExpiry: new Date('2028-03-15'),
                                medCertificateExpiry: new Date('2027-01-10'),
                                personalDataConsent: true,
                                personalDataConsentDate: new Date('2026-01-01'),
                            },
                            {
                                userId: driverUsers[1].id,
                                fullName: 'Волков Артём Дмитриевич',
                                birthDate: new Date('1990-07-22'),
                                licenseNumber: '5000987654',
                                licenseCategories: ['B', 'C'],
                                licenseExpiry: new Date('2029-07-22'),
                                medCertificateExpiry: new Date('2027-06-01'),
                                personalDataConsent: true,
                                personalDataConsentDate: new Date('2026-01-01'),
                            },
                            {
                                userId: driverUsers[2].id,
                                fullName: 'Соколов Игорь Петрович',
                                birthDate: new Date('1982-11-03'),
                                licenseNumber: '9900456789',
                                licenseCategories: ['B', 'C', 'CE', 'D'],
                                licenseExpiry: new Date('2027-11-03'),
                                medCertificateExpiry: new Date('2026-12-01'),
                                personalDataConsent: true,
                                personalDataConsentDate: new Date('2026-01-01'),
                            },
                        ])];
                case 17:
                    _a.sent();
                    // --- Checklist Templates ---
                    console.log('  → Creating checklist templates...');
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.checklistTemplates).values([
                            {
                                type: 'tech',
                                version: '1.0',
                                name: 'Предрейсовый техосмотр (стандартный)',
                                items: [
                                    { name: 'Тормозная система', responseType: 'ok_fault', required: true },
                                    { name: 'Рулевое управление', responseType: 'ok_fault', required: true },
                                    { name: 'Шины (состояние, давление)', responseType: 'ok_fault', required: true },
                                    { name: 'Внешние световые приборы', responseType: 'ok_fault', required: true },
                                    { name: 'Стеклоочистители', responseType: 'ok_fault', required: true },
                                    { name: 'Уровень масла', responseType: 'ok_fault', required: true },
                                    { name: 'Охлаждающая жидкость', responseType: 'ok_fault', required: true },
                                    { name: 'Состояние кузова/тента', responseType: 'ok_fault', required: true },
                                    { name: 'Огнетушитель', responseType: 'ok_fault', required: true },
                                    { name: 'Аптечка', responseType: 'ok_fault', required: true },
                                    { name: 'Знак аварийной остановки', responseType: 'ok_fault', required: true },
                                    { name: 'Тахограф', responseType: 'ok_fault', required: true },
                                    { name: 'Показания одометра', responseType: 'number', required: true },
                                ],
                            },
                            {
                                type: 'med',
                                version: '1.0',
                                name: 'Предрейсовый медосмотр (стандартный)',
                                items: [
                                    { name: 'АД систолическое (мм рт.ст.)', responseType: 'number', required: true },
                                    { name: 'АД диастолическое (мм рт.ст.)', responseType: 'number', required: true },
                                    { name: 'Пульс (уд/мин)', responseType: 'number', required: true },
                                    { name: 'Температура (°C)', responseType: 'number', required: true },
                                    { name: 'Общее состояние', responseType: 'text', required: true },
                                    { name: 'Признаки опьянения', responseType: 'ok_fault', required: true },
                                    { name: 'Жалобы', responseType: 'text', required: false },
                                ],
                            },
                        ])];
                case 18:
                    _a.sent();
                    // --- Restriction Zones ---
                    console.log('  → Creating restriction zones...');
                    return [4 /*yield*/, connection_js_1.db.insert(schema_js_1.restrictionZones).values([
                            {
                                name: 'МКАД',
                                type: 'mkad',
                                geoJson: { type: 'Polygon', coordinates: [] }, // Упрощённый GeoJSON
                            },
                            {
                                name: 'ТТК',
                                type: 'ttk',
                                geoJson: { type: 'Polygon', coordinates: [] },
                            },
                        ])];
                case 19:
                    _a.sent();
                    console.log('✅ Seed completed!');
                    console.log('');
                    console.log("\uD83D\uDCCB \u0422\u0435\u0441\u0442\u043E\u0432\u044B\u0435 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u044B (\u043F\u0430\u0440\u043E\u043B\u044C: ".concat(seedPassword, "):"));
                    console.log('   admin@tms.local      — Администратор');
                    console.log('   logist@tms.local     — Логист');
                    console.log('   dispatcher@tms.local — Диспетчер');
                    console.log('   mechanic@tms.local   — Механик');
                    console.log('   medic@tms.local      — Медик');
                    console.log('   manager@tms.local    — Руководитель');
                    console.log('   accountant@tms.local — Бухгалтер');
                    console.log('   repair@tms.local     — Ремонтная служба');
                    console.log('   driver1@tms.local    — Водитель 1');
                    console.log('   driver2@tms.local    — Водитель 2');
                    console.log('   driver3@tms.local    — Водитель 3');
                    return [4 /*yield*/, connection_js_1.sql.end()];
                case 20:
                    _a.sent();
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
seed().catch(function (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
