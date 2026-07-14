import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { parallelHwpxRows } from './hwpx-flow.js';
import { buildHwpxHeader, estimatedTableRowHeight, HWPX_STYLE, paragraphXml, tableXml } from './hwpx-style.js';
import { coverSectionContentIsRedundant, numberedStep } from './workflow-cover.js';
import { buildWorkflowPdf } from './workflow-pdf.js';

const templateRoot = path.join(process.cwd(), 'lib/export/hwpx-template');
const ZIP_DATE = new Date('2000-01-01T00:00:00Z');
const ZIP_OPTIONS = Object.freeze({ date: ZIP_DATE, createFolders: false });
const MAX_RUBRIC_TABLE_HEIGHT = 60_000;
const CONTENT_WIDTH = 49_928;
const DEFAULT_PAGE_MARGIN = '<hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/>';
const PDF_MATCHED_PAGE_MARGIN = '<hp:margin header="4252" footer="4252" gutter="0" left="4800" right="4800" top="5668" bottom="4252"/>';

function createIdAllocator() {
    let current = 1000000000;
    return { next: () => current++ };
}

function splitWidths(total, count) {
    const base = Math.floor(total / count);
    return Array.from({ length: count }, (_value, index) => base + (index < total % count ? 1 : 0));
}

const body = text => ({ text, charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left });
const centered = text => ({ text, charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.center });
const label = text => ({ text, charPrIDRef: HWPX_STYLE.char.tableHeader, paraPrIDRef: HWPX_STYLE.para.left });
const heading = (ids, text) => paragraphXml(ids, text, { charPrIDRef: HWPX_STYLE.char.section, paraPrIDRef: HWPX_STYLE.para.section });
const title = (ids, text) => paragraphXml(ids, text, { charPrIDRef: HWPX_STYLE.char.title, paraPrIDRef: HWPX_STYLE.para.title });

function cell(paragraphs, width, options = {}) {
    return {
        width,
        header: options.header ?? false,
        verticalAlign: options.verticalAlign ?? 'TOP',
        borderFillIDRef: options.header ? HWPX_STYLE.border.header : HWPX_STYLE.border.body,
        minimumHeight: options.minimumHeight,
        paragraphs,
    };
}

function labelValueTable(ids, values) {
    const widths = [9000, CONTENT_WIDTH - 9000];
    return tableXml(ids, {
        columnWidths: widths,
        rows: values.map(([key, value]) => [cell([label(key)], widths[0], { header: true, verticalAlign: 'CENTER' }), cell([body(value || '')], widths[1])]),
    });
}

function fieldTable(ids, fields) {
    const widths = splitWidths(CONTENT_WIDTH, 3);
    const rows = Array.from({ length: Math.max(1, Math.ceil(fields.length / 3)) }, (_value, index) => {
        const current = fields.slice(index * 3, index * 3 + 3);
        while (current.length < 3) current.push('');
        return current.map((field, column) => cell([centered(field ? `${field}: ____________________` : '')], widths[column]));
    });
    return tableXml(ids, { columnWidths: widths, rows });
}

function blankArea(ids, minimumHeight) {
    return tableXml(ids, { columnWidths: [CONTENT_WIDTH], rows: [[cell([body('')], CONTENT_WIDTH, { minimumHeight })]] });
}

function recordTable(ids, responseAreaHeight) {
    const minimumHeight = Math.ceil(responseAreaHeight / 4);
    const rows = Array.from({ length: 4 }, () => [cell([body('')], CONTENT_WIDTH, { minimumHeight })]);
    return tableXml(ids, { columnWidths: [CONTENT_WIDTH], rows });
}

function responseLines(ids, lineCount) {
    const rows = Array.from({ length: lineCount }, () => [cell([body('')], CONTENT_WIDTH, { minimumHeight: 1750 })]);
    return tableXml(ids, { columnWidths: [CONTENT_WIDTH], rows });
}

function standardTable(ids, standards) {
    return labelValueTable(ids, standards.map(standard => [`[${standard.code}]`, standard.text]));
}

