'use client';
import { useEffect, useRef, useState } from 'react';
import { clearDraft, loadDraft, saveDraft } from '@/lib/draft-store';
import { StepNavigation } from './StepNavigation.jsx';
import { LessonBasicsStep } from './LessonBasicsStep.jsx';
import { StandardsStep } from './StandardsStep.jsx';
import { InstructionModelStep } from './InstructionModelStep.jsx';
import { GenerationStatus } from './GenerationStatus.jsx';
import { LessonPlanEditor } from './LessonPlanEditor.jsx';
import { GenerationSummary } from './GenerationSummary.jsx';
import { buildLessonPlanGenerationRequest, createGenerationSnapshot, hasGenerationInputChanged, normalizeLessonMetadata } from '@/lib/lesson-input';
import { useOperation } from '@/components/workflow/OperationProvider.jsx';

const emptyBasics = { schoolLevel: 'middle', grade: '', subject: '', subjectMode: 'official', displaySubject: '', mappedSubjects: [], mode: 'single', sessions: 1, intent: '', studentNeeds: '', metadata: normalizeLessonMetadata(), error: '' };
const emptyDraft = { step: 1, maxReached: 1, basics: emptyBasics, standards: [] };
function hasDraftContent(draft) {
    const basics = draft.basics ?? {};
    return Boolean(draft.plan || draft.instructionModel || draft.standards?.length || draft.step > 1 || draft.maxReached > 1
        || basics.schoolLevel !== 'middle' || basics.grade || basics.subject || basics.displaySubject || basics.mappedSubjects?.length
        || basics.mode === 'multi' || basics.sessions !== 1 || basics.intent?.trim() || basics.studentNeeds?.trim()
        || Object.values(normalizeLessonMetadata(basics.metadata)).some(Boolean));
}

