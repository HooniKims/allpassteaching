const DEFAULT_CHARACTER_WIDTH = 1050;
const DEFAULT_HORIZONTAL_MARGIN = 240;
const DEFAULT_MAX_LINES = 18;

export function splitHwpxParagraph(paragraph, width, options = {}) {
    const characters = Array.from(String(paragraph.text ?? ''));
    if (!characters.length) return [paragraph];
    const characterWidth = options.characterWidth ?? DEFAULT_CHARACTER_WIDTH;
    const horizontalMargin = options.horizontalMargin ?? DEFAULT_HORIZONTAL_MARGIN;
    const maximumLines = options.maximumLines ?? DEFAULT_MAX_LINES;
    const charactersPerLine = Math.max(1, Math.floor((width - horizontalMargin) / characterWidth));
    const chunks = [];
    let chunkStart = 0;
    let lineCount = 1;
    let lineLength = 0;
    for (let index = 0; index < characters.length; index += 1) {
        const character = characters[index];
        const startsNewLine = character === '\n' || character === '\r' || lineLength >= charactersPerLine;
        if (startsNewLine) {
            if (lineCount >= maximumLines) {
                chunks.push(characters.slice(chunkStart, index).join(''));
                chunkStart = index;
                lineCount = 1;
            } else {
                lineCount += 1;
            }
            lineLength = 0;
        }
        if (character !== '\n' && character !== '\r') lineLength += 1;
    }
    chunks.push(characters.slice(chunkStart).join(''));
    return chunks.filter((chunk, index) => chunk || index === 0).map(text => ({ ...paragraph, text }));
}

export function parallelHwpxRows(paragraphColumns, widths, makeCell, emptyParagraph) {
    const chunks = paragraphColumns.map((paragraph, index) => splitHwpxParagraph(paragraph, widths[index]));
    const rowCount = Math.max(...chunks.map(items => items.length));
    return Array.from({ length: rowCount }, (_value, rowIndex) => chunks.map((items, columnIndex) => (
        makeCell([items[rowIndex] ?? emptyParagraph()], widths[columnIndex], columnIndex, rowIndex)
    )));
}
