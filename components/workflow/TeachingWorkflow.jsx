'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LessonPlanWorkspace } from '@/components/lesson-plan/LessonPlanWorkspace.jsx';
import { clearDraft } from '@/lib/draft-store';
import { clearWorkflow, createEmptyWorkflow, loadWorkflow, saveWorkflow } from '@/lib/workflow-store';
import { normalizeRecordTargetBytes } from '@/lib/record-length';
import { workflowProcessStatuses } from '@/lib/workflow-lineage';
import { reviseSubmission } from '@/lib/grading-generation.js';
import { removeStudentFromProject, replaceProjectRoster } from '@/lib/student-roster.js';
import { ProcessTabs, teachingProcesses } from './ProcessTabs.jsx';
import { WorkflowPrerequisite } from './WorkflowPrerequisite.jsx';
import { WorksheetStage } from './WorksheetStage.jsx';
import { AssessmentStage } from './AssessmentStage.jsx';
import { OcrGradingStage } from './OcrGradingStage.jsx';
import { RecordsStage } from './RecordsStage.jsx';
import { SubmissionFileProvider, useSubmissionFiles } from './SubmissionFileProvider.jsx';
import { OperationProvider } from './OperationProvider.jsx';

const prerequisiteContent = {
    worksheet: { title: '먼저 지도안을 완성해주세요', description: '학습지는 지도안의 성취기준, 활동, 수업 설계를 바탕으로 만듭니다.', actionLabel: '지도안으로 이동', target: 'lesson' },
    assessment: { title: '먼저 지도안을 완성해주세요', description: '수행평가와 루브릭은 지도안의 성취기준과 학습 활동이 필요합니다.', actionLabel: '지도안으로 이동', target: 'lesson' },
    grading: { title: '먼저 수행평가와 루브릭을 완성해주세요', description: '학생 제출물은 교사가 확인한 루브릭을 기준으로 채점합니다.', actionLabel: '수행평가로 이동', target: 'assessment' },
    records: { title: '먼저 학생별 채점 결과를 승인해주세요', description: '세특은 승인된 수행 증거만 사용해 작성합니다.', actionLabel: 'OCR·채점으로 이동', target: 'grading' },
};

function StagePlaceholder({ process }) {
    const copy = {
        worksheet: ['학습지', '지도안과 수업 설계에 맞는 학습지를 생성하고 편집합니다.'],
        assessment: ['수행평가', '성취기준에 맞는 수행과제와 4수준 루브릭을 만듭니다.'],
        grading: ['OCR·채점', '학생 PDF를 일괄 처리하고 루브릭 근거를 검토합니다.'],
        records: ['세특', '승인된 수행 증거로 과목별 세부능력 및 특기사항을 작성합니다.'],
    }[process];
    return <section className="workflow-stage"><p className="eyebrow">{copy[0]}</p><h1>{copy[0]} 작업 공간</h1><p>{copy[1]}</p></section>;
}

function detachRestoredSubmissionFiles(project) {
    return {
        ...project,
        submissions: project.submissions.map(submission => reviseSubmission(submission, {
            status: submission.grading ? 'graded' : submission.extractedText ? 'extracted' : 'pending',
            originalAttached: false,
            originalReviewedAt: null,
            reviewedOriginalRevision: null,
            approved: false,
            approvalRevoked: Boolean(submission.approved || submission.grading),
        })),
    };
}

