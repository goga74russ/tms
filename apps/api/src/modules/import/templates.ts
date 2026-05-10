// ============================================================
// Round 3B — D11: Excel template builders
// Each builder returns a Buffer with a well-formatted .xlsx file:
//   * sheet "Шаблон"     — header row + 2 sample rows
//   * sheet "Инструкция" — column descriptions and rules
// ============================================================
import * as XLSX from 'xlsx';

export type TemplateType = 'contractors' | 'vehicles' | 'drivers' | 'orders';

interface ColumnSpec {
    key: string;
    header: string;
    required?: boolean;
    description: string;
    example1: string | number;
    example2: string | number;
}

const SPECS: Record<TemplateType, ColumnSpec[]> = {
    contractors: [
        { key: 'name', header: 'Название', required: true, description: 'Полное наименование организации', example1: 'ООО "Транспорт-Сервис"', example2: 'ИП Иванов И.И.' },
        { key: 'inn', header: 'ИНН', required: true, description: '10 или 12 цифр', example1: '7700000001', example2: '500100123456' },
        { key: 'kpp', header: 'КПП', description: '9 цифр (для юр. лиц)', example1: '770001001', example2: '' },
        { key: 'legalAddress', header: 'Юридический адрес', description: 'Полный почтовый адрес', example1: 'г. Москва, ул. Ленина, 1', example2: 'Московская обл., г. Подольск, ул. Кирова, 5' },
        { key: 'phone', header: 'Телефон', description: 'В формате +7XXXXXXXXXX', example1: '+74951234567', example2: '+79991234567' },
        { key: 'email', header: 'Email', description: 'Контактный email', example1: 'info@example.com', example2: 'contact@firma.ru' },
    ],
    vehicles: [
        { key: 'plateNumber', header: 'Госномер', required: true, description: 'Регистрационный знак', example1: 'А001АА77', example2: 'В123ВВ199' },
        { key: 'vin', header: 'VIN', required: true, description: '17 символов', example1: 'XTA21700080000010', example2: 'WVWZZZ1JZXW123456' },
        { key: 'make', header: 'Марка', required: true, description: 'Производитель', example1: 'ГАЗ', example2: 'Volvo' },
        { key: 'model', header: 'Модель', required: true, description: 'Модель ТС', example1: 'Газель NEXT', example2: 'FH 460' },
        { key: 'year', header: 'Год', description: 'Год выпуска (YYYY)', example1: 2024, example2: 2022 },
        { key: 'bodyType', header: 'Тип кузова', description: 'тент / фургон / рефрижератор / самосвал', example1: 'тент', example2: 'рефрижератор' },
        { key: 'payloadCapacityKg', header: 'Грузоподъёмность кг', description: 'Полезная нагрузка, кг', example1: 1500, example2: 20000 },
        { key: 'payloadVolumeM3', header: 'Объём м3', description: 'Полезный объём, м³', example1: 14, example2: 86 },
        { key: 'fuelTankLiters', header: 'Объём бака, л', description: 'Ёмкость топливного бака', example1: 80, example2: 600 },
        { key: 'fuelNormPer100Km', header: 'Расход л/100км', description: 'Норма расхода топлива', example1: 14, example2: 32 },
    ],
    drivers: [
        { key: 'fullName', header: 'ФИО', required: true, description: 'Фамилия Имя Отчество полностью', example1: 'Петров Иван Сергеевич', example2: 'Иванов Алексей Александрович' },
        { key: 'licenseNumber', header: 'Номер ВУ', required: true, description: 'Номер водительского удостоверения', example1: '7700111222', example2: '7799555666' },
        { key: 'licenseCategories', header: 'Категории', description: 'Через запятую, например B,C,CE', example1: 'B,C', example2: 'C,CE' },
        { key: 'birthDate', header: 'Дата рождения', description: 'YYYY-MM-DD', example1: '1990-01-15', example2: '1985-03-20' },
        { key: 'licenseExpiry', header: 'Срок действия ВУ', description: 'YYYY-MM-DD', example1: '2030-01-01', example2: '2028-06-15' },
        { key: 'phone', header: 'Телефон', description: '+7XXXXXXXXXX', example1: '+79991234567', example2: '+79261234567' },
        { key: 'email', header: 'Email', description: 'Если не указан — будет создан тех. email', example1: 'driver@example.com', example2: '' },
    ],
    orders: [
        { key: 'number', header: 'Номер заявки', required: true, description: 'Уникальный номер', example1: 'ORD-2025-001', example2: 'ORD-2025-002' },
        { key: 'contractorInn', header: 'ИНН контрагента', required: true, description: 'Связь с существующим контрагентом по ИНН', example1: '7700000001', example2: '7700000002' },
        { key: 'cargoDescription', header: 'Описание груза', required: true, description: 'Краткое описание', example1: 'Палеты с бытовой техникой', example2: 'Молочная продукция' },
        { key: 'cargoWeightKg', header: 'Вес кг', required: true, description: 'Вес груза, кг', example1: 1200, example2: 5000 },
        { key: 'cargoVolumeM3', header: 'Объём м3', description: 'Объём груза, м³', example1: 8, example2: 25 },
        { key: 'loadingAddress', header: 'Адрес погрузки', required: true, description: 'Полный адрес', example1: 'г. Москва, Ленинградское ш., 18', example2: 'г. Москва, Дмитровское ш., 100' },
        { key: 'loadingDate', header: 'Дата погрузки', description: 'YYYY-MM-DD HH:mm', example1: '2025-05-15 10:00', example2: '2025-05-16 09:00' },
        { key: 'unloadingAddress', header: 'Адрес выгрузки', required: true, description: 'Полный адрес', example1: 'г. Тверь, ул. Советская, 25', example2: 'г. Нижний Новгород, ул. Ванеева, 12' },
        { key: 'unloadingDate', header: 'Дата выгрузки', description: 'YYYY-MM-DD HH:mm', example1: '2025-05-15 14:00', example2: '2025-05-16 18:00' },
        { key: 'coldChainRequired', header: 'Холодильная цепь', description: 'true / false', example1: 'false', example2: 'true' },
        { key: 'temperatureMinC', header: 'Темп. мин °C', description: 'Минимальная температура', example1: '', example2: 2 },
        { key: 'temperatureMaxC', header: 'Темп. макс °C', description: 'Максимальная температура', example1: '', example2: 6 },
    ],
};

