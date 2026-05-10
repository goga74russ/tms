// ================================================================
// Geocoding Service — realistic Russian-cities mock
// Translates string addresses → [lat, lon] coordinates
// In-memory dataset of ~50 major Russian cities with substring lookup
// + small jitter. Fallback to Moscow center.
// Designed for easy swap to Nominatim/Yandex Geocoder API.
// ================================================================

export interface GeoPoint {
    lat: number;
    lon: number;
}

export interface GeocodeResult extends GeoPoint {
    address: string;
    source: 'dictionary' | 'mock' | 'nominatim';
    confidence: number; // 0..1
    matchedCity?: string;
}

// ================================================================
// 50 major Russian cities with coordinates (city-center).
// Aliases let us match common spellings ("спб", "питер" → СПб).
// ================================================================
interface CityRecord {
    name: string;          // canonical Russian name (used in reverse geocode)
    aliases: string[];     // lowercase substrings to look for
    lat: number;
    lon: number;
}

const RUSSIAN_CITIES: CityRecord[] = [
    { name: 'Москва', aliases: ['москва', 'moscow', 'мск'], lat: 55.7558, lon: 37.6176 },
    { name: 'Санкт-Петербург', aliases: ['санкт-петербург', 'санкт петербург', 'спб', 'питер', 'st. petersburg', 'saint petersburg'], lat: 59.9343, lon: 30.3351 },
    { name: 'Нижний Новгород', aliases: ['нижний новгород', 'н.новгород', 'нн', 'nizhny novgorod'], lat: 56.2965, lon: 43.9361 },
    { name: 'Казань', aliases: ['казань', 'kazan'], lat: 55.7887, lon: 49.1221 },
    { name: 'Самара', aliases: ['самара', 'samara'], lat: 53.1959, lon: 50.1002 },
    { name: 'Уфа', aliases: ['уфа', 'ufa'], lat: 54.7388, lon: 55.9721 },
    { name: 'Волгоград', aliases: ['волгоград', 'volgograd'], lat: 48.7080, lon: 44.5133 },
    { name: 'Воронеж', aliases: ['воронеж', 'voronezh'], lat: 51.6720, lon: 39.1843 },
    { name: 'Ростов-на-Дону', aliases: ['ростов-на-дону', 'ростов на дону', 'rostov'], lat: 47.2357, lon: 39.7015 },
    { name: 'Екатеринбург', aliases: ['екатеринбург', 'yekaterinburg', 'ekaterinburg'], lat: 56.8389, lon: 60.6057 },
    { name: 'Челябинск', aliases: ['челябинск', 'chelyabinsk'], lat: 55.1644, lon: 61.4368 },
    { name: 'Пермь', aliases: ['пермь', 'perm'], lat: 58.0105, lon: 56.2502 },
    { name: 'Краснодар', aliases: ['краснодар', 'krasnodar'], lat: 45.0355, lon: 38.9753 },
    { name: 'Тула', aliases: ['тула', 'tula'], lat: 54.1920, lon: 37.6175 },
    { name: 'Иваново', aliases: ['иваново', 'ivanovo'], lat: 57.0001, lon: 40.9739 },
    { name: 'Ярославль', aliases: ['ярославль', 'yaroslavl'], lat: 57.6261, lon: 39.8845 },
    { name: 'Тверь', aliases: ['тверь', 'tver'], lat: 56.8587, lon: 35.9176 },
    { name: 'Калуга', aliases: ['калуга', 'kaluga'], lat: 54.5293, lon: 36.2754 },
    { name: 'Брянск', aliases: ['брянск', 'bryansk'], lat: 53.2521, lon: 34.3717 },
    { name: 'Курск', aliases: ['курск', 'kursk'], lat: 51.7373, lon: 36.1873 },
    { name: 'Орёл', aliases: ['орёл', 'орел', 'oryol', 'orel'], lat: 52.9651, lon: 36.0785 },
    { name: 'Белгород', aliases: ['белгород', 'belgorod'], lat: 50.5953, lon: 36.5872 },
    { name: 'Липецк', aliases: ['липецк', 'lipetsk'], lat: 52.6088, lon: 39.5992 },
    { name: 'Тамбов', aliases: ['тамбов', 'tambov'], lat: 52.7213, lon: 41.4523 },
    { name: 'Рязань', aliases: ['рязань', 'ryazan'], lat: 54.6296, lon: 39.7423 },
    { name: 'Владимир', aliases: ['владимир', 'vladimir'], lat: 56.1290, lon: 40.4070 },
    { name: 'Кострома', aliases: ['кострома', 'kostroma'], lat: 57.7681, lon: 40.9269 },
    { name: 'Вологда', aliases: ['вологда', 'vologda'], lat: 59.2181, lon: 39.8886 },
    { name: 'Архангельск', aliases: ['архангельск', 'arkhangelsk'], lat: 64.5401, lon: 40.5433 },
    { name: 'Мурманск', aliases: ['мурманск', 'murmansk'], lat: 68.9585, lon: 33.0827 },
    { name: 'Сочи', aliases: ['сочи', 'sochi'], lat: 43.6028, lon: 39.7342 },
    { name: 'Ставрополь', aliases: ['ставрополь', 'stavropol'], lat: 45.0428, lon: 41.9734 },
    { name: 'Махачкала', aliases: ['махачкала', 'makhachkala'], lat: 42.9849, lon: 47.5047 },
    { name: 'Оренбург', aliases: ['оренбург', 'orenburg'], lat: 51.7727, lon: 55.0988 },
    { name: 'Тюмень', aliases: ['тюмень', 'tyumen'], lat: 57.1530, lon: 65.5343 },
    { name: 'Омск', aliases: ['омск', 'omsk'], lat: 54.9885, lon: 73.3242 },
    { name: 'Новосибирск', aliases: ['новосибирск', 'novosibirsk'], lat: 55.0084, lon: 82.9357 },
    { name: 'Барнаул', aliases: ['барнаул', 'barnaul'], lat: 53.3548, lon: 83.7698 },
    { name: 'Кемерово', aliases: ['кемерово', 'kemerovo'], lat: 55.3331, lon: 86.0833 },
    { name: 'Красноярск', aliases: ['красноярск', 'krasnoyarsk'], lat: 56.0153, lon: 92.8932 },
    { name: 'Иркутск', aliases: ['иркутск', 'irkutsk'], lat: 52.2870, lon: 104.3050 },
    { name: 'Хабаровск', aliases: ['хабаровск', 'khabarovsk'], lat: 48.4827, lon: 135.0838 },
    { name: 'Владивосток', aliases: ['владивосток', 'vladivostok'], lat: 43.1198, lon: 131.8869 },
    { name: 'Магадан', aliases: ['магадан', 'magadan'], lat: 59.5638, lon: 150.8035 },
    { name: 'Якутск', aliases: ['якутск', 'yakutsk'], lat: 62.0339, lon: 129.7331 },
    { name: 'Сыктывкар', aliases: ['сыктывкар', 'syktyvkar'], lat: 61.6688, lon: 50.8364 },
    { name: 'Псков', aliases: ['псков', 'pskov'], lat: 57.8194, lon: 28.3324 },
    { name: 'Великий Новгород', aliases: ['великий новгород', 'в.новгород', 'novgorod'], lat: 58.5215, lon: 31.2755 },
    { name: 'Калининград', aliases: ['калининград', 'kaliningrad'], lat: 54.7065, lon: 20.5110 },
    { name: 'Саратов', aliases: ['саратов', 'saratov'], lat: 51.5331, lon: 46.0342 },
    { name: 'Пенза', aliases: ['пенза', 'penza'], lat: 53.2007, lon: 45.0046 },
];

