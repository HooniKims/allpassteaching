import { buildDocumentModel } from './document-model.js';
import { splitHwpxParagraph as splitParagraph } from './hwpx-flow.js';
import { buildHwpxPackage } from './hwpx-package.js';
import { estimatedTableRowHeight, HWPX_STYLE, paragraphXml, tableXml } from './hwpx-style.js';

const OVERVIEW_WIDTHS = [8200, 41728];
const PROCESS_WIDTHS = [3600, 6000, 12000, 12000, 3600, 7200, 5528];
const ASSESSMENT_WIDTHS = [7600, 7600, 9400, 25328];
const UNIT_SEQUENCE_WIDTHS = [5200, 9000, 18000, 17728];
const FULL_WIDTH = [49928];
const MAX_TABLE_SEGMENT_HEIGHT = 50_000;
const PAGE_CONTENT_HEIGHT = 70_000;
const DOCUMENT_HEADER_HEIGHT = 5_200;
const SECTION_HEADING_HEIGHT = 2_400;
const DEFAULT_PAGE_MARGIN = '<hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/>';
const PDF_MATCHED_PAGE_MARGIN = '<hp:margin header="4252" footer="4252" gutter="0" left="4800" right="4800" top="5668" bottom="4252"/>';
const CENTERED_OVERVIEW_KEYS = new Set([
    'date', 'place', 'className', 'teacherName', 'schoolGrade',
    'subject', 'unitTitle', 'lessonTitle', 'session', 'instructionModel',
]);
const LEVEL_LABELS = { needsSupport: '보충', meets: '도달', exceeds: '심화' };

function createIdAllocator() {
    let current = 1000000000;
    return { next: () => current++ };
}

const bodyParagraph = text => ({ text, charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left });
const centeredParagraph = text => ({ text, charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.center });
const headerParagraph = text => ({ text, charPrIDRef: HWPX_STYLE.char.tableHeader, paraPrIDRef: HWPX_STYLE.para.center });

function labelCell(label, width) {
    return { width, verticalAlign: 'CENTER', borderFillIDRef: HWPX_STYLE.border.label, paragraphs: [headerParagraph(label)] };
}

function valueCell(paragraphs, width, colSpan = 1) {
    return { width, colSpan, borderFillIDRef: HWPX_STYLE.border.body, paragraphs };
}

function flowingTableSegments(ids, definition, headerRowCount = 0, firstSegmentHeight = MAX_TABLE_SEGMENT_HEIGHT) {
    const headerRows = definition.rows.slice(0, headerRowCount);
    const bodyRows = definition.rows.slice(headerRowCount);
    const headerHeight = headerRows.reduce((total, row) => total + estimatedTableRowHeight(row), 0);
    const segments = [];
    let rows = [...headerRows];
    let height = headerHeight;
    let bodyRowCount = 0;
    let segmentHeight = firstSegmentHeight;
    for (const row of bodyRows) {
        const rowHeight = estimatedTableRowHeight(row);
        if (bodyRowCount > 0 && height + rowHeight > segmentHeight) {
            segments.push(rows);
            rows = [...headerRows];
            height = headerHeight;
            bodyRowCount = 0;
            segmentHeight = MAX_TABLE_SEGMENT_HEIGHT;
        }
        rows.push(row);
        height += rowHeight;
        bodyRowCount += 1;
    }
    if (bodyRowCount > 0 || !segments.length) segments.push(rows);
    return segments.map(segmentRows => ({
        height: segmentRows.reduce((total, row) => total + estimatedTableRowHeight(row), 0),
        xml: tableXml(ids, { ...definition, rows: segmentRows }),
    }));
}

function overviewParagraph(row) {
    switch (row.key) {
        case 'standards':
            return bodyParagraph(row.value.map(({ code, text, subject }) => `${subject ? `[${subject}] ` : ''}[${code}] ${text}`).join('\n'));
        case 'learningGoals':
            return bodyParagraph(row.value.map((goal, index) => `${index + 1}. ${goal}`).join('\n'));
        case 'materials':
            return bodyParagraph(row.value.join(', '));
        default:
            return CENTERED_OVERVIEW_KEYS.has(row.key) ? centeredParagraph(row.value) : bodyParagraph(row.value);
    }
}

function overviewTable(ids, overview) {
    const rows = overview.rows.flatMap(row => splitParagraph(overviewParagraph(row), OVERVIEW_WIDTHS[1]).map((paragraph, index) => [
        labelCell(index === 0 ? row.label : '', OVERVIEW_WIDTHS[0]),
        valueCell([paragraph], OVERVIEW_WIDTHS[1]),
    ]));
    return flowingTableSegments(ids, { columnWidths: OVERVIEW_WIDTHS, rows });
}

function tableHeader(columns, widths) {
    return columns.map((column, index) => ({
        width: widths[index], header: true, verticalAlign: 'CENTER', borderFillIDRef: HWPX_STYLE.border.header,
        paragraphs: [headerParagraph(column.label)],
    }));
}