const TEMPLATE_TITLES: Record<TemplateType, string> = {
    contractors: 'Шаблон импорта контрагентов',
    vehicles: 'Шаблон импорта транспортных средств',
    drivers: 'Шаблон импорта водителей',
    orders: 'Шаблон импорта заявок',
};

export function getTemplateColumns(type: TemplateType): ColumnSpec[] {
    return SPECS[type];
}

export function buildTemplate(type: TemplateType): Buffer {
    const cols = SPECS[type];

    // Sheet 1: header + 2 example rows
    const headerRow = cols.map((c) => c.header + (c.required ? ' *' : ''));
    const example1 = cols.map((c) => c.example1);
    const example2 = cols.map((c) => c.example2);
    const ws = XLSX.utils.aoa_to_sheet([headerRow, example1, example2]);
    ws['!cols'] = cols.map(() => ({ wch: 24 }));

    // Sheet 2: instructions
    const instructions: (string | number)[][] = [
        [TEMPLATE_TITLES[type]],
        [''],
        ['Колонка', 'Обязательно', 'Описание'],
        ...cols.map((c) => [c.header, c.required ? 'да' : 'нет', c.description]),
        [''],
        ['Правила:'],
        ['• Обязательные поля помечены звёздочкой (*) в шапке'],
        ['• Заголовки колонок не переименовывайте'],
        ['• Даты — в формате YYYY-MM-DD или YYYY-MM-DD HH:mm'],
        ['• Максимум 200 строк за один импорт'],
    ];
    const wsi = XLSX.utils.aoa_to_sheet(instructions);
    wsi['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Шаблон');
    XLSX.utils.book_append_sheet(wb, wsi, 'Инструкция');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buf as Buffer;
}

/**
 * Parse XLSX buffer using the localised headers from the template.
 * Returns rows keyed by canonical field names.
 */
export function parseTemplate(type: TemplateType, buffer: Buffer): Record<string, unknown>[] {
    const cols = SPECS[type];
    const headerMap = new Map<string, string>();
    for (const c of cols) {
        // Accept both "Header" and "Header *" forms
        headerMap.set(c.header, c.key);
        headerMap.set(c.header + ' *', c.key);
        headerMap.set(c.key, c.key); // also accept canonical key
    }

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('шаблон') || n.toLowerCase() === 'sheet1') ?? wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    return rows.map((row) => {
        const item: Record<string, unknown> = {};
        for (const [hdr, val] of Object.entries(row)) {
            const trimmed = typeof hdr === 'string' ? hdr.trim() : hdr;
            const key = headerMap.get(trimmed as string) ?? trimmed;
            if (val === '' || val === null || val === undefined) continue;
            // Special handling for arrays
            if (key === 'licenseCategories' && typeof val === 'string') {
                item[key] = val.split(',').map((s) => s.trim()).filter(Boolean);
            } else if (key === 'coldChainRequired') {
                item[key] = String(val).toLowerCase() === 'true' || val === 1 || val === '1';
            } else {
                item[key as string] = val;
            }
        }
        return item;
    });
}
