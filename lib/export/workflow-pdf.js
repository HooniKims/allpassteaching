import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';

const PAGE = [595.28, 841.89];
const MARGIN = 48;
const TOP = 794;
const WIDTH = PAGE[0] - MARGIN * 2;
const COLORS = { ink: rgb(47 / 255, 48 / 255, 45 / 255), muted: rgb(101 / 255, 101 / 255, 95 / 255), green: rgb(23 / 255, 111 / 255, 91 / 255), tint: rgb(232 / 255, 243 / 255, 239 / 255), border: rgb(217 / 255, 216 / 255, 210 / 255) };

async function embedFonts(pdf) {
    const root = path.join(process.cwd(), 'public/fonts/paperlogy');
    const [regular, bold] = await Promise.all([readFile(path.join(root, 'Paperlogy-4Regular.ttf')), readFile(path.join(root, 'Paperlogy-7Bold.ttf'))]);
    return { regular: await pdf.embedFont(Uint8Array.from(regular), { subset: true }), bold: await pdf.embedFont(Uint8Array.from(bold), { subset: true }) };
}

function wrap(text, font, size, maxWidth) {
    const lines = [];
    for (const paragraph of String(text ?? '').replace(/\r/g, '').split('\n')) {
        if (!paragraph) { lines.push(''); continue; }
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
            const candidate = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue; }
            if (line) lines.push(line);
            line = '';
            let chunk = '';
            for (const character of word) {
                if (chunk && font.widthOfTextAtSize(chunk + character, size) > maxWidth) { lines.push(chunk); chunk = character; }
                else chunk += character;
            }
            line = chunk;
        }
        if (line) lines.push(line);
    }
    return lines;
}

function addPage(context) {
    context.page = context.pdf.addPage(PAGE);
    context.y = TOP;
    context.pageIndex = context.pdf.getPageCount() - 1;
}

function ensure(context, height) {
    if (context.y - height < MARGIN) addPage(context);
}

function text(context, value, { font = context.fonts.regular, size = 10, color = COLORS.ink, lineHeight = size * 1.45, after = 5, indent = 0 } = {}) {
    const lines = wrap(value, font, size, WIDTH - indent);
    for (const line of lines) {
        ensure(context, lineHeight);
        if (line) {
            context.page.drawText(line, { x: MARGIN + indent, y: context.y, size, font, color });
            context.onDraw?.({ pageIndex: context.pageIndex, text: line, y: context.y });
        }
        context.y -= lineHeight;
    }
    context.y -= after;
}

function heading(context, value, level = 2) {
    const size = level === 1 ? 20 : level === 2 ? 13 : 11;
    ensure(context, size * 2.2);
    text(context, value, { font: context.fonts.bold, size, color: level === 1 ? COLORS.green : COLORS.ink, lineHeight: size * 1.35, after: level === 1 ? 14 : 7 });
    if (level === 2) {
        context.page.drawLine({ start: { x: MARGIN, y: context.y + 4 }, end: { x: MARGIN + WIDTH, y: context.y + 4 }, thickness: 1, color: COLORS.border });
        context.y -= 5;
    }
}

function labelValue(context, label, value) {
    ensure(context, 38);
    text(context, label, { font: context.fonts.bold, size: 9, color: COLORS.green, lineHeight: 12, after: 1 });
    text(context, value, { size: 10, lineHeight: 14, after: 6 });
}

function bulletList(context, values) {
    values.forEach(item => text(context, `• ${item}`, { size: 10, lineHeight: 14, after: 2, indent: 4 }));
    context.y -= 4;
}

export class CoverPageOverflowError extends Error {
    constructor(message = '학생 안내 표지는 한 페이지에 들어가야 합니다. 표지 문구나 평가영역 수를 줄여주세요.') {
        super(message);
        this.name = 'CoverPageOverflowError';
    }
}

