import { beforeEach, expect, test } from 'vitest';
import { createEmptyWorkflow, loadWorkflow, saveWorkflow, WORKFLOW_KEY, WORKFLOW_VERSION } from '@/lib/workflow-store';
import { sourceHash } from '@/lib/source-hash';

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

test('stable source hashes ignore object key order and change with source content', () => {
    expect(sourceHash({ lesson: { subject: '과학', grade: '5' } })).toBe(sourceHash({ lesson: { grade: '5', subject: '과학' } }));
    expect(sourceHash({ subject: '과학' })).not.toBe(sourceHash({ subject: '수학' }));
});

test('current-tab persistence keeps structured results for refresh but never selected PDF objects', () => {
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
    const raw = window.sessionStorage.getItem(WORKFLOW_KEY);
    const loaded = loadWorkflow();

    expect(raw).not.toContain('"file"');
    expect(loaded).toMatchObject({ activeProcess: 'grading', worksheet: project.worksheet, assessment: project.assessment, submissions: [{ studentName: '김학생', extractedText: '관찰 결과' }], records: [{ studentName: '김학생', text: '세특 문장' }] });
    expect(loaded.submissions[0]).not.toHaveProperty('file');
    expect(window.localStorage.getItem(WORKFLOW_KEY)).toBeNull();
});

test('공용 학생 명단은 안정적인 ID와 순서를 보존하고 File·Blob 값은 저장하지 않는다', () => {
    const project = createEmptyWorkflow();
    project.students = [
        { id: 'student-a', grade: '2', className: '3', number: 7, name: '김하늘', privateFile: new File(['x'], '명단.xlsx') },
        { id: 'student-b', grade: '2', className: '3', number: 8, name: '이바다', privateBlob: new Blob(['x']) },
    ];

    saveWorkflow(project);
    const raw = window.sessionStorage.getItem(WORKFLOW_KEY);
    const loaded = loadWorkflow();

    expect(loaded.students).toEqual([
        { id: 'student-a', grade: '2', className: '3', number: 7, name: '김하늘' },
        { id: 'student-b', grade: '2', className: '3', number: 8, name: '이바다' },
    ]);
    expect(raw).not.toContain('privateFile');
    expect(raw).not.toContain('privateBlob');
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

test('migrates the earlier activeStage name and supplies empty collections', () => {
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 0, data: { activeStage: 'worksheet', worksheet: { title: '기존 학습지' } } }));

    const loaded = loadWorkflow();

    expect(WORKFLOW_VERSION).toBe(3);
    expect(loaded).toMatchObject({ activeProcess: 'worksheet', worksheet: { title: '기존 학습지' }, students: [], submissions: [], records: [] });
});

test('moves a legacy persistent workflow into the current tab and removes the permanent copy', () => {
    window.localStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 1, data: { lessonSnapshot: { basics: { studentNeeds: '김학생 지원 정보' } } } }));
    expect(loadWorkflow()).toMatchObject({ lessonSnapshot: { basics: { studentNeeds: '김학생 지원 정보' } } });
    expect(window.localStorage.getItem(WORKFLOW_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(WORKFLOW_KEY)).toContain('김학생 지원 정보');
});