export function LessonPlanWorkspace({ onDraftChange = () => {} }) {
    const { runOperation } = useOperation();
    const [ready, setReady] = useState(false);
    const [draft, setDraft] = useState(emptyDraft);
    const [generation, setGeneration] = useState({ status: 'idle', message: '' });
    const activeGeneration = useRef(null);
    useEffect(() => {
        const loaded = loadDraft();
        setDraft(loaded ? {
            ...emptyDraft,
            ...loaded,
            maxReached: loaded.maxReached ?? Math.max(loaded.step ?? 1, loaded.plan ? 4 : 1),
            basics: { ...emptyBasics, ...loaded.basics, metadata: normalizeLessonMetadata(loaded.basics?.metadata) },
        } : emptyDraft);
        setReady(true);
    }, []);
    useEffect(() => {
        if (!ready) return;
        if (!hasDraftContent(draft)) { clearDraft(); return; }
        const timer = setTimeout(() => saveDraft(draft), 300);
        return () => clearTimeout(timer);
    }, [draft, ready]);
    useEffect(() => { if (ready) onDraftChange(draft); }, [draft, onDraftChange, ready]);
    useEffect(() => () => { activeGeneration.current?.abort(); activeGeneration.current = null; }, []);
    const cancelGeneration = () => {
        activeGeneration.current?.abort();
        activeGeneration.current = null;
    };
    const generatePlan = async () => {
        cancelGeneration();
        const controller = new AbortController();
        const requestDraft = buildLessonPlanGenerationRequest(draft);
        const requestedSnapshot = createGenerationSnapshot(draft);
        activeGeneration.current = controller;
        setGeneration({ status: 'loading', message: '' });
        try {
            const body = await runOperation({ kind: 'lesson-generation', label: '수업 지도안 생성', phase: 'upstageWaiting', cancelable: true, model: 'configured-generation-model' }, async ({ signal }) => {
                const combinedSignal = AbortSignal.any([controller.signal, signal]);
                const response = await fetch('/api/generate-plan', { method: 'POST', signal: combinedSignal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestDraft) });
                const responseBody = await response.json();
                if (!response.ok) throw new Error(responseBody?.message || '다시 시도해주세요.');
                return responseBody;
            });
            if (!body) { setGeneration({ status: 'idle', message: '' }); return; }
            if (activeGeneration.current !== controller) return;
            setDraft(current => current.step === 4 && !hasGenerationInputChanged(current, requestedSnapshot)
                ? { ...current, maxReached: 4, plan: body.plan, originalPlan: structuredClone(body.plan), generatedFrom: requestedSnapshot }
                : current);
            setGeneration({ status: 'done', message: '' });
        } catch (error) {
            if (activeGeneration.current !== controller) return;
            const message = error instanceof SyntaxError || error instanceof TypeError
                ? '네트워크 또는 응답 형식을 확인할 수 없습니다. 다시 시도해주세요.'
                : error instanceof Error ? error.message : '네트워크 또는 응답 형식을 확인할 수 없습니다. 다시 시도해주세요.';
            setGeneration({ status: 'error', message });
        } finally {
            if (activeGeneration.current === controller) activeGeneration.current = null;
        }
    };
    const goToStep = step => {
        if (step > draft.maxReached) return;
        cancelGeneration();
        setGeneration({ status: 'idle', message: '' });
        setDraft(current => ({ ...current, step }));
    };
    const advanceTo = step => setDraft(current => ({ ...current, step, maxReached: Math.max(current.maxReached, step) }));
    const updateBasics = nextBasics => setDraft(current => {
        const basics = typeof nextBasics === 'function' ? nextBasics(current.basics) : nextBasics;
        const previousScope = JSON.stringify([current.basics.schoolLevel, current.basics.grade, current.basics.mappedSubjects]);
        const nextScope = JSON.stringify([basics.schoolLevel, basics.grade, basics.mappedSubjects]);
        if (previousScope === nextScope) return { ...current, basics };
        const instructionModel = current.instructionModel?.id === 'integrated'
            ? { ...current.instructionModel, integrationSubject: '', integrationStandards: [] }
            : current.instructionModel;
        return { ...current, basics, standards: [], instructionModel };
    });
    if (!ready) return <main className="workspace" aria-busy="true">
        <section className="workspace__main"><p role="status">저장된 수업 정보를 불러오는 중입니다.</p></section>
    </main>;
    const changed = draft.plan ? hasGenerationInputChanged(draft, draft.generatedFrom) : false;
    return <main className="workspace"><StepNavigation current={draft.step} maxReached={draft.maxReached} onStepChange={goToStep}/><section className="workspace__main">
        {draft.step === 1 && <LessonBasicsStep value={draft.basics} onChange={updateBasics} onNext={() => advanceTo(2)}/>}
        {draft.step === 2 && <StandardsStep basics={draft.basics} selected={draft.standards || []} onChange={standards => setDraft(current => ({ ...current, standards }))} onBack={() => goToStep(1)} onNext={() => advanceTo(3)}/>}
        {draft.step === 3 && <InstructionModelStep basics={draft.basics} primaryStandards={draft.standards || []} lessonIntent={draft.basics.intent} selected={draft.instructionModel} onChange={instructionModel => setDraft(current => ({ ...current, instructionModel }))} onBack={() => goToStep(2)} onNext={() => advanceTo(4)}/>}
        {draft.step === 4 && <div>{!draft.plan && <><p className="eyebrow">4단계 · 지도안 완성</p><h1>지도안을 생성할 준비가 됐어요</h1><p>선택한 모든 성취기준과 수업 설계를 바탕으로 초안을 만듭니다.</p><GenerationStatus {...generation}/><div className="step-actions"><button type="button" className="secondary-button" onClick={() => goToStep(3)}>이전</button><button type="button" disabled={generation.status === 'loading'} onClick={generatePlan}>지도안 생성하기</button></div></>}{draft.plan && <><GenerationSummary draft={draft} changed={changed} loading={generation.status === 'loading'} onEdit={() => goToStep(1)} onRegenerate={generatePlan}/><GenerationStatus {...generation}/><LessonPlanEditor plan={draft.plan} originalPlan={draft.originalPlan} onChange={plan => setDraft(current => ({ ...current, plan }))}/></>}</div>}
    </section></main>;
}