function rubricTables(ids, assessment, options = {}) {
    const widths = [11000, ...splitWidths(CONTENT_WIDTH - 11000, assessment.rubric.levels.length)];
    const header = [
        cell([centered('평가영역')], widths[0], { header: true, verticalAlign: 'CENTER' }),
        ...assessment.rubric.levels.map((level, index) => cell([centered(level.label)], widths[index + 1], { header: true, verticalAlign: 'CENTER' })),
    ];
    const rows = assessment.rubric.criteria.flatMap(criterion => {
        const criterionText = body([
            `${criterion.name} · ${criterion.maxPoints}점`,
            criterion.description,
            `성취기준 · ${criterion.standardCodes.join(', ')}`,
            `확인 증거 · ${criterion.evidence}`,
        ].join('\n'));
        const levelTexts = assessment.rubric.levels.map(level => {
            const current = criterion.levels.find(item => item.levelId === level.id);
            return body(`${current.score}점\n${current.description}`);
        });
        return parallelHwpxRows(
            [criterionText, ...levelTexts],
            widths,
            (paragraphs, width) => cell(paragraphs, width),
            () => body(''),
        );
    });
    const groups = [];
    if (!options.paginate) groups.push(rows);
    else {
        const headerHeight = estimatedTableRowHeight(header);
        let current = [];
        let currentHeight = headerHeight;
        for (const row of rows) {
            const rowHeight = estimatedTableRowHeight(row);
            if (current.length && currentHeight + rowHeight > MAX_RUBRIC_TABLE_HEIGHT) {
                groups.push(current);
                current = [];
                currentHeight = headerHeight;
            }
            current.push(row);
            currentHeight += rowHeight;
        }
        if (current.length || !groups.length) groups.push(current);
    }
    return groups.flatMap((group, index) => [
        ...(index ? [paragraphXml(ids, '', { pageBreak: true })] : []),
        tableXml(ids, { columnWidths: widths, rows: [header, ...group] }),
    ]);
}

function worksheetParts(ids, worksheet, includeTeacherKey, questionPages = new Map()) {
    const parts = [
        title(ids, worksheet.document.title),
        fieldTable(ids, worksheet.document.studentFields),
        tableXml(ids, { columnWidths: [CONTENT_WIDTH], rows: [[cell([body(worksheet.document.instructions)], CONTENT_WIDTH, { header: true })]] }),
    ];
    let number = 0;
    let currentPage = 0;
    const questions = worksheet.document.sections.flatMap(section => section.questions);
    const questionNumbers = new Map(questions.map((question, index) => [question.id, index + 1]));
    for (const section of worksheet.document.sections) {
        parts.push(heading(ids, section.title), paragraphXml(ids, section.purpose, { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left }));
        for (const question of section.questions) {
            number += 1;
            const questionPage = questionPages.get(question.id) ?? currentPage;
            if (questionPage > currentPage) parts.push(paragraphXml(ids, '', { pageBreak: true }));
            currentPage = questionPage;
            parts.push(paragraphXml(ids, `${number}. ${question.prompt}`, { charPrIDRef: HWPX_STYLE.char.tableHeader, paraPrIDRef: HWPX_STYLE.para.left }));
            parts.push(paragraphXml(ids, `성취기준 · ${question.standardCodes.map(code => `[${code}]`).join(', ')}`, { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left }));
            if (question.type === 'multiple-choice-5') {
                question.choices.forEach((choice, index) => parts.push(paragraphXml(ids, `${index + 1}) ${choice}`, { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left })));
            } else if (question.type === 'true-false') {
                parts.push(paragraphXml(ids, '□ 참    □ 거짓', { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left }));
            } else if (question.type === 'table-chart') parts.push(recordTable(ids, question.responseAreaHeight * 100));
            else if (question.type === 'drawing-diagram') parts.push(blankArea(ids, question.responseAreaHeight * 100));
            else parts.push(responseLines(ids, question.responseLines));
        }
    }
    if (!includeTeacherKey) return parts;
    parts.push(paragraphXml(ids, '', { pageBreak: true }), title(ids, `교사용 예시 답안 · ${worksheet.document.title}`));
    worksheet.teacherKey.answers.toSorted((left, right) => questionNumbers.get(left.questionId) - questionNumbers.get(right.questionId)).forEach(answer => {
        parts.push(heading(ids, `${questionNumbers.get(answer.questionId)}번 문항`));
        parts.push(paragraphXml(ids, answer.answer, { charPrIDRef: HWPX_STYLE.char.body, paraPrIDRef: HWPX_STYLE.para.left }));
    });
    return parts;
}

function coverSectionParts(ids, assessment, section) {
    const parts = [heading(ids, section.label)];
    if (section.type !== 'self-checklist' && section.content && !coverSectionContentIsRedundant(assessment, section)) parts.push(paragraphXml(ids, section.content, { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left }));
    if (section.type === 'subject') parts.push(paragraphXml(ids, `과목 · ${assessment.subject}`, { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left }));
    else if (section.type === 'transfer-goal') parts.push(paragraphXml(ids, assessment.backwardDesign.transferGoal, { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left }));
    else if (section.type === 'standards') parts.push(standardTable(ids, assessment.task.standards));
    else if (section.type === 'grasps') parts.push(labelValueTable(ids, [['목표', assessment.task.goal], ['역할', assessment.task.role], ['대상', assessment.task.audience], ['상황', assessment.task.situation], ['산출물', assessment.task.product], ['성공 기준', assessment.task.successCriteria]]));
    else if (section.type === 'task' || section.type === 'procedure') assessment.task.procedure.forEach((step, index) => parts.push(paragraphXml(ids, numberedStep(step, index), { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left })));
    else if (section.type === 'submission') parts.push(labelValueTable(ids, [['제출 조건', assessment.task.conditions.join(', ')], ['준비물', assessment.task.materials.join(', ')], ['유의점', assessment.task.cautions.join(', ')]]));
    else if (section.type === 'checkpoints') assessment.backwardDesign.checkpoints.toSorted((left, right) => left.order - right.order).forEach(item => parts.push(paragraphXml(ids, `${item.order}. ${item.title} · ${item.evidence} · ${item.feedbackPurpose}`, { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left })));
    else if (section.type === 'rubric') parts.push(...rubricTables(ids, assessment));
    else if (section.type === 'self-checklist') section.content.split('\n').map(item => item.trim()).filter(Boolean).forEach(item => parts.push(paragraphXml(ids, `□ ${item}`, { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left })));
    return parts;
}

