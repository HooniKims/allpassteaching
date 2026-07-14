import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { POST } from '@/app/api/export-rubric/[format]/route';
import { buildAssessmentRubricHwpx } from '@/lib/export/assessment-rubric';
import { buildWorkflowPdf } from '@/lib/export/workflow-pdf';
import { makeAssessment } from './fixtures/workflow.mjs';

const exportRequest = body => new Request('http://localhost/api/export-rubric/hwpx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

const oversizedStreamRequest = () => new Request('http://localhost/api/export-rubric/hwpx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('{"padding":"'));
            controller.enqueue(new TextEncoder().encode('x'.repeat(500_000)));
            controller.enqueue(new TextEncoder().encode('"}'));
            controller.close();
        },
    }),
    duplex: 'half',
});

const firstZipEntryName = bytes => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const nameLength = view.getUint16(26, true);
    return new TextDecoder().decode(bytes.subarray(30, 30 + nameLength));
};

const firstZipEntryCompressionMethod = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(8, true);
const requiredHwpxFiles = [
    'mimetype',
    'META-INF/container.xml',
    'META-INF/container.rdf',
    'META-INF/manifest.xml',
    'Contents/content.hpf',
    'Contents/header.xml',
    'Contents/section0.xml',
    'settings.xml',
    'version.xml',
];

test('exports the teacher-edited rubric in PDF, HWPX, DOCX, and Excel', async () => {
    const assessment = makeAssessment();
    assessment.rubric.criteria[0].name = '교사가 고친 관찰 근거';
    assessment.rubric.criteria[0].levels[0].description = '교사가 직접 고친 탁월 수준 설명';
    assessment.backwardDesign.evidenceMap[0].scoreBasis = assessment.backwardDesign.evidenceMap[0].scoreBasis.replace('관찰 근거', '교사가 고친 관찰 근거');
    const directPdfText = [];
    const directPdf = await buildWorkflowPdf('assessment-rubric', assessment, { onDraw: item => directPdfText.push(item.text) });
    expect(Buffer.from(directPdf).subarray(0, 5).toString()).toBe('%PDF-');
    expect(directPdfText).toContain('식물 기관 탐구 수행평가 루브릭');
    expect(directPdfText).toContain('[6과11-02] 식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.');
    expect(directPdfText.join('\n')).toContain('교사가 고친 관찰 근거');
    expect(directPdfText.join('\n')).toContain('교사가 직접 고친 탁월 수준 설명');

    const responses = [];
    for (const format of ['pdf', 'hwpx', 'docx', 'xlsx']) {
        responses.push(await POST(exportRequest(assessment), { params: Promise.resolve({ format }) }));
    }

    expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200]);
    expect(responses[0].headers.get('content-type')).toContain('application/pdf');
    expect(responses[1].headers.get('content-type')).toContain('application/hwp+zip');
    expect(responses[2].headers.get('content-type')).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(responses[3].headers.get('content-type')).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const [pdf, hwpx, docx, xlsx] = await Promise.all(responses.map(async response => new Uint8Array(await response.arrayBuffer())));
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');

    const hwpxZip = await JSZip.loadAsync(hwpx);
    const sectionXml = await hwpxZip.file('Contents/section0.xml').async('string');
    const headerXml = await hwpxZip.file('Contents/header.xml').async('string');
    const section = new DOMParser().parseFromString(sectionXml, 'application/xml');
    expect(section.querySelector('parsererror')).toBeNull();
    expect(firstZipEntryName(hwpx)).toBe('mimetype');
    expect(firstZipEntryCompressionMethod(hwpx)).toBe(0);
    expect(await hwpxZip.file('mimetype').async('string')).toBe('application/hwp+zip');
    for (const file of requiredHwpxFiles) expect(hwpxZip.file(file), file).toBeTruthy();
    expect(headerXml).toContain('face="Paperlogy"');
    expect(sectionXml).toContain('교사가 고친 관찰 근거');
    expect(sectionXml).toContain('교사가 직접 고친 탁월 수준 설명');
    expect(sectionXml).not.toContain('<hp:linesegarray');
    const rubricTable = [...section.getElementsByTagName('hp:tbl')].at(-1);
    expect(Number(rubricTable.getAttribute('colCnt'))).toBe(assessment.rubric.levels.length + 1);
    for (const row of [...rubricTable.getElementsByTagName('hp:tr')]) {
        const widths = [...row.getElementsByTagName('hp:tc')].map(cell => Number(cell.getElementsByTagName('hp:cellSz')[0].getAttribute('width')));
        expect(widths.reduce((sum, width) => sum + width, 0)).toBe(42520);
        for (const cell of [...row.getElementsByTagName('hp:tc')]) expect(cell.getElementsByTagName('hp:p')).toHaveLength(1);
    }
    expect([...rubricTable.getElementsByTagName('hp:tr')][0].textContent).toContain('탁월');

    const docxZip = await JSZip.loadAsync(docx);
    const documentXml = await docxZip.file('word/document.xml').async('string');
    expect(new DOMParser().parseFromString(documentXml, 'application/xml').querySelector('parsererror')).toBeNull();
    expect(documentXml).toContain('교사가 고친 관찰 근거');
    expect(documentXml).toContain('교사가 직접 고친 탁월 수준 설명');
    expect(documentXml).toContain('<w:tbl>');

    const excelModule = await import('exceljs');
    const ExcelJS = excelModule.default ?? excelModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx);
    const sheet = workbook.getWorksheet('루브릭');
    expect(sheet.getCell('A1').value).toBe('식물 기관 탐구 수행평가 루브릭');
    expect(sheet.getRow(5).values).toContain('탁월');
    expect(sheet.getCell('A6').value).toContain('교사가 고친 관찰 근거');
    expect(sheet.getCell('D6').value).toContain('교사가 직접 고친 탁월 수준 설명');
});

