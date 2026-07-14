import {
    AlignmentType,
    BorderStyle,
    Packer,
    PageBreak,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    Tab,
    TextRun,
    VerticalAlign,
    WidthType,
} from 'docx';
import { buildDocumentModel } from './document-model.js';
import { CONTENT_WIDTH, GREEN, INK, PAPERLOGY, createFormalDocument } from './docx-format.js';

const HEADER_FILL = 'DDE9E1';
const LABEL_FILL = 'EDF3EF';
const BORDER_COLOR = '91A99A';
const OVERVIEW_WIDTHS = [1250, 3739, 1250, 3739];
const PROCESS_WIDTHS = [650, 1050, 2300, 2200, 550, 1900, 1328];
const ASSESSMENT_WIDTHS = [1700, 1700, 1900, 4678];
const UNIT_SEQUENCE_WIDTHS = [900, 1900, 3500, 3678];
const LONG_OVERVIEW_KEYS = new Set(['unitTitle', 'lessonTitle', 'standards', 'learningGoals', 'essentialQuestion', 'materials']);
// Stable feedback keys map to the formal DOCX presentation labels required by the output format.
const LEVEL_LABELS = { needsSupport: '보충', meets: '도달', exceeds: '심화' };
const BORDER = { style: BorderStyle.SINGLE, color: BORDER_COLOR, size: 6 };
const TABLE_BORDERS = {
    top: BORDER,
    bottom: BORDER,
    left: BORDER,
    right: BORDER,
    insideHorizontal: BORDER,
    insideVertical: BORDER,
};

function sanitizeDocxText(value) {
    let sanitized = '';
    for (const character of String(value)) {
        const codePoint = character.codePointAt(0);
        const isXml10Character = codePoint === 0x9 || codePoint === 0xA || codePoint === 0xD
            || (codePoint >= 0x20 && codePoint <= 0xD7FF)
            || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
            || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
        sanitized += isXml10Character ? character : '\uFFFD';
    }
    return sanitized;
}

function textRuns(text, options) {
    const properties = {
        font: PAPERLOGY,
        size: options.size ?? 18,
        bold: options.bold ?? false,
        color: options.color ?? INK,
    };
    const runs = sanitizeDocxText(text).split(/(\r\n|\r|\n|\t)/).filter(Boolean).map(token => {
        if (token === '\t') return new TextRun({ ...properties, children: [new Tab()] });
        if (/^(?:\r\n|\r|\n)$/.test(token)) return new TextRun({ ...properties, break: 1 });
        return new TextRun({ ...properties, text: token });
    });
    return runs.length ? runs : [new TextRun({ ...properties, text: sanitizeDocxText('') })];
}

function textParagraph(text = '', options = {}) {
    return new Paragraph({
        alignment: options.alignment,
        spacing: { before: options.before ?? 0, after: options.after ?? 40, line: options.line ?? 260 },
        children: textRuns(text, options),
    });
}

function titleParagraph(text) {
    return textParagraph(text, { alignment: AlignmentType.CENTER, bold: true, color: GREEN, size: 32, after: 100 });
}

function sectionHeading(text) {
    return textParagraph(text, { bold: true, color: GREEN, size: 22, before: 100, after: 70 });
}

function pageBreakParagraph() {
    return new Paragraph({ children: [new PageBreak()] });
}

function tableCell(children, options = {}) {
    return new TableCell({
        children: children.length ? children : [textParagraph('')],
        width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
        columnSpan: options.columnSpan,
        verticalAlign: VerticalAlign.CENTER,
        shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR } : undefined,
        margins: { top: 75, bottom: 75, left: 90, right: 90 },
    });
}

function labelCell(label, width) {
    return tableCell([textParagraph(label, { bold: true, color: GREEN, alignment: AlignmentType.CENTER })], { width, fill: LABEL_FILL });
}

function fixedTable(rows, columnWidths) {
    return new Table({
        rows,
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths,
        layout: TableLayoutType.FIXED,
        borders: TABLE_BORDERS,
        margins: { top: 50, bottom: 50, left: 60, right: 60 },
    });
}

