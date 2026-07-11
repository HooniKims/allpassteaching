import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { buildHwpx } from '@/lib/export/hwpx';
import { makeGeneratedPlan, makeTwoSessionPlan } from './fixtures/lesson-plan.mjs';

const PROCESS_WIDTHS = [4252, 5669, 12047, 12047, 3543, 4962];
const ASSESSMENT_WIDTHS = [8504, 8504, 11339, 14173];
const REQUIRED_FILES = [
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

function parseXml(xml) {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    expect(document.querySelector('parsererror')).toBeNull();
    return document;
}

async function unpackHwpx(plan) {
    const bytes = await buildHwpx(plan);
    const zip = await JSZip.loadAsync(bytes);
    const headerXml = await zip.file('Contents/header.xml').async('string');
    const sectionXml = await zip.file('Contents/section0.xml').async('string');
    return {
        bytes,
        zip,
        headerXml,
        sectionXml,
        header: parseXml(headerXml),
        section: parseXml(sectionXml),
    };
}

const elements = (document, tagName) => [...document.getElementsByTagName(tagName)];
const children = (element, tagName) => [...element.children].filter(child => child.tagName === tagName);
const rows = table => children(table, 'hp:tr');
const cells = row => children(row, 'hp:tc');
const width = cell => Number(children(cell, 'hp:cellSz')[0].getAttribute('width'));
const span = cell => children(cell, 'hp:cellSpan')[0];
const address = cell => children(cell, 'hp:cellAddr')[0];

function expectExactGrid(table, expectedWidths) {
    for (const [rowIndex, row] of rows(table).entries()) {
        const rowCells = cells(row);
        expect(rowCells.map(width), `row ${rowIndex} widths`).toEqual(expectedWidths);
        expect(rowCells.reduce((sum, cell) => sum + width(cell), 0)).toBe(42520);
        expect(rowCells.map(cell => Number(address(cell).getAttribute('colAddr')))).toEqual(expectedWidths.map((_, index) => index));
        expect(rowCells.map(cell => Number(address(cell).getAttribute('rowAddr')))).toEqual(expectedWidths.map(() => rowIndex));
        expect(rowCells.map(cell => Number(span(cell).getAttribute('colSpan')))).toEqual(expectedWidths.map(() => 1));
        expect(rowCells.map(cell => Number(span(cell).getAttribute('rowSpan')))).toEqual(expectedWidths.map(() => 1));
    }
}

test('builds a well-formed HWPX package with a first uncompressed mimetype entry', async () => {
    // Given a standard generated lesson plan
    // When its HWPX package is built and unpacked
    const { bytes, zip, header, section } = await unpackHwpx(makeGeneratedPlan());

    // Then all mandatory package parts exist and mimetype is first and STORED
    for (const file of REQUIRED_FILES) expect(zip.file(file), file).not.toBeNull();
    expect(await zip.file('mimetype').async('string')).toBe('application/hwp+zip');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034B50);
    expect(view.getUint16(8, true)).toBe(0);
    const nameLength = view.getUint16(26, true);
    expect(new TextDecoder().decode(bytes.subarray(30, 30 + nameLength))).toBe('mimetype');
    expect(header.documentElement.tagName).toBe('hh:head');
    expect(section.documentElement.tagName).toBe('hs:sec');
});

test('keeps every header collection count equal to its actual element count', async () => {
    // Given a generated formal HWPX header
    // When all counted style collections are inspected
    const { header } = await unpackHwpx(makeGeneratedPlan());

    // Then itemCnt and fontCnt never drift from their child definitions
    for (const collection of [...header.querySelectorAll('[itemCnt]')]) {
        expect(Number(collection.getAttribute('itemCnt')), collection.tagName).toBe(collection.children.length);
    }
    for (const fontface of elements(header, 'hh:fontface')) {
        expect(Number(fontface.getAttribute('fontCnt')), fontface.getAttribute('lang')).toBe(children(fontface, 'hh:font').length);
    }
});

