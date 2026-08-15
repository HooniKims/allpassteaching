import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
    AlignmentType,
    BorderStyle,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
} from 'docx';
import JSZip from 'jszip';
import { CONTENT_WIDTH as DOCX_CONTENT_WIDTH, createFormalDocument, INK, PAPERLOGY } from './docx-format.js';
import { parallelHwpxRows } from './hwpx-flow.js';
import { buildHwpxHeader, CONTENT_WIDTH as HWPX_CONTENT_WIDTH, estimatedTableRowHeight, HWPX_STYLE, paragraphXml, sanitizeXmlText, tableXml } from './hwpx-style.js';

const templateRoot = path.join(process.cwd(), 'lib/export/hwpx-template');
const ZIP_DATE = new Date('2000-01-01T00:00:00Z');
const ZIP_OPTIONS = Object.freeze({ date: ZIP_DATE, createFolders: false });
const MAX_RUBRIC_TABLE_HEIGHT = 60_000;
const DOCX_BORDER = { style: BorderStyle.SINGLE, color: '91A99A', size: 6 };
const DOCX_TABLE_BORDERS = {
    top: DOCX_BORDER,
    bottom: DOCX_BORDER,
    left: DOCX_BORDER,
    right: DOCX_BORDER,
    insideHorizontal: DOCX_BORDER,
    insideVertical: DOCX_BORDER,
};

function createIdAllocator() {
    let current = 1000000000;
    return { next: () => current++ };
}

function rubricTitle(assessment) {
    return `${assessment.assessmentName} 루브릭`;
}

function criterionLevel(criterion, level) {
    return criterion.levels.find(item => item.levelId === level.id);
}

function criterionSummary(criterion) {
    return `${criterion.name} · ${criterion.maxPoints}점`;
}

function splitWidths(total, count) {
    const base = Math.floor(total / count);
    const remainder = total - base * count;
    return Array.from({ length: count }, (_value, index) => base + (index < remainder ? 1 : 0));
}

function docxColumnWidths(levelCount) {
    const criterionWidth = 2800;
    return [criterionWidth, ...splitWidths(DOCX_CONTENT_WIDTH - criterionWidth, levelCount)];
}

function hwpBody(text) {
    return { text, charPrIDRef: HWPX_STYLE.char.compact, paraPrIDRef: HWPX_STYLE.para.left };
}

function hwpHeader(text) {
    return { text, charPrIDRef: HWPX_STYLE.char.tableHeader, paraPrIDRef: HWPX_STYLE.para.center };
}

function hwpLabel(text) {
    return { text, charPrIDRef: HWPX_STYLE.char.tableHeader, paraPrIDRef: HWPX_STYLE.para.left };
}

function hwpHeaderCell(text, width) {
    return {
        width,
        header: true,
        verticalAlign: 'CENTER',
        borderFillIDRef: HWPX_STYLE.border.header,
        paragraphs: [hwpHeader(text)],
    };
}

function hwpCell(paragraphs, width) {
    return { width, verticalAlign: 'TOP', borderFillIDRef: HWPX_STYLE.border.body, paragraphs };
}

function hwpStandardTable(ids, assessment) {
    const widths = [9000, HWPX_CONTENT_WIDTH - 9000];
    const rows = [
        [hwpHeaderCell('성취기준', widths[0]), hwpHeaderCell('내용', widths[1])],
        ...assessment.task.standards.map(standard => [
            hwpCell([hwpHeader(`[${standard.code}]`)], widths[0]),
            hwpCell([hwpBody(standard.text)], widths[1]),
        ]),
    ];
    return tableXml(ids, { columnWidths: widths, rows });
}

function hwpRubricTables(ids, assessment) {
    const widths = [11000, ...splitWidths(HWPX_CONTENT_WIDTH - 11000, assessment.rubric.levels.length)];
    const header = [
        hwpHeaderCell('평가영역', widths[0]),
        ...assessment.rubric.levels.map((level, index) => hwpHeaderCell(level.label, widths[index + 1])),
    ];
    const rows = [];
    for (const criterion of assessment.rubric.criteria) {
        const criterionText = hwpBody([
            criterionSummary(criterion),
            criterion.description,
            `성취기준 · ${criterion.standardCodes.join(', ')}`,
            `확인 증거 · ${criterion.evidence}`,
        ].join('\n'));
        const levelTexts = assessment.rubric.levels.map(level => {
            const current = criterionLevel(criterion, level);
            return hwpBody(`${current.score}점\n${current.description}`);
        });
        rows.push(...parallelHwpxRows(
            [criterionText, ...levelTexts],
            widths,
            (paragraphs, width) => hwpCell(paragraphs, width),
            () => hwpBody(''),
        ));
    }
    const groups = [];
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
    return groups.flatMap((group, index) => [
        ...(index ? [paragraphXml(ids, '', { pageBreak: true })] : []),
        tableXml(ids, { columnWidths: widths, rows: [header, ...group] }),
    ]);
}

