// Генератор иконок приложения из брендового знака (docs/design/brand/apple-icon.svg).
// Растеризует SVG → PNG через headless Chrome (sharp/cairosvg в проекте нет).
// Запуск: node scripts/gen-icons.mjs "<path-to-chrome.exe>"
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const chrome = process.argv[2];
if (!chrome) throw new Error('Передай путь к chrome.exe первым аргументом');

const brandSvg = readFileSync(resolve(root, '../../docs/design/brand/apple-icon.svg'), 'utf8');
// Достаём вложенный <svg ...>…</svg> со знаком (viewBox="90 109 843 843").
const inner = brandSvg.match(/<svg x="22"[\s\S]*?<\/svg>/)[0];
// Тот же знак, но все заливки → белые (для monochrome-слоя Android).
const innerWhite = inner.replace(/fill="#[0-9A-Fa-f]+"/g, 'fill="#FFFFFF"');

const NAVY = '#111827';
const tmp = resolve(root, '.icon-tmp');
mkdirSync(tmp, { recursive: true });

function page({ bg, svg, sizePx }) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:1024px;height:1024px;overflow:hidden;${bg ? `background:${bg};` : ''}}
.w{width:1024px;height:1024px;display:flex;align-items:center;justify-content:center}
.w > svg{width:${sizePx}px;height:${sizePx}px;display:block}
</style></head><body><div class="w">${svg}</div></body></html>`;
}

// name → { html, transparent }. sizePx — размер знака внутри 1024-канвы.
const targets = {
    'icon.png': { html: page({ bg: NAVY, svg: inner, sizePx: 760 }), transparent: false },
    'android-icon-background.png': { html: page({ bg: NAVY, svg: '', sizePx: 0 }), transparent: false },
    'android-icon-foreground.png': { html: page({ bg: null, svg: inner, sizePx: 600 }), transparent: true },
    'android-icon-monochrome.png': { html: page({ bg: null, svg: innerWhite, sizePx: 600 }), transparent: true },
    'splash-icon.png': { html: page({ bg: null, svg: inner, sizePx: 480 }), transparent: true },
};

for (const [name, { html, transparent }] of Object.entries(targets)) {
    const htmlPath = join(tmp, name.replace('.png', '.html'));
    writeFileSync(htmlPath, html, 'utf8');
    const out = resolve(root, 'assets', name);
    const args = [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--window-size=1024,1024',
        `--default-background-color=${transparent ? '00000000' : 'ffffffff'}`,
        `--screenshot=${out}`,
        `file:///${htmlPath.replace(/\\/g, '/')}`,
    ];
    execFileSync(chrome, args, { stdio: 'pipe' });
    console.log('generated', name);
}

rmSync(tmp, { recursive: true, force: true });
console.log('done');
