'use client';
import { useEffect, useRef, useState } from 'react';
import { loadDraft, saveDraft } from '@/lib/draft-store';
import { StepNavigation } from './StepNavigation.jsx';
import { LessonBasicsStep } from './LessonBasicsStep.jsx';
import { StandardsStep } from './StandardsStep.jsx';
import { InstructionModelStep } from './InstructionModelStep.jsx';
import { GenerationStatus } from './GenerationStatus.jsx';
import { LessonPlanEditor } from './LessonPlanEditor.jsx';
import { GenerationSummary } from './GenerationSummary.jsx';
import { createGenerationSnapshot, hasGenerationInputChanged, normalizeLessonMetadata } from '@/lib/lesson-input';

const emptyBasics = { schoolLevel: '', grade: '', subject: '', subjectMode: 'official', displaySubject: '', mappedSubjects: [], mode: 'single', sessions: 1, intent: '', studentNeeds: '', metadata: normalizeLessonMetadata(), error: '' };
const emptyDraft = { step: 1, maxReached: 1, basics: emptyBasics, standards: [] };

export function LessonPlanWorkspace({ onDraftChange = () => {} }) {
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
    useEffect(() => { if (!ready) return; const timer = setTimeout(() => saveDraft(draft), 300); return () => clearTimeout(timer); }, [draft, ready]);
    useEffect(() => { if (ready) onDraftChange(draft); }, [draft, onDraftChange, ready]);
    useEffect(() => () => { activeGeneration.current?.abort(); activeGeneration.current = null; }, []);
    const cancelGeneration = () => {
        activeGeneration.current?.abort();
        activeGeneration.current = null;
    };
    const generatePlan = async () => {
        cancelGeneration();
        const controller = new AbortController();
        const requestDraft = {
            basics: { ...draft.basics, sessionMinutes: draft.basics.schoolLevel === 'elementary' ? 40 : 45 },
            standards: draft.standards,
            instructionModel: draft.instructionModel,
        };
        const requestedSnapshot = createGenerationSnapshot(requestDraft);
        activeGeneration.current = controller;
        setGeneration({ status: 'loading', message: '' });
        try {
            const response = await fetch('/api/generate-plan', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestDraft) });
            const body = await response.json();
            if (activeGeneration.current !== controller) return;
            if (!response.ok) return setGeneration({ status: 'error', message: body?.message || '다시 시도해주세요.' });
            setDraft(current => current.step === 4 && !hasGenerationInputChanged(current, requestedSnapshot)
                ? { ...current, maxReached: 4, plan: body.plan, originalPlan: structuredClone(body.plan), generatedFrom: requestedSnapshot }
                : current);
            setGeneration({ status: 'done', message: '' });
        } catch {
            if (activeGeneration.current !== controller) return;
            setGeneration({ status: 'error', message: '네트워크 또는 응답 형식을 확인할 수 없습니다. 다시 시도해주세요.' });
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
    const updateBasics = basics => setDraft(current => {
        const previousScope = JSON.stringify([current.basics.schoolLevel, current.basics.grade, current.basics.mappedSubjects]);
        const nextScope = JSON.stringify([basics.schoolLevel, basics.grade, basics.mappedSubjects]);
        return { ...current, basics, standards: previousScope === nextScope ? current.standards : [] };
    });
    const changed = draft.plan ? hasGenerationInputChanged(draft, draft.generatedFrom) : false;
    return <main className="workspace"><StepNavigation current={draft.step} maxReached={draft.maxReached} onStepChange={goToStep}/><section className="workspace__main">
        {draft.step === 1 && <LessonBasicsStep value={draft.basics} onChange={updateBasics} onNext={() => advanceTo(2)}/>}
        {draft.step === 2 && <StandardsStep basics={draft.basics} selected={draft.standards || []} onChange={standards => setDraft(current => ({ ...current, standards }))} onBack={() => goToStep(1)} onNext={() => advanceTo(3)}/>}
        {draft.step === 3 && <InstructionModelStep lessonIntent={draft.basics.intent} selected={draft.instructionModel} onChange={instructionModel => setDraft(current => ({ ...current, instructionModel }))} onBack={() => goToStep(2)} onNext={() => advanceTo(4)}/>}
        {draft.step === 4 && <div>{!draft.plan && <><p className="eyebrow">4단계 · 지도안 완성</p><h1>지도안을 생성할 준비가 됐어요</h1><p>선택한 성취기준과 수업 모형을 바탕으로 초안을 만듭니다.</p><GenerationStatus {...generation}/><div className="step-actions"><button type="button" className="secondary-button" onClick={() => goToStep(3)}>이전</button><button type="button" disabled={generation.status === 'loading'} onClick={generatePlan}>지도안 생성하기</button></div></>}{draft.plan && <><GenerationSummary draft={draft} changed={changed} loading={generation.status === 'loading'} onEdit={() => goToStep(1)} onRegenerate={generatePlan}/><GenerationStatus {...generation}/><LessonPlanEditor plan={draft.plan} originalPlan={draft.originalPlan} onChange={plan => setDraft(current => ({ ...current, plan }))}/></>}</div>}
    </section></main>;
}
