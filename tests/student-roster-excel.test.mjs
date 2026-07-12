import ExcelJS from 'exceljs';
import { describe, expect, test } from 'vitest';
import { createRosterTemplate, parseRosterWorkbook, ROSTER_HEADERS } from '@/lib/student-roster-excel.js';

async function workbookBytes(rows, headers = ROSTER_HEADERS) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('학생 명단');
    sheet.addRow(headers);
    for (const row of rows) sheet.addRow(row);
    return workbook.xlsx.writeBuffer();
}

describe('private roster workbook adapter', () => {
    test('Given a template request When creating the workbook Then it contains only the exact four roster headers', async () => {
        const bytes = await createRosterTemplate();

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(bytes);
        const headers = workbook.getWorksheet('학생 명단').getRow(1).values.slice(1);

        expect(headers).toEqual(['학년', '반', '번호', '이름']);
        expect(workbook.worksheets).toHaveLength(1);
    });

    test('Given a valid workbook When parsing Then row order is preserved and no network request is used', async () => {
        const originalFetch = globalThis.fetch;
        const fetchCalls = [];
        globalThis.fetch = (...args) => { fetchCalls.push(args); throw new Error('network must not be used'); };
        try {
            const bytes = await workbookBytes([
                ['2', '3', 7, '김하늘'],
                ['', '', '', ''],
                ['2', '3', 8, '이바다'],
            ]);

            const result = await parseRosterWorkbook(bytes, { idFactory: () => crypto.randomUUID() });

            expect(result.headers).toEqual(ROSTER_HEADERS);
            expect(result.issues).toEqual([]);
            expect(result.students.map(student => student.name)).toEqual(['김하늘', '이바다']);
            expect(fetchCalls).toEqual([]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test('Given a workbook with a missing exact header When parsing Then it reports row and column and returns no students', async () => {
        const bytes = await workbookBytes([['2', '3', 7, '김하늘']], ['학년', '학급', '번호', '이름']);

        const result = await parseRosterWorkbook(bytes);

        expect(result.students).toEqual([]);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ row: 1, column: '반', code: 'header' }),
        ]));
    });

    test('Given duplicate and invalid rows When parsing Then every candidate is rejected with spreadsheet row and column details', async () => {
        const bytes = await workbookBytes([
            ['2', '3', 7, '김하늘'],
            ['2', '3', 7, '이바다'],
            ['2', '3', '일곱', '박별'],
        ]);

        const result = await parseRosterWorkbook(bytes);

        expect(result.students).toEqual([]);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ row: 3, column: '번호', code: 'duplicate' }),
            expect.objectContaining({ row: 4, column: '번호', code: 'number' }),
        ]));
    });
});
