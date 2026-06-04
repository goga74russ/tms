// C8: единообразная замена `error: <var>.message[ || 'X']` → safeClientError(<var>, 'X')
// в per-route catch'ах. Добавляет import. Идемпотентно. Запуск: node scripts/apply-safe-error.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { relative, dirname } from 'node:path';

const root = 'apps/api/src';
// Файлы с утечкой (из grep). Только routes + sync/service (отдают наружу).
const files = execSync(
  `grep -rln "error: error\\.message\\|error: err\\.message\\|error: e\\.message" ${root} --include=*.ts`,
  { encoding: 'utf8' },
).split('\n').filter(f => f && !f.includes('.test.ts'));

const GENERIC = 'Внутренняя ошибка сервера';
let totalReplaced = 0;
const changed = [];

for (const file of files) {
  let src = readFileSync(file, 'utf8');
  const before = src;

  // 1) `error: <var>.message || 'X'`  и  `error: <var>.message ?? 'X'`
  src = src.replace(
    /error:\s*(error|err|e)\.message\s*(?:\|\||\?\?)\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g,
    (_m, v, fb) => `error: safeClientError(${v}, ${fb})`,
  );
  // 2) голый `error: <var>.message` (без fallback)
  src = src.replace(
    /error:\s*(error|err|e)\.message\b(?!\s*(?:\|\||\?\?))/g,
    (_m, v) => `error: safeClientError(${v}, '${GENERIC}')`,
  );

  if (src === before) continue;

  // import (если ещё нет)
  if (!src.includes("utils/safe-error.js")) {
    const relPath = relative(dirname(file), `${root}/utils/safe-error.js`).replace(/\\/g, '/');
    const importPath = relPath.startsWith('.') ? relPath : './' + relPath;
    const importLine = `import { safeClientError } from '${importPath}';\n`;
    // вставляем после последней строки import в начале файла
    const lines = src.split('\n');
    let lastImport = -1;
    for (let i = 0; i < Math.min(lines.length, 60); i++) {
      if (/^import\s/.test(lines[i])) lastImport = i;
    }
    if (lastImport >= 0) {
      lines.splice(lastImport + 1, 0, importLine.trimEnd());
      src = lines.join('\n');
    } else {
      src = importLine + src;
    }
  }

  const count = (before.match(/error:\s*(error|err|e)\.message/g) || []).length;
  totalReplaced += count;
  changed.push(`${file} (${count})`);
  writeFileSync(file, src);
}

console.log(`Заменено ~${totalReplaced} мест в ${changed.length} файлах:`);
changed.forEach(c => console.log('  ' + c));