test('splits a long HWPX rubric into page-sized level-column tables', async () => {
    const assessment = makeAssessment();
    assessment.rubric.criteria[0].description = `평가영역-시작-${'관찰 근거를 구체적으로 설명한다. '.repeat(120)}-평가영역-끝`;
    assessment.rubric.criteria[0].levels[0].description = `수준기준-시작-${'학생의 수행 증거를 바탕으로 판단한다. '.repeat(120)}-수준기준-끝`;
    const bytes = await buildAssessmentRubricHwpx(assessment);
    const zip = await JSZip.loadAsync(bytes);
    const sectionXml = await zip.file('Contents/section0.xml').async('string');
    const section = new DOMParser().parseFromString(sectionXml, 'application/xml');
    const rubricTables = [...section.getElementsByTagName('hp:tbl')].filter(table => table.textContent.includes('평가영역') && table.textContent.includes('탁월'));

    expect(rubricTables.length).toBeGreaterThan(1);
    expect([...section.getElementsByTagName('hp:p')].filter(paragraph => paragraph.getAttribute('pageBreak') === '1').length).toBeGreaterThan(0);
    for (const table of rubricTables) {
        expect(Number(table.getAttribute('colCnt'))).toBe(assessment.rubric.levels.length + 1);
        for (const cell of [...table.getElementsByTagName('hp:tc')]) expect(cell.getElementsByTagName('hp:p')).toHaveLength(1);
    }
    expect(rubricTables.map(table => table.textContent).join('')).toContain('평가영역-끝');
    expect(rubricTables.map(table => table.textContent).join('')).toContain('수준기준-끝');
});

