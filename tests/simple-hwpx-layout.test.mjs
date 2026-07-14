import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { buildSimpleHwpx } from '@/lib/export/simple-hwpx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

function parseXml(xml) {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    expect(document.querySelector('parsererror')).toBeNull();
    return document;
}

const children = (element, tagName) => [...element.children].filter(child => child.tagName === tagName);
const rows = table => children(table, 'hp:tr');
const cells = row => children(row, 'hp:tc');

test('separates every process item into a readable single-paragraph HWPX row', async () => {
    // Given a lesson whose introduction, development, and closing contain several activity fields
    const zip = await JSZip.loadAsync(await buildSimpleHwpx(makeGeneratedPlan()));

    // When the simple HWPX teaching-learning process table is inspected
    const section = parseXml(await zip.file('Contents/section0.xml').async('string'));
    const processTable = [...section.getElementsByTagName('hp:tbl')][1];
    const processRows = rows(processTable);

    // Then each field gets its own row, readable body text, and no crowded multi-paragraph cell
    expect(processRows).toHaveLength(18);
    expect(processRows.map(row => cells(row)[0].textContent.trim())).toEqual([
        '도입 · 5분', '교사 활동', '주요 발문', '학생 활동', '예상 학생 반응',
        '전개 · 30분', '교사 활동', '주요 발문', '학생 활동', '예상 학생 반응', '자료·유의점', '지원', '비고',
        '정리 · 5분', '교사 활동', '주요 발문', '학생 활동', '예상 학생 반응',
    ]);
    for (const row of processRows) {
        const valueCell = cells(row)[1];
        expect(valueCell.getElementsByTagName('hp:p')).toHaveLength(1);
        expect(valueCell.getElementsByTagName('hp:run')[0].getAttribute('charPrIDRef')).toBe('7');
    }
});
