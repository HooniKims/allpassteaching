const characterSetCache = new WeakMap();

function fontCharacterSet(font) {
    if (!font?.getCharacterSet) return null;
    if (!characterSetCache.has(font)) characterSetCache.set(font, new Set(font.getCharacterSet()));
    return characterSetCache.get(font);
}

function supportedFallback(font, preferred) {
    const characterSet = fontCharacterSet(font);
    if (!characterSet || characterSet.has(preferred.codePointAt(0))) return preferred;
    for (const candidate of ['□', '?']) {
        if (characterSet.has(candidate.codePointAt(0))) return candidate;
    }
    const visibleCodePoint = [...characterSet].find(codePoint => codePoint >= 0x21 && codePoint !== 0x7F);
    return visibleCodePoint === undefined ? '?' : String.fromCodePoint(visibleCodePoint);
}

export function selectVisibleFallback(regular, bold) {
    const regularSet = fontCharacterSet(regular);
    const boldSet = fontCharacterSet(bold);
    if (!regularSet || !boldSet) return '?';
    for (const candidate of ['□', '?']) {
        const codePoint = candidate.codePointAt(0);
        if (regularSet.has(codePoint) && boldSet.has(codePoint)) return candidate;
    }
    const sharedCodePoint = [...regularSet].find(codePoint => (
        boldSet.has(codePoint) && codePoint >= 0x21 && codePoint !== 0x7F
    ));
    return sharedCodePoint === undefined ? '?' : String.fromCodePoint(sharedCodePoint);
}

export function sanitizePdfText(value, font, fallback = '?') {
    const normalized = String(value ?? '').replace(/\r\n?/g, '\n');
    const characterSet = fontCharacterSet(font);
    const visibleFallback = supportedFallback(font, fallback);
    let result = '';
    for (const character of normalized) {
        const codePoint = character.codePointAt(0);
        const isSupportedControl = codePoint === 0x9 || codePoint === 0xA;
        const isControl = codePoint < 0x20 || (codePoint >= 0x7F && codePoint <= 0x9F);
        const isLoneSurrogate = codePoint >= 0xD800 && codePoint <= 0xDFFF;
        const isNoncharacter = (codePoint >= 0xFDD0 && codePoint <= 0xFDEF)
            || (codePoint & 0xFFFF) >= 0xFFFE;
        const isUnsupported = characterSet && !characterSet.has(codePoint);
        result += (!isSupportedControl && isControl) || isLoneSurrogate || isNoncharacter || (!isSupportedControl && isUnsupported)
            ? visibleFallback
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
    let pendingSpaces = '';
    let spacesAreIndentation = false;

    for (const token of tokens) {
        if (/^ +$/.test(token)) {
            if (!pendingSpaces) spacesAreIndentation = line === '' && lines.length === 0;
            pendingSpaces += token;
            continue;
        }
        if (line && font.widthOfTextAtSize(line + pendingSpaces + token, fontSize) <= maxWidth) {
            line += pendingSpaces + token;
            pendingSpaces = '';
            continue;
        }
        if (line) {
            lines.push(line);
            line = '';
        }
        if (spacesAreIndentation && font.widthOfTextAtSize(pendingSpaces + token, fontSize) <= maxWidth) {
            line = pendingSpaces + token;
            pendingSpaces = '';
            spacesAreIndentation = false;
            continue;
        }
        pendingSpaces = '';
        spacesAreIndentation = false;
        const chunks = splitOverlongToken(token, font, fontSize, maxWidth);
        line = chunks.pop() ?? '';
        lines.push(...chunks);
    }
    if (line) lines.push(line);
    if (lines.length === 0) lines.push('');
    if (lines.length >= 2 && !lines.at(-1).includes(' ')) {
        const previousTokens = lines.at(-2).split(' ');
        const movedToken = previousTokens.at(-1);
        const balancedLastLine = `${movedToken} ${lines.at(-1)}`;
        if (previousTokens.length > 1 && font.widthOfTextAtSize(balancedLastLine, fontSize) <= maxWidth) {
            lines[lines.length - 2] = previousTokens.slice(0, -1).join(' ');
            lines[lines.length - 1] = balancedLastLine;
        }
    }
    return lines;
}

export function wrapText(value, font, fontSize, maxWidth, fallback = '?') {
    return sanitizePdfText(value, font, fallback)
        .split('\n')
        .flatMap(paragraph => wrapParagraph(paragraph, font, fontSize, maxWidth));
}

function normalizedCell(cell, style) {
    const specification = typeof cell === 'object' && cell !== null && 'text' in cell ? cell : { text: cell };
    const fontSize = specification.fontSize ?? style.fontSize;
    const font = specification.font ?? style.font;
    const fallback = specification.fallback ?? style.fallback ?? '?';
    return {
        text: sanitizePdfText(specification.text, font, fallback),
        font,
        fallback,
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
    measured.lines = wrapText(measured.text, measured.font, measured.fontSize, width - measured.padding * 2, measured.fallback);
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

export function measureTableHeader(definition) {
    return definition.header?.length
        ? measureRow(definition.header, definition.widths, definition.headerStyle)
        : null;
}

export function withTableFallback(definition, fallback) {
    return {
        ...definition,
        style: { ...definition.style, fallback },
        headerStyle: definition.headerStyle ? { ...definition.headerStyle, fallback } : undefined,
    };
}

export function minimumRowStartHeight(row) {
    return Math.max(...row.cells.map(cell => cell.padding * 2 + cell.lineHeight));
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
    onDraw?.({ type: 'cell', pageIndex, tableId: options.tableId, x, top: y, bottom: y - height, width, height });
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
            tableId: options.tableId,
            text: line,
            sourceText: cell.text,
            lineIndex: cell.lineStart + index,
            x: textX(cell, x, width, line),
            y: baseline,
            top: baseline + ascent,
            bottom: baseline - descent,
            fontSize: cell.fontSize,
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
