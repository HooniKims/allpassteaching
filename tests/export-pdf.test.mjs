import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { test, expect } from 'vitest';
import { buildPdf } from '@/lib/export/pdf';
import { selectVisibleFallback, sanitizePdfText, wrapText } from '@/lib/export/pdf-table';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { makeGeneratedPlan, makeTwoSessionPlan } from './fixtures/lesson-plan.mjs';

const execFileAsync = promisify(execFile);

const monospaceFont = { widthOfTextAtSize: text => [...text].length };
const limitedFont = characters => ({
    widthOfTextAtSize: text => [...text].length,
    getCharacterSet: () => [...characters].map(character => character.codePointAt(0)),
});
const PAGE_HEIGHT = 841.89;
const CONTENT_TOP_LIMIT = PAGE_HEIGHT - 42;
const CONTENT_BOTTOM_LIMIT = 42;

async function renderPlan(plan) {
    const trace = [];
    const bytes = await buildPdf(plan, { onDraw: event => trace.push(event) });
    return { bytes, trace, document: await PDFDocument.load(bytes) };
}

function drawnText(trace) {
    return trace.filter(event => event.type === 'text').map(event => event.text).join('\n');
}

test('wraps Korean text at word boundaries and preserves explicit whitespace', () => {
    expect(wrapText('한글 문장\n둘째\t줄', monospaceFont, 1, 4)).toEqual([
        '한글',
        '문장',
        '둘째',
        '줄',
    ]);
    expect(wrapText('\t가나', monospaceFont, 1, 8)).toEqual(['    가나']);
    expect(wrapText('가나다라마바사', monospaceFont, 1, 3)).toEqual(['가나다', '라마바', '사']);
});

test('keeps a final Korean auxiliary expression together instead of orphaning one word', () => {
    expect(wrapText('기관마다 하는 일이 다를 것 같습니다.', monospaceFont, 1, 15)).toEqual([
        '기관마다 하는 일이 다를',
        '것 같습니다.',
    ]);
});

test('uses one visible fallback for unsupported glyphs while preserving supported Korean and whitespace', () => {
    const regular = limitedFont('앞중뒤넷다섯끝줄탭한글□?\n\t');
    const bold = limitedFont('앞중뒤넷다섯끝줄탭한글□?\n\t');
    const fallback = selectVisibleFallback(regular, bold);
    expect(fallback).toBe('□');
    expect(sanitizePdfText(null, regular, fallback)).toBe('');
    expect(sanitizePdfText('한글😀앞\u0000중\u0001뒤\u0085넷\uFFFE다섯\uD800끝\n줄\t탭', regular, fallback))
        .toBe('한글□앞□중□뒤□넷□다섯□끝\n줄\t탭');
    expect(selectVisibleFallback(limitedFont('□?'), limitedFont('?'))).toBe('?');
});

test('replaces unsupported plan glyphs before measurement, drawing, and tracing', async () => {
    const unsupportedText = '지원앞😀지원뒤\u0000지원끝';
    const { trace } = await renderPlan(makeGeneratedPlan({ supportStrategies: [unsupportedText] }));
    const sourceText = trace.find(event => event.type === 'text' && event.sourceText.includes('지원앞'))?.sourceText;
    expect(sourceText).toMatch(/^• 지원앞[□?]지원뒤[□?]지원끝$/);
    expect(sourceText).not.toMatch(/[😀\u0000�]/u);
});

test.each([
    ['one session', makeGeneratedPlan(), 2],
    ['two sessions', makeTwoSessionPlan(), 4],
])('builds an A4 formal PDF with two logical pages per session for %s', async (_label, plan, pageCount) => {
    const { bytes, document } = await renderPlan(plan);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(10_000);
    expect(document.getPageCount()).toBe(pageCount);
    expect(document.getTitle()).toBe('교수·학습 과정안');
    for (const page of document.getPages()) {
        expect(page.getWidth()).toBeCloseTo(595.28, 1);
        expect(page.getHeight()).toBeCloseTo(841.89, 1);
    }
});

test('keeps true text and cell bounds inside the usable page margins', async () => {
    const { document, trace } = await renderPlan(makeGeneratedPlan());
    expect(document.getPageCount()).toBe(2);
    const drawnBounds = trace.filter(event => ['text', 'cell', 'table-header'].includes(event.type));
    expect(drawnBounds.length).toBeGreaterThan(0);
    for (const event of drawnBounds) {
        expect(event.top).toBeLessThanOrEqual(CONTENT_TOP_LIMIT);
        expect(event.bottom).toBeGreaterThanOrEqual(CONTENT_BOTTOM_LIMIT);
    }
});