test.each([
    ['one session', makeGeneratedPlan(), 3],
    ['two sessions', makeTwoSessionPlan(), 6],
])('renders three real OWPML tables per session for %s', async (_label, plan, expectedTableCount) => {
    // Given one or more structured lesson sessions
    // When the section XML is generated
    const { section } = await unpackHwpx(plan);

    // Then each session has overview, process, and assessment tables
    expect(elements(section, 'hp:tbl')).toHaveLength(expectedTableCount);
});

test.each([
    ['one session', makeGeneratedPlan(), 1],
    ['two sessions', makeTwoSessionPlan(), 3],
])('adds the exact logical page boundaries for %s', async (_label, plan, expectedPageBreaks) => {
    // Given a document with two logical portions per session
    // When its section paragraphs are inspected
    const { section } = await unpackHwpx(plan);

    // Then page 1/2 and adjacent sessions have explicit page-break paragraphs
    expect(elements(section, 'hp:p').filter(paragraph => paragraph.getAttribute('pageBreak') === '1')).toHaveLength(expectedPageBreaks);
});

test('renders the exact six-column process table grid and cell coordinates', async () => {
    // Given one session containing three instructional stages
    // When its process table is inspected
    const { section } = await unpackHwpx(makeGeneratedPlan());
    const processTable = elements(section, 'hp:tbl')[1];

    // Then its dimensions, fixed widths, addresses, spans, and pagination controls are exact
    expect(processTable.getAttribute('rowCnt')).toBe('4');
    expect(processTable.getAttribute('colCnt')).toBe('6');
    expect(processTable.getAttribute('pageBreak')).toBe('CELL');
    expect(processTable.getAttribute('repeatHeader')).toBe('1');
    expectExactGrid(processTable, PROCESS_WIDTHS);
});

test('renders the exact four-column assessment table grid with common and level feedback', async () => {
    // Given a plan with one assessment row
    // When its assessment table is inspected
    const { section, sectionXml } = await unpackHwpx(makeGeneratedPlan());
    const assessmentTable = elements(section, 'hp:tbl')[2];

    // Then the formal grid and all four feedback variants are preserved
    expect(assessmentTable.getAttribute('rowCnt')).toBe('2');
    expect(assessmentTable.getAttribute('colCnt')).toBe('4');
    expect(assessmentTable.getAttribute('repeatHeader')).toBe('1');
    expectExactGrid(assessmentTable, ASSESSMENT_WIDTHS);
    for (const text of ['공통 피드백', '근거를 구체화하도록 피드백한다.', '보충', '도달', '심화']) {
        expect(sectionXml).toContain(text);
    }
});

test('renders every formal section, column, block label, and exact achievement standard text', async () => {
    // Given a structured plan with XML-sensitive standard text and a distinct connection
    const base = makeGeneratedPlan();
    const plan = makeGeneratedPlan({
        standards: [{ code: '6과11-02', text: '식물 기관 & 기능의 관계를 정확히 설명한다.' }],
        sessions: [{ ...base.sessions[0], nextSessionConnection: '다음 차시에는 뿌리와 잎의 기능을 비교한다.' }],
    });

    // When the HWPX section is generated
    const { sectionXml } = await unpackHwpx(plan);

    // Then the common model vocabulary and exact user content are all present
    for (const text of [
        '교수·학습 과정안', '수업 개요', '교수·학습 과정', '과정중심평가', '개별화·지원 전략', '수업 후 성찰', '수업 후 연계',
        '단계', '학습 요소', '교사 활동', '학생 활동', '시간', '자료·유의점', '주요 발문', '예상 학생 반응', '지원',
        '평가 요소', '평가 방법', '관찰 증거', '수준별 피드백', '[6과11-02] 식물 기관 &amp; 기능의 관계를 정확히 설명한다.',
        '다음 차시에는 뿌리와 잎의 기능을 비교한다.',
    ]) expect(sectionXml).toContain(text);
});