function overviewValueParagraphs(row) {
    switch (row.key) {
        case 'standards':
            return row.value.map(({ code, text, subject }) => textParagraph(`${subject ? `[${subject}] ` : ''}[${code}] ${text}`));
        case 'learningGoals':
            return row.value.map((goal, index) => textParagraph(`${index + 1}. ${goal}`));
        case 'materials':
            return [textParagraph(row.value.join(', '))];
        default:
            return [textParagraph(row.value)];
    }
}

function overviewTable(overview) {
    const rows = [];
    let pendingRow = null;
    const pushPairedRow = () => {
        if (!pendingRow) return;
        rows.push(new TableRow({ children: [
            labelCell(pendingRow.label, OVERVIEW_WIDTHS[0]),
            tableCell(overviewValueParagraphs(pendingRow), { width: OVERVIEW_WIDTHS[1] }),
            labelCell('', OVERVIEW_WIDTHS[2]),
            tableCell([textParagraph('')], { width: OVERVIEW_WIDTHS[3] }),
        ] }));
        pendingRow = null;
    };

    for (const row of overview.rows) {
        if (LONG_OVERVIEW_KEYS.has(row.key)) {
            pushPairedRow();
            rows.push(new TableRow({ cantSplit: true, children: [
                labelCell(row.label, OVERVIEW_WIDTHS[0]),
                tableCell(overviewValueParagraphs(row), { width: CONTENT_WIDTH - OVERVIEW_WIDTHS[0], columnSpan: 3 }),
            ] }));
        } else if (pendingRow) {
            rows.push(new TableRow({ cantSplit: true, children: [
                labelCell(pendingRow.label, OVERVIEW_WIDTHS[0]),
                tableCell(overviewValueParagraphs(pendingRow), { width: OVERVIEW_WIDTHS[1] }),
                labelCell(row.label, OVERVIEW_WIDTHS[2]),
                tableCell(overviewValueParagraphs(row), { width: OVERVIEW_WIDTHS[3] }),
            ] }));
            pendingRow = null;
        } else {
            pendingRow = row;
        }
    }
    pushPairedRow();
    return fixedTable(rows, OVERVIEW_WIDTHS);
}

function headerRow(columns, widths) {
    return new TableRow({
        cantSplit: true,
        tableHeader: true,
        children: columns.map((column, index) => tableCell([
            textParagraph(column.label, { bold: true, color: GREEN, alignment: AlignmentType.CENTER }),
        ], { width: widths[index], fill: HEADER_FILL })),
    });
}

function labeledBlocks(blocks) {
    return blocks.flatMap(block => [
        textParagraph(block.label, { bold: true, color: GREEN }),
        ...block.items.map(item => textParagraph(`• ${item}`)),
    ]);
}

function processTable(process) {
    const rows = [headerRow(process.columns, PROCESS_WIDTHS)];
    for (const row of process.rows) {
        rows.push(new TableRow({ children: [
            tableCell([textParagraph(row.phase, { bold: true, alignment: AlignmentType.CENTER })], { width: PROCESS_WIDTHS[0] }),
            tableCell([textParagraph(row.learningElement)], { width: PROCESS_WIDTHS[1] }),
            tableCell(labeledBlocks(row.teacherActivity), { width: PROCESS_WIDTHS[2] }),
            tableCell(labeledBlocks(row.studentActivity), { width: PROCESS_WIDTHS[3] }),
            tableCell([textParagraph(`${row.minutes}분`, { alignment: AlignmentType.CENTER })], { width: PROCESS_WIDTHS[4] }),
            tableCell(labeledBlocks(row.notes), { width: PROCESS_WIDTHS[5] }),
            tableCell(labeledBlocks(row.remarks), { width: PROCESS_WIDTHS[6] }),
        ] }));
    }
    return fixedTable(rows, PROCESS_WIDTHS);
}

function feedbackParagraphs(row) {
    return [
        textParagraph('공통 피드백', { bold: true, color: GREEN }),
        textParagraph(row.feedback),
        ...row.levelFeedback.flatMap(item => [
            textParagraph(LEVEL_LABELS[item.key], { bold: true, color: GREEN }),
            textParagraph(item.text),
        ]),
    ];
}

