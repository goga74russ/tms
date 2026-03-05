// ================================================================
// Geocoding Service
// Translates string addresses → [lat, lon] coordinates
// Currently uses a built-in dictionary + hash-based mock.
// Designed for easy swap to real Nominatim/Yandex Geocoder API.
// ================================================================

export interface GeoPoint {
    lat: number;
    lon: number;
}

export interface GeocodeResult extends GeoPoint {
    address: string;
    source: 'dictionary' | 'mock' | 'nominatim';
    confidence: number; // 0..1
}

// ================================================================
// Well-known address dictionary (Moscow region)
// ================================================================
const KNOWN_ADDRESSES: Record<string, GeoPoint> = {
    'москва, тверская 1': { lat: 55.7578, lon: 37.6137 },
    'москва, тверская ул. 1': { lat: 55.7578, lon: 37.6137 },
    'москва, красная площадь 1': { lat: 55.7539, lon: 37.6208 },
    'москва, ленинградский проспект 80': { lat: 55.8065, lon: 37.5111 },
    'москва, мкад 1 км': { lat: 55.8888, lon: 37.4421 },
    'москва, варшавское шоссе 170': { lat: 55.5858, lon: 37.6111 },
    'санкт-петербург, невский проспект 1': { lat: 59.9386, lon: 30.3141 },
    'санкт-петербург, дворцовая площадь': { lat: 59.9398, lon: 30.3149 },
    'нижний новгород, большая покровская 1': { lat: 56.3269, lon: 43.9956 },
    'казань, кремль': { lat: 55.7987, lon: 49.1060 },
    'екатеринбург, ленина 1': { lat: 56.8389, lon: 60.6057 },
    'новосибирск, красный проспект 1': { lat: 55.0302, lon: 82.9204 },
    'ростов-на-дону, большая садовая 1': { lat: 47.2229, lon: 39.7186 },
    'владивосток, светланская 1': { lat: 43.1198, lon: 131.8869 },
    'краснодар, красная 1': { lat: 45.0355, lon: 38.9753 },
    'самара, куйбышева 1': { lat: 53.1878, lon: 50.0966 },
};

/**
 * Geocode an address string to coordinates.
 * 
 * Lookup order:
 * 1. Check the built-in dictionary (exact match, case-insensitive)
 * 2. Check the built-in dictionary (fuzzy/partial match)
 * 3. Fall back to deterministic hash-based mock (for development)
 * 
 * In production, step 3 would be replaced by an HTTP call to
 * Nominatim (`https://nominatim.openstreetmap.org/search`) or
 * Yandex Geocoder API (`https://geocode-maps.yandex.ru/1.x/`).
 */
export function geocodeAddress(address: string): GeocodeResult {
    const normalized = normalizeAddress(address);

    // 1. Exact dictionary match
    if (KNOWN_ADDRESSES[normalized]) {
        return {
            ...KNOWN_ADDRESSES[normalized],
            address,
            source: 'dictionary',
            confidence: 1.0,
        };
    }

    // 2. Partial match — try to find a key that contains
    for (const [key, point] of Object.entries(KNOWN_ADDRESSES)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return {
                ...point,
                address,
                source: 'dictionary',
                confidence: 0.8,
            };
        }
    }

    // 3. Deterministic hash-based mock (development fallback)
    return mockGeocode(address);
}

/**
 * Batch geocode multiple addresses.
 */
export function geocodeBatch(addresses: string[]): GeocodeResult[] {
    return addresses.map(geocodeAddress);
}

/**
 * Reverse geocode: coordinates → address string (stub)
 */
export function reverseGeocode(lat: number, lon: number): string {
    // Find nearest known address
    let bestAddr = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    let bestDist = Infinity;

    for (const [addr, point] of Object.entries(KNOWN_ADDRESSES)) {
        const dist = Math.sqrt(
            Math.pow(lat - point.lat, 2) + Math.pow(lon - point.lon, 2)
        );
        if (dist < bestDist) {
            bestDist = dist;
            bestAddr = addr;
        }
    }

    return bestDist < 0.05 ? bestAddr : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

// ================================================================
// Helpers
// ================================================================

function normalizeAddress(address: string): string {
    return address
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.;:!?]/g, '')
        .replace(/ул\.?\s*/g, '')
        .replace(/д\.?\s*/g, '')
        .replace(/^г\.?\s*/g, '')
        .trim();
}

/**
 * Deterministic hash-based mock geocoder.
 * Generates coordinates near Moscow based on the address string hash.
 * Compatible with the existing `mockGeocodeAddress` in fleet/references.
 */
function mockGeocode(address: string): GeocodeResult {
    const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const latOffset = ((hash % 100) / 100) * 2 - 1;
    const lonOffset = (((hash * 13) % 100) / 100) * 2 - 1;

    return {
        lat: Number((55.751 + latOffset).toFixed(4)),
        lon: Number((37.617 + lonOffset).toFixed(4)),
        address,
        source: 'mock',
        confidence: 0.3,
    };
}
