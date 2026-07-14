import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { buildHwpx } from '@/lib/export/hwpx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

const OVERVIEW_WIDTHS = [8200, 41728];
const PROCESS_WIDTHS = [3600, 6000, 12000, 12000, 3600, 7200, 5528];
const ASSESSMENT_WIDTHS = [7600, 7600, 9400, 25328];
const FULL_WIDTH = [49928];
const PDF_MATCHED_WIDTHS = [OVERVIEW_WIDTHS, PROCESS_WIDTHS, PROCESS_WIDTHS, ASSESSMENT_WIDTHS, FULL_WIDTH, FULL_WIDTH, FULL_WIDTH];

function children(element, tagName) {
    return [...element.children].filter(child => child.tagName === tagName);
}

function cells(table) {
    return children(table, 'hp:tr').flatMap(row => children(row, 'hp:tc'));
}

function widths(table) {
    return children(children(table, 'hp:tr')[0], 'hp:tc').map(cell => Number(children(cell, 'hp:cellSz')[0].getAttribute('width')));
}

test('matches the PDF table structure and keeps each cell in one reflowable paragraph', async () => {
    // Given the same lesson data used by PDF and formal HWPX exports
    const bytes = await buildHwpx(makeGeneratedPlan());
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('Contents/section0.xml').async('string');
    const section = new DOMParser().parseFromString(xml, 'application/xml');

    // When the formal HWPX tables are inspected
    const tables = [...section.getElementsByTagName('hp:tbl')];

    // Then the page uses the PDF-equivalent 48pt side margins and the same table column ratios
    const pageMargin = section.getElementsByTagName('hp:margin')[0];
    expect(pageMargin.getAttribute('left')).toBe('4800');
    expect(pageMargin.getAttribute('right')).toBe('4800');
    expect(tables).toHaveLength(7);
    expect(tables.map(table => Number(table.getAttribute('colCnt')))).toEqual([2, 7, 7, 4, 1, 1, 1]);
    for (const [table, expectedWidths] of tables.map((item, index) => [item, PDF_MATCHED_WIDTHS[index]])) {
        for (const row of children(table, 'hp:tr')) {
            const widths = children(row, 'hp:tc').map(cell => Number(children(cell, 'hp:cellSz')[0].getAttribute('width')));
            expect(widths).toEqual(expectedWidths);
            expect(widths.reduce((sum, width) => sum + width, 0)).toBe(49928);
        }
    }

    // And HOP/Hancom can reflow each cell without stacking independent paragraphs at the same y-position
    for (const table of tables) {
        for (const cell of cells(table)) {
            const subList = children(cell, 'hp:subList')[0];
            expect(children(subList, 'hp:p')).toHaveLength(1);
        }
    }
});

test('keeps very long lesson content flowable without truncation or overlapping table positioning', async () => {
    // Given content long enough to require wrapping and cell-level page continuation
    const longText = `긴 내용 시작 ${'관찰 결과와 근거를 연결하여 설명한다. '.repeat(120)}긴 내용 끝`;
    const base = makeGeneratedPlan();
    const plan = makeGeneratedPlan({
        standards: [{ code: '장문-기준', text: longText }],
        sessions: [{ ...base.sessions[0], stages: [{
            ...base.sessions[0].stages[0],
            teacherActivities: [longText],
            studentActivities: [longText],
            teacherQuestions: [longText],
            expectedStudentResponses: [longText],
            materialsAndNotes: [longText],
            supportNotes: [longText],
        }] }],
        assessment: [{ ...base.assessment[0], feedback: longText }],
    });

    // When the HWPX is generated
    const bytes = await buildHwpx(plan);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('Contents/section0.xml').async('string');
    const section = new DOMParser().parseFromString(xml, 'application/xml');
    const tables = [...section.getElementsByTagName('hp:tbl')];

    // Then all exact content remains and every table is text-flowing, non-overlapping, and cell-breakable
    expect(xml).toContain('긴 내용 시작');
    expect(xml).toContain('긴 내용 끝');
    for (const table of tables) {
        expect(table.getAttribute('pageBreak')).toBe('CELL');
        const position = children(table, 'hp:pos')[0];
        expect(position.getAttribute('treatAsChar')).toBe('1');
        expect(position.getAttribute('flowWithText')).toBe('1');
        expect(position.getAttribute('allowOverlap')).toBe('0');
    }
    const processTables = tables.filter(table => widths(table).join(',') === PROCESS_WIDTHS.join(','));
    const processRows = processTables.flatMap(table => children(table, 'hp:tr').slice(1));
    expect(processTables.length).toBeGreaterThan(1);
    expect(processRows.length).toBeGreaterThan(1);
    for (const table of tables) {
        expect(Number(children(table, 'hp:sz')[0].getAttribute('height'))).toBeLessThanOrEqual(50_000);
        for (const row of children(table, 'hp:tr')) {
            for (const cell of children(row, 'hp:tc')) {
                expect(Number(children(cell, 'hp:cellSz')[0].getAttribute('height'))).toBeLessThanOrEqual(30_000);
            }
        }
    }
});
