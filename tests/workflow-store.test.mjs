import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createEmptyWorkflow, loadWorkflow, saveWorkflow, WORKFLOW_KEY, WORKFLOW_VERSION } from '@/lib/workflow-store';
import { canonicalJson, sourceHash } from '@/lib/source-hash';

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

function failLocalWrites() {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const storage = window.localStorage;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
        getItem: storage.getItem.bind(storage),
        setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
        removeItem: storage.removeItem.bind(storage),
    } });
    return () => Object.defineProperty(window, 'localStorage', descriptor);
}

test('stable source hashes ignore object key order and change with source content', () => {
    expect(sourceHash({ lesson: { subject: '과학', grade: '5' } })).toBe(sourceHash({ lesson: { grade: '5', subject: '과학' } }));
    expect(sourceHash({ subject: '과학' })).not.toBe(sourceHash({ subject: '수학' }));
});

test('source hashes use the full canonical SHA-256 digest', () => {
    const value = { lesson: { subject: '과학', grade: '5' } };
    const expected = createHash('sha256').update(canonicalJson(value)).digest('hex');

    expect(sourceHash(value)).toBe(`src-${expected}`);
});

test('persists the selected record byte target and defaults older workspaces to 700byte', () => {
    const project = { ...createEmptyWorkflow(), recordTargetBytes: 850 };
    saveWorkflow(project);
    expect(loadWorkflow()).toMatchObject({ recordTargetBytes: 850 });

    window.localStorage.clear();
    window.localStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 4, data: { activeProcess: 'records' } }));
    expect(loadWorkflow()).toMatchObject({ recordTargetBytes: 700 });
});

test('local persistence keeps structured results for refresh but never selected PDF objects', () => {
    const project = {
        ...createEmptyWorkflow(),
        activeProcess: 'grading',
        worksheet: { document: { title: '식물 학습지' } },
        assessment: { task: { title: '식물 수행평가' } },
        submissions: [{
            id: 'student-1', studentName: '김학생', fileName: '김학생.pdf', status: 'done',
            extractedText: '관찰 결과', grading: { totalScore: 85 }, file: new File(['pdf'], '김학생.pdf', { type: 'application/pdf' }),
        }],
        records: [{ submissionId: 'student-1', studentName: '김학생', text: '세특 문장' }],
    };

    saveWorkflow(project);
    const raw = window.localStorage.getItem(WORKFLOW_KEY);
    const loaded = loadWorkflow();

    expect(raw).not.toContain('"file"');
    expect(loaded).toMatchObject({ activeProcess: 'grading', worksheet: project.worksheet, assessment: project.assessment, submissions: [{ studentName: '김학생', extractedText: '관찰 결과' }], records: [{ studentName: '김학생', text: '세특 문장' }] });
    expect(loaded.submissions[0]).not.toHaveProperty('file');
    expect(window.sessionStorage.getItem(WORKFLOW_KEY)).toBeNull();
});

test('공용 학생 명단은 안정적인 ID와 순서를 보존하고 File·Blob 값은 저장하지 않는다', () => {
    const project = createEmptyWorkflow();
    project.students = [
        { id: 'student-a', grade: '2', className: '3', number: 7, name: '김하늘', privateFile: new File(['x'], '명단.xlsx') },
        { id: 'student-b', grade: '2', className: '3', number: 8, name: '이바다', privateBlob: new Blob(['x']) },
    ];

    saveWorkflow(project);
    const raw = window.localStorage.getItem(WORKFLOW_KEY);
    const loaded = loadWorkflow();

    expect(loaded.students).toEqual([
        { id: 'student-a', grade: '2', className: '3', number: 7, name: '김하늘' },
        { id: 'student-b', grade: '2', className: '3', number: 8, name: '이바다' },
    ]);
    expect(raw).not.toContain('privateFile');
    expect(raw).not.toContain('privateBlob');
});