test('renders every formal table with a readable font size', async () => {
    const { trace } = await renderPlan(makeGeneratedPlan());
    const tableText = trace.filter(event => event.type === 'text' && event.tableId);
    expect(tableText.length).toBeGreaterThan(0);
    expect(Math.min(...tableText.map(event => event.fontSize))).toBeGreaterThanOrEqual(8);
});

test('embeds Paperlogy regular and bold font resources once for reuse', async () => {
    const { document } = await renderPlan(makeGeneratedPlan());
    const baseFontNames = new Set();
    for (const page of document.getPages()) {
        const fontResources = page.node.Resources().lookup(PDFName.of('Font'), PDFDict);
        for (const reference of fontResources.values()) {
            const font = document.context.lookup(reference, PDFDict);
            baseFontNames.add(font.get(PDFName.of('BaseFont'))?.toString() ?? '');
        }
    }
    expect([...baseFontNames].filter(name => name.includes('Paperlogy'))).toHaveLength(2);
});

test('renders the structured document model with formal table labels and every section', async () => {
    const plan = makeGeneratedPlan({ title: 'PDF-편집수업제목-센티널' });
    const { trace } = await renderPlan(plan);
    const text = drawnText(trace);
    for (const label of [
        '교수·학습 과정안', '수업 개요', '학습 요소', '주요 발문', '예상 학생 반응',
        '수준별 피드백', '공통 피드백', '보충', '도달', '심화',
        '개별화·지원 전략', '수업 후 성찰', '후속 학습 및 정리',
    ]) expect(text).toContain(label);
    expect(text).toContain('수업 제목');
    expect(text).toContain('PDF-편집수업제목-센티널');
    expect(text).not.toContain('수업 후 연계');
    expect(text).not.toContain('다음 학습 연결');
});

