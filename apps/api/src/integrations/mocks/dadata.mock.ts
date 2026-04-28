// ============================================================
// Mock DaData Service (§3.17)
// Имитирует DaData findById/party — поиск компании по ИНН
// ============================================================

export interface DaDataCompany {
    inn: string;
    kpp: string;
    name: string;
    fullName: string;
    legalAddress: string;
    actualAddress: string;
    ogrn: string;
    okved: string;
    managementName: string;
    managementPost: string;
    status: 'ACTIVE' | 'LIQUIDATING' | 'LIQUIDATED' | 'REORGANIZING';
}

export interface DaDataAddress {
    value: string;           // Полный адрес строкой
    fiasId: string;
    lat: number;
    lon: number;
    city: string;
    street: string;
    house: string;
    postalCode: string;
}

/**
 * Known companies for testing — real well-known Russian INNs.
 */
const KNOWN_COMPANIES: Record<string, DaDataCompany> = {
    '7707083893': {
        inn: '7707083893',
        kpp: '773601001',
        name: 'ПАО Сбербанк',
        fullName: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "СБЕРБАНК РОССИИ"',
        legalAddress: 'г. Москва, ул. Вавилова, д. 19',
        actualAddress: 'г. Москва, ул. Вавилова, д. 19',
        ogrn: '1027700132195',
        okved: '64.19',
        managementName: 'Греф Герман Оскарович',
        managementPost: 'Президент, Председатель Правления',
        status: 'ACTIVE',
    },
    '7736050003': {
        inn: '7736050003',
        kpp: '997950001',
        name: 'ПАО "Газпром"',
        fullName: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "ГАЗПРОМ"',
        legalAddress: 'г. Санкт-Петербург, пр-кт Лахтинский, д. 2, к. 3, стр. 1',
        actualAddress: 'г. Санкт-Петербург, пр-кт Лахтинский, д. 2, к. 3, стр. 1',
        ogrn: '1027700070518',
        okved: '06.20',
        managementName: 'Миллер Алексей Борисович',
        managementPost: 'Председатель Правления',
        status: 'ACTIVE',
    },
    '7710140679': {
        inn: '7710140679',
        kpp: '771001001',
        name: 'ООО "Яндекс"',
        fullName: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ЯНДЕКС"',
        legalAddress: 'г. Москва, ул. Льва Толстого, д. 16',
        actualAddress: 'г. Москва, ул. Льва Толстого, д. 16',
        ogrn: '1027700229193',
        okved: '63.11',
        managementName: 'Худавердян Тигран Оганесович',
        managementPost: 'Генеральный директор',
        status: 'ACTIVE',
    },
};

function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
    }
    return hash;
}

/**
 * Lookup company by INN. Returns known company or generates a mock one.
 */
export function findByInn(inn: string): DaDataCompany | null {
    // Return known company if exists
    if (KNOWN_COMPANIES[inn]) {
        return { ...KNOWN_COMPANIES[inn] };
    }

    // Validate INN format (10 or 12 digits)
    if (!/^\d{10}(\d{2})?$/.test(inn)) {
        return null;
    }

    // Generate a deterministic mock company
    const h = hashString(inn);
    const orgForms = ['ООО', 'ЗАО', 'ОАО', 'ИП', 'АО'];
    const names = ['Транслогистик', 'ГрузоПеревозки', 'ТрансКарго', 'АвтоЛайн', 'ЛогистикПро', 'ТрансЭкспресс', 'КаргоСервис'];
    const streets = ['ул. Ленина', 'ул. Мира', 'пр-кт Победы', 'ул. Гагарина', 'ул. Советская', 'ул. Профсоюзная'];
    const cities = ['г. Москва', 'г. Санкт-Петербург', 'г. Казань', 'г. Нижний Новгород', 'г. Екатеринбург'];

    const orgForm = orgForms[h % orgForms.length];
    const name = names[(h >> 3) % names.length];
    const city = cities[(h >> 5) % cities.length];
    const street = streets[(h >> 7) % streets.length];
    const house = String(1 + (h % 150));

    const fullName = `${orgForm} "${name}"`;
    const address = `${city}, ${street}, д. ${house}`;

    return {
        inn,
        kpp: inn.length === 10 ? `${inn.slice(0, 4)}01001` : '',
        name: fullName,
        fullName: fullName.toUpperCase(),
        legalAddress: address,
        actualAddress: address,
        ogrn: `10${inn}`.slice(0, 13),
        okved: '49.41',
        managementName: 'Иванов Иван Иванович',
        managementPost: orgForm === 'ИП' ? 'Индивидуальный предприниматель' : 'Генеральный директор',
        status: 'ACTIVE',
    };
}

/**
 * Suggest addresses by query string (mock DaData /suggest/address).
 */
export function suggestAddress(query: string): DaDataAddress[] {
    if (!query || query.length < 3) return [];

    const h = hashString(query);
    const cities = ['Москва', 'Санкт-Петербург', 'Казань', 'Нижний Новгород'];
    const city = cities[h % cities.length];

    return [
        {
            value: `г. ${city}, ${query}`,
            fiasId: `fias-${h.toString(16).slice(0, 8)}`,
            lat: 55.7 + (h % 100) / 1000,
            lon: 37.6 + ((h >> 4) % 100) / 1000,
            city,
            street: query,
            house: '',
            postalCode: `1${String(h).slice(0, 5)}`,
        },
    ];
}

/**
 * Validate BIK (bank identifier code) — 9 digits.
 */
export function validateBik(bik: string): { valid: boolean; bankName?: string; error?: string } {
    if (!/^\d{9}$/.test(bik)) {
        return { valid: false, error: 'БИК должен содержать 9 цифр' };
    }

    // Known test BIKs
    const knownBanks: Record<string, string> = {
        '044525225': 'ПАО Сбербанк',
        '044525700': 'АО «Тинькофф Банк»',
        '044525593': 'АО «АЛЬФА-БАНК»',
    };

    if (knownBanks[bik]) {
        return { valid: true, bankName: knownBanks[bik] };
    }

    return { valid: true, bankName: `Банк (БИК ${bik})` };
}
