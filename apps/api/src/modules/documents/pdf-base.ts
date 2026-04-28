// ============================================================
// PDF Base — shared helpers for all printed forms
// ============================================================
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, '../../assets/fonts');

export const FONT_REGULAR = path.join(FONTS_DIR, 'Roboto-Regular.ttf');
export const FONT_BOLD    = path.join(FONTS_DIR, 'Roboto-Bold.ttf');

// A4 page margins
export const MARGIN = 40;
export const PAGE_W = 595.28;
export const CONTENT_W = PAGE_W - MARGIN * 2;

export type PdfDoc = InstanceType<typeof PDFDocument>;

// ----------------------------------------------------------------
// createDoc — create a PDFDocument with Cyrillic fonts registered
// ----------------------------------------------------------------
export function createDoc(): PdfDoc {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    doc.registerFont('Regular', FONT_REGULAR);
    doc.registerFont('Bold', FONT_BOLD);
    doc.font('Regular').fontSize(10);
    return doc;
}

// ----------------------------------------------------------------
// streamToBuffer — collect PDFDocument stream into Buffer
// ----------------------------------------------------------------
export function streamToBuffer(doc: PdfDoc): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
    });
}

// ----------------------------------------------------------------
// formatDate — DD.MM.YYYY
// ----------------------------------------------------------------
export function formatDate(d: Date | string | null | undefined): string {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ----------------------------------------------------------------
// formatMoney — 1 234 567,89 ₽
// ----------------------------------------------------------------
export function formatMoney(n: number | string | null | undefined): string {
    if (n == null) return '—';
    return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ----------------------------------------------------------------
// drawHLine — horizontal rule
// ----------------------------------------------------------------
export function drawHLine(doc: PdfDoc, y?: number) {
    const yPos = y ?? doc.y;
    doc.moveTo(MARGIN, yPos).lineTo(PAGE_W - MARGIN, yPos).stroke('#cccccc');
}

// ----------------------------------------------------------------
// drawLabelValue — left label, right value on same line
// ----------------------------------------------------------------
export function drawLabelValue(
    doc: PdfDoc,
    label: string,
    value: string | null | undefined,
    opts?: { labelWidth?: number },
) {
    const lw = opts?.labelWidth ?? 160;
    const x = doc.x;
    const y = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#666666')
        .text(label, x, y, { width: lw, continued: false });
    doc.font('Regular').fontSize(10).fillColor('#000000')
        .text(value || '—', x + lw, y, { width: CONTENT_W - lw });
}

// ----------------------------------------------------------------
// sectionHeader — bold section title with underline
// ----------------------------------------------------------------
export function sectionHeader(doc: PdfDoc, title: string, moveDown = 4) {
    doc.moveDown(0.5);
    doc.font('Bold').fontSize(10).fillColor('#000000').text(title.toUpperCase());
    drawHLine(doc, doc.y);
    doc.moveDown(moveDown / 10);
}

// ----------------------------------------------------------------
// drawTable — simple grid table
// ----------------------------------------------------------------
export interface TableColumn {
    header: string;
    width: number;
    align?: 'left' | 'right' | 'center';
}

export function drawTable(
    doc: PdfDoc,
    columns: TableColumn[],
    rows: (string | number | null | undefined)[][],
) {
    const rowH = 18;
    const headerH = 20;
    const x0 = MARGIN;
    let y = doc.y;

    // Header background
    doc.rect(x0, y, CONTENT_W, headerH).fill('#f0f0f0');
    doc.fillColor('#000000');

    // Header text
    let xCur = x0;
    for (const col of columns) {
        doc.font('Bold').fontSize(8)
            .text(col.header, xCur + 3, y + 5, { width: col.width - 6, align: col.align ?? 'left' });
        xCur += col.width;
    }

    y += headerH;

    // Rows
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Alternate row background
        if (i % 2 === 1) {
            doc.rect(x0, y, CONTENT_W, rowH).fill('#fafafa');
        }
        doc.fillColor('#000000');

        xCur = x0;
        for (let j = 0; j < columns.length; j++) {
            const cell = row[j] ?? '';
            doc.font('Regular').fontSize(8)
                .text(String(cell), xCur + 3, y + 4, {
                    width: columns[j].width - 6,
                    align: columns[j].align ?? 'left',
                    ellipsis: true,
                    lineBreak: false,
                });
            xCur += columns[j].width;
        }
        y += rowH;

        // Page break if needed
        if (y > 780) {
            doc.addPage();
            y = MARGIN;
        }
    }

    // Bottom border
    doc.moveTo(x0, y).lineTo(x0 + CONTENT_W, y).stroke('#cccccc');

    // Vertical lines
    xCur = x0;
    for (const col of columns) {
        doc.moveTo(xCur, doc.y - (rows.length * rowH + headerH + 2))
            .lineTo(xCur, y)
            .stroke('#cccccc');
        xCur += col.width;
    }
    doc.moveTo(xCur, doc.y - (rows.length * rowH + headerH + 2))
        .lineTo(xCur, y)
        .stroke('#cccccc');

    doc.y = y + 4;
}

// ----------------------------------------------------------------
// drawSignatureLine — _____________ / ФИО
// ----------------------------------------------------------------
export function drawSignatureLine(
    doc: PdfDoc,
    label: string,
    name?: string | null,
    x?: number,
    y?: number,
) {
    const xPos = x ?? MARGIN;
    const yPos = y ?? doc.y;
    doc.font('Regular').fontSize(9).fillColor('#666666').text(label, xPos, yPos);
    doc.moveTo(xPos + 5, yPos + 20).lineTo(xPos + 120, yPos + 20).stroke('#000000');
    if (name) {
        doc.font('Regular').fontSize(8).fillColor('#444444')
            .text(name, xPos + 5, yPos + 22, { width: 115 });
    }
    doc.font('Regular').fontSize(7).fillColor('#999999')
        .text('(подпись)', xPos + 35, yPos + 24);
}

// ----------------------------------------------------------------
// CARRIER_INFO — company defaults from env
// ----------------------------------------------------------------
export const CARRIER = {
    name:    process.env.CARRIER_NAME    || 'ООО «ТМС Логистик»',
    inn:     process.env.CARRIER_INN     || '7701234567',
    kpp:     process.env.CARRIER_KPP     || '770101001',
    address: process.env.CARRIER_ADDRESS || 'г. Москва, ул. Транспортная, д. 1',
    bank:    process.env.CARRIER_BANK    || 'ПАО Сбербанк',
    bik:     process.env.CARRIER_BIK     || '044525225',
    account: process.env.CARRIER_ACCOUNT || '40702810938000123456',
    corr:    process.env.CARRIER_CORR    || '30101810400000000225',
    phone:   process.env.CARRIER_PHONE   || '+7 (495) 000-00-00',
};
