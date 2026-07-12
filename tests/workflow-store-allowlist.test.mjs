import { beforeEach, expect, test } from 'vitest';
import { createDefaultAssessmentRequest } from '@/lib/assessment-request';
import { createGenerationSnapshot } from '@/lib/lesson-input';
import { gradingSourceHash, recordSourceHash } from '@/lib/workflow-lineage';
import { loadWorkflow, saveWorkflow, WORKFLOW_KEY, WORKFLOW_VERSION } from '@/lib/workflow-store';
import { sourceHash } from '@/lib/source-hash';
import { generationDraft, makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment, makeWorksheet } from './fixtures/workflow.mjs';

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

function fullWorkflow() {
    const plan = makeGeneratedPlan();
    const assessment = { ...makeAssessment(), sourceHash: sourceHash(plan), approved: true };
    const grading = {
        criteria: assessment.rubric.criteria.map(criterion => ({
            criterionId: criterion.id,
            score: criterion.levels[1].score,
            evidence: `${criterion.name} 관찰 근거`,
            feedback: `${criterion.name} 피드백`,
        })),
        totalScore: assessment.rubric.criteria.reduce((sum, criterion) => sum + criterion.levels[1].score, 0),
        summary: '관찰 근거를 활용했습니다.',
        nextSteps: '다른 기관에도 설명을 적용해보세요.',
    };
    const submission = {
        id: 'submission-a', studentId: 'student-a', needsStudentLink: false, studentName: '김하늘', fileName: '김하늘.pdf',
        status: 'approved', extractedText: '관찰 결과와 구조·기능 설명을 충분히 기록한 학생 제출 내용입니다.', ocrModel: 'document-parse', pageCount: 2,
        grading, approved: true, approvalRevoked: false, error: '',
    };
    submission.sourceHash = gradingSourceHash(assessment, submission.extractedText);
    const record = {
        submissionId: submission.id, studentId: submission.studentId, studentName: submission.studentName,
        sourceHash: recordSourceHash(assessment, submission), status: 'done', text: '승인된 수행 증거를 바탕으로 작성한 세특 문장입니다.', error: '', approved: true,
    };
    const request = createDefaultAssessmentRequest();
    request.assessmentName = assessment.assessmentName;
    request.teacherIntent = structuredClone(assessment.backwardDesign.teacherIntent);
    return {
        activeProcess: 'records',
        lessonSnapshot: {
            ...structuredClone(generationDraft), step: 4, maxReached: 4,
            plan, originalPlan: structuredClone(plan), generatedFrom: createGenerationSnapshot(generationDraft),
        },
        worksheet: { ...makeWorksheet(), sourceHash: sourceHash(plan) },
        assessmentRequest: request,
        assessment,
        students: [{ id: 'student-a', grade: '2', className: '3', number: 7, name: '김하늘' }],
        submissions: [submission],
        records: [record],
    };
}

test('version 2 allowlist round-trips every workflow subtree the current app consumes', () => {
    const project = fullWorkflow();

    saveWorkflow(project);

    expect(loadWorkflow()).toEqual(project);
    expect(JSON.parse(window.sessionStorage.getItem(WORKFLOW_KEY)).version).toBe(WORKFLOW_VERSION);
    expect(WORKFLOW_VERSION).toBe(2);
});

test('renamed sensitive fields and runtime-like objects are dropped at arbitrary nesting depths', () => {
    const project = fullWorkflow();
    const expected = structuredClone(project);
    project.lessonSnapshot.thumbnailObjectUrl = 'blob:http://localhost/lesson';
    project.lessonSnapshot.plan.metadata.originalBase64 = 'JVBERi0xLjQ=';
    project.lessonSnapshot.plan.previewAsset = new File(['private'], 'preview.pdf', { type: 'application/pdf' });
    project.worksheet.document.sections[0].rawResponse = { provider: 'secret worksheet payload' };
    project.worksheet.document.binaryCache = new Blob(['private'], { type: 'application/pdf' });
    project.worksheet.teacherKey.answers[0].unknownBinary = new Uint8Array([80, 68, 70]);
    project.assessment.task.thumbnailObjectUrl = 'blob:http://localhost/assessment';
    project.assessment.rubric.criteria[0].rawResponse = { provider: 'secret assessment payload' };
    project.assessment.cover.sections[0].runtimeHandle = new AbortController();
    project.assessment.cover.sections[0].opaqueBuffer = new ArrayBuffer(8);
    project.submissions[0].originalBase64 = 'cHJpdmF0ZSBzdWJtaXNzaW9u';
    project.submissions[0].grading.criteria[0].rawResponse = { provider: 'secret grading payload' };
    project.records[0].thumbnailObjectUrl = 'blob:http://localhost/record';
    project.records[0].runtimeHandle = { toJSON: () => ({ provider: 'secret record payload' }) };

    saveWorkflow(project);
    const raw = window.sessionStorage.getItem(WORKFLOW_KEY);
    const forbiddenValues = ['thumbnailObjectUrl', 'originalBase64', 'previewAsset', 'rawResponse', 'binaryCache', 'unknownBinary', 'runtimeHandle', 'opaqueBuffer', 'secret worksheet payload', 'secret assessment payload', 'secret grading payload', 'secret record payload'];

    for (const forbidden of forbiddenValues) expect(raw).not.toContain(forbidden);
    expect(loadWorkflow()).toEqual(expected);

    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 2, data: project }));
    expect(loadWorkflow()).toEqual(expected);
    for (const forbidden of forbiddenValues) expect(window.sessionStorage.getItem(WORKFLOW_KEY)).not.toContain(forbidden);
});

test('binary encodings and object URLs are rejected even when placed under otherwise allowed field names', () => {
    const project = fullWorkflow();
    project.assessment.task.title = 'blob:http://localhost/renamed';
    project.worksheet.teacherKey.answers[0].answer = 'data:application/pdf;base64,JVBERi0xLjQ=';
    project.records[0].text = 'cHJpdmF0ZSBzdWJtaXNzaW9u';
    project.students[0].name = 'c3R1ZGVudCBwcml2YXRl';
    project.submissions[0].grading.criteria[0].feedback = new Uint8Array([1, 2, 3]);

    saveWorkflow(project);
    const raw = window.sessionStorage.getItem(WORKFLOW_KEY);

    expect(raw).not.toContain('blob:http://localhost/renamed');
    expect(raw).not.toContain('data:application/pdf;base64');
    expect(raw).not.toContain('cHJpdmF0ZSBzdWJtaXNzaW9u');
    expect(raw).not.toContain('c3R1ZGVudCBwcml2YXRl');
    expect(raw).not.toContain('"0":1');
});
