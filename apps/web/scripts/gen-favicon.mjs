// Генератор favicon.ico для web из бренд-знака (app/apple-icon.svg — тёмный
// квадрат + знак ТрансПульт). Растеризация SVG→PNG через headless Chrome
// (sharp/cairosvg в проекте нет), затем сборка многоразмерного .ico
// (PNG-embedded — поддерживается браузерами и Google-краулером).
//
// Зачем: в выдаче Google нужен растровый /favicon.ico; SVG-only фавикон
// краулер часто не подхватывает, отсюда «глобус» вместо лого.
//
// Запуск: node scripts/gen-favicon.mjs "<path-to-chrome.exe>"
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '../src/app');
const chrome = process.argv[2];
if (!chrome) throw new Error('Передай путь к chrome.exe первым аргументом');

const svg = readFileSync(resolve(appDir, 'apple-icon.svg'), 'utf8');
const tmp = resolve(__dirname, '.favicon-tmp');
mkdirSync(tmp, { recursive: true });

const SIZES = [16, 32, 48];

/** Рендерит SVG в PNG нужного размера через headless Chrome. */
function renderPng(size) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
svg{width:${size}px;height:${size}px;display:block}
</style></head><body>${svg}</body></html>`;
    const htmlPath = join(tmp, `f${size}.html`);
    const pngPath = join(tmp, `f${size}.png`);
    writeFileSync(htmlPath, html, 'utf8');
    execFileSync(chrome, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        `--window-size=${size},${size}`,
        '--default-background-color=00000000',
        `--screenshot=${pngPath}`,
        `file:///${htmlPath.replace(/\\/g, '/')}`,
    ], { stdio: 'pipe' });
    return readFileSync(pngPath);
}

/** Собирает многоразмерный .ico из PNG-буферов (PNG-embedded ICO). */
function buildIco(entries) {
    const count = entries.length;
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(count, 4);

    const dir = Buffer.alloc(16 * count);
    let offset = 6 + 16 * count;
    entries.forEach((e, i) => {
        const b = i * 16;
        dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 0); // width
        dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 1); // height
        dir.writeUInt8(0, b + 2); // palette
        dir.writeUInt8(0, b + 3); // reserved
        dir.writeUInt16LE(1, b + 4); // planes
        dir.writeUInt16LE(32, b + 6); // bpp
        dir.writeUInt32LE(e.png.length, b + 8); // size
        dir.writeUInt32LE(offset, b + 12); // offset
        offset += e.png.length;
    });
    return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

const entries = SIZES.map((size) => ({ size, png: renderPng(size) }));
const ico = buildIco(entries);
writeFileSync(resolve(appDir, 'favicon.ico'), ico);
rmSync(tmp, { recursive: true, force: true });
console.log('favicon.ico written:', ico.length, 'bytes,', SIZES.join('/'));
