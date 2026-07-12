import { afterEach, beforeEach, expect, test } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createRecordContext, recordContextIncludesSubmission, verifyRecordContext } from '@/lib/record-context-token.js';

beforeEach(() => { process.env.GRADING_INTEGRITY_SECRET = randomBytes(32).toString('hex'); });
afterEach(() => { delete process.env.GRADING_INTEGRITY_SECRET; });

const lessonPlan = { title: '식물 수업', standards: [{ code: '6과11-02', text: '식물을 관찰한다.' }] };
const assessment = { title: '식물 평가', sourceHash: 'lesson-source', approved: true };
const students = [
    { id: 'student-1', grade: '6', className: '1', number: 1, name: '김학생' },
    { id: 'student-2', grade: '6', className: '1', number: 2, name: '이학생' },
];
const submissions = [{
    id: 'submission-1', studentId: 'student-1', sourceHash: 'grading-source', gradingRevision: 4,
    grading: { sourceHash: 'grading-source', originToken: 'a'.repeat(64), approvalToken: 'b'.repeat(64) },
}];

test('Given current workflow state When issuing a record context Then it cryptographically binds roster lesson assessment and approval lineage', () => {
    const now = 1_700_000_000_000;

    const context = createRecordContext({ lessonPlan, assessment, students, submissions }, now);

    expect(context.payload.projectRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyRecordContext(context, { lessonPlan, assessment, students }, now + 1_000)).toBe(true);
    expect(recordContextIncludesSubmission(context, submissions[0])).toBe(true);
    expect(verifyRecordContext(context, { lessonPlan, assessment, students: students.slice(1) }, now + 1_000)).toBe(false);
    expect(recordContextIncludesSubmission(context, { ...submissions[0], gradingRevision: 5 })).toBe(false);
});

test('Given an expired signed context When verifying Then it fails closed', () => {
    const now = 1_700_000_000_000;
    const context = createRecordContext({ lessonPlan, assessment, students, submissions }, now);

    expect(verifyRecordContext(context, { lessonPlan, assessment, students }, now + 5 * 60_000 + 1)).toBe(false);
});
