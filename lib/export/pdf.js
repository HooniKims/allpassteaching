import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import { buildDocumentModel } from './document-model.js';
import {
    assessmentDefinition,
    COLORS,
    CONTENT_WIDTH,
    MARGIN,
    overviewDefinition,
    PAGE_SIZE,
    processDefinition,
    singleColumnDefinition,
} from './pdf-content.js';
import {
    drawRow,
    drawTableHeader,
    measureTableHeader,
    measureRow,
    minimumRowStartHeight,
    sanitizePdfText,
    selectVisibleFallback,
    splitRow,
    withTableFallback,
    wrapText,
} from './pdf-table.js';

const TOP = PAGE_SIZE[1] - 64;
const SECTION_HEADING_HEIGHT = 17;

function addPage(context) {
    const page = context.pdf.addPage(PAGE_SIZE);
    context.state = { page, pageIndex: context.pdf.getPageCount() - 1, y: TOP, margin: MARGIN };
}

function emitText(context, sourceText, text, options) {
    const width = options.width ?? CONTENT_WIDTH;
    const x = options.align === 'center'
        ? MARGIN + Math.max(0, (width - options.font.widthOfTextAtSize(text, options.size)) / 2)
        : options.x ?? MARGIN;
    context.state.page.drawText(text, {
        x,
        y: context.state.y,
        size: options.size,
        font: options.font,
        color: options.color ?? COLORS.ink,
    });
    const ascent = options.font.heightAtSize(options.size, { descender: false });
    const descent = Math.max(0, options.font.heightAtSize(options.size) - ascent);
    context.onDraw?.({
        type: 'text',
        pageIndex: context.state.pageIndex,
        sourceText,
        text,
        x,
        y: context.state.y,
        top: context.state.y + ascent,
        bottom: context.state.y - descent,
        fontSize: options.size,
    });
}

function drawFlowText(context, value, options) {
    const sourceText = sanitizePdfText(value, options.font, context.fallback);
    const lines = wrapText(sourceText, options.font, options.size, options.width ?? CONTENT_WIDTH, context.fallback);
    for (const line of lines) {
        if (context.state.y - options.lineHeight < MARGIN) addPage(context);
        if (line) emitText(context, sourceText, line, options);
        context.state.y -= options.lineHeight;
    }
    context.state.y -= options.after ?? 0;
}

function drawSectionHeading(context, text) {
    if (context.state.y - 24 < MARGIN) addPage(context);
    drawFlowText(context, text, {
        font: context.fonts.bold,
        size: 10.5,
        lineHeight: 13,
        color: COLORS.green,
        after: 4,
    });
}

function tableDrawOptions(context, widths, row) {
    return {
        page: context.state.page,
        pageIndex: context.state.pageIndex,
        x: MARGIN,
        y: context.state.y,
        widths,
        row,
        borderColor: COLORS.border,
        onDraw: context.onDraw,
    };
}

function prepareSectionPage(context, definition) {
    const headerHeight = measureTableHeader(definition)?.height ?? 0;
    const firstRow = measureRow(definition.rows[0], definition.widths, definition.style);
    const freshRowSpace = TOP - MARGIN - SECTION_HEADING_HEIGHT - headerHeight;
    const firstStartHeight = firstRow.height <= freshRowSpace
        ? firstRow.height
        : minimumRowStartHeight(firstRow);
    if (context.state.y - SECTION_HEADING_HEIGHT - headerHeight - firstStartHeight < MARGIN) addPage(context);
}

