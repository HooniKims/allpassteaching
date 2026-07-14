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
        gradingRevision: 7,
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
        recordTargetBytes: 700,
    };
}

test('version 4 allowlist round-trips every workflow subtree the current app consumes', () => {
    const project = fullWorkflow();

    saveWorkflow(project);

    expect(loadWorkflow()).toEqual(project);
    expect(JSON.parse(window.localStorage.getItem(WORKFLOW_KEY)).version).toBe(WORKFLOW_VERSION);
    expect(WORKFLOW_VERSION).toBe(4);
});

test('an already-clean full version 2 project migrates to version 4 without changing any allowed data', () => {
    const project = fullWorkflow();
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 2, data: project }));

    const loaded = loadWorkflow();

    expect(loaded).toEqual(project);
    expect(JSON.parse(window.localStorage.getItem(WORKFLOW_KEY))).toMatchObject({ version: 4, data: project });
});

test('worksheet authoring metadata and all ten question variants survive the private workflow allowlist', () => {
    const project = fullWorkflow();
    const questionTypes = [
        'blank', 'short-answer', 'descriptive', 'essay', 'true-false',
        'multiple-choice-5', 'table-chart', 'drawing-diagram', 'experiment-record', 'self-assessment',
    ];
    project.worksheet.generationRequest = { additionalRequirements: '표와 그림 문항을 포함하세요.', questionTypes };
    project.worksheet.document.sections[0].questions = questionTypes.map((type, index) => {
        const common = { id: `q-${index + 1}`, type, prompt: `${type} 문항`, standardCodes: ['6과11-02'] };
        if (type === 'multiple-choice-5') return { ...common, choices: ['①', '②', '③', '④', '⑤'], responseLines: 1 };
        if (type === 'table-chart' || type === 'drawing-diagram') return { ...common, responseAreaHeight: 180 };
        return { ...common, responseLines: 4 };
    });
    project.worksheet.document.sections = [project.worksheet.document.sections[0]];
    project.worksheet.teacherKey.answers = project.worksheet.document.sections[0].questions.map(question => ({
        questionId: question.id,
        answer: `${question.type} 예시 답안`,
    }));

    saveWorkflow(project);

    expect(loadWorkflow()?.worksheet).toEqual(project.worksheet);
});

test('allowlisted ordinary ASCII and base64-like educational text round-trips exactly', () => {
    const project = fullWorkflow();
    project.assessment.task.title = 'ChristopherRobin';
    project.students[0].name = 'electromagnetism';
    project.worksheet.document.title = 'PhotosynthesisAB';
    project.worksheet.teacherKey.answers[0].answer = 'ChristopherRobin';
    project.records[0].text = 'PhotosynthesisAB';

    saveWorkflow(project);

    expect(loadWorkflow()).toEqual(project);
});

test('Given a pending record comparison When refreshing the tab Then current previous and candidate drafts remain separate', () => {
    const project = fullWorkflow();
    project.records[0] = {
        ...project.records[0], text: '현재 교사 문장', previousText: '재생성 전 문장',
        candidateText: '새 AI 후보', candidateSourceHash: 'candidate-source', approved: false,
    };

    saveWorkflow(project);

    expect(loadWorkflow().records[0]).toMatchObject({
        text: '현재 교사 문장', previousText: '재생성 전 문장',
        candidateText: '새 AI 후보', candidateSourceHash: 'candidate-source', approved: false,
    });
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
    const raw = window.localStorage.getItem(WORKFLOW_KEY);
    const forbiddenValues = ['thumbnailObjectUrl', 'originalBase64', 'previewAsset', 'rawResponse', 'binaryCache', 'unknownBinary', 'runtimeHandle', 'opaqueBuffer', 'secret worksheet payload', 'secret assessment payload', 'secret grading payload', 'secret record payload'];

    for (const forbidden of forbiddenValues) expect(raw).not.toContain(forbidden);
    expect(raw).not.toContain('JVBERi0xLjQ=');
    expect(raw).not.toContain('cHJpdmF0ZSBzdWJtaXNzaW9u');
    expect(loadWorkflow()).toEqual(expected);

    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 2, data: project }));
    expect(loadWorkflow()).toEqual(expected);
    const cleanedRaw = window.localStorage.getItem(WORKFLOW_KEY);
    for (const forbidden of [...forbiddenValues, 'JVBERi0xLjQ=', 'cHJpdmF0ZSBzdWJtaXNzaW9u']) expect(cleanedRaw).not.toContain(forbidden);
});

