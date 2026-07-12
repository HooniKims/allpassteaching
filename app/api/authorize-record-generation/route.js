import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { approvedAssessmentSchema } from '@/lib/assessment-schema';
import { gradingIntegrityAvailable } from '@/lib/grading-origin-token';
import { sourceHash } from '@/lib/source-hash';
import { createRecordContext } from '@/lib/record-context-token';
import { parseBoundedJsonRequest, publicValidationIssues, requestBoundaryError } from '@/lib/api-request-boundary';

const noStoreHeaders = { 'Cache-Control': 'no-store' };
const json = (body, init = {}) => Response.json(body, { ...init, headers: { ...init.headers, ...noStoreHeaders } });

const studentSchema = z.object({
    id: z.string().min(1).max(300), grade: z.string().max(20), className: z.string().max(30),
    number: z.number().int().min(1).max(1000).nullable(), name: z.string().min(1).max(100),
}).strict();

const submissionSchema = z.object({
    id: z.string().min(1).max(200), studentId: z.string().min(1).max(300), sourceHash: z.string().min(1).max(100),
    gradingRevision: z.number().int().min(0),
    grading: z.object({
        sourceHash: z.string().min(1).max(100),
        originToken: z.string().regex(/^[a-f0-9]{64}$/),
        approvalToken: z.string().regex(/^[a-f0-9]{64}$/),
    }).passthrough(),
}).passthrough();

const requestSchema = z.object({
    lessonPlan: lessonPlanSchema,
    assessment: approvedAssessmentSchema,
    students: z.array(studentSchema).min(1).max(50),
    submissions: z.array(submissionSchema).min(1).max(50),
}).strict();

export async function POST(request) {
    const boundary = await parseBoundedJsonRequest(request);
    if (!boundary.ok) {
        const error = requestBoundaryError(boundary.reason);
        return json(error.body, { status: error.status });
    }
    const body = boundary.value;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return json({ code: 'invalid_request', message: '현재 명단과 승인 결과를 확인해주세요.', issues: publicValidationIssues(parsed.error.issues) }, { status: 400 });
    const { lessonPlan, assessment, students, submissions } = parsed.data;
    if (!gradingIntegrityAvailable()) return json({ code: 'integrity_unavailable', message: '채점 무결성 설정을 확인해주세요.' }, { status: 503 });
    if (assessment.sourceHash !== sourceHash(lessonPlan)) return json({ code: 'stale_assessment', message: '현재 지도안으로 수행평가를 다시 승인해주세요.' }, { status: 409 });
    const rosterIds = new Set(students.map(student => student.id));
    if (rosterIds.size !== students.length || submissions.some(submission => !rosterIds.has(submission.studentId))) {
        return json({ code: 'stale_context', message: '현재 학생 명단과 승인 결과가 일치하지 않습니다.' }, { status: 409 });
    }
    return json({ context: createRecordContext({ lessonPlan, assessment, students, submissions }) });
}