function assessmentTable(assessment) {
    const rows = [headerRow(assessment.columns, ASSESSMENT_WIDTHS)];
    for (const row of assessment.rows) {
        rows.push(new TableRow({ cantSplit: true, children: [
            tableCell([textParagraph(row.element)], { width: ASSESSMENT_WIDTHS[0] }),
            tableCell([textParagraph(row.method)], { width: ASSESSMENT_WIDTHS[1] }),
            tableCell([textParagraph(row.evidence)], { width: ASSESSMENT_WIDTHS[2] }),
            tableCell(feedbackParagraphs(row), { width: ASSESSMENT_WIDTHS[3] }),
        ] }));
    }
    return fixedTable(rows, ASSESSMENT_WIDTHS);
}

function unitSequenceTable(items) {
    const columns = [
        { label: '차시' },
        { label: '주제' },
        { label: '학습 목표' },
        { label: '지도·평가 중점' },
    ];
    const rows = [headerRow(columns, UNIT_SEQUENCE_WIDTHS)];
    for (const item of items) rows.push(new TableRow({ children: [
        tableCell([textParagraph(item.session, { alignment: AlignmentType.CENTER })], { width: UNIT_SEQUENCE_WIDTHS[0] }),
        tableCell([textParagraph(item.topic)], { width: UNIT_SEQUENCE_WIDTHS[1] }),
        tableCell([textParagraph(item.learningGoal)], { width: UNIT_SEQUENCE_WIDTHS[2] }),
        tableCell([textParagraph(item.focus)], { width: UNIT_SEQUENCE_WIDTHS[3] }),
    ] }));
    return fixedTable(rows, UNIT_SEQUENCE_WIDTHS);
}

function detailedPlanChildren(documentTitle, detail) {
    return [
        titleParagraph(`${documentTitle} · 세안`),
        sectionHeading('수업자 의도 및 지도 중점'),
        textParagraph(detail.teacherIntent),
        sectionHeading('단원 개관'),
        textParagraph(detail.unitOverview),
        sectionHeading('단원 목표'),
        ...detail.unitGoals.map((item, index) => textParagraph(`${index + 1}. ${item}`)),
        sectionHeading('학습자 분석 및 지도 대책'),
        textParagraph(detail.learnerAnalysis),
        sectionHeading('수업 모형·설계 틀 적용 전략'),
        textParagraph(detail.teachingStrategy),
        sectionHeading('단원 지도 계획'),
        unitSequenceTable(detail.unitSequence),
        sectionHeading('판서·화면 및 자료 활용 계획'),
        ...detail.boardPlan.map(item => textParagraph(`• ${item}`)),
        sectionHeading('참고 자료'),
        ...(detail.references.length ? detail.references.map(item => textParagraph(`• ${item}`)) : [textParagraph('없음')]),
        pageBreakParagraph(),
    ];
}

function sessionChildren(documentTitle, session) {
    return [
        titleParagraph(documentTitle),
        textParagraph(`${session.order}차시 · ${session.title} (${session.sessionMinutes}분)`, { alignment: AlignmentType.CENTER, bold: true, size: 22, after: 120 }),
        sectionHeading('수업 개요'),
        overviewTable(session.overview),
        sectionHeading('교수·학습 과정'),
        processTable(session.process),
        pageBreakParagraph(),
        sectionHeading('과정중심평가'),
        assessmentTable(session.assessment),
        sectionHeading('개별화·지원 전략'),
        ...session.supportStrategies.map(item => textParagraph(`• ${item}`)),
        sectionHeading('수업 후 성찰'),
        textParagraph(session.reflectionPrompt),
        sectionHeading(session.connectionLabel),
        textParagraph(session.nextSessionConnection),
    ];
}

export async function buildDocx(plan, options = {}) {
    const model = buildDocumentModel(plan, { variant: options.variant });
    const children = [];
    if (model.detail) children.push(...detailedPlanChildren(model.documentTitle, model.detail));
    model.sessions.forEach((session, index) => {
        if (session.pageBreakBefore) children.push(pageBreakParagraph());
        children.push(...sessionChildren(model.documentTitle, session));
    });

    return Packer.toBuffer(createFormalDocument(children));
}
