import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { XMLParser } from 'fast-xml-parser';
import { ETRN_XSD_MANIFEST, ETRN_XSD_SOURCE_DIR } from '../src/modules/trips/etrn-xsd-manifest.js';

const sourceDir = process.env.ETRN_XSD_DIR || ETRN_XSD_SOURCE_DIR;
const windows1251 = new TextDecoder('windows-1251');
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
});

type CheckResult = {
    file: string;
    status: 'used' | 'skipped';
    titleType?: string;
    reason: string;
    rootElement?: string;
    targetNamespace?: string;
};

async function inspectXsd(entry: typeof ETRN_XSD_MANIFEST[number]): Promise<CheckResult> {
    const fullPath = path.join(sourceDir, entry.file);
    const xml = windows1251.decode(await readFile(fullPath));
    const parsed = parser.parse(xml);
    const schema = parsed['xs:schema'];
    if (!schema) {
        throw new Error(`${entry.file}: expected xs:schema root`);
    }

    const elements = Array.isArray(schema['xs:element'])
        ? schema['xs:element']
        : schema['xs:element'] ? [schema['xs:element']] : [];
    const rootElement = elements[0]?.['@_name'];

    if (entry.status === 'used' && rootElement !== 'Файл') {
        throw new Error(`${entry.file}: expected root xs:element name "Файл", got "${rootElement ?? 'none'}"`);
    }

    return {
        file: entry.file,
        status: entry.status,
        titleType: entry.titleType,
        reason: entry.reason,
        rootElement,
        targetNamespace: schema['@_targetNamespace'],
    };
}

const results: CheckResult[] = [];
for (const entry of ETRN_XSD_MANIFEST) {
    results.push(await inspectXsd(entry));
}

const used = results.filter((result) => result.status === 'used');
const skipped = results.filter((result) => result.status === 'skipped');

console.log(`ETRN XSD fixture check`);
console.log(`sourceDir=${sourceDir}`);
console.log(`used=${used.length} skipped=${skipped.length}`);
console.log('');
console.log('Used XSD:');
for (const result of used) {
    console.log(`- ${result.file} (${result.titleType}): root=${result.rootElement}; reason=${result.reason}`);
}
console.log('');
console.log('Skipped XSD:');
for (const result of skipped) {
    console.log(`- ${result.file}: reason=${result.reason}`);
}