test('renders the ordered four-column overview with practical merged long rows and blank metadata', async () => {
    // Given intentionally blank metadata and distinct ordered overview values
    const base = makeGeneratedPlan();
    const plan = makeGeneratedPlan({
        metadata: { date: '', place: '', className: '', teacherName: '' },
        subject: '순서과목',
        unitTitle: '순서단원',
        standards: [{ code: '순서-기준', text: '순서 성취기준 문장' }],
        learningGoals: ['순서 학습목표'],
        essentialQuestion: '순서 핵심 질문?',
        materials: ['순서 준비물'],
        instructionModel: { ...base.instructionModel, name: '순서 수업모형' },
    });

    // When the overview table is inspected
    const { section } = await unpackHwpx(plan);
    const overview = elements(section, 'hp:tbl')[0];
    const overviewRows = rows(overview);

    // Then paired rows have four cells and long rows merge the value across three columns
    expect(overview.getAttribute('colCnt')).toBe('4');
    expect(overviewRows).toHaveLength(9);
    expect(overviewRows.map(row => cells(row).length)).toEqual([4, 4, 4, 2, 4, 2, 2, 2, 2]);
    for (const rowIndex of [3, 5, 6, 7, 8]) {
        expect([...cells(overviewRows[rowIndex])].map(cell => Number(span(cell).getAttribute('colSpan')))).toEqual([1, 3]);
        expect(cells(overviewRows[rowIndex]).reduce((sum, cell) => sum + width(cell), 0)).toBe(42520);
    }
    const orderedText = overview.textContent;
    let previousIndex = -1;
    for (const value of ['일시', '장소', '대상 학급', '수업자', '초등학교 5학년', '순서과목', '순서단원', '1/1', '순서 수업모형', '순서-기준', '순서 학습목표', '순서 핵심 질문?', '순서 준비물']) {
        const valueIndex = orderedText.indexOf(value);
        expect(valueIndex, value).toBeGreaterThan(previousIndex);
        previousIndex = valueIndex;
    }
    expect(orderedText).not.toMatch(/미입력|입력 없음|정보 없음/);
});

test('declares Paperlogy, distinct formal styles, green-neutral fills, and valid style references', async () => {
    // Given a generated HWPX header and section
    // When their style declarations and references are collected
    const { header, headerXml, section } = await unpackHwpx(makeGeneratedPlan());
    const defined = {
        charPrIDRef: new Set(elements(header, 'hh:charPr').map(element => element.getAttribute('id'))),
        paraPrIDRef: new Set(elements(header, 'hh:paraPr').map(element => element.getAttribute('id'))),
        borderFillIDRef: new Set(elements(header, 'hh:borderFill').map(element => element.getAttribute('id'))),
        styleIDRef: new Set(elements(header, 'hh:style').map(element => element.getAttribute('id'))),
    };

    // Then named font/style/fill definitions exist and every section reference resolves
    expect(headerXml).toContain('face="Paperlogy"');
    expect(headerXml).toContain('face="함초롬돋움"');
    expect(new Set(elements(section, 'hp:run').map(run => run.getAttribute('charPrIDRef'))).size).toBeGreaterThanOrEqual(4);
    expect(headerXml).toMatch(/<hh:(?:left|right|top|bottom)Border type="SOLID"/);
    expect(headerXml).toMatch(/faceColor="#[D-F][0-9A-F]{5}"/);
    for (const [attribute, ids] of Object.entries(defined)) {
        for (const element of [...section.querySelectorAll(`[${attribute}]`)]) {
            expect(ids.has(element.getAttribute(attribute)), `${attribute}=${element.getAttribute(attribute)}`).toBe(true);
        }
    }
});

test('maps every used formal text role to the exact planned HWPUNIT height', async () => {
    // Given the generated header styles and representative rendered paragraphs
    const { header, section } = await unpackHwpx(makeGeneratedPlan());
    const charHeights = Object.fromEntries(elements(header, 'hh:charPr').map(property => [property.getAttribute('id'), property.getAttribute('height')]));
    const usedStyle = text => elements(section, 'hp:p').find(paragraph => paragraph.textContent === text)
        .getElementsByTagName('hp:run')[0].getAttribute('charPrIDRef');

    // When each formal role is resolved through the style ID actually used by section XML
    // Then title/body/table body use 18/10/9pt while section and table headers retain their planned sizes
    expect(charHeights).toMatchObject({ 7: '1000', 8: '1800', 9: '1200', 10: '900', 11: '900' });
    expect({
        title: usedStyle('교수·학습 과정안'),
        body: usedStyle('학생이 증거를 바탕으로 설명했는가?'),
        section: usedStyle('수업 개요'),
        tableHeader: usedStyle('단계'),
        compactTableBody: usedStyle('관찰 문제 확인'),
    }).toEqual({ title: '8', body: '7', section: '9', tableHeader: '10', compactTableBody: '11' });
});