function blockText(blocks) {
    return blocks.filter(block => block.items.length).flatMap(block => [block.label, ...block.items.map(item => `• ${item}`)]).join('\n');
}

function processTable(ids, process, firstSegmentHeight) {
    const rows = [tableHeader(process.columns, PROCESS_WIDTHS)];
    for (const row of process.rows) {
        const paragraphColumns = [
            [headerParagraph(row.phase)],
            splitParagraph(bodyParagraph(row.learningElement), PROCESS_WIDTHS[1]),
            splitParagraph(bodyParagraph(blockText(row.teacherActivity)), PROCESS_WIDTHS[2]),
            splitParagraph(bodyParagraph(blockText(row.studentActivity)), PROCESS_WIDTHS[3]),
            [centeredParagraph(`${row.minutes}분`)],
            splitParagraph(bodyParagraph(blockText(row.notes)), PROCESS_WIDTHS[5]),
            splitParagraph(bodyParagraph(blockText(row.remarks)), PROCESS_WIDTHS[6]),
        ];
        const rowCount = Math.max(...paragraphColumns.map(paragraphs => paragraphs.length));
        for (let index = 0; index < rowCount; index += 1) {
            rows.push(paragraphColumns.map((paragraphs, columnIndex) => valueCell(
                [paragraphs[index] ?? bodyParagraph('')],
                PROCESS_WIDTHS[columnIndex],
            )));
        }
    }
    return flowingTableSegments(ids, { columnWidths: PROCESS_WIDTHS, rows }, 1, firstSegmentHeight);
}

function assessmentTable(ids, assessment) {
    const rows = [tableHeader(assessment.columns, ASSESSMENT_WIDTHS)];
    for (const row of assessment.rows) {
        const feedback = ['공통 피드백', row.feedback];
        for (const item of row.levelFeedback) {
            feedback.push(LEVEL_LABELS[item.key], item.text);
        }
        const paragraphColumns = [
            splitParagraph(bodyParagraph(row.element), ASSESSMENT_WIDTHS[0]),
            splitParagraph(bodyParagraph(row.method), ASSESSMENT_WIDTHS[1]),
            splitParagraph(bodyParagraph(row.evidence), ASSESSMENT_WIDTHS[2]),
            splitParagraph(bodyParagraph(feedback.join('\n')), ASSESSMENT_WIDTHS[3]),
        ];
        const rowCount = Math.max(...paragraphColumns.map(paragraphs => paragraphs.length));
        for (let index = 0; index < rowCount; index += 1) {
            rows.push(paragraphColumns.map((paragraphs, columnIndex) => valueCell(
                [paragraphs[index] ?? bodyParagraph('')],
                ASSESSMENT_WIDTHS[columnIndex],
            )));
        }
    }
    return flowingTableSegments(ids, { columnWidths: ASSESSMENT_WIDTHS, rows }, 1);
}

function unitSequenceTable(ids, items) {
    const columns = [
        { label: '차시' },
        { label: '주제' },
        { label: '학습 목표' },
        { label: '지도·평가 중점' },
    ];
    const rows = [tableHeader(columns, UNIT_SEQUENCE_WIDTHS)];
    for (const item of items) {
        const paragraphColumns = [
            splitParagraph(centeredParagraph(item.session), UNIT_SEQUENCE_WIDTHS[0]),
            splitParagraph(bodyParagraph(item.topic), UNIT_SEQUENCE_WIDTHS[1]),
            splitParagraph(bodyParagraph(item.learningGoal), UNIT_SEQUENCE_WIDTHS[2]),
            splitParagraph(bodyParagraph(item.focus), UNIT_SEQUENCE_WIDTHS[3]),
        ];
        const rowCount = Math.max(...paragraphColumns.map(paragraphs => paragraphs.length));
        for (let index = 0; index < rowCount; index += 1) {
            rows.push(paragraphColumns.map((paragraphs, columnIndex) => valueCell(
                [paragraphs[index] ?? bodyParagraph('')],
                UNIT_SEQUENCE_WIDTHS[columnIndex],
            )));
        }
    }
    return flowingTableSegments(ids, { columnWidths: UNIT_SEQUENCE_WIDTHS, rows }, 1);
}

function fullWidthTable(ids, text) {
    return flowingTableSegments(ids, {
        columnWidths: FULL_WIDTH,
        rows: splitParagraph(bodyParagraph(text), FULL_WIDTH[0]).map(paragraph => [
            valueCell([paragraph], FULL_WIDTH[0]),
        ]),
    });
}

function sectionHeading(ids, text) {
    return paragraphXml(ids, text, { charPrIDRef: HWPX_STYLE.char.section, paraPrIDRef: HWPX_STYLE.para.section });
}

