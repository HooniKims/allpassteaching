'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LessonPlanWorkspace } from '@/components/lesson-plan/LessonPlanWorkspace.jsx';
import { createEmptyWorkflow, loadWorkflow, saveWorkflow } from '@/lib/workflow-store';
import { workflowProcessStatuses } from '@/lib/workflow-lineage';
import { ProcessTabs, teachingProcesses } from './ProcessTabs.jsx';
import { WorkflowPrerequisite } from './WorkflowPrerequisite.jsx';
import { WorksheetStage } from './WorksheetStage.jsx';
import { AssessmentStage } from './AssessmentStage.jsx';
import { OcrGradingStage } from './OcrGradingStage.jsx';
import { RecordsStage } from './RecordsStage.jsx';

const prerequisiteContent = {
    worksheet: { title: '먼저 지도안을 완성해주세요', description: '학습지는 지도안의 성취기준, 활동, 수업 모형을 바탕으로 만듭니다.', actionLabel: '지도안으로 이동', target: 'lesson' },
    assessment: { title: '먼저 지도안을 완성해주세요', description: '수행평가와 루브릭은 지도안의 성취기준과 학습 활동이 필요합니다.', actionLabel: '지도안으로 이동', target: 'lesson' },
    grading: { title: '먼저 수행평가와 루브릭을 완성해주세요', description: '학생 제출물은 교사가 확인한 루브릭을 기준으로 채점합니다.', actionLabel: '수행평가로 이동', target: 'assessment' },
    records: { title: '먼저 학생별 채점 결과를 승인해주세요', description: '세특은 승인된 수행 증거만 사용해 작성합니다.', actionLabel: 'OCR·채점으로 이동', target: 'grading' },
};

function StagePlaceholder({ process }) {
    const copy = {
        worksheet: ['학습지', '지도안과 수업 모형에 맞는 학습지를 생성하고 편집합니다.'],
        assessment: ['수행평가', '성취기준에 맞는 수행과제와 4수준 루브릭을 만듭니다.'],
        grading: ['OCR·채점', '학생 PDF를 일괄 처리하고 루브릭 근거를 검토합니다.'],
        records: ['세특', '승인된 수행 증거로 과목별 세부능력 및 특기사항을 작성합니다.'],
    }[process];
    return <section className="workflow-stage"><p className="eyebrow">{copy[0]}</p><h1>{copy[0]} 작업 공간</h1><p>{copy[1]}</p></section>;
}

export function TeachingWorkflow() {
    const [project, setProject] = useState(createEmptyWorkflow);
    const [hydrated, setHydrated] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    useEffect(() => {
        setProject(loadWorkflow() ?? createEmptyWorkflow());
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
        setProject(current => ({ ...current, submissions: [], records: [] }));
        setConfirmClear(false);
    };
    const updateSubmissions = useCallback(updater => setProject(current => {
        const submissions = typeof updater === 'function' ? updater(current.submissions) : updater;
        const submissionIds = new Set(submissions.map(item => item.id));
        return { ...current, submissions, records: current.records.filter(record => submissionIds.has(record.submissionId)) };
    }), []);
    const updateRecords = useCallback(updater => setProject(current => ({ ...current, records: typeof updater === 'function' ? updater(current.records) : updater })), []);
    return <div className="teaching-workflow">
        <ProcessTabs activeProcess={activeProcess} statuses={statuses} onChange={next => setProject(current => ({ ...current, activeProcess: next }))}/>
        <div id={`process-panel-${activeProcess}`} role="tabpanel" aria-labelledby={`process-tab-${activeProcess}`}>
            <section className="process-panel-region" aria-label={`${activeProcessLabel} 작업 영역`}>
            {activeProcess === 'lesson' && <LessonPlanWorkspace onDraftChange={onLessonDraftChange}/>}
            {activeProcess !== 'lesson' && <main className="workflow-stage-shell">
                {prerequisite
                    ? <WorkflowPrerequisite {...prerequisite} onAction={() => setProject(current => ({ ...current, activeProcess: prerequisite.target }))}/>
                    : activeProcess === 'worksheet'
                        ? <WorksheetStage lessonPlan={project.lessonSnapshot.plan} value={project.worksheet} onChange={worksheet => setProject(current => ({ ...current, worksheet }))}/>
                        : activeProcess === 'assessment'
                            ? <AssessmentStage lessonPlan={project.lessonSnapshot.plan} value={project.assessment} request={project.assessmentRequest} onRequestChange={assessmentRequest => setProject(current => ({ ...current, assessmentRequest }))} onChange={assessment => setProject(current => ({ ...current, assessment }))}/>
                            : activeProcess === 'grading'
                                ? <OcrGradingStage assessment={project.assessment} submissions={project.submissions} onChange={updateSubmissions}/>
                                : activeProcess === 'records'
                                    ? <RecordsStage lessonPlan={project.lessonSnapshot.plan} assessment={project.assessment} submissions={project.submissions} records={project.records} onChange={updateRecords}/>
                                    : <StagePlaceholder process={activeProcess}/>}
                {(activeProcess === 'grading' || activeProcess === 'records') && <aside className="privacy-panel" aria-label="학생 자료 보관 안내">
                    <p><strong>학생 자료 보호</strong><br/>PDF 원본은 저장하지 않습니다. 학생 이름·OCR·채점·세특은 현재 탭에만 임시 보관되어 <span className="nowrap">새로고침 후 복구되고</span>, <span className="nowrap">탭을 닫으면 사라집니다.</span></p>
                    {!confirmClear && <button type="button" className="danger-button" onClick={() => setConfirmClear(true)}>학생 자료 모두 지우기</button>}
                    {confirmClear && <div className="privacy-panel__confirm" role="alert"><span>학생 이름, OCR, 채점, 세특을 모두 삭제할까요?</span><button type="button" className="danger-button" onClick={clearStudentData}>학생 자료 삭제 확인</button><button type="button" className="secondary-button" onClick={() => setConfirmClear(false)}>취소</button></div>}
                </aside>}
            </main>}
            </section>
        </div>
    </div>;
}
