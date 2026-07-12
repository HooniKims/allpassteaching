import { normalizeRosterRows } from './student-roster.js';

export const ROSTER_HEADERS = Object.freeze(['학년', '반', '번호', '이름']);

async function newWorkbook() {
    const module = await import('exceljs');
    const ExcelJS = module.default ?? module;
    return new ExcelJS.Workbook();
}

export async function createRosterTemplate() {
    const workbook = await newWorkbook();
    const sheet = workbook.addWorksheet('학생 명단');
    sheet.addRow(ROSTER_HEADERS);
    sheet.columns = [
        { key: 'grade', width: 12 },
        { key: 'className', width: 12 },
        { key: 'number', width: 12 },
        { key: 'name', width: 20 },
    ];
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176F5B' } };
    header.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return workbook.xlsx.writeBuffer();
}

function cellValue(cell) {
    const value = cell.value;
    return value ?? '';
}

function hasFormula(cell) {
    return Boolean(cell.value && typeof cell.value === 'object' && ('formula' in cell.value || 'sharedFormula' in cell.value));
}

function columnLabel(index) {
    return ROSTER_HEADERS[index - 1] ?? `${index}열`;
}

function cellIsBlank(value) {
    return value == null || value === '';
}

export async function parseRosterWorkbook(bytes, options = {}) {
    try {
        const workbook = await newWorkbook();
        await workbook.xlsx.load(bytes);
        const sheet = workbook.worksheets[0];
        if (!sheet) return { headers: [], students: [], issues: [{ row: 1, column: '파일', code: 'sheet', message: '학생 명단 시트를 찾을 수 없습니다.' }] };
        const boundaryIssues = [];
        if (workbook.worksheets.length !== 1) boundaryIssues.push({ row: 1, column: '파일', code: 'sheet-count', message: '학생 명단 시트는 하나만 있어야 합니다.' });
        const columnCount = Math.max(sheet.actualColumnCount, sheet.getRow(1).actualCellCount);
        for (let column = ROSTER_HEADERS.length + 1; column <= columnCount; column += 1) {
            boundaryIssues.push({ row: 1, column: `${column}열`, code: 'extra-column', message: '학년·반·번호·이름 외의 열은 사용할 수 없습니다.' });
        }
        for (let row = 1; row <= sheet.rowCount; row += 1) {
            for (let column = 1; column <= Math.max(columnCount, ROSTER_HEADERS.length); column += 1) {
                if (hasFormula(sheet.getRow(row).getCell(column))) boundaryIssues.push({ row, column: columnLabel(column), code: 'formula', message: '수식 셀은 사용할 수 없습니다. 계산된 값을 직접 입력해주세요.' });
            }
        }
        const headers = ROSTER_HEADERS.map((_, index) => cellValue(sheet.getRow(1).getCell(index + 1)));
        const headerIssues = ROSTER_HEADERS.flatMap((expected, index) => headers[index] === expected ? [] : [{
            row: 1,
            column: expected,
            code: 'header',
            message: `1행 ${index + 1}열은 '${expected}'이어야 합니다.`,
        }]);
        if (boundaryIssues.length || headerIssues.length) return { headers, students: [], issues: [...boundaryIssues, ...headerIssues] };
        const rows = [];
        const typeIssues = [];
        for (let row = 2; row <= sheet.rowCount; row += 1) {
            const values = ROSTER_HEADERS.map((_, index) => cellValue(sheet.getRow(row).getCell(index + 1)));
            if (!values.every(cellIsBlank)) {
                for (const column of [0, 1]) {
                    if (!['string', 'number'].includes(typeof values[column])) typeIssues.push({ row, column: ROSTER_HEADERS[column], code: 'type', message: `${ROSTER_HEADERS[column]}은 글자 또는 숫자로 입력해주세요.` });
                }
                if (!['string', 'number'].includes(typeof values[2])) typeIssues.push({ row, column: '번호', code: 'type', message: '번호는 숫자로 입력해주세요.' });
                if (typeof values[3] !== 'string') typeIssues.push({ row, column: '이름', code: 'type', message: '이름은 글자로 입력해주세요.' });
            }
            rows.push(Object.fromEntries(ROSTER_HEADERS.map((header, index) => [header, values[index]])));
        }
        if (typeIssues.length) return { headers, students: [], issues: typeIssues };
        return { headers, ...normalizeRosterRows(rows, options) };
    } catch {
        return { headers: [], students: [], issues: [{ row: 1, column: '파일', code: 'workbook', message: 'Excel 파일을 읽을 수 없습니다.' }] };
    }
}
