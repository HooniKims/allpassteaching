import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { expect, test } from 'vitest';
import { buildWorkflowHwpx } from '@/lib/export/workflow-hwpx';
import { buildWorkflowPdf } from '@/lib/export/workflow-pdf';
import { makeAssessment, makeWorksheet } from './fixtures/workflow.mjs';

const REQUIRED_HWPX_FILES = [
    'mimetype', 'META-INF/container.xml', 'META-INF/container.rdf', 'META-INF/manifest.xml',
    'Contents/content.hpf', 'Contents/header.xml', 'Contents/section0.xml', 'settings.xml', 'version.xml',
];

async function sectionFor(question) {
    const worksheet = makeWorksheet();
    worksheet.document.sections = [{ ...worksheet.document.sections[0], questions: [question] }];
    worksheet.teacherKey.answers = [{ questionId: question.id, answer: '교사용 예시 답안' }];
    const bytes = await buildWorkflowHwpx('worksheet-student', worksheet);
    const zip = await JSZip.loadAsync(bytes);
    return new DOMParser().parseFromString(await zip.file('Contents/section0.xml').async('string'), 'application/xml');
}

function responseTableHeights(section) {
    const table = [...section.getElementsByTagName('hp:tbl')].at(-1);
    return [...table.getElementsByTagName('hp:cellSz')].map(cell => Number(cell.getAttribute('height')));
}

test('preserves requested drawing and table response-area heights in HWPX tables', async () => {
    const drawing = height => ({ id: `drawing-${height}`, type: 'drawing-diagram', prompt: '그림으로 설명하세요.', standardCodes: ['6과11-02'], responseAreaHeight: height });
    const chart = height => ({ id: `chart-${height}`, type: 'table-chart', prompt: '표와 그래프로 정리하세요.', standardCodes: ['6과11-02'], responseAreaHeight: height });

    const [smallDrawing, largeDrawing, smallChart, largeChart] = await Promise.all([
        sectionFor(drawing(80)), sectionFor(drawing(400)), sectionFor(chart(80)), sectionFor(chart(400)),
    ]);

    expect(Math.max(...responseTableHeights(smallDrawing))).toBeGreaterThanOrEqual(8_000);
    expect(Math.max(...responseTableHeights(largeDrawing))).toBeGreaterThanOrEqual(40_000);
    expect(Math.max(...responseTableHeights(largeDrawing))).toBeGreaterThan(Math.max(...responseTableHeights(smallDrawing)));
    expect(Math.max(...responseTableHeights(largeChart))).toBeGreaterThan(Math.max(...responseTableHeights(smallChart)));
});

test('rejects HWPX exports when the included student cover exceeds one page', async () => {
    const assessment = makeAssessment();
    assessment.rubric.levels = Array.from({ length: 6 }, (_value, index) => ({ id: `level-${index + 1}`, label: `${index + 1}수준` }));
    assessment.rubric.criteria = Array.from({ length: 15 }, (_value, index) => ({
        ...assessment.rubric.criteria[0],
        id: `criterion-${index + 1}`,
        name: `평가영역 ${index + 1}`,
        levels: assessment.rubric.levels.map((level, levelIndex) => ({
            levelId: level.id,
            score: 10 - levelIndex,
            description: '학생이 수행 과정의 근거를 구체적으로 기록하고 피드백을 반영한 이유를 설명한다.',
        })),
    }));

    await expect(buildWorkflowHwpx('assessment-cover', assessment)).rejects.toThrow(/한 페이지/);
    await expect(buildWorkflowHwpx('assessment', assessment)).rejects.toThrow(/한 페이지/);
});