function drawWorksheet(context, worksheet) {
    heading(context, worksheet.document.title, 1);
    text(context, worksheet.document.studentFields.map(field => `${field}: ____________________`).join('     '), { font: context.fonts.bold, size: 9.5, lineHeight: 14, after: 12 });
    context.page.drawRectangle({ x: MARGIN, y: context.y - 38, width: WIDTH, height: 44, color: COLORS.tint, borderColor: COLORS.border, borderWidth: .7 });
    text(context, worksheet.document.instructions, { size: 9.5, lineHeight: 13, after: 16, indent: 10 });
    let number = 0;
    worksheet.document.sections.forEach(section => {
        heading(context, section.title, 2);
        text(context, section.purpose, { size: 9, color: COLORS.muted, lineHeight: 13, after: 7 });
        section.questions.forEach(question => {
            number += 1;
            ensure(context, 46);
            text(context, `${number}. ${question.prompt}`, { font: context.fonts.bold, size: 10, lineHeight: 14, after: 6 });
            for (let line = 0; line < question.responseLines; line += 1) {
                ensure(context, 18);
                context.page.drawLine({ start: { x: MARGIN + 8, y: context.y }, end: { x: MARGIN + WIDTH, y: context.y }, thickness: .65, color: COLORS.border });
                context.y -= 18;
            }
            context.y -= 5;
        });
    });
    addPage(context);
    heading(context, `교사용 예시 답안 · ${worksheet.document.title}`, 1);
    const questionNumbers = new Map(worksheet.document.sections.flatMap(section => section.questions).map((question, index) => [question.id, index + 1]));
    worksheet.teacherKey.answers.toSorted((left, right) => questionNumbers.get(left.questionId) - questionNumbers.get(right.questionId)).forEach(answer => { heading(context, `${questionNumbers.get(answer.questionId)}번 문항`, 3); text(context, answer.answer, { size: 10, lineHeight: 15, after: 10 }); });
}

function drawRubric(context, assessment) {
    heading(context, `${assessment.rubric.levels.length}수준 분석적 루브릭 · 총 ${assessment.totalPoints}점`, 2);
    assessment.rubric.criteria.forEach((criterion, index) => {
        ensure(context, 58);
        context.page.drawRectangle({ x: MARGIN, y: context.y - 27, width: WIDTH, height: 34, color: COLORS.tint, borderColor: COLORS.border, borderWidth: .7 });
        text(context, `${index + 1}. ${criterion.name} · ${criterion.maxPoints}점`, { font: context.fonts.bold, size: 11, color: COLORS.green, lineHeight: 15, after: 3, indent: 8 });
        text(context, criterion.description, { size: 9.5, lineHeight: 14, after: 7 });
        assessment.rubric.levels.forEach((level, levelIndex) => labelValue(context, `${level.label} · ${criterion.levels[levelIndex].score}점`, criterion.levels[levelIndex].description));
        labelValue(context, '관찰 증거', criterion.evidence);
        context.y -= 10;
    });
}

function coverHeading(context, value) {
    ensure(context, 18);
    text(context, value, { font: context.fonts.bold, size: 10.5, color: COLORS.green, lineHeight: 12.5, after: 1 });
    context.page.drawLine({ start: { x: MARGIN, y: context.y + 2 }, end: { x: MARGIN + WIDTH, y: context.y + 2 }, thickness: .55, color: COLORS.border });
    context.y -= 2;
}

function coverLine(context, value, options = {}) {
    text(context, value, { size: 8.2, lineHeight: 10.2, after: 1, ...options });
}

