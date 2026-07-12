import { afterEach, beforeEach, expect, test } from 'vitest';
import { randomBytes } from 'node:crypto';
import { POST } from '@/app/api/authorize-record-generation/route.js';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';
import { sourceHash } from '@/lib/source-hash.js';

const student = { id: 'student-1', grade: '6', className: '1', number: 1, name: '김학생' };
const submission = { id: 'submission-1', studentId: student.id, sourceHash: 'grading-source', gradingRevision: 4, grading: { sourceHash: 'grading-source', originToken: 'a'.repeat(64), approvalToken: 'b'.repeat(64) } };
const lessonPlan = makeGeneratedPlan();
const assessment = { ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: true };
const request = body => new Request('http://localhost/api/authorize-record-generation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => { process.env.GRADING_INTEGRITY_SECRET = randomBytes(32).toString('hex'); });
afterEach(() => { delete process.env.GRADING_INTEGRITY_SECRET; });

test('issues a short-lived no-store context for the current roster and approvals', async () => {
    const response = await POST(request({ lessonPlan, assessment, students: [student], submissions: [submission] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.context.token).toMatch(/^[a-f0-9]{64}$/);
    expect(body.context.payload.rosterStudentIds).toEqual([student.id]);
});

test('fails closed when record integrity signing is unavailable', async () => {
    delete process.env.GRADING_INTEGRITY_SECRET;

    const response = await POST(request({ lessonPlan, assessment, students: [student], submissions: [submission] }));

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
});