test('현재 저장 계약은 파일·객체 URL·원시 OCR payload를 모든 중첩 결과에서 제거한다', () => {
    const project = createEmptyWorkflow();
    project.assessment = {
        title: '보존할 수행평가',
        answerPdfBase64: 'JVBERi0xLjQ=',
        objectUrl: 'blob:http://localhost/assessment',
        answerFile: new File(['pdf'], 'answer.pdf', { type: 'application/pdf' }),
    };
    project.records = [{
        submissionId: 'submission-a', text: '보존할 세특',
        objectUrl: 'blob:http://localhost/record', rawBase64: 'cmF3', rawUpstage: { pages: ['민감 원문'] },
        packetFile: new Blob(['pdf'], { type: 'application/pdf' }),
    }];

    saveWorkflow(project);
    const raw = window.localStorage.getItem(WORKFLOW_KEY);
    const loaded = loadWorkflow();

    for (const forbidden of ['answerPdfBase64', 'objectUrl', 'answerFile', 'rawBase64', 'rawUpstage', 'packetFile']) expect(raw).not.toContain(forbidden);
    expect(loaded.assessment).toEqual({ title: '보존할 수행평가' });
    expect(loaded.records).toEqual([{ submissionId: 'submission-a', text: '보존할 세특' }]);
});

test('이름만 있던 이전 제출물은 명단과 같은 이름이어도 자동 연결하지 않는다', () => {
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 2, data: {
        activeProcess: 'grading',
        students: [{ id: 'student-a', grade: '2', className: '3', number: 7, name: '김학생' }],
        submissions: [{ id: 'submission-a', studentName: '김학생', extractedText: '기존 내용' }],
    } }));

    const loaded = loadWorkflow();

    expect(loaded.submissions[0]).toMatchObject({ studentName: '김학생', studentId: null, needsStudentLink: true });
});

test('평가 요청의 세 질문과 생성 옵션을 현재 탭에 보존한다', () => {
    const project = createEmptyWorkflow();
    project.assessmentRequest.teacherIntent.desiredResult = '관찰 근거로 설명한다.';
    project.assessmentRequest.totalPoints = 60;

    saveWorkflow(project);

    expect(loadWorkflow().assessmentRequest).toMatchObject({ teacherIntent: { desiredResult: '관찰 근거로 설명한다.' }, totalPoints: 60 });
});

test('교사가 확정한 총점·수준 수와 같은 수행평가 계약을 함께 보존한다', () => {
    const project = createEmptyWorkflow();
    project.assessmentRequest = { ...project.assessmentRequest, totalPoints: 60, levelCount: 5 };
    project.assessment = { totalPoints: 60, rubric: { levels: Array.from({ length: 5 }, (_, index) => ({ id: `level-${index + 1}` })) } };

    saveWorkflow(project);
    const loaded = loadWorkflow();

    expect(loaded.assessmentRequest).toMatchObject({ totalPoints: 60, levelCount: 5 });
    expect(loaded.assessment.totalPoints).toBe(60);
    expect(loaded.assessment.rubric.levels).toHaveLength(5);
});

test('이전 GRASPS 결과에 목표와 성공 기준이 없으면 백워드 설계 내용으로 채운다', () => {
    window.localStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 4, data: {
        activeProcess: 'assessment',
        assessment: {
            backwardDesign: {
                transferGoal: '새로운 식물을 관찰해 구조와 기능을 설명한다.',
                teacherIntent: { desiredResult: '기관의 구조와 기능을 설명한다.', evidenceOfSuccess: '관찰 근거를 들어 설명한다.' },
            },
            task: { title: '식물 관찰', situation: '학교 화단', role: '식물 연구원', audience: '학급 친구', product: '관찰 보고서' },
        },
    } }));

    expect(loadWorkflow().assessment.task).toMatchObject({
        goal: '새로운 식물을 관찰해 구조와 기능을 설명한다.',
        successCriteria: '관찰 근거를 들어 설명한다.',
    });
});

test('migrates the earlier activeStage name and supplies empty collections', () => {
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 0, data: { activeStage: 'worksheet', worksheet: { title: '기존 학습지' } } }));

    const loaded = loadWorkflow();

    expect(WORKFLOW_VERSION).toBe(4);
    expect(loaded).toMatchObject({ activeProcess: 'worksheet', worksheet: { title: '기존 학습지' }, students: [], submissions: [], records: [] });
});

test('Given a clean version 2 development rubric When loading Then it upgrades to version 3 without data loss or a false regeneration flag', () => {
    const project = { ...createEmptyWorkflow(), students: [{ id: 'student-a', grade: '2', className: '3', number: 7, name: '김하늘' }] };
    project.assessment = {
        title: '개발형 수행평가', totalPoints: 10,
        rubric: {
            levels: [{ id: 'high', label: '상' }, { id: 'low', label: '하' }],
            criteria: [{ id: 'criterion-a', name: '설명', description: '근거로 설명한다.', standardCodes: ['9과01-01'], kind: 'outcome', maxPoints: 10, intervalPoints: 5, evidence: '설명문', levels: [
                { levelId: 'high', score: 10, description: '근거가 충분함' },
                { levelId: 'low', score: 5, description: '근거가 일부 있음' },
            ] }],
        },
    };
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 2, data: project }));

    const loaded = loadWorkflow();
    const stored = JSON.parse(window.localStorage.getItem(WORKFLOW_KEY));

    expect(loaded).toEqual(project);
    expect(stored.version).toBe(4);
    expect(loaded.assessment).not.toHaveProperty('requiresAssessmentRegeneration');
});