test('builds a complete, editable student HWPX package without teacher-only content', async () => {
    const worksheet = makeWorksheet();
    worksheet.document.sections[0].questions[0].prompt = '관찰 & 비교 <설명>';
    const bytes = await buildWorkflowHwpx('worksheet-student', worksheet);
    const zip = await JSZip.loadAsync(bytes);
    const sectionXml = await zip.file('Contents/section0.xml').async('string');
    const headerXml = await zip.file('Contents/header.xml').async('string');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const nameLength = view.getUint16(26, true);

    for (const filename of REQUIRED_HWPX_FILES) expect(zip.file(filename), filename).not.toBeNull();
    expect(await zip.file('mimetype').async('string')).toBe('application/hwp+zip');
    expect(view.getUint16(8, true)).toBe(0);
    expect(new TextDecoder().decode(bytes.subarray(30, 30 + nameLength))).toBe('mimetype');
    expect(new DOMParser().parseFromString(headerXml, 'application/xml').querySelector('parsererror')).toBeNull();
    expect(new DOMParser().parseFromString(sectionXml, 'application/xml').querySelector('parsererror')).toBeNull();
    expect(headerXml).toContain('face="Paperlogy"');
    expect(sectionXml).toContain('관찰 &amp; 비교 &lt;설명&gt;');
    expect(sectionXml).not.toContain('교사용 예시 답안');
    expect(sectionXml).not.toContain('<hp:linesegarray');
});

test('학생 표지 HWPX에 GRASPS 목표와 성공 기준을 함께 보존한다', async () => {
    const assessment = makeAssessment();
    const bytes = await buildWorkflowHwpx('assessment-cover', assessment);
    const zip = await JSZip.loadAsync(bytes);
    const sectionXml = await zip.file('Contents/section0.xml').async('string');

    expect(sectionXml).toContain(assessment.task.goal);
    expect(sectionXml).toContain(assessment.task.successCriteria);
});

test('학생 표지 HWPX는 참조 데이터와 같은 섹션 설명을 중복 출력하지 않는다', async () => {
    const assessment = makeAssessment();
    assessment.cover.sections.find(section => section.type === 'transfer-goal').content = assessment.backwardDesign.transferGoal;
    const bytes = await buildWorkflowHwpx('assessment-cover', assessment);
    const zip = await JSZip.loadAsync(bytes);
    const sectionXml = await zip.file('Contents/section0.xml').async('string');

    expect(sectionXml.split(assessment.backwardDesign.transferGoal)).toHaveLength(2);
});

test('수행평가 HWPX는 AI 절차에 붙은 순번을 다시 붙이지 않는다', async () => {
    const assessment = makeAssessment();
    assessment.task.procedure[0] = '1. 기관별 특징을 관찰한다.';
    const bytes = await buildWorkflowHwpx('assessment', assessment);
    const zip = await JSZip.loadAsync(bytes);
    const sectionXml = await zip.file('Contents/section0.xml').async('string');

    expect(sectionXml).toContain('1. 기관별 특징을 관찰한다.');
    expect(sectionXml).not.toContain('1. 1. 기관별 특징을 관찰한다.');
});

test('제출용 수행평가지 HWPX는 안내문과 루브릭을 제외하고 실제 문항과 응답 공간을 보존한다', async () => {
    const assessment = makeAssessment();
    const bytes = await buildWorkflowHwpx('assessment-sheet', assessment);
    const zip = await JSZip.loadAsync(bytes);
    const sectionXml = await zip.file('Contents/section0.xml').async('string');

    expect(sectionXml).not.toContain(assessment.cover.title);
    expect(sectionXml).toContain(assessment.studentSheet.document.title);
    expect(sectionXml).toContain(assessment.studentSheet.document.sections[0].questions[0].prompt);
    expect(sectionXml).toContain(assessment.studentSheet.document.sections[1].questions[0].prompt);
    expect(sectionXml).not.toContain('점수형 분석적 루브릭');
    expect(sectionXml).not.toContain('탁월');
    const section = new DOMParser().parseFromString(sectionXml, 'application/xml');
    const responseTables = [...section.getElementsByTagName('hp:tbl')].filter(table => table.textContent.trim() === '' || table.textContent.includes('조건'));
    expect(responseTables.length).toBeGreaterThanOrEqual(3);
});

