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
    if (value && typeof value === 'object') {
        if ('result' in value) return value.result;
        if ('text' in value) return value.text;
        if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
    }
    return value ?? '';
}

export async function parseRosterWorkbook(bytes, options = {}) {
    try {
        const workbook = await newWorkbook();
        await workbook.xlsx.load(bytes);
        const sheet = workbook.worksheets[0];
        if (!sheet) return { headers: [], students: [], issues: [{ row: 1, column: '파일', code: 'sheet', message: '학생 명단 시트를 찾을 수 없습니다.' }] };
        const headers = ROSTER_HEADERS.map((_, index) => String(cellValue(sheet.getRow(1).getCell(index + 1))).trim());
        const headerIssues = ROSTER_HEADERS.flatMap((expected, index) => headers[index] === expected ? [] : [{
            row: 1,
            column: expected,
            code: 'header',
            message: `1행 ${index + 1}열은 '${expected}'이어야 합니다.`,
        }]);
        if (headerIssues.length) return { headers, students: [], issues: headerIssues };
        const rows = [];
        for (let row = 2; row <= sheet.rowCount; row += 1) {
            const values = ROSTER_HEADERS.map((_, index) => cellValue(sheet.getRow(row).getCell(index + 1)));
            rows.push(Object.fromEntries(ROSTER_HEADERS.map((header, index) => [header, values[index]])));
        }
        return { headers, ...normalizeRosterRows(rows, options) };
    } catch {
        return { headers: [], students: [], issues: [{ row: 1, column: '파일', code: 'workbook', message: 'Excel 파일을 읽을 수 없습니다.' }] };
    }
}