const MOSCOW_FALLBACK: CityRecord = RUSSIAN_CITIES[0];

// ================================================================
// Deterministic small jitter (0.001 .. 0.01 deg).
// Same input → same coordinates → idempotent for tests.
// ================================================================
function hashString(str: string): number {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff;
    }
    return h;
}

function deterministicJitter(seed: string, axis: number): number {
    const h = hashString(seed + ':' + axis);
    // 0.001 .. 0.01, signed
    const magnitude = 0.001 + ((h % 9000) / 1_000_000); // 0.001..0.010
    const sign = (h >> 8) & 1 ? 1 : -1;
    return Number((sign * magnitude).toFixed(6));
}

function findCityInAddress(address: string): CityRecord | null {
    const lc = address.toLowerCase();
    // Prefer longer alias matches (so "нижний новгород" beats incidental "новгород" in another city block).
    const ranked: { city: CityRecord; aliasLen: number }[] = [];
    for (const city of RUSSIAN_CITIES) {
        for (const alias of city.aliases) {
            if (lc.includes(alias)) {
                ranked.push({ city, aliasLen: alias.length });
                break;
            }
        }
    }
    if (ranked.length === 0) return null;
    ranked.sort((a, b) => b.aliasLen - a.aliasLen);
    return ranked[0].city;
}

// ================================================================
// Public API
// ================================================================

/**
 * Geocode an address string to coordinates by substring-matching
 * the city name against the in-memory Russian-cities dataset.
 * Adds small deterministic jitter (~0.001..0.01 deg, ~100m..1km)
 * so two different addresses in the same city map to distinct points.
 * Falls back to Moscow center if no city is recognised.
 */
export function geocodeAddress(address: string): GeocodeResult {
    const matched = findCityInAddress(address);
    const city = matched ?? MOSCOW_FALLBACK;
    const latJ = deterministicJitter(address, 0);
    const lonJ = deterministicJitter(address, 1);
    return {
        lat: Number((city.lat + latJ).toFixed(6)),
        lon: Number((city.lon + lonJ).toFixed(6)),
        address,
        source: matched ? 'dictionary' : 'mock',
        confidence: matched ? 0.85 : 0.2,
        matchedCity: city.name,
    };
}

/**
 * Batch geocode multiple addresses.
 */
export function geocodeBatch(addresses: string[]): GeocodeResult[] {
    return addresses.map(geocodeAddress);
}

/**
 * Reverse geocode: coordinates → "г. {City}".
 * Uses haversine to find nearest known city.
 */
export function reverseGeocode(lat: number, lon: number): string {
    let best = MOSCOW_FALLBACK;
    let bestDist = Infinity;
    for (const city of RUSSIAN_CITIES) {
        const d = haversineKm(lat, lon, city.lat, city.lon);
        if (d < bestDist) {
            bestDist = d;
            best = city;
        }
    }
    return `г. ${best.name}`;
}

// ================================================================
// Helpers
// ================================================================

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

// Exposed for tests & internal callers that want raw dataset.
export const __RUSSIAN_CITIES__ = RUSSIAN_CITIES;