function TeachingWorkflowContent() {
    const submissionFiles = useSubmissionFiles();
    const [project, setProject] = useState(createEmptyWorkflow);
    const [hydrated, setHydrated] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [confirmNewWorkspace, setConfirmNewWorkspace] = useState(false);
    const [storageError, setStorageError] = useState('');
    const [lessonWorkspaceKey, setLessonWorkspaceKey] = useState(0);
    const newWorkspaceDialogRef = useRef(null);
    const processTopRef = useRef(null);
    useEffect(() => {
        setProject(detachRestoredSubmissionFiles(loadWorkflow() ?? createEmptyWorkflow()));
        setHydrated(true);
    }, []);
    useEffect(() => {
        if (!hydrated) return;
        const timer = setTimeout(() => saveWorkflow(project), 120);
        return () => clearTimeout(timer);
    }, [hydrated, project]);
    const onLessonDraftChange = useCallback(lessonSnapshot => setProject(current => ({ ...current, lessonSnapshot })), []);
    const statuses = useMemo(() => workflowProcessStatuses(project), [project]);
    const activeProcess = project.activeProcess;
    const activeProcessLabel = teachingProcesses.find(item => item.id === activeProcess)?.label ?? '현재 프로세스';
    const prerequisite = statuses[activeProcess] === 'prerequisite' ? prerequisiteContent[activeProcess] : null;
    const clearStudentData = () => {
        submissionFiles.clear();
        const nextProject = { ...project, submissions: [], records: [] };
        setProject(nextProject);
        setConfirmClear(false);
        setStorageError(saveWorkflow(nextProject) ? '' : '브라우저 저장소에 변경 내용을 저장하지 못했습니다. 브라우저의 사이트 데이터 설정을 확인한 뒤 다시 시도해주세요.');
    };
    useEffect(() => {
        const dialog = newWorkspaceDialogRef.current;
        if (!dialog) return;
        if (confirmNewWorkspace && !dialog.open) {
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
        } else if (!confirmNewWorkspace && dialog.open) {
            if (typeof dialog.close === 'function') dialog.close();
            else dialog.removeAttribute('open');
        }
    }, [confirmNewWorkspace]);
    const startNewWorkspace = () => {
        submissionFiles.clear();
        const draftCleared = clearDraft();
        const workflowCleared = clearWorkflow();
        const storageCleared = draftCleared && workflowCleared;
        setProject(createEmptyWorkflow());
        setLessonWorkspaceKey(current => current + 1);
        setConfirmNewWorkspace(false);
        setStorageError(storageCleared ? '' : '브라우저 저장소를 완전히 지우지 못했습니다. 브라우저의 사이트 데이터 설정을 확인한 뒤 다시 시도해주세요.');
    };
    const updateSubmissions = useCallback(updater => setProject(current => {
        const submissions = typeof updater === 'function' ? updater(current.submissions) : updater;
        const submissionIds = new Set(submissions.map(item => item.id));
        return { ...current, submissions, records: current.records.filter(record => submissionIds.has(record.submissionId)) };
    }), []);
    const updateRecords = useCallback(updater => setProject(current => ({ ...current, records: typeof updater === 'function' ? updater(current.records) : updater })), []);
    const updateRecordTargetBytes = useCallback(value => setProject(current => ({ ...current, recordTargetBytes: normalizeRecordTargetBytes(value) })), []);
    const updateStudents = useCallback(updater => setProject(current => replaceProjectRoster(current, typeof updater === 'function' ? updater(current.students) : updater)), []);
    const deleteStudent = useCallback(studentId => {
        const submissionIds = [];
        for (const item of project.submissions) if (item.studentId === studentId) submissionIds.push(item.id);
        submissionFiles.removeMany(submissionIds);
        const nextProject = removeStudentFromProject(project, studentId);
        setProject(nextProject);
        setStorageError(saveWorkflow(nextProject) ? '' : '브라우저 저장소에 변경 내용을 저장하지 못했습니다. 브라우저의 사이트 데이터 설정을 확인한 뒤 다시 시도해주세요.');
    }, [project, submissionFiles]);
    const scrollToProcessTop = () => {
        processTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById(`process-tab-${activeProcess}`)?.focus({ preventScroll: true });
    };
    return <div className="teaching-workflow">
        <div ref={processTopRef}><ProcessTabs activeProcess={activeProcess} statuses={statuses} onChange={next => setProject(current => ({ ...current, activeProcess: next }))}/></div>
        <div className="workflow-toolbar"><p>현재 작업은 이 브라우저의 로컬 저장소에 저장됩니다. 공용 기기에서는 <span className="nowrap">새 작업 시작</span>으로 지워주세요.</p>{storageError && <p className="form-alert" role="alert">{storageError}</p>}<button type="button" className="secondary-button" onClick={() => { setStorageError(''); setConfirmNewWorkspace(true); }}>새 작업 시작</button></div>
        <dialog ref={newWorkspaceDialogRef} className="workspace-reset-dialog" role="alertdialog" aria-labelledby="new-workspace-title" onCancel={event => { event.preventDefault(); setConfirmNewWorkspace(false); }}>
            <h2 id="new-workspace-title">새 작업 시작 확인</h2><p>현재 지도안, 학습지, 수행평가, 학생 명단과 채점·세특 기록을 모두 지웁니다. 이 작업은 되돌릴 수 없습니다.</p>
            <div><button type="button" className="secondary-button" autoFocus onClick={() => setConfirmNewWorkspace(false)}>취소</button><button type="button" className="danger-button" onClick={startNewWorkspace}>모든 작업 지우고 새로 시작</button></div>
        </dialog>
        {activeProcess === 'lesson'
            ? <div id="process-panel-lesson" role="tabpanel" aria-labelledby="process-tab-lesson"><LessonPlanWorkspace key={lessonWorkspaceKey} onDraftChange={onLessonDraftChange}/></div>
            : <main className="workflow-stage-shell" aria-label={`${activeProcessLabel} 작업 영역`}>
                <div id={`process-panel-${activeProcess}`} role="tabpanel" aria-labelledby={`process-tab-${activeProcess}`}>
                    {prerequisite
                        ? <WorkflowPrerequisite {...prerequisite} onAction={() => setProject(current => ({ ...current, activeProcess: prerequisite.target }))}/>
                        : activeProcess === 'worksheet'
                            ? <WorksheetStage lessonPlan={project.lessonSnapshot.plan} value={project.worksheet} onChange={worksheet => setProject(current => ({ ...current, worksheet }))}/>
                            : activeProcess === 'assessment'
                                ? <AssessmentStage lessonPlan={project.lessonSnapshot.plan} design={project.assessmentDesign} value={project.assessment} request={project.assessmentRequest} onDesignChange={assessmentDesign => setProject(current => ({ ...current, assessmentDesign }))} onRequestChange={assessmentRequest => setProject(current => ({ ...current, assessmentRequest }))} onChange={assessment => setProject(current => ({ ...current, assessment }))}/>
                                : activeProcess === 'grading'
                                    ? <OcrGradingStage assessment={project.assessment} students={project.students} submissions={project.submissions} records={project.records} onStudentsChange={updateStudents} onDeleteStudent={deleteStudent} onChange={updateSubmissions}/>
                                    : activeProcess === 'records'
                                        ? <RecordsStage lessonPlan={project.lessonSnapshot.plan} assessment={project.assessment} students={project.students} submissions={project.submissions} records={project.records} recordTargetBytes={project.recordTargetBytes} onTargetBytesChange={updateRecordTargetBytes} onChange={updateRecords}/>
                                        : <StagePlaceholder process={activeProcess}/>
                    }
                </div>
                {(activeProcess === 'grading' || activeProcess === 'records') && <aside className="privacy-panel" aria-label="학생 자료 보관 안내">
                    <p><strong>학생 자료 보호</strong><br/>PDF 원본은 저장하지 않습니다. <span className="nowrap">학생 이름·OCR·채점·세특은</span> 이 브라우저의 로컬 저장소에 보관됩니다. 공용 기기에서는 <span className="nowrap">새 작업 시작</span>으로 지워주세요.</p>
                    {!confirmClear && <button type="button" className="danger-button" onClick={() => setConfirmClear(true)}>학생 제출·채점·세특 모두 지우기</button>}
                    {confirmClear && <div className="privacy-panel__confirm" role="alert"><span>PDF 연결, OCR, 채점, 세특을 모두 삭제할까요? 공용 학생 명단은 유지됩니다.</span><button type="button" className="danger-button" onClick={clearStudentData}>제출·채점·세특 삭제 확인</button><button type="button" className="secondary-button" onClick={() => setConfirmClear(false)}>취소</button></div>}
                </aside>}
            </main>}
        <div className="workflow-back-to-top"><button type="button" className="secondary-button" aria-label={`${activeProcessLabel} 맨 위로`} onClick={scrollToProcessTop}>맨 위로</button></div>
    </div>;
}

export function TeachingWorkflow() {
    return <OperationProvider><SubmissionFileProvider><TeachingWorkflowContent/></SubmissionFileProvider></OperationProvider>;
}
