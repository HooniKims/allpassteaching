import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { extractStandards } from '../lib/curriculum/extract.js';

const SOURCE_ROOT = '2022_Revised_National_Curriculum 복사본';
const ALLOWED_CATEGORIES = new Set(['common_subject', 'elementary_integrated_subject', 'middle_school_elective', 'high_school_liberal_arts']);

function versionRank(record) {
    if (record.version_note?.startsWith('notice_')) return 3;
    if (record.version_note?.includes('revised')) return 2;
    return 1;
}

function subjectName(title) {
    return title
        .replace(/ 교육과정$/, '')
        .replace(/과$/, '')
        .replace('실과(기술가정)정보', '실과·기술가정·정보')
        .replace('바른 생활, 슬기로운 생활, 즐거운 생활', '통합교과')
        .replace('중학교 선택 교과', '중학교 선택')
        .replace('고등학교 교양 교과', '교양');
}

const manifest = JSON.parse(await readFile(path.join(SOURCE_ROOT, 'manifest.json'), 'utf8'));
const candidates = manifest.records
    .filter(record => ALLOWED_CATEGORIES.has(record.category) && !record.duplicate_of)
    .sort((a, b) => a.book - b.book || versionRank(b) - versionRank(a));

const selected = [...new Map(candidates.map(record => [record.book, record])).values()];
const unique = new Map();

for (const record of selected) {
    const markdown = await readFile(path.join(SOURCE_ROOT, 'documents', record.output_file), 'utf8');
    for (const standard of extractStandards(markdown, { subject: subjectName(record.korean_title), sourceFile: record.output_file })) {
        if (standard.sourcePage > 0) unique.set(`${standard.subject}:${standard.code}`, standard);
    }
}

const catalog = [...unique.values()].sort((a, b) => a.subject.localeCompare(b.subject, 'ko') || a.code.localeCompare(b.code, 'ko'));
await mkdir('data', { recursive: true });
await writeFile('data/curriculum.json', `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Built ${catalog.length} canonical standards from ${selected.length} curriculum documents.`);
