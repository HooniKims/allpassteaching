import { describe, expect, test } from 'vitest';
import {
    MAX_STUDENTS,
    academicStudentKey,
    createStudent,
    normalizeRosterRows,
    removeStudentFromProject,
    replaceProjectRoster,
    validateRoster,
} from '@/lib/student-roster.js';

const fixedIds = (...ids) => {
    let index = 0;
    return () => ids[index++];
};

describe('student roster domain', () => {
    test('Given one valid row When normalizing Then it creates a generated stable identifier and preserves academic fields', () => {
        const result = normalizeRosterRows(
            [{ 학년: '2', 반: '3', 번호: 7, 이름: '김하늘' }],
            { idFactory: fixedIds('2e06f73e-a96e-4f6e-9158-00f5865a45e6') },
        );

        expect(result).toEqual({
            students: [{ id: 'student-2e06f73e-a96e-4f6e-9158-00f5865a45e6', grade: '2', className: '3', number: 7, name: '김하늘' }],
            issues: [],
        });
        expect(academicStudentKey(result.students[0])).toBe('2:3:7');
    });

    test('Given an existing student When editable fields change Then its identifier remains independent from the academic key', () => {
        const student = createStudent(
            { grade: '2', className: '3', number: 7, name: '김하늘' },
            fixedIds('a37ee08d-303c-4218-8c3a-179928c29730'),
        );

        const edited = { ...student, grade: '3', className: '1', number: 2, name: '김바다' };

        expect(edited.id).toBe(student.id);
        expect(academicStudentKey(edited)).toBe('3:1:2');
    });

    test('Given blank spreadsheet rows When normalizing Then it ignores them and preserves valid row order', () => {
        const result = normalizeRosterRows([
            { 학년: '', 반: '', 번호: '', 이름: '' },
            { 학년: '1', 반: '2', 번호: 8, 이름: '이봄' },
            {},
            { 학년: '1', 반: '2', 번호: 9, 이름: '박별' },
        ], { idFactory: fixedIds('id-1', 'id-2') });

        expect(result.issues).toEqual([]);
        expect(result.students.map(student => student.name)).toEqual(['이봄', '박별']);
    });

    test.each([
        [{ 학년: '2', 반: '1', 번호: 3, 이름: '' }, '이름', '필수'],
        [{ 학년: '2', 반: '1', 번호: '셋', 이름: '김하늘' }, '번호', '양의 정수'],
        [{ 학년: '', 반: '1', 번호: 3, 이름: '김하늘' }, '학년', '필수'],
    ])('Given an invalid row When normalizing Then the whole result is rejected with row and column detail', (row, column, message) => {
        const result = normalizeRosterRows([
            { 학년: '2', 반: '1', 번호: 2, 이름: '정바다' },
            row,
        ]);

        expect(result.students).toEqual([]);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ row: 3, column, message: expect.stringContaining(message) }),
        ]));
    });

    test('Given duplicate academic numbers When normalizing Then it rejects every row atomically and identifies the duplicate cell', () => {
        const rows = [
            { 학년: '2', 반: '1', 번호: 3, 이름: '김하늘' },
            { 학년: '2', 반: '1', 번호: 3, 이름: '이바다' },
        ];

        const result = normalizeRosterRows(rows);

        expect(result.students).toEqual([]);
        expect(result.issues).toEqual([
            expect.objectContaining({ row: 3, column: '번호', code: 'duplicate', message: expect.stringContaining('2행') }),
        ]);
    });

    test('Given more than fifty students When normalizing Then it rejects the entire import at the first overflow row', () => {
        const rows = Array.from({ length: MAX_STUDENTS + 1 }, (_, index) => ({
            학년: '1', 반: '1', 번호: index + 1, 이름: `학생${index + 1}`,
        }));

        const result = normalizeRosterRows(rows);

        expect(result.students).toEqual([]);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ row: MAX_STUDENTS + 2, column: '명단', code: 'limit' }),
        ]));
    });

    test('Given an edited roster When validating Then duplicate issues are reported without replacing identifiers', () => {
        const students = [
            { id: 'student-a', grade: '1', className: '2', number: 5, name: '김하늘' },
            { id: 'student-b', grade: '1', className: '2', number: 5, name: '이바다' },
        ];

        const issues = validateRoster(students);

        expect(issues).toEqual([expect.objectContaining({ row: 2, column: '번호', code: 'duplicate' })]);
        expect(students.map(student => student.id)).toEqual(['student-a', 'student-b']);
    });

    test('Given linked and legacy student data When deleting by stable ID Then only explicitly linked data is removed', () => {
        const project = {
            students: [{ id: 'student-a' }, { id: 'student-b' }],
            submissions: [
                { id: 'submission-a', studentId: 'student-a', studentName: '같은이름' },
                { id: 'submission-b', studentId: 'student-b', studentName: '다른학생' },
                { id: 'submission-legacy', studentName: '같은이름', needsStudentLink: true },
            ],
            records: [
                { submissionId: 'submission-a', studentId: 'student-a' },
                { submissionId: 'submission-b', studentId: 'student-b' },
                { submissionId: 'submission-legacy' },
            ],
        };

        const result = removeStudentFromProject(project, 'student-a');

        expect(result.students).toEqual([{ id: 'student-b' }]);
        expect(result.submissions.map(item => item.id)).toEqual(['submission-b', 'submission-legacy']);
        expect(result.records.map(item => item.submissionId)).toEqual(['submission-b', 'submission-legacy']);
    });

    test('Given a valid replacement roster When prior stable IDs disappear Then submissions are explicitly unlinked without name matching', () => {
        const project = {
            students: [{ id: 'student-old', name: '김하늘' }],
            submissions: [{ id: 'submission-a', studentId: 'student-old', studentName: '김하늘', needsStudentLink: false }],
            records: [{ submissionId: 'submission-a', studentId: 'student-old', studentName: '김하늘' }],
        };
        const replacement = [{ id: 'student-new', grade: '2', className: '3', number: 7, name: '김하늘' }];

        const result = replaceProjectRoster(project, replacement);

        expect(result.students).toEqual(replacement);
        expect(result.submissions[0]).toMatchObject({ studentId: null, studentName: '김하늘', needsStudentLink: true });
        expect(result.records[0]).toMatchObject({ studentId: null, studentName: '김하늘' });
    });
});
