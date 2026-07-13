import { rgb } from 'pdf-lib';

export const PAGE_SIZE = [595.28, 841.89];
export const MARGIN = 48;
export const CONTENT_WIDTH = PAGE_SIZE[0] - MARGIN * 2;
export const COLORS = {
    ink: rgb(0.15, 0.20, 0.18),
    green: rgb(0.31, 0.44, 0.36),
    headerFill: rgb(0.87, 0.91, 0.88),
    labelFill: rgb(0.93, 0.95, 0.94),
    border: rgb(0.57, 0.66, 0.60),
};

const PROCESS_WIDTHS = [50, 75, 280, CONTENT_WIDTH - 405];
const ASSESSMENT_WIDTHS = [76, 76, 94, CONTENT_WIDTH - 246];
const LEVEL_LABELS = { needsSupport: '보충', meets: '도달', exceeds: '심화' };

function labelCell(text, fonts) {
    return { text, font: fonts.bold, color: COLORS.green, fill: COLORS.labelFill, align: 'center' };
}

function overviewText(row) {
    switch (row.key) {
        case 'standards':
            return row.value.map(({ code, text }) => `[${code}] ${text}`).join('\n');
        case 'learningGoals':
            return row.value.map((goal, index) => `${index + 1}. ${goal}`).join('\n');
        case 'materials':
            return row.value.join(', ');
        default:
            return row.value;
    }
}

function tableHeader(columns, fonts) {
    return columns.map(column => ({
        text: column.label,
        font: fonts.bold,
        color: COLORS.green,
        fill: COLORS.headerFill,
        align: 'center',
    }));
}

function labeledBlocks(blocks) {
    return blocks.flatMap(block => [block.label, ...block.items.map(item => `• ${item}`)]).join('\n');
}

function feedbackText(row) {
    return [
        '공통 피드백',
        row.feedback,
        ...row.levelFeedback.flatMap(item => [LEVEL_LABELS[item.key], item.text]),
    ].join('\n');
}

export function overviewDefinition(overview, fonts) {
    return {
        id: 'overview',
        widths: [82, CONTENT_WIDTH - 82],
        rows: overview.rows.map(row => [labelCell(row.label, fonts), overviewText(row)]),
        style: { font: fonts.regular, fontSize: 8, lineHeight: 9.8, padding: 2.4, color: COLORS.ink, minimumHeight: 14.6 },
    };
}

export function processDefinition(process, fonts) {
    return {
        id: 'process',
        widths: PROCESS_WIDTHS,
        header: tableHeader([
            { label: '단계' },
            { label: '학습 요소' },
            { label: '교수·학습 활동' },
            { label: '시간' },
        ], fonts),
        headerStyle: { font: fonts.bold, fontSize: 8, lineHeight: 9.8, padding: 2.5, color: COLORS.green, minimumHeight: 20 },
        rows: process.rows.map(row => [
            { text: row.phase, font: fonts.bold, align: 'center' },
            row.learningElement,
            labeledBlocks([...row.teacherActivity, ...row.studentActivity, ...row.notes]),
            { text: `${row.minutes}분`, align: 'center' },
        ]),
        style: { font: fonts.regular, fontSize: 8, lineHeight: 9.8, padding: 2.5, color: COLORS.ink, minimumHeight: 18 },
    };
}

export function assessmentDefinition(assessment, fonts) {
    return {
        id: 'assessment',
        widths: ASSESSMENT_WIDTHS,
        header: tableHeader(assessment.columns, fonts),
        headerStyle: { font: fonts.bold, fontSize: 8, lineHeight: 9.8, padding: 3, color: COLORS.green, minimumHeight: 20 },
        rows: assessment.rows.map(row => [row.element, row.method, row.evidence, feedbackText(row)]),
        style: { font: fonts.regular, fontSize: 8, lineHeight: 10, padding: 3, color: COLORS.ink, minimumHeight: 20 },
    };
}

export function singleColumnDefinition(id, text, fonts) {
    return {
        id,
        widths: [CONTENT_WIDTH],
        rows: [[text]],
        style: { font: fonts.regular, fontSize: 8, lineHeight: 10.2, padding: 4, color: COLORS.ink, minimumHeight: 20 },
    };
}
