export type EtrnXsdManifestEntry = {
    file: string;
    titleType?: string;
    status: 'used' | 'skipped';
    reason: string;
};

export const ETRN_XSD_SOURCE_DIR = String.raw`D:\Ai\TMS\docs\etrn`;

export const ETRN_XSD_MANIFEST: EtrnXsdManifestEntry[] = [
    { file: 'ON_TRNACLGROT_1_973_01_05_01_02.xsd', titleType: 'title_01', status: 'used', reason: 'Mandatory ETRN title 01 baseline' },
    { file: 'ON_TRNACLPPRIN_1_973_02_05_01_01.xsd', titleType: 'title_02', status: 'used', reason: 'Mandatory ETRN title 02 baseline' },
    { file: 'ON_TRNPEREADR_1_973_03_05_01_01.xsd', titleType: 'title_03', status: 'used', reason: 'Optional readdressing title baseline' },
    { file: 'ON_TRNZAMEN_1_973_04_05_01_01.xsd', titleType: 'title_04', status: 'used', reason: 'Optional vehicle/driver replacement title baseline' },
    { file: 'ON_TRNACLGRPO_1_973_05_05_01_01.xsd', titleType: 'title_05', status: 'used', reason: 'Mandatory ETRN title 05 baseline' },
    { file: 'ON_TRNACLPVYN_1_973_06_05_01_01.xsd', titleType: 'title_06', status: 'used', reason: 'Mandatory ETRN title 06 baseline' },
    { file: 'ON_TRNPUDPER_1_973_07_05_01_03.xsd', titleType: 'title_07', status: 'used', reason: 'Current title 07 PUD baseline' },
    { file: 'ON_TRNPUDGO_1_973_08_05_01_01.xsd', titleType: 'title_08', status: 'used', reason: 'Title 08 PUD confirmation baseline' },
    { file: 'ON_TRNPUDPER_1_973_07_05_01_02.xsd', titleType: 'title_07', status: 'skipped', reason: 'Older title 07 version retained only for version-diff checks' },
    { file: 'ON_SOPVEDPER_1_974_01_05_01_01.xsd', status: 'skipped', reason: 'Accompanying statement is not a first-class artifact yet' },
    { file: 'ON_SOPVEDGO_1_974_02_05_01_01.xsd', status: 'skipped', reason: 'Accompanying statement is not a first-class artifact yet' },
    { file: 'ON_SOPVEDGP_1_974_03_05_01_01.xsd', status: 'skipped', reason: 'Accompanying statement is not a first-class artifact yet' },
    { file: 'ON_ZAKAZNAR_1_975_01_05_01_01.xsd', status: 'skipped', reason: 'Electronic order/job request is not modeled as a first-class document yet' },
    { file: 'ON_ZAKAZNARSOG_1_975_02_05_01_01.xsd', status: 'skipped', reason: 'Order/job request approval is not modeled as a first-class document yet' },
    { file: 'ON_ZAKAZNARPOD_1_975_03_05_01_01.xsd', status: 'skipped', reason: 'Order/job request confirmation is not modeled as a first-class document yet' },
    { file: 'ON_ZAKAZNARVOZ_1_975_04_05_01_01.xsd', status: 'skipped', reason: 'Carrier response/order part is not modeled as a first-class document yet' },
];

export function getUsedEtrnXsdFiles() {
    return ETRN_XSD_MANIFEST.filter((entry) => entry.status === 'used').map((entry) => entry.file);
}
