import JSZip from 'jszip';
import { expect, test } from 'vitest';
import { buildHwpx } from '@/lib/export/hwpx';
import { buildSimpleHwpx } from '@/lib/export/simple-hwpx';
import { makeGeneratedPlan, makeTwoSessionPlan } from './fixtures/lesson-plan.mjs';

const OVERVIEW_WIDTHS = [8200, 41728];
const PROCESS_WIDTHS = [3600, 6000, 12000, 12000, 3600, 7200, 5528];
const ASSESSMENT_WIDTHS = [7600, 7600, 9400, 25328];
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

async function unpackHwpx(plan, builder = buildHwpx) {
    const bytes = await builder(plan);
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
const height = cell => Number(children(cell, 'hp:cellSz')[0].getAttribute('height'));
const span = cell => children(cell, 'hp:cellSpan')[0];
const address = cell => children(cell, 'hp:cellAddr')[0];
const cellMargin = cell => children(cell, 'hp:cellMargin')[0];
const tableWidths = table => cells(rows(table)[0]).map(width);

function expectExactGrid(table, expectedWidths) {
    for (const [rowIndex, row] of rows(table).entries()) {
        const rowCells = cells(row);
        expect(rowCells.map(width), `row ${rowIndex} widths`).toEqual(expectedWidths);
        expect(rowCells.reduce((sum, cell) => sum + width(cell), 0)).toBe(expectedWidths.reduce((sum, value) => sum + value, 0));
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

test('builds simple two-column HWPX tables while keeping the core lesson content', async () => {
    // Given a complete lesson plan that needs a layout-safe but structured alternative
    const plan = makeGeneratedPlan();

    // When the simple HWPX builder creates a document
    const { section, sectionXml } = await unpackHwpx(plan, buildSimpleHwpx);

    // Then the package uses small two-column tables without stale layout caches or complex cell merging
    const tables = elements(section, 'hp:tbl');
    expect(tables).toHaveLength(4);
    for (const table of tables) expectExactGrid(table, [8504, 34016]);
    expect(sectionXml).not.toContain('<hp:linesegarray');
    for (const text of [
        '교수·학습 과정안', '수업 개요', '[6과11-02] 식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.',
        '1차시 · 식물 기관 관찰 (40분)', '교사 활동', '• 문제 인식: 질문을 제시한다.', '학생 활동', '• 문제 인식: 관찰할 문제를 확인한다.',
        '과정중심평가', '관찰 결과 설명', '관찰 및 산출물 확인', '관찰 증거: 관찰 기록지', '수업 후 성찰', '학생이 증거를 바탕으로 설명했는가?',
    ]) expect(section.documentElement.textContent).toContain(text);
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
    ['one session', makeGeneratedPlan(), 7],
    ['two sessions', makeTwoSessionPlan(), 14],
])('renders PDF-matched OWPML table segments per session for %s', async (_label, plan, expectedTableCount) => {
    // Given one or more structured lesson sessions
    // When the section XML is generated
    const { section } = await unpackHwpx(plan);

    // Then each session has overview, page-safe process segments, assessment, support, reflection, and connection tables
    expect(elements(section, 'hp:tbl')).toHaveLength(expectedTableCount);
});

test.each([
    ['one session', makeGeneratedPlan(), 2],
    ['two sessions', makeTwoSessionPlan(), 5],
])('adds explicit safe page boundaries for %s', async (_label, plan, expectedPageBreaks) => {
    // Given a document with two logical portions per session
    // When its section paragraphs are inspected
    const { section } = await unpackHwpx(plan);

    // Then oversized first-page sections, assessment sections, and adjacent sessions have explicit page-break paragraphs
    expect(elements(section, 'hp:p').filter(paragraph => paragraph.getAttribute('pageBreak') === '1')).toHaveLength(expectedPageBreaks);
});

test('renders a readable seven-column process table with separate student activity and remarks', async () => {
    // Given one session containing three instructional stages
    // When its process table is inspected
    const { section } = await unpackHwpx(makeGeneratedPlan());
    const processTables = elements(section, 'hp:tbl').filter(table => tableWidths(table).join(',') === PROCESS_WIDTHS.join(','));

    // Then teacher activity, student activity, notes, and remarks remain independent while dimensions and pagination controls stay exact across segments
    expect(processTables.length).toBeGreaterThanOrEqual(2);
    expect(processTables.reduce((total, table) => total + rows(table).length - 1, 0)).toBeGreaterThanOrEqual(3);
    for (const processTable of processTables) {
        expect(processTable.getAttribute('colCnt')).toBe('7');
        expect(processTable.getAttribute('pageBreak')).toBe('CELL');
        expect(processTable.getAttribute('repeatHeader')).toBe('1');
        expectExactGrid(processTable, PROCESS_WIDTHS);
    }
    expect(rows(processTables[0])[0].textContent).toContain('학생 활동');
    expect(rows(processTables[0])[0].textContent).toContain('비고');
    for (const cell of processTables.flatMap(rows).flatMap(cells)) {
        expect(cellMargin(cell).getAttribute('left')).toBe('120');
        expect(cellMargin(cell).getAttribute('right')).toBe('120');
        expect(cellMargin(cell).getAttribute('top')).toBe('160');
        expect(cellMargin(cell).getAttribute('bottom')).toBe('160');
    }
});

test('renders the exact four-column assessment table grid with common and level feedback', async () => {
    // Given a plan with one assessment row
    // When its assessment table is inspected
    const { section, sectionXml } = await unpackHwpx(makeGeneratedPlan());
    const assessmentTable = elements(section, 'hp:tbl').find(table => tableWidths(table).join(',') === ASSESSMENT_WIDTHS.join(','));

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
        '교수·학습 과정안', '수업 개요', '교수·학습 과정', '과정중심평가', '개별화·지원 전략', '수업 후 성찰', '후속 학습 및 정리',
        '단계', '학습 요소', '교사 활동', '학생 활동', '시간', '자료·유의점', '주요 발문', '예상 학생 반응', '지원',
        '평가 요소', '평가 방법', '관찰 증거', '수준별 피드백', '[6과11-02] 식물 기관 &amp; 기능의 관계를 정확히 설명한다.',
        '다음 차시에는 뿌리와 잎의 기능을 비교한다.',
    ]) expect(sectionXml).toContain(text);
});

test('preserves the edited lesson title and common connection labels in section XML', async () => {
    // Given
    const plan = makeTwoSessionPlan();
    plan.title = 'HWPX-편집수업제목-센티널';
    plan.sessions[0].nextSessionConnection = 'HWPX-다음차시-센티널';
    plan.sessions[1].nextSessionConnection = 'HWPX-후속정리-센티널';

    // When
    const { sectionXml } = await unpackHwpx(plan);

    // Then
    for (const text of [
        '수업 제목', 'HWPX-편집수업제목-센티널',
        '다음 차시 연결', 'HWPX-다음차시-센티널',
        '후속 학습 및 정리', 'HWPX-후속정리-센티널',
    ]) expect(sectionXml).toContain(text);
    expect(sectionXml).not.toContain('수업 후 연계');
    expect(sectionXml).not.toContain('다음 학습 연결');
});

test('renders the ordered PDF-style two-column overview with blank metadata', async () => {
    // Given intentionally blank metadata and distinct ordered overview values
    const base = makeGeneratedPlan();
    const plan = makeGeneratedPlan({
        metadata: { date: '', place: '', className: '', teacherName: '' },
        subject: '순서과목',
        unitTitle: '순서단원',
        title: '순서수업제목',
        standards: [{ code: '순서-기준', text: '순서 성취기준 문장' }],
        learningGoals: ['순서 학습목표'],
        essentialQuestion: '순서 핵심 질문?',
        materials: ['순서 준비물'],
        instructionModel: { ...base.instructionModel, name: '순서 수업모형' },
    });

    // When the overview table is inspected
    const { section } = await unpackHwpx(plan);
    const overview = elements(section, 'hp:tbl').find(table => tableWidths(table).join(',') === OVERVIEW_WIDTHS.join(','));
    const overviewRows = rows(overview);

    // Then every field gets the same label/value grid used by the PDF overview
    expect(overview.getAttribute('colCnt')).toBe('2');
    expect(overviewRows).toHaveLength(14);
    expect(overviewRows.map(row => cells(row).length)).toEqual(Array(14).fill(2));
    expectExactGrid(overview, OVERVIEW_WIDTHS);
    const orderedText = overview.textContent;
    let previousIndex = -1;
    for (const value of ['일시', '장소', '대상 학급', '수업자', '초등학교 5학년', '순서과목', '순서단원', '순서수업제목', '1/1', '순서 수업모형', '순서-기준', '순서 학습목표', '순서 핵심 질문?', '순서 준비물']) {
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
    // Then title/formal table body use 18/9pt while section and table headers retain their planned sizes
    expect(charHeights).toMatchObject({ 7: '1000', 8: '1800', 9: '1200', 10: '900', 11: '900' });
    expect({
        title: usedStyle('교수·학습 과정안'),
        body: usedStyle('학생이 증거를 바탕으로 설명했는가?'),
        section: usedStyle('수업 개요'),
        tableHeader: usedStyle('단계'),
        compactTableBody: usedStyle('문제 인식 · 가설 설정'),
    }).toEqual({ title: '8', body: '11', section: '9', tableHeader: '10', compactTableBody: '11' });
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
    const values = Object.fromEntries(['교사활동', '주요발문', '학생활동', '예상반응', '자료유의점', '지원', '비고', '공통피드백', '보충피드백', '도달피드백', '심화피드백', '다음연결'].map(name => [name, sentinel(name)]));
    const base = makeGeneratedPlan();
    const plan = makeGeneratedPlan({
        sessions: [{ ...base.sessions[0], nextSessionConnection: values.다음연결, stages: [{
            ...base.sessions[0].stages[0],
            teacherActivities: [values.교사활동], teacherQuestions: [values.주요발문],
            studentActivities: [values.학생활동], expectedStudentResponses: [values.예상반응],
            materialsAndNotes: [values.자료유의점], supportNotes: [values.지원], remarks: [values.비고],
        }] }],
        assessment: [{ ...base.assessment[0], feedback: values.공통피드백, levelFeedback: {
            needsSupport: values.보충피드백, meets: values.도달피드백, exceeds: values.심화피드백,
        } }],
    });

    // When the HWPX section is generated
    const { section } = await unpackHwpx(plan);

    // Then every exact sentinel remains in its logical column even when a very long cell is split across safe continuation rows
    const textOf = element => elements(element, 'hp:t').map(node => node.textContent).join('');
    const tables = elements(section, 'hp:tbl');
    const processTables = tables.filter(table => tableWidths(table).join(',') === PROCESS_WIDTHS.join(','));
    const assessmentTables = tables.filter(table => tableWidths(table).join(',') === ASSESSMENT_WIDTHS.join(','));
    const processRows = processTables.flatMap(table => rows(table).slice(1));
    const processColumnText = columnIndex => processRows.map(row => textOf(cells(row)[columnIndex])).join('');
    const assessmentFeedbackText = assessmentTables.flatMap(table => rows(table).slice(1)).map(row => textOf(cells(row)[3])).join('');
    const connectionText = textOf(tables.at(-1));
    for (const key of ['교사활동', '주요발문']) expect(processColumnText(2)).toContain(values[key]);
    for (const key of ['학생활동', '예상반응']) expect(processColumnText(3)).toContain(values[key]);
    for (const key of ['자료유의점', '지원']) expect(processColumnText(5)).toContain(values[key]);
    expect(processColumnText(6)).toContain(values.비고);
    for (const key of ['공통피드백', '보충피드백', '도달피드백', '심화피드백']) {
        expect(assessmentFeedbackText).toContain(values[key]);
    }
    expect(connectionText).toContain(values.다음연결);
});

test('expands HWPX rows from their paragraph content and sizes each table to the row-height sum', async () => {
    const { section } = await unpackHwpx(makeGeneratedPlan());
    const processTables = elements(section, 'hp:tbl').filter(table => tableWidths(table).join(',') === PROCESS_WIDTHS.join(','));
    const bodyRowHeights = processTables.flatMap(table => rows(table).slice(1).map(row => height(cells(row)[0])));

    expect(new Set(bodyRowHeights).size).toBeGreaterThan(1);
    expect(bodyRowHeights.every(value => value > 2000)).toBe(true);
    for (const processTable of processTables) {
        const processRows = rows(processTable);
        const rowHeights = processRows.map(row => height(cells(row)[0]));
        const tableHeight = Number(children(processTable, 'hp:sz')[0].getAttribute('height'));
        for (const row of processRows) expect(new Set(cells(row).map(height)).size).toBe(1);
        expect(tableHeight).toBe(rowHeights.reduce((sum, value) => sum + value, 0));
    }
});

test('centers short overview values through the instruction model and keeps standards left aligned', async () => {
    const { section } = await unpackHwpx(makeGeneratedPlan({ metadata: { date: '2026-07-11', period: '3', place: '과학실', className: '5학년 1반', teacherName: '김교사' } }));
    const paragraphFor = text => {
        let element = elements(section, 'hp:t').find(node => node.textContent === text);
        while (element && element.tagName !== 'hp:p') element = element.parentElement;
        return element;
    };

    expect(paragraphFor('탐구·발견 학습').getAttribute('paraPrIDRef')).toBe('23');
    expect(paragraphFor('[과학] [6과11-02] 식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.').getAttribute('paraPrIDRef')).toBe('24');
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