function renderTable(context, definition) {
    const header = measureTableHeader(definition);
    const headerHeight = header?.height ?? 0;
    const drawHeader = () => {
        if (!header) return;
        context.state.y = drawTableHeader({
            ...tableDrawOptions(context, definition.widths, header),
            tableId: definition.id,
            rowKind: 'header',
        });
    };
    if (context.state.y - headerHeight < MARGIN) addPage(context);
    drawHeader();
    const fullPageRowHeight = TOP - MARGIN - headerHeight;

    for (const [rowIndex, cells] of definition.rows.entries()) {
        let pending = measureRow(cells, definition.widths, definition.style);
        if (rowIndex === 0 && pending.height > context.state.y - MARGIN) {
            while (pending) {
                const { chunk, remainder } = splitRow(pending, context.state.y - MARGIN);
                context.state.y = drawRow({
                    ...tableDrawOptions(context, definition.widths, chunk),
                    tableId: definition.id,
                    rowKind: 'body',
                });
                pending = remainder;
                if (pending) {
                    addPage(context);
                    drawHeader();
                }
            }
            continue;
        }
        if (pending.height <= fullPageRowHeight) {
            if (context.state.y - pending.height < MARGIN) {
                addPage(context);
                drawHeader();
            }
            context.state.y = drawRow({
                ...tableDrawOptions(context, definition.widths, pending),
                tableId: definition.id,
                rowKind: 'body',
            });
            continue;
        }

        const freshTableY = TOP - headerHeight;
        if (context.state.y < freshTableY - 0.1) {
            addPage(context);
            drawHeader();
        }
        while (pending) {
            const { chunk, remainder } = splitRow(pending, context.state.y - MARGIN);
            context.state.y = drawRow({
                ...tableDrawOptions(context, definition.widths, chunk),
                tableId: definition.id,
                rowKind: 'body',
            });
            pending = remainder;
            if (pending) {
                addPage(context);
                drawHeader();
            }
        }
    }
}

function renderSectionTable(context, title, definition) {
    const renderDefinition = withTableFallback(definition, context.fallback);
    prepareSectionPage(context, renderDefinition);
    drawSectionHeading(context, title);
    renderTable(context, renderDefinition);
}

function renderFirstPage(context, title, session) {
    drawFlowText(context, title, {
        font: context.fonts.bold,
        size: 18,
        lineHeight: 23,
        color: COLORS.green,
        align: 'center',
        after: 1,
    });
    drawFlowText(context, `${session.order}차시 · ${session.title} (${session.sessionMinutes}분)`, {
        font: context.fonts.bold,
        size: 10,
        lineHeight: 13,
        align: 'center',
        after: 3,
    });
    renderSectionTable(context, '수업 개요', overviewDefinition(session.overview, context.fonts));
    context.state.y -= 15;
    renderSectionTable(context, '교수·학습 과정', processDefinition(session.process, context.fonts));
}

function renderSecondPage(context, session, isLastSession) {
    renderSectionTable(context, '과정중심평가', assessmentDefinition(session.assessment, context.fonts));
    context.state.y -= 15;
    renderSectionTable(context, '개별화·지원 전략', singleColumnDefinition(
        'support',
        session.supportStrategies.map(item => `• ${item}`).join('\n'),
        context.fonts,
    ));
    context.state.y -= 15;
    renderSectionTable(context, '수업 후 성찰', singleColumnDefinition('reflection', session.reflectionPrompt, context.fonts));
    context.state.y -= 15;
    renderSectionTable(
        context,
        isLastSession ? '수업 후 연계' : '다음 차시 연결',
        singleColumnDefinition('connection', session.nextSessionConnection, context.fonts),
    );
}

async function embedFonts(pdf) {
    const fontRoot = path.join(process.cwd(), 'public/fonts/paperlogy');
    const [regularFile, boldFile] = await Promise.all([
        readFile(path.join(fontRoot, 'Paperlogy-4Regular.ttf')),
        readFile(path.join(fontRoot, 'Paperlogy-7Bold.ttf')),
    ]);
    return {
        regular: await pdf.embedFont(Uint8Array.from(regularFile), { subset: true }),
        bold: await pdf.embedFont(Uint8Array.from(boldFile), { subset: true }),
    };
}

export async function buildPdf(plan, options = {}) {
    const model = buildDocumentModel(plan);
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle(model.title);
    pdf.setAuthor('AllPass Teaching');
    pdf.setSubject('교수·학습 과정안');
    pdf.setCreator('AllPass Teaching PDF Renderer');
    const fonts = await embedFonts(pdf);
    const context = {
        pdf,
        fonts,
        fallback: selectVisibleFallback(fonts.regular, fonts.bold),
        onDraw: options.onDraw,
        state: null,
    };

    model.sessions.forEach((session, index) => {
        addPage(context);
        renderFirstPage(context, model.title, session);
        addPage(context);
        renderSecondPage(context, session, index === model.sessions.length - 1);
    });
    return pdf.save();
}
