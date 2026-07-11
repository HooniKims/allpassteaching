import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { lessonPlanLines } from './render-model.js';

const templateRoot = path.join(process.cwd(), 'lib/export/hwpx-template');
const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
async function addDirectory(zip, directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const filePath = path.join(directory, entry.name); const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await addDirectory(zip, filePath, zipPath);
        else if (zipPath !== 'mimetype' && zipPath !== 'Contents/section0.xml') zip.file(zipPath, await readFile(filePath));
    }
}
export async function buildHwpx(plan) {
    const zip = new JSZip(); zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' }); await addDirectory(zip, templateRoot);
    const base = await readFile(path.join(templateRoot, 'Contents/section0.xml'), 'utf8');
    const paragraphs = lessonPlanLines(plan).map((line, index) => `<hp:p id="${900000000 + index}" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>${escapeXml(line || ' ')}</hp:t></hp:run></hp:p>`).join('\n');
    zip.file('Contents/section0.xml', base.replace('</hs:sec>', `${paragraphs}\n</hs:sec>`));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
