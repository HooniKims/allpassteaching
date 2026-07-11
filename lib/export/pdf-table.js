export function sanitizePdfText(value) {
    const normalized = String(value ?? '').replace(/\r\n?/g, '\n');
    let result = '';
    for (const character of normalized) {
        const codePoint = character.codePointAt(0);
        const isSupportedControl = codePoint === 0x9 || codePoint === 0xA;
        const isControl = codePoint < 0x20 || (codePoint >= 0x7F && codePoint <= 0x9F);
        const isLoneSurrogate = codePoint >= 0xD800 && codePoint <= 0xDFFF;
        const isNoncharacter = (codePoint >= 0xFDD0 && codePoint <= 0xFDEF)
            || (codePoint & 0xFFFF) >= 0xFFFE;
        result += (!isSupportedControl && isControl) || isLoneSurrogate || isNoncharacter
            ? '\uFFFD'
            : character;
    }
    return result;
}

function splitOverlongToken(token, font, fontSize, maxWidth) {
    const chunks = [];
    let chunk = '';
    for (const character of token) {
        if (chunk && font.widthOfTextAtSize(chunk + character, fontSize) > maxWidth) {
            chunks.push(chunk);
            chunk = character;
        } else {
            chunk += character;
        }
    }
    if (chunk || token === '') chunks.push(chunk);
    return chunks;
}

function wrapParagraph(paragraph, font, fontSize, maxWidth) {
    const tokens = paragraph.replaceAll('\t', '    ').match(/ +|[^ ]+/gu) ?? [''];
    const lines = [];
    let line = '';
    const pushLine = () => {
        lines.push(line.trim() ? line.trimEnd() : line);
        line = '';
    };

    for (const token of tokens) {
        if (font.widthOfTextAtSize(line + token, fontSize) <= maxWidth) {
            line += token;
            continue;
        }
        if (line) pushLine();
        const chunks = splitOverlongToken(token, font, fontSize, maxWidth);
        line = chunks.pop() ?? '';
        lines.push(...chunks);
    }
    if (line || lines.length === 0) pushLine();
    return lines;
}

export function wrapText(value, font, fontSize, maxWidth) {
    return sanitizePdfText(value)
        .split('\n')
        .flatMap(paragraph => wrapParagraph(paragraph, font, fontSize, maxWidth));
}

function normalizedCell(cell, style) {
    const specification = typeof cell === 'object' && cell !== null && 'text' in cell ? cell : { text: cell };
    const fontSize = specification.fontSize ?? style.fontSize;
    return {
        text: sanitizePdfText(specification.text),
        font: specification.font ?? style.font,
        fontSize,
        lineHeight: specification.lineHeight ?? style.lineHeight ?? fontSize * 1.3,
        padding: specification.padding ?? style.padding ?? 3,
        align: specification.align ?? style.align ?? 'left',
        color: specification.color ?? style.color,
        fill: specification.fill ?? style.fill,
        lineStart: 0,
    };
}

export function measureCell(cell, width, style) {
    const measured = normalizedCell(cell, style);
    measured.lines = wrapText(measured.text, measured.font, measured.fontSize, width - measured.padding * 2);
    measured.height = measured.padding * 2 + Math.max(measured.lines.length, 1) * measured.lineHeight;
    return measured;
}

function rowHeight(cells, minimumHeight = 0) {
    return Math.max(minimumHeight, ...cells.map(cell => (
        cell.padding * 2 + Math.max(cell.lines.length, 1) * cell.lineHeight
    )));
}

export function measureRow(cells, widths, style) {
    const measuredCells = cells.map((cell, index) => measureCell(cell, widths[index], style));
    return { cells: measuredCells, height: rowHeight(measuredCells, style.minimumHeight) };
}

export function splitRow(row, maxHeight) {
    if (row.height <= maxHeight) return { chunk: row, remainder: null };
    const chunkCells = [];
    const remainderCells = [];
    let hasRemainder = false;
    for (const cell of row.cells) {
        const capacity = Math.max(1, Math.floor((maxHeight - cell.padding * 2) / cell.lineHeight));
        const lineCount = Math.min(capacity, cell.lines.length);
        const lines = cell.lines.slice(0, lineCount);
        const remainingLines = cell.lines.slice(lineCount);
        chunkCells.push({ ...cell, lines, height: cell.padding * 2 + Math.max(lines.length, 1) * cell.lineHeight });
        remainderCells.push({
            ...cell,
            lines: remainingLines,
            lineStart: cell.lineStart + lineCount,
            height: cell.padding * 2 + Math.max(remainingLines.length, 1) * cell.lineHeight,
        });
        hasRemainder ||= remainingLines.length > 0;
    }
    return {
        chunk: { cells: chunkCells, height: rowHeight(chunkCells) },
        remainder: hasRemainder ? { cells: remainderCells, height: rowHeight(remainderCells) } : null,
    };
}

function textX(cell, x, width, line) {
    const textWidth = cell.font.widthOfTextAtSize(line, cell.fontSize);
    if (cell.align === 'center') return x + Math.max(cell.padding, (width - textWidth) / 2);
    if (cell.align === 'right') return x + width - cell.padding - textWidth;
    return x + cell.padding;
}

export function drawCell(options) {
    const { page, pageIndex, x, y, width, height, cell, borderColor, onDraw } = options;
    const rectangle = { x, y: y - height, width, height, borderColor, borderWidth: 0.45 };
    if (cell.fill) rectangle.color = cell.fill;
    page.drawRectangle(rectangle);
    onDraw?.({ type: 'cell', pageIndex, x, top: y, bottom: y - height, width, height });
    cell.lines.forEach((line, index) => {
        if (!line) return;
        const baseline = y - cell.padding - cell.fontSize - index * cell.lineHeight;
        const ascent = cell.font.heightAtSize(cell.fontSize, { descender: false });
        const descent = Math.max(0, cell.font.heightAtSize(cell.fontSize) - ascent);
        page.drawText(line, {
            x: textX(cell, x, width, line),
            y: baseline,
            size: cell.fontSize,
            font: cell.font,
            color: cell.color,
        });
        onDraw?.({
            type: 'text',
            pageIndex,
            text: line,
            sourceText: cell.text,
            lineIndex: cell.lineStart + index,
            x: textX(cell, x, width, line),
            y: baseline,
            top: baseline + ascent,
            bottom: baseline - descent,
        });
    });
}

export function drawRow(options) {
    const { widths, row, x, y } = options;
    let cellX = x;
    row.cells.forEach((cell, index) => {
        drawCell({ ...options, x: cellX, width: widths[index], height: row.height, cell });
        cellX += widths[index];
    });
    options.onDraw?.({
        type: options.rowKind === 'header' ? 'table-header' : 'table-row',
        tableId: options.tableId,
        pageIndex: options.pageIndex,
        top: y,
        bottom: y - row.height,
    });
    return y - row.height;
}

export function drawTableHeader(options) {
    return drawRow(options);
}

export function ensureSpace(state, requiredHeight, startPage) {
    return state.y - requiredHeight >= state.margin ? state : startPage();
}
