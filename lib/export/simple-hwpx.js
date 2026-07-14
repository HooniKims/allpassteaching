import { buildDocumentModel } from './document-model.js';
import { buildHwpxPackage } from './hwpx-package.js';
import { HWPX_STYLE, paragraphXml, tableXml } from './hwpx-style.js';

const SIMPLE_TABLE_WIDTHS = [8504, 34016];

function createIdAllocator() {
    let current = 1000000000;
    return { next: () => current++ };
}

const simpleBody = text => ({ text, charPrIDRef: HWPX_STYLE.char.body, paraPrIDRef: HWPX_STYLE.para.left });
const simpleHeading = (ids, text) => paragraphXml(ids, text, {
    charPrIDRef: HWPX_STYLE.char.section,
    paraPrIDRef: HWPX_STYLE.para.section,
});
const simpleTitle = (ids, text) => paragraphXml(ids, text, {
    charPrIDRef: HWPX_STYLE.char.title,
    paraPrIDRef: HWPX_STYLE.para.title,
});
const simpleSessionTitle = (ids, text) => paragraphXml(ids, text, {
    charPrIDRef: HWPX_STYLE.char.section,
    paraPrIDRef: HWPX_STYLE.para.title,
});
const labelCell = text => ({
    width: SIMPLE_TABLE_WIDTHS[0],
    verticalAlign: 'CENTER',
    borderFillIDRef: HWPX_STYLE.border.label,
    paragraphs: [{ text, charPrIDRef: HWPX_STYLE.char.tableHeader, paraPrIDRef: HWPX_STYLE.para.center }],
});
const valueCell = paragraphs => ({
    width: SIMPLE_TABLE_WIDTHS[1],
    borderFillIDRef: HWPX_STYLE.border.body,
    paragraphs: paragraphs.length ? paragraphs : [simpleBody('')],
});

function simpleTable(ids, rows) {
    return tableXml(ids, {
        columnWidths: SIMPLE_TABLE_WIDTHS,
        rows: rows.map(row => [labelCell(row.label), valueCell(row.paragraphs)]),
    });
}

function overviewValueParagraphs(row) {
    if (row.key === 'standards') return row.value.map(item => simpleBody(`${item.subject ? `[${item.subject}] ` : ''}[${item.code}] ${item.text}`));
    if (row.key === 'learningGoals') return row.value.map((item, index) => simpleBody(`${index + 1}. ${item}`));
    if (row.key === 'materials') return [simpleBody(row.value.join(', ') || '없음')];
    return [simpleBody(row.value)];
}

function overviewTable(ids, overview) {
    return simpleTable(ids, overview.rows.map(row => ({ label: row.label, paragraphs: overviewValueParagraphs(row) })));
}

function processTable(ids, process) {
    const rows = process.rows.flatMap(row => [
        {
            label: `${row.phase} · ${row.minutes}분`,
            paragraphs: [simpleBody(`학습 요소: ${row.learningElement}`)],
        },
        ...[...row.teacherActivity, ...row.studentActivity, ...row.notes, ...row.remarks].filter(block => block.items.length).map(block => ({
            label: block.label,
            paragraphs: [simpleBody(block.items.map(item => `• ${item}`).join('\n'))],
        })),
    ]);
    return simpleTable(ids, rows);
}

function assessmentTable(ids, assessment) {
    return simpleTable(ids, assessment.rows.map(row => ({
        label: [row.element, row.method].filter(Boolean).join('\n'),
        paragraphs: [
            simpleBody(`관찰 증거: ${row.evidence}`),
            simpleBody(`피드백: ${row.feedback}`),
            ...row.levelFeedback.map(item => simpleBody(`${item.label}: ${item.text}`)),
        ],
    })));
}

function supportTable(ids, session) {
    return simpleTable(ids, [
        { label: '개별화·지원 전략', paragraphs: session.supportStrategies.map(item => simpleBody(`• ${item}`)) },
        { label: '수업 후 성찰', paragraphs: [simpleBody(session.reflectionPrompt)] },
        { label: session.connectionLabel, paragraphs: [simpleBody(session.nextSessionConnection)] },
    ]);
}

function simpleSessionXml(ids, documentTitle, session) {
    const parts = [];
    if (session.pageBreakBefore) parts.push(paragraphXml(ids, '', { pageBreak: true }));
    parts.push(
        simpleTitle(ids, documentTitle),
        simpleSessionTitle(ids, `${session.order}차시 · ${session.title} (${session.sessionMinutes}분)`),
        simpleHeading(ids, '수업 개요'),
        overviewTable(ids, session.overview),
        simpleHeading(ids, '교수·학습 과정'),
        processTable(ids, session.process),
        simpleHeading(ids, '과정중심평가'),
        assessmentTable(ids, session.assessment),
        supportTable(ids, session),
    );
    return parts.join('\n');
}

function simpleDetailedXml(ids, documentTitle, detail) {
    const rows = [
        { label: '수업자 의도', paragraphs: [simpleBody(detail.teacherIntent)] },
        { label: '단원 개관', paragraphs: [simpleBody(detail.unitOverview)] },
        { label: '단원 목표', paragraphs: detail.unitGoals.map((item, index) => simpleBody(`${index + 1}. ${item}`)) },
        { label: '학습자 분석', paragraphs: [simpleBody(detail.learnerAnalysis)] },
        { label: '설계 전략', paragraphs: [simpleBody(detail.teachingStrategy)] },
        { label: '단원 지도 계획', paragraphs: detail.unitSequence.map(item => simpleBody(`${item.session} · ${item.topic}\n${item.learningGoal}\n${item.focus}`)) },
        { label: '판서·자료 계획', paragraphs: detail.boardPlan.map(item => simpleBody(`• ${item}`)) },
        { label: '참고 자료', paragraphs: detail.references.length ? detail.references.map(item => simpleBody(`• ${item}`)) : [simpleBody('없음')] },
    ];
    return [simpleTitle(ids, `${documentTitle} · 세안`), simpleTable(ids, rows), paragraphXml(ids, '', { pageBreak: true })].join('\n');
}

function buildSimpleSectionXml(baseSection, model) {
    const ids = createIdAllocator();
    const content = [
        model.detail ? simpleDetailedXml(ids, model.documentTitle, model.detail) : '',
        model.sessions.map(session => simpleSessionXml(ids, model.documentTitle, session)).join('\n'),
    ].filter(Boolean).join('\n');
    return baseSection.replace('</hs:sec>', `${content}\n</hs:sec>`);
}

export async function buildSimpleHwpx(plan, options = {}) {
    const model = buildDocumentModel(plan, { variant: options.variant });
    return buildHwpxPackage(baseSection => buildSimpleSectionXml(baseSection, model));
}