function studentCoverParts(ids, assessment) {
    const parts = [title(ids, assessment.cover.title), fieldTable(ids, ['학년·반', '번호', '이름'])];
    assessment.cover.sections.filter(section => section.visible).toSorted((left, right) => left.order - right.order).forEach(section => parts.push(...coverSectionParts(ids, assessment, section)));
    return parts;
}

function assessmentGuideParts(ids, assessment) {
    const parts = [title(ids, assessment.task.title), heading(ids, '성취기준'), standardTable(ids, assessment.task.standards)];
    parts.push(heading(ids, '수행과제 개요'), labelValueTable(ids, [['목표', assessment.task.goal], ['역할', assessment.task.role], ['대상', assessment.task.audience], ['상황', assessment.task.situation], ['산출물', assessment.task.product], ['성공 기준', assessment.task.successCriteria], ['제출 조건', assessment.task.conditions.join(', ')], ['준비물', assessment.task.materials.join(', ')], ['유의점', assessment.task.cautions.join(', ')]]));
    parts.push(heading(ids, '수행 절차'));
    assessment.task.procedure.forEach((step, index) => parts.push(paragraphXml(ids, numberedStep(step, index), { charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left })));
    return parts;
}

function assessmentParts(ids, assessment, kind, questionPages) {
    const parts = [];
    if (kind === 'assessment' && assessment.includeStudentCover) {
        parts.push(...studentCoverParts(ids, assessment));
        parts.push(paragraphXml(ids, '', { pageBreak: true }));
    }
    if (kind === 'assessment-cover') return studentCoverParts(ids, assessment);
    if (kind === 'assessment') parts.push(...assessmentGuideParts(ids, assessment), paragraphXml(ids, '', { pageBreak: true }));
    parts.push(...worksheetParts(ids, {
        standards: assessment.task.standards,
        document: assessment.studentSheet.document,
        teacherKey: assessment.studentSheet.teacherKey,
    }, false, questionPages));
    if (kind === 'assessment') parts.push(paragraphXml(ids, '', { pageBreak: true }), heading(ids, `점수형 분석적 루브릭 · 총 ${assessment.totalPoints}점`), ...rubricTables(ids, assessment, { paginate: true }));
    return parts;
}

async function copyTemplate(zip, directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
        const filePath = path.join(directory, entry.name);
        const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await copyTemplate(zip, filePath, zipPath);
        else if (!['mimetype', 'Contents/header.xml', 'Contents/section0.xml'].includes(zipPath)) zip.file(zipPath, await readFile(filePath), ZIP_OPTIONS);
    }
}

export async function buildWorkflowHwpx(kind, value) {
    const ids = createIdAllocator();
    const isWorksheet = kind === 'worksheet' || kind === 'worksheet-student' || kind === 'worksheet-teacher';
    if (!isWorksheet && value.includeStudentCover) await buildWorkflowPdf('assessment-cover', value);
    const questionPages = new Map();
    if (isWorksheet || kind === 'assessment' || kind === 'assessment-sheet') {
        await buildWorkflowPdf(isWorksheet ? 'worksheet-student' : 'assessment-sheet', value, { onDraw: event => {
            if (event.kind === 'worksheet-question-start') questionPages.set(event.questionId, event.pageIndex);
        } });
    }
    const content = isWorksheet
        ? worksheetParts(ids, value, kind !== 'worksheet-student', questionPages)
        : assessmentParts(ids, value, kind, questionPages);
    const [header, section] = await Promise.all([
        readFile(path.join(templateRoot, 'Contents/header.xml'), 'utf8'),
        readFile(path.join(templateRoot, 'Contents/section0.xml'), 'utf8'),
    ]);
    const zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip', { ...ZIP_OPTIONS, compression: 'STORE' });
    await copyTemplate(zip, templateRoot);
    zip.file('Contents/header.xml', buildHwpxHeader(header), ZIP_OPTIONS);
    if (!section.includes(DEFAULT_PAGE_MARGIN)) throw new Error('HWPX template page margin structure is invalid');
    const sectionXml = section
        .replace(DEFAULT_PAGE_MARGIN, PDF_MATCHED_PAGE_MARGIN)
        .replace('</hs:sec>', `${content.join('\n')}\n</hs:sec>`);
    zip.file('Contents/section0.xml', sectionXml, ZIP_OPTIONS);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
