import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeFilename, ensureExtension, saveBlob } from './download';

describe('sanitizeFilename', () => {
    it('replaces forbidden Windows/Unix filename chars with _', () => {
        expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe('a_b_c_d_e_f_g_h_i_j');
    });

    it('replaces control characters (\\x00-\\x1F)', () => {
        expect(sanitizeFilename('foobarbaz')).toBe('foo_bar_baz');
    });

    it('leaves normal filenames untouched', () => {
        expect(sanitizeFilename('report-2026-05-13.pdf')).toBe('report-2026-05-13.pdf');
    });

    it('preserves unicode letters', () => {
        expect(sanitizeFilename('отчёт.pdf')).toBe('отчёт.pdf');
    });
});

describe('ensureExtension', () => {
    it('keeps filename as-is when it already has an extension', () => {
        const blob = new Blob([], { type: 'application/pdf' });
        expect(ensureExtension('report.pdf', blob)).toBe('report.pdf');
    });

    it('appends .pdf for application/pdf blobs', () => {
        const blob = new Blob([], { type: 'application/pdf' });
        expect(ensureExtension('report', blob)).toBe('report.pdf');
    });

    it('appends .xml for text/xml and application/xml', () => {
        expect(ensureExtension('doc', new Blob([], { type: 'application/xml' }))).toBe('doc.xml');
        expect(ensureExtension('doc', new Blob([], { type: 'text/xml' }))).toBe('doc.xml');
    });

    it('appends .csv for text/csv', () => {
        expect(ensureExtension('rows', new Blob([], { type: 'text/csv' }))).toBe('rows.csv');
    });

    it('appends .xlsx for openxml spreadsheet', () => {
        expect(
            ensureExtension(
                'sheet',
                new Blob([], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            ),
        ).toBe('sheet.xlsx');
    });

    it('returns filename unchanged when MIME unknown', () => {
        expect(ensureExtension('blob', new Blob([], { type: 'image/some-weird-type' }))).toBe('blob');
    });

    it('appends nothing for application/octet-stream', () => {
        expect(ensureExtension('blob', new Blob([], { type: 'application/octet-stream' }))).toBe('blob');
    });
});

describe('saveBlob', () => {
    let originalCreate: typeof URL.createObjectURL;
    let originalRevoke: typeof URL.revokeObjectURL;
    let createSpy: ReturnType<typeof vi.fn>;
    let revokeSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        originalCreate = URL.createObjectURL;
        originalRevoke = URL.revokeObjectURL;
        createSpy = vi.fn(() => 'blob:mock-url');
        revokeSpy = vi.fn();
        URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
        URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
    });

    afterEach(() => {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
        vi.useRealTimers();
    });

    it('creates an object URL and revokes it after a delay', () => {
        const blob = new Blob(['hi'], { type: 'application/pdf' });
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { });

        saveBlob(blob, 'hello.pdf');

        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(revokeSpy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(3000);
        expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');

        clickSpy.mockRestore();
    });

    it('sanitizes and extends filename before triggering download', () => {
        const blob = new Blob(['data'], { type: 'application/pdf' });
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { });

        saveBlob(blob, 'bad/name');

        // The anchor element should have been created with a sanitized filename plus .pdf
        // We can't capture the anchor directly post-remove(), but createObjectURL got a File
        // whose name reflects the sanitization. The first arg to createObjectURL is that File.
        const arg = createSpy.mock.calls[0][0] as File;
        expect(arg.name).toBe('bad_name.pdf');

        clickSpy.mockRestore();
    });
});