test('Given a version 2 fixed rubric When loading Then it preserves legacy descriptions and requires assessment regeneration', () => {
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 2, data: {
        activeProcess: 'grading',
        assessment: {
            task: { title: '식물 관찰', standards: [{ code: '6과11-02', text: '식물을 관찰한다.' }] },
            rubric: {
                levels: [{ id: 'excellent', label: '탁월' }, { id: 'beginning', label: '보완 필요' }],
                criteria: [{
                    id: 'criterion-1', name: '관찰 근거', description: '관찰 사실을 기록한다.', maxPoints: 10, evidence: '관찰 기록',
                    levels: { excellent: '모든 특징을 구체적으로 기록함', beginning: '관찰 기록이 제한적임' },
                }],
            },
            totalPoints: 10, approved: true,
        },
        students: [{ id: 'student-a', grade: '5', className: '1', number: 1, name: '김학생' }],
        submissions: [{ id: 'submission-a', studentName: '김학생', extractedText: '잎을 관찰함', approved: true }],
    } }));

    const loaded = loadWorkflow();

    expect(loaded.assessment).toMatchObject({
        requiresAssessmentRegeneration: true,
        approved: false,
        rubric: { criteria: [{ levels: [
            { levelId: 'excellent', description: '모든 특징을 구체적으로 기록함' },
            { levelId: 'beginning', description: '관찰 기록이 제한적임' },
        ] }] },
    });
    expect(loaded.submissions[0]).toMatchObject({ studentId: null, needsStudentLink: true, approved: false, approvalRevoked: true });
    expect(JSON.parse(window.localStorage.getItem(WORKFLOW_KEY)).version).toBe(4);
});

test('Given a local write failure When saving Then it reports failure and does not delete the session recovery copy', () => {
    const legacy = JSON.stringify({ version: 2, data: { activeProcess: 'lesson' } });
    window.sessionStorage.setItem(WORKFLOW_KEY, legacy);
    const restore = failLocalWrites();

    const saved = saveWorkflow(createEmptyWorkflow());
    restore();

    expect(saved).toBe(false);
    expect(window.sessionStorage.getItem(WORKFLOW_KEY)).toBe(legacy);
});

test('Given a valid session copy and corrupt local state When loading Then it recovers data even if the clean rewrite fails', () => {
    window.localStorage.setItem(WORKFLOW_KEY, '{corrupt-json');
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 2, data: {
        activeProcess: 'grading',
        students: [{ id: 'student-a', grade: '2', className: '3', number: 7, name: '김학생' }],
    } }));
    const restore = failLocalWrites();

    const loaded = loadWorkflow();
    restore();

    expect(loaded).toMatchObject({ activeProcess: 'grading', students: [{ id: 'student-a', name: '김학생' }] });
    expect(window.sessionStorage.getItem(WORKFLOW_KEY)).not.toBeNull();
});

test('moves a legacy session workflow into local storage', () => {
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 1, data: { lessonSnapshot: { basics: { studentNeeds: '김학생 지원 정보' } } } }));
    expect(loadWorkflow()).toMatchObject({ lessonSnapshot: { basics: { studentNeeds: '김학생 지원 정보' } } });
    expect(window.localStorage.getItem(WORKFLOW_KEY)).toContain('김학생 지원 정보');
    expect(window.sessionStorage.getItem(WORKFLOW_KEY)).toBeNull();
});

test('prefers the newer session workflow over an older local workflow during migration', () => {
    window.localStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 4, savedAt: '2026-07-12T08:00:00.000Z', data: { activeProcess: 'worksheet' } }));
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 4, savedAt: '2026-07-13T08:00:00.000Z', data: { activeProcess: 'assessment' } }));

    expect(loadWorkflow()).toMatchObject({ activeProcess: 'assessment' });
    expect(window.localStorage.getItem(WORKFLOW_KEY)).toContain('assessment');
    expect(window.sessionStorage.getItem(WORKFLOW_KEY)).toBeNull();
});