function drawCoverSection(context, assessment, section) {
    coverHeading(context, section.label);
    if (section.type !== 'self-checklist' && section.content) coverLine(context, section.content, { color: COLORS.muted });
    if (section.type === 'subject') coverLine(context, `과목 · ${assessment.subject}`, { font: context.fonts.bold });
    else if (section.type === 'transfer-goal') coverLine(context, assessment.backwardDesign.transferGoal);
    else if (section.type === 'standards') assessment.task.standards.forEach(standard => coverLine(context, `[${standard.code}] ${standard.text}`));
    else if (section.type === 'grasps') [['상황', assessment.task.situation], ['역할', assessment.task.role], ['대상', assessment.task.audience], ['산출물', assessment.task.product]].forEach(([label, value]) => coverLine(context, `${label} · ${value}`));
    else if (section.type === 'task') {
        coverLine(context, `산출물 · ${assessment.task.product}`);
        assessment.task.procedure.forEach((step, index) => coverLine(context, `${index + 1}. ${step}`));
    } else if (section.type === 'procedure') assessment.task.procedure.forEach((step, index) => coverLine(context, `${index + 1}. ${step}`));
    else if (section.type === 'submission') [['제출 조건', assessment.task.conditions], ['준비물', assessment.task.materials], ['유의점', assessment.task.cautions]].forEach(([label, values]) => coverLine(context, `${label} · ${values.join(', ') || '없음'}`));
    else if (section.type === 'checkpoints') assessment.backwardDesign.checkpoints.toSorted((left, right) => left.order - right.order).forEach(item => coverLine(context, `${item.order}. ${item.title} · ${item.evidence} · ${item.feedbackPurpose}`));
    else if (section.type === 'rubric') assessment.rubric.criteria.forEach(criterion => {
        coverLine(context, `${criterion.name} · ${criterion.maxPoints}점`, { font: context.fonts.bold, size: 8.6, lineHeight: 10.5, after: 0 });
        assessment.rubric.levels.forEach((level, index) => coverLine(context, `${level.label} · ${criterion.levels[index].score}점 · ${criterion.levels[index].description}`, { size: 8.5, lineHeight: 10.1, after: 0, indent: 5 }));
        context.y -= 1;
    });
    else if (section.type === 'self-checklist') section.content.split('\n').map(item => item.trim()).filter(Boolean).forEach(item => coverLine(context, `□ ${item}`));
}

function drawAssessmentCover(context, assessment) {
    if (!assessment.includeStudentCover) throw new CoverPageOverflowError('학생당 안내 표지를 사용하지 않는 평가입니다.');
    const startPageIndex = context.pageIndex;
    heading(context, assessment.cover.title, 1);
    text(context, '학년·반: ____________________    번호: ______    이름: ____________________', { font: context.fonts.bold, size: 9, lineHeight: 12, after: 8 });
    assessment.cover.sections.filter(section => section.visible).toSorted((left, right) => left.order - right.order).forEach(section => drawCoverSection(context, assessment, section));
    if (context.pageIndex !== startPageIndex) throw new CoverPageOverflowError();
}

function drawAssessment(context, assessment) {
    if (assessment.includeStudentCover) {
        drawAssessmentCover(context, assessment);
        addPage(context);
    }
    heading(context, assessment.task.title, 1);
    heading(context, '성취기준', 2);
    assessment.task.standards.forEach(standard => text(context, `[${standard.code}] ${standard.text}`, { size: 9.5, lineHeight: 14, after: 4 }));
    heading(context, '수행과제 개요', 2);
    for (const [label, value] of [['상황', assessment.task.situation], ['역할', assessment.task.role], ['대상', assessment.task.audience], ['산출물', assessment.task.product]]) labelValue(context, label, value);
    for (const [label, values] of [['수행 절차', assessment.task.procedure], ['제출 조건', assessment.task.conditions], ['준비물', assessment.task.materials], ['유의점', assessment.task.cautions]]) { heading(context, label, 3); bulletList(context, values); }
    addPage(context);
    drawRubric(context, assessment);
}

export async function buildWorkflowPdf(kind, value, options = {}) {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setLanguage('ko-KR');
    const fonts = await embedFonts(pdf);
    pdf.setAuthor('AllPass Teaching'); pdf.setCreator('AllPass Teaching'); pdf.setTitle(kind === 'worksheet' ? value.document.title : value.task.title);
    const context = { pdf, fonts, onDraw: options.onDraw, page: null, pageIndex: -1, y: TOP };
    addPage(context);
    if (kind === 'worksheet') drawWorksheet(context, value);
    else if (kind === 'assessment') drawAssessment(context, value);
    else if (kind === 'assessment-cover') drawAssessmentCover(context, value);
    else throw new Error('지원하지 않는 PDF 문서 종류입니다.');
    return pdf.save();
}