async function copyHwpxTemplate(zip, directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
        const filePath = path.join(directory, entry.name);
        const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) await copyHwpxTemplate(zip, filePath, zipPath);
        else if (!['mimetype', 'Contents/header.xml', 'Contents/section0.xml'].includes(zipPath)) zip.file(zipPath, await readFile(filePath), ZIP_OPTIONS);
    }
}

function buildHwpxSection(baseSection, assessment) {
    const ids = createIdAllocator();
    const content = [
        paragraphXml(ids, rubricTitle(assessment), { charPrIDRef: HWPX_STYLE.char.title, paraPrIDRef: HWPX_STYLE.para.title }),
        paragraphXml(ids, `${assessment.subject} · 총 ${assessment.totalPoints}점 · ${assessment.rubric.levels.length}수준`, { charPrIDRef: HWPX_STYLE.char.section, paraPrIDRef: HWPX_STYLE.para.title }),
        paragraphXml(ids, '성취기준', { charPrIDRef: HWPX_STYLE.char.section, paraPrIDRef: HWPX_STYLE.para.section }),
        hwpStandardTable(ids, assessment),
        paragraphXml(ids, '점수형 분석적 루브릭', { charPrIDRef: HWPX_STYLE.char.section, paraPrIDRef: HWPX_STYLE.para.section }),
        paragraphXml(ids, '', { pageBreak: true }),
        ...hwpRubricTables(ids, assessment),
    ].join('\n');
    return baseSection.replace('</hs:sec>', `${content}\n</hs:sec>`);
}

export async function buildAssessmentRubricHwpx(assessment) {
    const zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip', { ...ZIP_OPTIONS, compression: 'STORE' });
    await copyHwpxTemplate(zip, templateRoot);
    const [header, section] = await Promise.all([
        readFile(path.join(templateRoot, 'Contents/header.xml'), 'utf8'),
        readFile(path.join(templateRoot, 'Contents/section0.xml'), 'utf8'),
    ]);
    zip.file('Contents/header.xml', buildHwpxHeader(header), ZIP_OPTIONS);
    zip.file('Contents/section0.xml', buildHwpxSection(section, assessment), ZIP_OPTIONS);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function documentParagraph(text, options = {}) {
    return new Paragraph({
        alignment: options.alignment,
        spacing: { before: options.before ?? 0, after: options.after ?? 40, line: options.line ?? 250 },
        children: [new TextRun({
            text: sanitizeXmlText(text),
            font: PAPERLOGY,
            size: options.size ?? 18,
            bold: options.bold ?? false,
            color: options.color ?? INK,
        })],
    });
}

function documentCell(children, width, options = {}) {
    return new TableCell({
        children,
        width: { size: width, type: WidthType.DXA },
        verticalAlign: options.verticalAlign ?? VerticalAlign.TOP,
        shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR } : undefined,
        margins: { top: 75, bottom: 75, left: 90, right: 90 },
    });
}

function documentHeaderCell(text, width) {
    return documentCell([documentParagraph(text, { bold: true, color: INK, alignment: AlignmentType.CENTER })], width, { fill: 'DDE9E1', verticalAlign: VerticalAlign.CENTER });
}

