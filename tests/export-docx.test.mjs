import JSZip from 'jszip';
import { test, expect } from 'vitest';
import { buildDocx } from '@/lib/export/docx';
import { makeGeneratedPlan, makeTwoSessionPlan } from './fixtures/lesson-plan.mjs';

async function unpackDocx(plan) {
    const zip = await JSZip.loadAsync(await buildDocx(plan));
    return {
        zip,
        contentTypesXml: await zip.file('[Content_Types].xml').async('string'),
        documentXml: await zip.file('word/document.xml').async('string'),
        stylesXml: await zip.file('word/styles.xml').async('string'),
    };
}

function expectWellFormedXml(xml) {
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
}

function tableParts(documentXml) {
    return documentXml.match(/<w:tbl>.*?<\/w:tbl>/g) ?? [];
}

function gridWidths(tableXml) {
    return [...tableXml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(match => Number(match[1]));
}

test.each([
    ['one session', makeGeneratedPlan(), 3],
    ['two sessions', makeTwoSessionPlan(), 6],
])('renders three real Word tables per session for %s', async (_label, plan, expectedTableCount) => {
    // Given a normalized lesson plan with one or more sessions
    // When the DOCX is built and unpacked
    const { zip, contentTypesXml, documentXml, stylesXml } = await unpackDocx(plan);

    // Then it is a valid OOXML package with overview, process, and assessment tables
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    for (const xml of [contentTypesXml, documentXml, stylesXml]) expectWellFormedXml(xml);
    expect(documentXml.match(/<w:tbl>/g) ?? []).toHaveLength(expectedTableCount);
});

test.each([
    ['one session', makeGeneratedPlan(), 1],
    ['two sessions', makeTwoSessionPlan(), 3],
])('adds the exact logical page boundaries for %s', async (_label, plan, expectedPageBreaks) => {
    // Given a plan whose sessions each have a first and second logical page
    // When the DOCX is built
    const { documentXml } = await unpackDocx(plan);

    // Then page 1/2 and adjacent sessions are separated by explicit page breaks
    expect(documentXml.match(/<w:br w:type="page"\/>/g) ?? []).toHaveLength(expectedPageBreaks);
});

test('renders the formal table labels and exact model content', async () => {
    // Given structured content that belongs in every formal section
    const plan = makeGeneratedPlan({
        standards: [{ code: '6과11-02', text: '식물 기관 & 기능의 관계를 정확히 설명한다.' }],
        sessions: [{
            ...makeGeneratedPlan().sessions[0],
            nextSessionConnection: '다음 차시에는 뿌리와 잎의 기능을 비교한다.',
        }],
    });

    // When the DOCX is built
    const { documentXml } = await unpackDocx(plan);

    // Then semantic model content is rendered without reconstructing or dropping fields
    for (const text of ['교수·학습 과정안', '학습 요소', '주요 발문', '예상 학생 반응', '수준별 피드백', '보충', '도달', '심화', '6과11-02', '식물 기관 &amp; 기능의 관계를 정확히 설명한다.', '다음 차시에는 뿌리와 잎의 기능을 비교한다.']) {
        expect(documentXml).toContain(text);
    }
});

test('applies Paperlogy defaults and calm green table styling', async () => {
    // Given a standard lesson plan
    // When the DOCX style and document parts are unpacked
    const { documentXml, stylesXml } = await unpackDocx(makeGeneratedPlan());

    // Then the document declares Paperlogy and visible shaded, bordered tables
    expect(stylesXml).toMatch(/<w:docDefaults>.*?Paperlogy.*?<\/w:docDefaults>/);
    expect(documentXml).toMatch(/<w:rFonts [^>]*w:eastAsia="Paperlogy"/);
    expect(documentXml).toContain('<w:shd');
    expect(documentXml).toContain('<w:tblBorders>');
    expect(documentXml).toContain('<w:cantSplit/>');
});

test('renders fixed standard table grids and repeatable unsplit rows', async () => {
    // Given one session with three process rows and one assessment row
    // When the DOCX tables are unpacked
    const { documentXml } = await unpackDocx(makeGeneratedPlan());
    const [, processTable, assessmentTable] = tableParts(documentXml);

    // Then the formal process and assessment grids and row controls are exact
    expect(gridWidths(processTable)).toEqual([760, 1250, 2730, 2550, 650, 2038]);
    expect(gridWidths(assessmentTable)).toEqual([1700, 1700, 1900, 4678]);
    expect(processTable.match(/<w:tblHeader\/>/g) ?? []).toHaveLength(1);
    expect(assessmentTable.match(/<w:tblHeader\/>/g) ?? []).toHaveLength(1);
    expect(processTable.match(/<w:cantSplit\/>/g) ?? []).toHaveLength(4);
    expect(assessmentTable.match(/<w:cantSplit\/>/g) ?? []).toHaveLength(2);
});

test('sets A4 portrait dimensions and 17 millimeter page margins', async () => {
    // Given a generated formal lesson plan
    // When its section properties are inspected
    const { documentXml } = await unpackDocx(makeGeneratedPlan());

    // Then the page size and all practical margins use the expected twip values
    expect(documentXml).toContain('<w:pgSz w:w="11905" w:h="16837" w:orient="portrait"/>');
    expect(documentXml).toContain('<w:pgMar w:top="963" w:right="963" w:bottom="963" w:left="963"');
});

test('preserves every long structured content field without truncation', async () => {
    // Given long, distinct sentinel strings in every detailed cell block
    const sentinel = name => `${name}-시작-${`${name}긴내용`.repeat(80)}-${name}-끝`;
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
            levelFeedback: {
                needsSupport: values.needsSupport,
                meets: values.meets,
                exceeds: values.exceeds,
            },
        }],
    });

    // When the DOCX is built
    const { documentXml } = await unpackDocx(plan);

    // Then every exact sentinel survives in document.xml
    for (const value of Object.values(values)) expect(documentXml).toContain(value);
});