test('object URLs and non-text binary values are rejected under otherwise allowed field names', () => {
    const project = fullWorkflow();
    project.assessment.task.title = 'blob:http://localhost/renamed';
    project.worksheet.teacherKey.answers[0].answer = 'data:application/pdf;base64,JVBERi0xLjQ=';
    project.submissions[0].grading.criteria[0].feedback = new Uint8Array([1, 2, 3]);

    saveWorkflow(project);
    const raw = window.localStorage.getItem(WORKFLOW_KEY);

    expect(raw).not.toContain('blob:http://localhost/renamed');
    expect(raw).not.toContain('data:application/pdf;base64');
    expect(raw).not.toContain('"0":1');
});

test('safe student evidence metadata round-trips while runtime document fields remain excluded', () => {
    const project = fullWorkflow();
    project.submissions[0] = {
        ...project.submissions[0],
        packetPages: [1, 2, 3],
        answerPages: [2, 3],
        ocrMode: 'enhanced',
        elements: [{ id: 'element-1', page: 2, category: 'text', text: '광합성 설명', confidence: 0.98, coordinates: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.3 }] }],
        elementsTruncated: false,
        originalAttached: false,
        originalReviewedAt: '2026-07-12T12:34:56.000Z',
        packetFile: new File(['private'], 'packet.pdf', { type: 'application/pdf' }),
        answerFile: new Blob(['private'], { type: 'application/pdf' }),
        objectUrl: 'blob:http://localhost/private',
    };

    saveWorkflow(project);
    const loaded = loadWorkflow();
    const raw = window.localStorage.getItem(WORKFLOW_KEY);

    expect(loaded.submissions[0]).toMatchObject({
        packetPages: [1, 2, 3], answerPages: [2, 3], ocrMode: 'enhanced', elementsTruncated: false,
        originalAttached: false, originalReviewedAt: '2026-07-12T12:34:56.000Z',
        elements: [{ id: 'element-1', page: 2, text: '광합성 설명', confidence: 0.98 }],
    });
    for (const forbidden of ['packetFile', 'answerFile', 'objectUrl', 'blob:http://localhost/private']) expect(raw).not.toContain(forbidden);
});

test('forbidden values are dropped even when injected into every allowed value category', () => {
    const project = fullWorkflow();
    project.assessment.assessmentName = new File(['private'], 'assessment.pdf', { type: 'application/pdf' });
    project.assessment.totalPoints = new Uint8Array([60]);
    project.assessment.approved = new AbortController();
    project.students[0].name = 'data:application/octet-stream;base64,cHJpdmF0ZQ==';
    project.submissions[0].elements = [new ArrayBuffer(8)];

    saveWorkflow(project);
    const raw = window.localStorage.getItem(WORKFLOW_KEY);

    for (const forbidden of ['assessment.pdf', 'cHJpdmF0ZQ==', 'AbortController', 'ArrayBuffer', '"0":60']) expect(raw).not.toContain(forbidden);
});

test('comparison lineage is stored only while a candidate draft exists', () => {
    const project = fullWorkflow();
    project.records[0] = { ...project.records[0], previousText: '이전 문장', candidateText: '', candidateSourceHash: 'stale', candidateTargetBytes: 700, regenerationStatus: 'done' };

    saveWorkflow(project);
    expect(loadWorkflow().records[0]).not.toHaveProperty('previousText');
    expect(loadWorkflow().records[0]).not.toHaveProperty('candidateSourceHash');

    project.records[0] = { ...project.records[0], previousText: '이전 문장', candidateText: '새 후보', candidateSourceHash: 'record-v2:candidate', candidateTargetBytes: 700, candidateInvalidCode: 'length_limit', candidateInvalidMessage: '현재 분량 설정과 맞지 않습니다.', regenerationStatus: 'done' };
    saveWorkflow(project);
    expect(loadWorkflow().records[0]).toMatchObject({ previousText: '이전 문장', candidateText: '새 후보', candidateSourceHash: 'record-v2:candidate', candidateTargetBytes: 700, candidateInvalidCode: 'length_limit', candidateInvalidMessage: '현재 분량 설정과 맞지 않습니다.' });
});

test('interrupted generation states recover as retryable records after reload', () => {
    const project = fullWorkflow();
    project.records = [
        { ...project.records[0], status: 'generating', text: '' },
        { ...project.records[0], submissionId: 'submission-b', status: 'done', regenerationStatus: 'generating', text: '보존할 현재 문장' },
    ];

    saveWorkflow(project);
    const [initial, regeneration] = loadWorkflow().records;

    expect(initial).toMatchObject({ status: 'error', text: '', error: '이전 생성 작업이 중단되었습니다. 다시 시도해주세요.' });
    expect(regeneration).toMatchObject({ status: 'done', regenerationStatus: 'error', text: '보존할 현재 문장', error: '이전 재생성 작업이 중단되었습니다. 다시 시도해주세요.' });
});
