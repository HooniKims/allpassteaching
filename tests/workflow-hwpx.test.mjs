import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { buildWorkflowHwpx } from '@/lib/export/workflow-hwpx';
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
});