test('rejects a malformed rubric export and unsupported file types', async () => {
    const invalid = await POST(exportRequest({}), { params: Promise.resolve({ format: 'hwpx' }) });
    const unsupported = await POST(exportRequest(makeAssessment()), { params: Promise.resolve({ format: 'odt' }) });
    const inherited = await POST(exportRequest(makeAssessment()), { params: Promise.resolve({ format: 'constructor' }) });
    const oversized = await POST(oversizedStreamRequest(), { params: Promise.resolve({ format: 'hwpx' }) });

    expect(invalid.status).toBe(400);
    expect(unsupported.status).toBe(404);
    expect(inherited.status).toBe(404);
    expect(oversized.status).toBe(413);
});

test('sanitizes malformed Unicode in a rubric download filename', async () => {
    const assessment = makeAssessment();
    assessment.assessmentName = '\ud800';

    const response = await POST(exportRequest(assessment), { params: Promise.resolve({ format: 'xlsx' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('%EF%BF%BD');
});

test('encodes RFC 8187-reserved characters in a rubric download filename', async () => {
    const assessment = makeAssessment();
    assessment.assessmentName = "빛's (수행평가)*!";

    const response = await POST(exportRequest(assessment), { params: Promise.resolve({ format: 'xlsx' }) });
    const disposition = response.headers.get('content-disposition');

    expect(response.status).toBe(200);
    expect(disposition).toContain('%27');
    expect(disposition).toContain('%28');
    expect(disposition).toContain('%29');
    expect(disposition).toContain('%2A');
    expect(disposition).toContain('%21');
});

test('sanitizes XML-disallowed control characters in a DOCX rubric export', async () => {
    const assessment = makeAssessment();
    assessment.assessmentName = '식물\u0000\u000B 탐구 수행평가';
    assessment.rubric.criteria[0].description = '관찰 근거\u0000\u000B를 설명한다.';

    const response = await POST(exportRequest(assessment), { params: Promise.resolve({ format: 'docx' }) });
    const zip = await JSZip.loadAsync(new Uint8Array(await response.arrayBuffer()));
    const documentXml = await zip.file('word/document.xml').async('string');

    expect(response.status).toBe(200);
    expect(documentXml).not.toMatch(/[\u0000\u000B]/);
    expect(new DOMParser().parseFromString(documentXml, 'application/xml').querySelector('parsererror')).toBeNull();
});

test('returns a safe 422 instead of a server error when a valid rubric exceeds the PDF page limit', async () => {
    const assessment = makeAssessment();
    assessment.includeStudentCover = false;
    assessment.totalPoints = 150;
    assessment.scoring = { includeProcessInScore: false, processWeightPercent: 0, processTargetPoints: 0 };
    assessment.rubric.levels = Array.from({ length: 6 }, (_value, index) => ({ id: `level-${index + 1}`, label: `${index + 1}수준` }));
    assessment.rubric.criteria = Array.from({ length: 15 }, (_value, index) => ({
        ...assessment.rubric.criteria[0],
        id: `criterion-${index + 1}`,
        name: `평가영역 ${index + 1}`,
        kind: 'outcome',
        maxPoints: 10,
        intervalPoints: 1,
        levels: assessment.rubric.levels.map((level, levelIndex) => ({
            levelId: level.id,
            score: 10 - levelIndex,
            description: `수준 설명\n${'\n'.repeat(40)}끝`,
        })),
    }));
    assessment.backwardDesign.evidenceMap[0] = {
        ...assessment.backwardDesign.evidenceMap[0],
        criterionIds: assessment.rubric.criteria.map(criterion => criterion.id),
        taskEvidenceTypes: [assessment.rubric.criteria[0].evidence],
        evidenceTypes: ['결과 증거'],
        scoreBasis: assessment.rubric.criteria.map(criterion => `${criterion.name} ${criterion.maxPoints}점`).join(', '),
    };

    const response = await POST(exportRequest(assessment), { params: Promise.resolve({ format: 'pdf' }) });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
        code: 'document_too_long',
        message: '수행평가 문서 내용이 너무 깁니다. 평가영역 또는 설명을 줄인 뒤 다시 시도해주세요.',
    });
});
