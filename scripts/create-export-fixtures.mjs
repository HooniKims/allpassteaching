import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDocx } from '../lib/export/docx.js';
import { buildHwpx } from '../lib/export/hwpx.js';
import { buildPdf } from '../lib/export/pdf.js';
import { makeTwoSessionPlan } from '../tests/fixtures/lesson-plan.mjs';

function outputDirectoryFromArguments(argumentsList) {
    const outputIndex = argumentsList.indexOf('--output');
    return outputIndex >= 0 && argumentsList[outputIndex + 1]
        ? path.resolve(argumentsList[outputIndex + 1])
        : path.resolve('test-results/exports');
}

const outputDirectory = outputDirectoryFromArguments(process.argv.slice(2));
const plan = makeTwoSessionPlan();
const exporters = [
    ['hwpx', buildHwpx],
    ['docx', buildDocx],
    ['pdf', buildPdf],
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(exporters.map(async ([extension, build]) => {
    const filePath = path.join(outputDirectory, `standard-lesson-plan.${extension}`);
    await writeFile(filePath, await build(plan));
    process.stdout.write(`${filePath}\n`);
}));
