import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { buildHwpxHeader } from './hwpx-style.js';

const templateRoot = path.join(process.cwd(), 'lib/export/hwpx-template');
const ZIP_DATE = new Date('2000-01-01T00:00:00Z');
const ZIP_OPTIONS = Object.freeze({ date: ZIP_DATE, createFolders: false });

async function addDirectory(zip, directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name === right.name ? 0 : left.name < right.name ? -1 : 1);
    for (const entry of entries) {
        const filePath = path.join(directory, entry.name);
        const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            await addDirectory(zip, filePath, zipPath);
        } else if (!['mimetype', 'Contents/header.xml', 'Contents/section0.xml'].includes(zipPath)) {
            zip.file(zipPath, await readFile(filePath), ZIP_OPTIONS);
        }
    }
}

export async function buildHwpxPackage(buildSectionXml) {
    const zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip', { ...ZIP_OPTIONS, compression: 'STORE' });
    await addDirectory(zip, templateRoot);
    const [baseHeader, baseSection] = await Promise.all([
        readFile(path.join(templateRoot, 'Contents/header.xml'), 'utf8'),
        readFile(path.join(templateRoot, 'Contents/section0.xml'), 'utf8'),
    ]);
    zip.file('Contents/header.xml', buildHwpxHeader(baseHeader), ZIP_OPTIONS);
    zip.file('Contents/section0.xml', buildSectionXml(baseSection), ZIP_OPTIONS);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
