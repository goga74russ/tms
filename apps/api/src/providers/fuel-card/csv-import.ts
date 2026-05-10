// ============================================================
// CSV fuel-card import — works today without any external API.
// Operators upload a CSV exported from their bank/processor.
// Expected columns (case-insensitive, comma or semicolon-separated):
//   transactionId, cardNumber, timestamp, stationName, stationAddress,
//   fuelType, liters, pricePerLiter, totalCost, odometerKm
// Missing columns are tolerated; missing required → row skipped.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    FuelCardCredentials, FuelCardProvider, FuelCardStatus, FuelTransaction,
} from './interface.js';

const REQUIRED = ['cardnumber', 'timestamp', 'liters'] as const;

function detectDelimiter(line: string): string {
    if (line.includes(';') && !line.includes(',')) return ';';
    if (line.includes('\t')) return '\t';
    return ',';
}

function parseCsvLine(line: string, delimiter: string): string[] {
    // Minimal CSV parser supporting double-quote escaping. Good enough for
    // fuel-card exports from major Russian banks.
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else inQuote = false;
            } else cur += ch;
        } else {
            if (ch === '"') inQuote = true;
            else if (ch === delimiter) { out.push(cur); cur = ''; }
            else cur += ch;
        }
    }
    out.push(cur);
    return out;
}

function toNumber(value: string | undefined): number {
    if (!value) return 0;
    const cleaned = value.replace(/\s/g, '').replace(',', '.');
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
}

export interface CsvParseOptions {
    /** Optional vehicle id to attribute every parsed row to. */
    vehicleId?: string;
}

export function parseFuelCardCsv(csv: string, options: CsvParseOptions = {}): FuelTransaction[] {
    const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const delimiter = detectDelimiter(lines[0]!);
    const headers = parseCsvLine(lines[0]!, delimiter).map(h => h.trim().toLowerCase().replace(/\s+/g, ''));

    for (const req of REQUIRED) {
        if (!headers.includes(req)) {
            throw new Error(`Missing required column: ${req}`);
        }
    }

    const idx = (key: string) => headers.indexOf(key);
    const result: FuelTransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]!, delimiter);
        const cardNumber = cols[idx('cardnumber')]?.trim();
        const timestamp = cols[idx('timestamp')]?.trim();
        const liters = toNumber(cols[idx('liters')]);
        if (!cardNumber || !timestamp || liters <= 0) continue;

        const pricePerLiter = toNumber(cols[idx('priceperliter')]);
        const totalCost = idx('totalcost') >= 0
            ? toNumber(cols[idx('totalcost')])
            : Number((liters * pricePerLiter).toFixed(2));

        result.push({
            transactionId: cols[idx('transactionid')]?.trim() || `csv-${cardNumber}-${timestamp}`,
            cardNumber,
            timestamp,
            stationName: cols[idx('stationname')]?.trim() || '—',
            stationAddress: cols[idx('stationaddress')]?.trim(),
            fuelType: cols[idx('fueltype')]?.trim() || 'ДТ',
            liters,
            pricePerLiter,
            totalCost,
            odometerKm: idx('odometerkm') >= 0 ? toNumber(cols[idx('odometerkm')]) : undefined,
            vehicleId: options.vehicleId,
        });
    }

    return result;
}

export class CsvFuelCardProvider implements FuelCardProvider {
    readonly name = 'csv';
    readonly providerType = 'fuel_card' as const;
    readonly mode = 'production' as const;

    /** Operator-supplied CSV body (set per-call via setCsvBody before sync). */
    private csvBody: string | null = null;

    setCsvBody(body: string): void { this.csvBody = body; }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: true,
            mode: 'production',
            detail: 'csv import provider — supply CSV body via setCsvBody()',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> { return { ok: true }; }

    async syncTransactions(_creds: FuelCardCredentials, vehicleId: string, _from: Date, _to: Date): Promise<FuelTransaction[]> {
        if (!this.csvBody) return [];
        return parseFuelCardCsv(this.csvBody, { vehicleId });
    }

    async getCardStatus(cardId: string): Promise<FuelCardStatus> {
        return { cardId, active: true };
    }
}
