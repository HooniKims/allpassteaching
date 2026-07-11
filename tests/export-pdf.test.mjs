import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { test, expect } from 'vitest';
import { buildPdf } from '@/lib/export/pdf';
import { sanitizePdfText, wrapText } from '@/lib/export/pdf-table';
import { makeGeneratedPlan, makeTwoSessionPlan } from './fixtures/lesson-plan.mjs';

const monospaceFont = { widthOfTextAtSize: text => [...text].length };

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
        '    ',
        '줄',
    ]);
    expect(wrapText('가나다라마바사', monospaceFont, 1, 3)).toEqual(['가나다', '라마바', '사']);
});

test('sanitizes unsupported controls without losing supported line and tab controls', () => {
    expect(sanitizePdfText(null)).toBe('');
    expect(sanitizePdfText('앞\u0000중\u0001뒤\u0085넷\uFFFE다섯\uD800끝\n줄\t탭')).toBe('앞�중�뒤�넷�다섯�끝\n줄\t탭');
});

test.each([
    ['one session', makeGeneratedPlan(), 2],
    ['two sessions', makeTwoSessionPlan(), 4],
])('builds an A4 formal PDF with two logical pages per session for %s', async (_label, plan, pageCount) => {
    const { bytes, document } = await renderPlan(plan);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(20_000);
    expect(document.getPageCount()).toBe(pageCount);
    expect(document.getTitle()).toBe('교수·학습 과정안');
    for (const page of document.getPages()) {
        expect(page.getWidth()).toBeCloseTo(595.28, 1);
        expect(page.getHeight()).toBeCloseTo(841.89, 1);
    }
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
    const plan = makeGeneratedPlan({ title: '이 제목은 레거시 문단 렌더러 전용' });
    const { trace } = await renderPlan(plan);
    const text = drawnText(trace);
    for (const label of [
        '교수·학습 과정안', '수업 개요', '학습 요소', '주요 발문', '예상 학생 반응',
        '수준별 피드백', '공통 피드백', '보충', '도달', '심화',
        '개별화·지원 전략', '수업 후 성찰', '수업 후 연계',
    ]) expect(text).toContain(label);
    expect(text).not.toContain('이 제목은 레거시 문단 렌더러 전용');
});

test('keeps section headings visibly separated from the preceding table border', async () => {
    const { trace } = await renderPlan(makeGeneratedPlan());
    for (const heading of ['교수·학습 과정', '개별화·지원 전략', '수업 후 성찰', '수업 후 연계']) {
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
        standards: [{ code: '순서-기준', text: '순서 성취기준 문장' }],
        learningGoals: ['순서 학습목표 하나', '순서 학습목표 둘'],
        essentialQuestion: '순서 핵심 질문?',
        materials: ['순서 준비물 하나', '순서 준비물 둘'],
        instructionModel: { ...base.instructionModel, name: '순서 수업모형' },
    });
    const text = drawnText((await renderPlan(plan)).trace);
    const orderedValues = ['초등학교 5학년', '순서과목', '순서단원', '1/1', '순서 수업모형', '[순서-기준] 순서 성취기준 문장', '1. 순서 학습목표 하나', '2. 순서 학습목표 둘', '순서 핵심 질문?', '순서 준비물 하나, 순서 준비물 둘'];
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
            stages: [{
                ...base.sessions[0].stages[0],
                teacherActivities: [values.teacherActivity],
                teacherQuestions: [values.teacherQuestion],
                studentActivities: [values.studentActivity],
                expectedStudentResponses: [values.expectedResponse],
                materialsAndNotes: [values.materialNote],
                supportNotes: [values.support],
            }],
        }],
        assessment: [{
            ...base.assessment[0],
            feedback: values.commonFeedback,
            levelFeedback: { needsSupport: values.needsSupport, meets: values.meets, exceeds: values.exceeds },
        }],
    });
    const { document, trace } = await renderPlan(plan);
    expect(document.getPageCount()).toBeGreaterThan(2);
    expect(trace.filter(event => event.type === 'cell').every(event => event.bottom >= 48)).toBe(true);
    for (const value of Object.values(values)) {
        const source = trace.find(event => event.type === 'text' && event.sourceText.includes(value))?.sourceText;
        expect(source).toBeDefined();
        const rendered = trace.filter(event => event.type === 'text' && event.sourceText === source).map(event => event.text).join('');
        expect(rendered).toContain(value);
    }
});