function documentStandardTable(assessment) {
    const widths = [1800, DOCX_CONTENT_WIDTH - 1800];
    const rows = [new TableRow({ tableHeader: true, cantSplit: true, children: [documentHeaderCell('성취기준', widths[0]), documentHeaderCell('내용', widths[1])] })];
    for (const standard of assessment.task.standards) {
        rows.push(new TableRow({ cantSplit: true, children: [
            documentCell([documentParagraph(`[${standard.code}]`, { bold: true, color: INK })], widths[0]),
            documentCell([documentParagraph(standard.text)], widths[1]),
        ] }));
    }
    return new Table({
        rows,
        width: { size: DOCX_CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: widths,
        layout: TableLayoutType.FIXED,
        borders: DOCX_TABLE_BORDERS,
    });
}

function documentRubricTable(assessment) {
    const widths = docxColumnWidths(assessment.rubric.levels.length);
    const rows = [new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [documentHeaderCell('평가영역', widths[0]), ...assessment.rubric.levels.map((level, index) => documentHeaderCell(level.label, widths[index + 1]))],
    })];
    for (const criterion of assessment.rubric.criteria) {
        rows.push(new TableRow({
            cantSplit: true,
            children: [
                documentCell([
                    documentParagraph(criterionSummary(criterion), { bold: true, color: INK }),
                    documentParagraph(criterion.description),
                    documentParagraph(`성취기준 · ${criterion.standardCodes.join(', ')}`, { size: 16, color: INK }),
                    documentParagraph(`확인 증거 · ${criterion.evidence}`, { size: 16 }),
                ], widths[0]),
                ...assessment.rubric.levels.map((level, index) => {
                    const current = criterionLevel(criterion, level);
                    return documentCell([
                        documentParagraph(`${level.label} · ${current.score}점`, { bold: true, color: INK }),
                        documentParagraph(current.description),
                    ], widths[index + 1]);
                }),
            ],
        }));
    }
    return new Table({
        rows,
        width: { size: DOCX_CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: widths,
        layout: TableLayoutType.FIXED,
        borders: DOCX_TABLE_BORDERS,
    });
}

export async function buildAssessmentRubricDocx(assessment) {
    const children = [
        documentParagraph(rubricTitle(assessment), { alignment: AlignmentType.CENTER, bold: true, color: INK, size: 32, after: 80 }),
        documentParagraph(`${assessment.subject} · 총 ${assessment.totalPoints}점 · ${assessment.rubric.levels.length}수준`, { alignment: AlignmentType.CENTER, bold: true, color: INK, size: 20, after: 180 }),
        documentParagraph('성취기준', { bold: true, color: INK, size: 22, before: 60, after: 70 }),
        documentStandardTable(assessment),
        documentParagraph('점수형 분석적 루브릭', { bold: true, color: INK, size: 22, before: 180, after: 70 }),
        documentRubricTable(assessment),
    ];
    return Packer.toBuffer(createFormalDocument(children));
}

export async function buildAssessmentRubricXlsx(assessment) {
    const module = await import('exceljs');
    const ExcelJS = module.default ?? module;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('루브릭');
    const headers = ['평가영역', '연결 성취기준', '확인 증거', ...assessment.rubric.levels.map(level => level.label)];
    const lastColumn = headers.length;
    sheet.mergeCells(1, 1, 1, lastColumn);
    sheet.getCell('A1').value = rubricTitle(assessment);
    sheet.getCell('A1').font = { name: PAPERLOGY, size: 16, bold: true, color: { argb: 'FF000000' } };
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;
    sheet.getCell('A2').value = '과목';
    sheet.getCell('B2').value = assessment.subject;
    sheet.getCell('C2').value = '전체 총점';
    sheet.getCell('D2').value = assessment.totalPoints;
    sheet.getRow(5).values = headers;
    const header = sheet.getRow(5);
    header.font = { name: PAPERLOGY, bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176F5B' } };
    header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (const criterion of assessment.rubric.criteria) {
        sheet.addRow([
            `${criterionSummary(criterion)}\n${criterion.description}`,
            criterion.standardCodes.join(', '),
            criterion.evidence,
            ...assessment.rubric.levels.map(level => {
                const current = criterionLevel(criterion, level);
                return `${level.label} · ${current.score}점\n${current.description}`;
            }),
        ]);
    }
    sheet.columns = [
        { width: 34 },
        { width: 20 },
        { width: 30 },
        ...assessment.rubric.levels.map(() => ({ width: 34 })),
    ];
    const border = {
        top: { style: 'thin', color: { argb: 'FF91A99A' } },
        left: { style: 'thin', color: { argb: 'FF91A99A' } },
        bottom: { style: 'thin', color: { argb: 'FF91A99A' } },
        right: { style: 'thin', color: { argb: 'FF91A99A' } },
    };
    for (let row = 6; row <= sheet.rowCount; row += 1) {
        sheet.getRow(row).height = 96;
        for (let column = 1; column <= lastColumn; column += 1) {
            const cell = sheet.getRow(row).getCell(column);
            cell.font = { name: PAPERLOGY, size: 10, color: { argb: 'FF000000' } };
            cell.alignment = { vertical: 'top', wrapText: true };
            cell.border = border;
        }
    }
    sheet.views = [{ state: 'frozen', ySplit: 5 }];
    return workbook.xlsx.writeBuffer();
}
