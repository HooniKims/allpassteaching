import { buildDocumentModel } from './document-model.js';
import { buildHwpxPackage } from './hwpx-package.js';
import { HWPX_STYLE, paragraphXml, tableXml } from './hwpx-style.js';

const OVERVIEW_WIDTHS = [7087, 14173, 7087, 14173];
const PROCESS_WIDTHS = [5500, 9000, 23020, 5000];
const ASSESSMENT_WIDTHS = [8504, 8504, 11339, 14173];
const LONG_OVERVIEW_KEYS = new Set(['unitTitle', 'lessonTitle', 'standards', 'learningGoals', 'essentialQuestion', 'materials']);
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
const labelParagraph = text => ({ text, charPrIDRef: HWPX_STYLE.char.tableHeader, paraPrIDRef: HWPX_STYLE.para.left });
const headerParagraph = text => ({ text, charPrIDRef: HWPX_STYLE.char.tableHeader, paraPrIDRef: HWPX_STYLE.para.center });

function labelCell(label, width) {
    return { width, verticalAlign: 'CENTER', borderFillIDRef: HWPX_STYLE.border.label, paragraphs: [headerParagraph(label)] };
}

function valueCell(paragraphs, width, colSpan = 1) {
    return { width, colSpan, borderFillIDRef: HWPX_STYLE.border.body, paragraphs };
}

function overviewParagraphs(row) {
    switch (row.key) {
        case 'standards':
            return row.value.map(({ code, text }) => bodyParagraph(`[${code}] ${text}`));
        case 'learningGoals':
            return row.value.map((goal, index) => bodyParagraph(`${index + 1}. ${goal}`));
        case 'materials':
            return [bodyParagraph(row.value.join(', '))];
        default:
            return [CENTERED_OVERVIEW_KEYS.has(row.key) ? centeredParagraph(row.value) : bodyParagraph(row.value)];
    }
}

function overviewTable(ids, overview) {
    const rows = [];
    let pending = null;
    const flushPending = () => {
        if (!pending) return;
        rows.push([
            labelCell(pending.label, OVERVIEW_WIDTHS[0]), valueCell(overviewParagraphs(pending), OVERVIEW_WIDTHS[1]),
            labelCell('', OVERVIEW_WIDTHS[2]), valueCell([bodyParagraph('')], OVERVIEW_WIDTHS[3]),
        ]);
        pending = null;
    };
    for (const row of overview.rows) {
        if (LONG_OVERVIEW_KEYS.has(row.key)) {
            flushPending();
            rows.push([labelCell(row.label, OVERVIEW_WIDTHS[0]), valueCell(overviewParagraphs(row), 35433, 3)]);
        } else if (pending) {
            rows.push([
                labelCell(pending.label, OVERVIEW_WIDTHS[0]), valueCell(overviewParagraphs(pending), OVERVIEW_WIDTHS[1]),
                labelCell(row.label, OVERVIEW_WIDTHS[2]), valueCell(overviewParagraphs(row), OVERVIEW_WIDTHS[3]),
            ]);
            pending = null;
        } else {
            pending = row;
        }
    }
    flushPending();
    return tableXml(ids, { columnWidths: OVERVIEW_WIDTHS, rows });
}

function tableHeader(columns, widths) {
    return columns.map((column, index) => ({
        width: widths[index], header: true, verticalAlign: 'CENTER', borderFillIDRef: HWPX_STYLE.border.header,
        paragraphs: [headerParagraph(column.label)],
    }));
}

function blockParagraphs(blocks) {
    return blocks.flatMap(block => [labelParagraph(block.label), ...block.items.map(item => bodyParagraph(`• ${item}`))]);
}

function processTable(ids, process) {
    const columns = [
        { label: '단계' },
        { label: '학습 요소' },
        { label: '교수·학습 활동' },
        { label: '시간' },
    ];
    const rows = [tableHeader(columns, PROCESS_WIDTHS)];
    for (const row of process.rows) {
        rows.push([
            valueCell([headerParagraph(row.phase)], PROCESS_WIDTHS[0]),
            valueCell([bodyParagraph(row.learningElement)], PROCESS_WIDTHS[1]),
            valueCell([
                ...blockParagraphs(row.teacherActivity),
                ...blockParagraphs(row.studentActivity),
                ...blockParagraphs(row.notes),
            ], PROCESS_WIDTHS[2]),
            valueCell([centeredParagraph(`${row.minutes}분`)], PROCESS_WIDTHS[3]),
        ]);
    }
    return tableXml(ids, { columnWidths: PROCESS_WIDTHS, rows });
}

function assessmentTable(ids, assessment) {
    const rows = [tableHeader(assessment.columns, ASSESSMENT_WIDTHS)];
    for (const row of assessment.rows) {
        const feedback = [labelParagraph('공통 피드백'), bodyParagraph(row.feedback)];
        for (const item of row.levelFeedback) {
            feedback.push(labelParagraph(LEVEL_LABELS[item.key]), bodyParagraph(item.text));
        }
        rows.push([
            valueCell([bodyParagraph(row.element)], ASSESSMENT_WIDTHS[0]),
            valueCell([bodyParagraph(row.method)], ASSESSMENT_WIDTHS[1]),
            valueCell([bodyParagraph(row.evidence)], ASSESSMENT_WIDTHS[2]),
            valueCell(feedback, ASSESSMENT_WIDTHS[3]),
        ]);
    }
    return tableXml(ids, { columnWidths: ASSESSMENT_WIDTHS, rows });
}

function sectionHeading(ids, text) {
    return paragraphXml(ids, text, { charPrIDRef: HWPX_STYLE.char.section, paraPrIDRef: HWPX_STYLE.para.section });
}

function sessionXml(ids, documentTitle, session) {
    const parts = [];
    if (session.pageBreakBefore) parts.push(paragraphXml(ids, '', { pageBreak: true }));
    parts.push(
        paragraphXml(ids, documentTitle, { charPrIDRef: HWPX_STYLE.char.title, paraPrIDRef: HWPX_STYLE.para.title }),
        paragraphXml(ids, `${session.order}차시 · ${session.title} (${session.sessionMinutes}분)`, { charPrIDRef: HWPX_STYLE.char.section, paraPrIDRef: HWPX_STYLE.para.title }),
        sectionHeading(ids, '수업 개요'),
        overviewTable(ids, session.overview),
        sectionHeading(ids, '교수·학습 과정'),
        processTable(ids, session.process),
        paragraphXml(ids, '', { pageBreak: true }),
        sectionHeading(ids, '과정중심평가'),
        assessmentTable(ids, session.assessment),
        sectionHeading(ids, '개별화·지원 전략'),
        ...session.supportStrategies.map(item => paragraphXml(ids, `• ${item}`)),
        sectionHeading(ids, '수업 후 성찰'),
        paragraphXml(ids, session.reflectionPrompt),
        sectionHeading(ids, session.connectionLabel),
        paragraphXml(ids, session.nextSessionConnection),
    );
    return parts.join('\n');
}

function buildSectionXml(baseSection, model) {
    const ids = createIdAllocator();
    const content = model.sessions.map(session => sessionXml(ids, model.documentTitle, session)).join('\n');
    return baseSection.replace('</hs:sec>', `${content}\n</hs:sec>`);
}

export async function buildHwpx(plan) {
    const model = buildDocumentModel(plan);
    return buildHwpxPackage(baseSection => buildSectionXml(baseSection, model));
}
