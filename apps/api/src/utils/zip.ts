/**
 * Minimal in-memory ZIP writer (STORE method only — no compression).
 *
 * Produces a valid PKZIP archive (.zip) from a list of {name, data} entries.
 * Uses only Node `Buffer` and `zlib.crc32` — no external dependencies.
 *
 * Why STORE-only: PDFs are already compressed (FlateDecode streams + image
 * compression), so deflate gains a few percent at best while costing CPU and
 * complexity. STORE keeps the writer ~80 lines and bundle-overhead-free.
 *
 * Format reference: APPNOTE.TXT 6.3.10 (Local file header, Central directory,
 * End of central directory record). Limits: 4 GiB per entry, 65535 entries
 * (no ZIP64). For bulk-PDF invoice export both ceilings are far above need.
 */
import { Buffer } from 'node:buffer';
import { crc32 } from 'node:zlib';

export interface ZipEntry {
    /** File name inside the archive (forward slashes for directories). */
    name: string;
    /** Raw file bytes. */
    data: Buffer;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CDIR = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/**
 * Pack the given DOS-style date/time pair. We encode the current UTC time;
 * archive timestamps are informational only for our use case.
 */
function dosDateTime(d: Date): { date: number; time: number } {
    const time =
        ((d.getUTCHours() & 0x1f) << 11) |
        ((d.getUTCMinutes() & 0x3f) << 5) |
        ((Math.floor(d.getUTCSeconds() / 2)) & 0x1f);
    const date =
        (((d.getUTCFullYear() - 1980) & 0x7f) << 9) |
        (((d.getUTCMonth() + 1) & 0x0f) << 5) |
        (d.getUTCDate() & 0x1f);
    return { date, time };
}

/**
 * Build a ZIP archive in memory. Returns a single Buffer ready to send.
 *
 * Entry names are encoded as UTF-8 with the Language-encoding flag (bit 11)
 * set, so Cyrillic file names render correctly in modern unzippers.
 */
export function buildZip(entries: ZipEntry[]): Buffer {
    if (entries.length > 0xffff) {
        throw new Error('ZIP entry count exceeds 65535 (ZIP64 not implemented)');
    }

    const { date, time } = dosDateTime(new Date());
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];

    let offset = 0;

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, 'utf8');
        if (nameBuf.length > 0xffff) {
            throw new Error(`ZIP entry name too long: ${entry.name}`);
        }
        if (entry.data.length > 0xffffffff) {
            throw new Error(`ZIP entry too large (>4 GiB): ${entry.name}`);
        }

        const crc = crc32(entry.data);
        const size = entry.data.length;

        // Local file header (30 bytes + name + data)
        const local = Buffer.alloc(30);
        local.writeUInt32LE(SIG_LOCAL, 0);
        local.writeUInt16LE(20, 4); // version needed (2.0)
        local.writeUInt16LE(0x0800, 6); // flags: bit 11 = UTF-8 names
        local.writeUInt16LE(0, 8); // method: 0 = STORE
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(size, 18); // compressed size
        local.writeUInt32LE(size, 22); // uncompressed size
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28); // extra length

        localParts.push(local, nameBuf, entry.data);

        // Central directory entry (46 bytes + name)
        const central = Buffer.alloc(46);
        central.writeUInt32LE(SIG_CDIR, 0);
        central.writeUInt16LE(20, 4); // version made by
        central.writeUInt16LE(20, 6); // version needed
        central.writeUInt16LE(0x0800, 8); // flags
        central.writeUInt16LE(0, 10); // method
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(size, 20);
        central.writeUInt32LE(size, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt16LE(0, 30); // extra length
        central.writeUInt16LE(0, 32); // comment length
        central.writeUInt16LE(0, 34); // disk number
        central.writeUInt16LE(0, 36); // internal attrs
        central.writeUInt32LE(0, 38); // external attrs
        central.writeUInt32LE(offset, 42); // relative offset of local header

        centralParts.push(central, nameBuf);

        offset += local.length + nameBuf.length + entry.data.length;
    }

    const localBuf = Buffer.concat(localParts);
    const centralBuf = Buffer.concat(centralParts);

    // End of central directory record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(SIG_EOCD, 0);
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // start disk
    eocd.writeUInt16LE(entries.length, 8); // entries on this disk
    eocd.writeUInt16LE(entries.length, 10); // total entries
    eocd.writeUInt32LE(centralBuf.length, 12); // central size
    eocd.writeUInt32LE(localBuf.length, 16); // central offset
    eocd.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([localBuf, centralBuf, eocd]);
}