test('제출용 수행평가지 HWPX는 PDF와 같은 본문 폭과 쪽 수로 문항을 나눈다', async () => {
    const assessment = makeAssessment();
    const [hwpxBytes, pdfBytes] = await Promise.all([
        buildWorkflowHwpx('assessment-sheet', assessment),
        buildWorkflowPdf('assessment-sheet', assessment),
    ]);
    const [zip, pdf] = await Promise.all([
        JSZip.loadAsync(hwpxBytes),
        PDFDocument.load(pdfBytes),
    ]);
    const sectionXml = await zip.file('Contents/section0.xml').async('string');
    const section = new DOMParser().parseFromString(sectionXml, 'application/xml');
    const margin = section.getElementsByTagName('hp:margin')[0];
    const explicitPageBreaks = [...section.getElementsByTagName('hp:p')]
        .filter(paragraph => paragraph.getAttribute('pageBreak') === '1');

    expect(margin.getAttribute('left')).toBe('4800');
    expect(margin.getAttribute('right')).toBe('4800');
    expect(explicitPageBreaks).toHaveLength(pdf.getPageCount() - 1);
});

test('수행평가지 루브릭 셀은 한 개의 흐르는 문단으로 구성하고 긴 내용도 연속 행에 보존한다', async () => {
    const assessment = makeAssessment();
    assessment.includeStudentCover = false;
    const longCriterion = `평가영역-시작-${'관찰 근거를 구체적으로 설명한다. '.repeat(120)}-평가영역-끝`;
    const longLevel = `수준기준-시작-${'학생의 수행 증거를 바탕으로 판단한다. '.repeat(120)}-수준기준-끝`;
    assessment.rubric.criteria[0].description = longCriterion;
    assessment.rubric.criteria[0].levels[0].description = longLevel;
    const bytes = await buildWorkflowHwpx('assessment', assessment);
    const zip = await JSZip.loadAsync(bytes);
    const sectionXml = await zip.file('Contents/section0.xml').async('string');
    const section = new DOMParser().parseFromString(sectionXml, 'application/xml');
    const tables = [...section.getElementsByTagName('hp:tbl')];
    const rubricTables = tables.filter(table => table.textContent.includes('평가영역') && table.textContent.includes('탁월'));

    expect(rubricTables.length).toBeGreaterThan(1);
    expect([...section.getElementsByTagName('hp:p')].filter(paragraph => paragraph.getAttribute('pageBreak') === '1').length).toBeGreaterThan(1);
    const rubricRows = rubricTables.flatMap(table => [...table.getElementsByTagName('hp:tr')].slice(1));
    const columnText = columnIndex => rubricRows.map(row => row.getElementsByTagName('hp:tc')[columnIndex].getElementsByTagName('hp:t')[0]?.textContent ?? '').join('');
    expect(columnText(0)).toContain(longCriterion);
    expect(columnText(1)).toContain(longLevel);
    for (const table of rubricTables) {
        expect(Number(table.getAttribute('colCnt'))).toBe(assessment.rubric.levels.length + 1);
        expect(table.getAttribute('pageBreak')).toBe('CELL');
        expect(table.getAttribute('repeatHeader')).toBe('1');
        for (const row of [...table.getElementsByTagName('hp:tr')]) {
            const widths = [...row.getElementsByTagName('hp:tc')].map(cell => Number(cell.getElementsByTagName('hp:cellSz')[0].getAttribute('width')));
            expect(widths.reduce((sum, width) => sum + width, 0)).toBe(49928);
        }
        for (const cell of [...table.getElementsByTagName('hp:tc')]) {
            expect(cell.getElementsByTagName('hp:p')).toHaveLength(1);
            expect(Number(cell.getElementsByTagName('hp:cellSz')[0].getAttribute('height'))).toBeLessThanOrEqual(30_000);
        }
    }
});
