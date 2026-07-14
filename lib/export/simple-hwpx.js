import { buildDocumentModel } from './document-model.js';
import { buildHwpxPackage } from './hwpx-package.js';
import { HWPX_STYLE, paragraphXml } from './hwpx-style.js';

function createIdAllocator() {
    let current = 1000000000;
    return { next: () => current++ };
}

const simpleBody = (ids, text) => paragraphXml(ids, text, {
    charPrIDRef: HWPX_STYLE.char.compact,
    paraPrIDRef: HWPX_STYLE.para.left,
});
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

function overviewParagraphs(ids, overview) {
    const parts = [simpleHeading(ids, '수업 개요')];
    for (const row of overview.rows) {
        if (row.key === 'standards') {
            parts.push(simpleBody(ids, row.label), ...row.value.map(item => simpleBody(ids, `[${item.code}] ${item.text}`)));
        } else if (row.key === 'learningGoals') {
            parts.push(simpleBody(ids, row.label), ...row.value.map((item, index) => simpleBody(ids, `${index + 1}. ${item}`)));
        } else if (row.key === 'materials') {
            parts.push(simpleBody(ids, `${row.label}: ${row.value.join(', ') || '없음'}`));
        } else {
            parts.push(simpleBody(ids, `${row.label}: ${row.value}`));
        }
    }
    return parts;
}

function activityParagraphs(ids, blocks) {
    return blocks.flatMap(block => block.items.length ? [simpleBody(ids, `${block.label}: ${block.items.join(' / ')}`)] : []);
}

function processParagraphs(ids, process) {
    const parts = [simpleHeading(ids, '교수·학습 과정')];
    for (const row of process.rows) {
        parts.push(
            simpleBody(ids, `• ${row.phase} · ${row.learningElement} (${row.minutes}분)`),
            ...activityParagraphs(ids, row.teacherActivity),
            ...activityParagraphs(ids, row.studentActivity),
            ...activityParagraphs(ids, row.notes),
        );
    }
    return parts;
}

function assessmentParagraphs(ids, assessment) {
    const parts = [simpleHeading(ids, '과정중심평가')];
    for (const row of assessment.rows) {
        parts.push(
            simpleBody(ids, `• ${row.element} · ${row.method}`),
            simpleBody(ids, `관찰 증거: ${row.evidence}`),
            simpleBody(ids, `피드백: ${row.feedback}`),
            ...row.levelFeedback.map(item => simpleBody(ids, `${item.label}: ${item.text}`)),
        );
    }
    return parts;
}

function simpleSessionXml(ids, documentTitle, session) {
    const parts = [];
    if (session.pageBreakBefore) parts.push(paragraphXml(ids, '', { pageBreak: true }));
    parts.push(
        simpleTitle(ids, documentTitle),
        simpleSessionTitle(ids, `${session.order}차시 · ${session.title} (${session.sessionMinutes}분)`),
        ...overviewParagraphs(ids, session.overview),
        ...processParagraphs(ids, session.process),
        ...assessmentParagraphs(ids, session.assessment),
        simpleHeading(ids, '개별화·지원 전략'),
        ...session.supportStrategies.map(item => simpleBody(ids, `• ${item}`)),
        simpleHeading(ids, '수업 후 성찰'),
        simpleBody(ids, session.reflectionPrompt),
        simpleHeading(ids, session.connectionLabel),
        simpleBody(ids, session.nextSessionConnection),
    );
    return parts.join('\n');
}

function buildSimpleSectionXml(baseSection, model) {
    const ids = createIdAllocator();
    const content = model.sessions.map(session => simpleSessionXml(ids, model.documentTitle, session)).join('\n');
    return baseSection.replace('</hs:sec>', `${content}\n</hs:sec>`);
}

export async function buildSimpleHwpx(plan) {
    const model = buildDocumentModel(plan);
    return buildHwpxPackage(baseSection => buildSimpleSectionXml(baseSection, model));
}