test('replaces XML 1.0 forbidden code points and keeps document XML well formed', async () => {
    // Given model text containing forbidden C0 controls, noncharacters, and a lone surrogate
    const plan = makeGeneratedPlan({
        essentialQuestion: '금지앞\u0001금지중\u0000금지뒤\uFFFE금지넷\uFFFF금지다섯\uD800금지끝',
    });

    // When the DOCX is built
    const { documentXml } = await unpackDocx(plan);

    // Then each invalid code point is visibly replaced and the XML remains parseable
    expect(documentXml).toContain('금지앞�금지중�금지뒤�금지넷�금지다섯�금지끝');
    expect(documentXml).not.toMatch(/[\u0000\u0001\uD800\uFFFE\uFFFF]/);
    expectWellFormedXml(documentXml);
});

test('preserves embedded CRLF, LF, CR, and tab as Word control runs', async () => {
    // Given text with every supported embedded whitespace control
    const plan = makeGeneratedPlan({
        essentialQuestion: '줄시작\r\n줄중간\t탭뒤\rCR뒤\n줄끝',
    });

    // When the DOCX is built
    const { documentXml } = await unpackDocx(plan);

    // Then line and tab boundaries become explicit Word controls without losing text
    expect(documentXml.match(/<w:br\/>/g) ?? []).toHaveLength(3);
    expect(documentXml.match(/<w:tab\/>/g) ?? []).toHaveLength(1);
    for (const text of ['줄시작', '줄중간', '탭뒤', 'CR뒤', '줄끝']) expect(documentXml).toContain(text);
    expectWellFormedXml(documentXml);
});

test('keeps every overview value in document-model order', async () => {
    // Given distinct values for each ordered overview field
    const base = makeGeneratedPlan();
    const plan = makeGeneratedPlan({
        metadata: { date: '2030-03-04', place: '순서장소', className: '순서학급', teacherName: '순서교사' },
        subject: '순서과목',
        unitTitle: '순서단원',
        standards: [{ code: '순서-기준', text: '순서 성취기준 문장' }],
        learningGoals: ['순서 학습목표 하나', '순서 학습목표 둘'],
        essentialQuestion: '순서 핵심 질문?',
        materials: ['순서 준비물 하나', '순서 준비물 둘'],
        instructionModel: { ...base.instructionModel, name: '순서 수업모형' },
    });

    // When the overview table is unpacked
    const { documentXml } = await unpackDocx(plan);
    const [overviewTable] = tableParts(documentXml);

    // Then its values appear once through the model's meaningful field order
    const orderedValues = ['2030-03-04', '순서장소', '순서학급', '순서교사', '초등학교 5학년', '순서과목', '순서단원', '1/1', '순서 수업모형', '[순서-기준] 순서 성취기준 문장', '1. 순서 학습목표 하나', '2. 순서 학습목표 둘', '순서 핵심 질문?', '순서 준비물 하나, 순서 준비물 둘'];
    let previousIndex = -1;
    for (const value of orderedValues) {
        const valueIndex = overviewTable.indexOf(value);
        expect(valueIndex).toBeGreaterThan(previousIndex);
        previousIndex = valueIndex;
    }
});

test('preserves blank metadata cells without injecting placeholder text', async () => {
    // Given intentionally blank metadata
    const plan = makeGeneratedPlan({ metadata: { date: '', place: '', className: '', teacherName: '' } });

    // When the DOCX is built
    const { documentXml } = await unpackDocx(plan);

    // Then the overview remains a table with its labels and no fabricated blank-value copy
    expect(documentXml).toContain('<w:tbl>');
    for (const label of ['일시', '장소', '대상 학급', '수업자']) expect(documentXml).toContain(label);
    expect(documentXml).not.toMatch(/미입력|입력 없음|정보 없음/);
});

test('preserves common and level-specific assessment feedback', async () => {
    // Given distinct feedback values for every assessment feedback field
    const plan = makeGeneratedPlan({ assessment: [{
        element: '근거 있는 설명',
        method: '관찰',
        evidence: '설명 기록',
        feedback: '공통 피드백 원문을 그대로 유지한다.',
        levelFeedback: {
            needsSupport: '보충 피드백 원문을 그대로 유지한다.',
            meets: '도달 피드백 원문을 그대로 유지한다.',
            exceeds: '심화 피드백 원문을 그대로 유지한다.',
        },
    }] });

    // When the DOCX is built
    const { documentXml } = await unpackDocx(plan);

    // Then none of the assessment feedback is lost
    for (const text of ['공통 피드백 원문을 그대로 유지한다.', '보충 피드백 원문을 그대로 유지한다.', '도달 피드백 원문을 그대로 유지한다.', '심화 피드백 원문을 그대로 유지한다.']) {
        expect(documentXml).toContain(text);
    }
});