test('keeps the edited lesson title and connection label in extractable PDF text when pdftotext is available', async () => {
    // Given
    const plan = makeGeneratedPlan({ title: 'PDFTEXT-편집수업제목-센티널' });
    plan.sessions[0].nextSessionConnection = 'PDFTEXT-후속정리-센티널';
    const directory = await mkdtemp(path.join(tmpdir(), 'allpass-pdftotext-'));

    // When
    try {
        const pdfPath = path.join(directory, 'lesson-plan.pdf');
        await writeFile(pdfPath, await buildPdf(plan));
        let extracted;
        try {
            ({ stdout: extracted } = await execFileAsync('pdftotext', [pdfPath, '-']));
        } catch (error) {
            if (error.code === 'ENOENT') return;
            throw error;
        }

        // Then
        expect(extracted).toContain('수업 제목');
        expect(extracted).toContain('PDFTEXT-편집수업제목-센티널');
        expect(extracted).toContain('후속 학습 및 정리');
        expect(extracted).toContain('PDFTEXT-후속정리-센티널');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('keeps section headings visibly separated from the preceding table border', async () => {
    const { trace } = await renderPlan(makeGeneratedPlan());
    for (const heading of ['교수·학습 과정', '개별화·지원 전략', '수업 후 성찰', '후속 학습 및 정리']) {
        const headingIndex = trace.findIndex(event => event.type === 'text' && event.sourceText === heading);
        const headingEvent = trace[headingIndex];
        const precedingCell = trace.slice(0, headingIndex).findLast(event => (
            event.type === 'cell' && event.pageIndex === headingEvent.pageIndex
        ));
        expect(precedingCell.bottom - headingEvent.y).toBeGreaterThanOrEqual(12);
    }
});

test('preserves ordered overview values and intentionally blank metadata', async () => {
    const base = makeGeneratedPlan();
    const plan = makeGeneratedPlan({
        metadata: { date: '', place: '', className: '', teacherName: '' },
        subject: '순서과목',
        unitTitle: '순서단원',
        title: '순서수업제목',
        standards: [{ code: '순서-기준', text: '순서 성취기준 문장' }],
        learningGoals: ['순서 학습목표 하나', '순서 학습목표 둘'],
        essentialQuestion: '순서 핵심 질문?',
        materials: ['순서 준비물 하나', '순서 준비물 둘'],
        instructionModel: { ...base.instructionModel, name: '순서 수업모형' },
    });
    const text = drawnText((await renderPlan(plan)).trace);
    const orderedValues = ['초등학교 5학년', '순서과목', '순서단원', '순서수업제목', '1/1', '순서 수업모형', '[순서-기준] 순서 성취기준 문장', '1. 순서 학습목표 하나', '2. 순서 학습목표 둘', '순서 핵심 질문?', '순서 준비물 하나, 순서 준비물 둘'];
    let previousIndex = -1;
    for (const value of orderedValues) {
        const valueIndex = text.indexOf(value);
        expect(valueIndex).toBeGreaterThan(previousIndex);
        previousIndex = valueIndex;
    }
    expect(text).not.toMatch(/미입력|입력 없음|정보 없음/);
});

test('continues oversized rows without clipping, dropping text, or crossing the bottom margin', async () => {
    const sentinel = name => `${name}-시작-${`${name}긴내용`.repeat(120)}-${name}-끝`;
    const values = {
        teacherActivity: sentinel('교사활동'),
        teacherQuestion: sentinel('주요발문'),
        studentActivity: sentinel('학생활동'),
        expectedResponse: sentinel('예상반응'),
        materialNote: sentinel('자료유의점'),
        support: sentinel('지원'),
        commonFeedback: sentinel('공통피드백'),
        needsSupport: sentinel('보충피드백'),
        meets: sentinel('도달피드백'),
        exceeds: sentinel('심화피드백'),
        connection: sentinel('다음연결'),
    };
    const base = makeGeneratedPlan();
    const plan = makeGeneratedPlan({
        sessions: [{
            ...base.sessions[0],
            nextSessionConnection: values.connection,
            stages: [
                {
                    ...base.sessions[0].stages[0],
                    teacherActivities: [values.teacherActivity],
                    teacherQuestions: [values.teacherQuestion],
                    studentActivities: [values.studentActivity],
                    expectedStudentResponses: [values.expectedResponse],
                    materialsAndNotes: [values.materialNote],
                    supportNotes: [values.support],
                },
                ...base.sessions[0].stages.slice(1),
            ],
        }],
        assessment: [{
            ...base.assessment[0],
            feedback: values.commonFeedback,
            levelFeedback: { needsSupport: values.needsSupport, meets: values.meets, exceeds: values.exceeds },
        }],
    });
    expect(() => lessonPlanSchema.parse(plan)).not.toThrow();
    const { document, trace } = await renderPlan(plan);
    expect(document.getPageCount()).toBeGreaterThan(2);
    expect(trace.filter(event => event.type === 'cell').every(event => event.bottom >= 48)).toBe(true);
    const processValues = Object.values(values).slice(0, 6);
    const lastLongProcessIndex = trace.findLastIndex(event => (
        event.type === 'text' && processValues.some(value => event.sourceText.includes(value))
    ));
    expect(trace.findIndex(event => event.type === 'text' && event.sourceText === '전개')).toBeGreaterThan(lastLongProcessIndex);
    for (const value of Object.values(values)) {
        const source = trace.find(event => event.type === 'text' && event.sourceText.includes(value))?.sourceText;
        expect(source).toBeDefined();
        const rendered = trace.filter(event => event.type === 'text' && event.sourceText === source).map(event => event.text).join('');
        expect(rendered).toContain(value);
    }
});

test('keeps an oversized first row with its section heading and repeated table headers', async () => {
    const marker = `평가첫행-${'매우긴평가내용'.repeat(900)}-끝`;
    const base = makeGeneratedPlan();
    const plan = makeGeneratedPlan({ assessment: [{
        ...base.assessment[0],
        feedback: marker,
    }] });
    const { trace } = await renderPlan(plan);
    const pageOf = sourceText => trace.find(event => event.type === 'text' && event.sourceText === sourceText)?.pageIndex;
    expect(pageOf('과정중심평가')).toBe(pageOf('평가 요소'));
    expect(pageOf('평가 요소')).toBe(pageOf('관찰 결과 설명'));

    const headers = trace.filter(event => event.type === 'table-header');
    expect(headers.length).toBeGreaterThan(1);
    for (const header of headers) {
        const headerIndex = trace.indexOf(header);
        const nextHeaderIndex = trace.findIndex((event, index) => index > headerIndex && event.type === 'table-header');
        const followingEvents = trace.slice(headerIndex + 1, nextHeaderIndex < 0 ? undefined : nextHeaderIndex);
        expect(followingEvents.some(event => (
            event.type === 'table-row' && event.tableId === header.tableId && event.pageIndex === header.pageIndex
        ))).toBe(true);
    }
});