function startNewPage(parts, ids, layout) {
    if (!layout.usedHeight) return;
    parts.push(paragraphXml(ids, '', { pageBreak: true }));
    layout.usedHeight = 0;
}

function appendTableSection(parts, ids, layout, title, segments, options = {}) {
    if (options.forceNewPage) startNewPage(parts, ids, layout);
    for (const [index, segment] of segments.entries()) {
        const requiredHeight = SECTION_HEADING_HEIGHT + segment.height;
        if (layout.usedHeight && layout.usedHeight + requiredHeight > PAGE_CONTENT_HEIGHT) startNewPage(parts, ids, layout);
        parts.push(sectionHeading(ids, index === 0 ? title : `${title} (계속)`), segment.xml);
        layout.usedHeight += requiredHeight;
    }
}

function sessionXml(ids, documentTitle, session) {
    const parts = [];
    const layout = { usedHeight: 0 };
    if (session.pageBreakBefore) parts.push(paragraphXml(ids, '', { pageBreak: true }));
    parts.push(
        paragraphXml(ids, documentTitle, { charPrIDRef: HWPX_STYLE.char.title, paraPrIDRef: HWPX_STYLE.para.title }),
        paragraphXml(ids, `${session.order}차시 · ${session.title} (${session.sessionMinutes}분)`, { charPrIDRef: HWPX_STYLE.char.section, paraPrIDRef: HWPX_STYLE.para.title }),
    );
    layout.usedHeight = DOCUMENT_HEADER_HEIGHT;
    appendTableSection(parts, ids, layout, '수업 개요', overviewTable(ids, session.overview));
    const remainingFirstPageHeight = PAGE_CONTENT_HEIGHT - layout.usedHeight - SECTION_HEADING_HEIGHT;
    appendTableSection(parts, ids, layout, '교수·학습 과정', processTable(ids, session.process, remainingFirstPageHeight));
    appendTableSection(parts, ids, layout, '과정중심평가', assessmentTable(ids, session.assessment), { forceNewPage: true });
    appendTableSection(parts, ids, layout, '개별화·지원 전략', fullWidthTable(ids, session.supportStrategies.map(item => `• ${item}`).join('\n')));
    appendTableSection(parts, ids, layout, '수업 후 성찰', fullWidthTable(ids, session.reflectionPrompt));
    appendTableSection(parts, ids, layout, session.connectionLabel, fullWidthTable(ids, session.nextSessionConnection));
    return parts.join('\n');
}

function detailedPlanXml(ids, documentTitle, detail) {
    const parts = [paragraphXml(ids, `${documentTitle} · 세안`, { charPrIDRef: HWPX_STYLE.char.title, paraPrIDRef: HWPX_STYLE.para.title })];
    const layout = { usedHeight: DOCUMENT_HEADER_HEIGHT };
    appendTableSection(parts, ids, layout, '수업자 의도 및 지도 중점', fullWidthTable(ids, detail.teacherIntent));
    appendTableSection(parts, ids, layout, '단원 개관', fullWidthTable(ids, detail.unitOverview));
    appendTableSection(parts, ids, layout, '단원 목표', fullWidthTable(ids, detail.unitGoals.map((item, index) => `${index + 1}. ${item}`).join('\n')));
    appendTableSection(parts, ids, layout, '학습자 분석 및 지도 대책', fullWidthTable(ids, detail.learnerAnalysis));
    appendTableSection(parts, ids, layout, '수업 모형·설계 틀 적용 전략', fullWidthTable(ids, detail.teachingStrategy));
    appendTableSection(parts, ids, layout, '단원 지도 계획', unitSequenceTable(ids, detail.unitSequence));
    appendTableSection(parts, ids, layout, '판서·화면 및 자료 활용 계획', fullWidthTable(ids, detail.boardPlan.map(item => `• ${item}`).join('\n')));
    appendTableSection(parts, ids, layout, '참고 자료', fullWidthTable(ids, detail.references.length ? detail.references.map(item => `• ${item}`).join('\n') : '없음'));
    parts.push(paragraphXml(ids, '', { pageBreak: true }));
    return parts.join('\n');
}

function buildSectionXml(baseSection, model) {
    const ids = createIdAllocator();
    const content = [
        model.detail ? detailedPlanXml(ids, model.documentTitle, model.detail) : '',
        model.sessions.map(session => sessionXml(ids, model.documentTitle, session)).join('\n'),
    ].filter(Boolean).join('\n');
    if (!baseSection.includes(DEFAULT_PAGE_MARGIN)) throw new Error('HWPX template page margin structure is invalid');
    return baseSection
        .replace(DEFAULT_PAGE_MARGIN, PDF_MATCHED_PAGE_MARGIN)
        .replace('</hs:sec>', `${content}\n</hs:sec>`);
}

export async function buildHwpx(plan, options = {}) {
    const model = buildDocumentModel(plan, { variant: options.variant });
    return buildHwpxPackage(baseSection => buildSectionXml(baseSection, model));
}