test('uses deterministic unique IDs for paragraphs, tables, and cell sublists', async () => {
    // Given the same two-session plan rendered twice
    // When relevant structural IDs are collected
    const first = await unpackHwpx(makeTwoSessionPlan());
    const second = await unpackHwpx(makeTwoSessionPlan());
    const collect = section => ['hp:p', 'hp:tbl', 'hp:subList'].flatMap(tag => elements(section, tag).map(element => element.getAttribute('id')).filter(Boolean));
    const firstIds = collect(first.section);

    // Then IDs are unique inside the package and stable across builds
    expect(new Set(firstIds).size).toBe(firstIds.length);
    expect(collect(second.section)).toEqual(firstIds);
});

test('preserves long structured fields without truncating any process or assessment content', async () => {
    // Given distinct long sentinels in every detailed structured field
    const sentinel = name => `${name}-시작-${`${name}긴내용`.repeat(80)}-${name}-끝`;
    const values = Object.fromEntries(['교사활동', '주요발문', '학생활동', '예상반응', '자료유의점', '지원', '공통피드백', '보충피드백', '도달피드백', '심화피드백', '다음연결'].map(name => [name, sentinel(name)]));
    const base = makeGeneratedPlan();
    const plan = makeGeneratedPlan({
        sessions: [{ ...base.sessions[0], nextSessionConnection: values.다음연결, stages: [{
            ...base.sessions[0].stages[0],
            teacherActivities: [values.교사활동], teacherQuestions: [values.주요발문],
            studentActivities: [values.학생활동], expectedStudentResponses: [values.예상반응],
            materialsAndNotes: [values.자료유의점], supportNotes: [values.지원],
        }] }],
        assessment: [{ ...base.assessment[0], feedback: values.공통피드백, levelFeedback: {
            needsSupport: values.보충피드백, meets: values.도달피드백, exceeds: values.심화피드백,
        } }],
    });

    // When the HWPX section is generated
    const { sectionXml } = await unpackHwpx(plan);

    // Then every exact sentinel reaches the XML unchanged
    for (const value of Object.values(values)) expect(sectionXml).toContain(value);
});

test('escapes XML and visibly replaces forbidden controls, lone surrogates, and noncharacters', async () => {
    // Given text with XML metacharacters and invalid XML 1.0 code points
    const plan = makeGeneratedPlan({
        essentialQuestion: '특수<&>"앞\u0001중\u0000뒤\uFDD0넷\uFFFE다섯\uFFFF여섯\uD800끝',
    });

    // When the HWPX section is generated
    const { sectionXml, section } = await unpackHwpx(plan);

    // Then metacharacters are escaped and every forbidden scalar is visibly replaced
    expect(sectionXml).toContain('특수&lt;&amp;&gt;&quot;앞�중�뒤�넷�다섯�여섯�끝');
    expect(sectionXml).not.toMatch(/[\u0000\u0001\uD800\uFDD0\uFFFE\uFFFF]/);
    expect(section.documentElement.tagName).toBe('hs:sec');
});

test('preserves CRLF, LF, CR, and tab as explicit OWPML inline controls', async () => {
    // Given supported embedded whitespace controls
    const plan = makeGeneratedPlan({ essentialQuestion: '줄시작\r\n줄중간\t탭뒤\rCR뒤\n줄끝' });

    // When the HWPX section is generated
    const { section, sectionXml } = await unpackHwpx(plan);

    // Then line and tab boundaries remain explicit without dropping surrounding text
    expect(elements(section, 'hp:lineBreak')).toHaveLength(3);
    expect(elements(section, 'hp:tab')).toHaveLength(1);
    for (const text of ['줄시작', '줄중간', '탭뒤', 'CR뒤', '줄끝']) expect(sectionXml).toContain(text);
});
