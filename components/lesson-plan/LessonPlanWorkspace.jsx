'use client';
import { useEffect, useRef, useState } from 'react';
import { loadDraft, saveDraft } from '@/lib/draft-store';
import { StepNavigation } from './StepNavigation.jsx';
import { LessonBasicsStep } from './LessonBasicsStep.jsx';
import { StandardsStep } from './StandardsStep.jsx';
import { InstructionModelStep } from './InstructionModelStep.jsx';
import { GenerationStatus } from './GenerationStatus.jsx';
import { LessonPlanEditor } from './LessonPlanEditor.jsx';

const emptyBasics = { schoolLevel: '', grade: '', subject: '', mode: 'single', sessions: 1, intent: '', studentNeeds: '', metadata: { date: '', place: '', className: '', teacherName: '' }, error: '' };
const emptyDraft = { step: 1, basics: emptyBasics, standards: [] };

export function LessonPlanWorkspace() {
    const [ready, setReady] = useState(false);
    const [draft, setDraft] = useState(emptyDraft);
    const [generation, setGeneration] = useState({ status: 'idle', message: '' });
    const activeGeneration = useRef(null);
    useEffect(() => { const loaded = loadDraft(); setDraft(loaded ? { ...emptyDraft, ...loaded, basics: { ...emptyBasics, ...loaded.basics, metadata: { ...emptyBasics.metadata, ...loaded.basics?.metadata } } } : emptyDraft); setReady(true); }, []);
    useEffect(() => { if (!ready) return; const timer = setTimeout(() => saveDraft(draft), 300); return () => clearTimeout(timer); }, [draft, ready]);
    useEffect(() => () => { activeGeneration.current?.abort(); activeGeneration.current = null; }, []);
    const cancelGeneration = () => {
        activeGeneration.current?.abort();
        activeGeneration.current = null;
    };
    const generatePlan = async () => {
        cancelGeneration();
        const controller = new AbortController();
        activeGeneration.current = controller;
        setGeneration({ status: 'loading', message: '' });
        try {
            const response = await fetch('/api/generate-plan', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ basics: { ...draft.basics, sessionMinutes: draft.basics.schoolLevel === 'elementary' ? 40 : 45 }, standards: draft.standards, instructionModel: draft.instructionModel }) });
            const body = await response.json();
            if (activeGeneration.current !== controller) return;
            if (!response.ok) return setGeneration({ status: 'error', message: body?.message || '다시 시도해주세요.' });
            setDraft(current => current.step === 4 ? { ...current, plan: body.plan } : current);
            setGeneration({ status: 'done', message: '' });
        } catch {
            if (activeGeneration.current !== controller) return;
            setGeneration({ status: 'error', message: '네트워크 또는 응답 형식을 확인할 수 없습니다. 다시 시도해주세요.' });
        } finally {
            if (activeGeneration.current === controller) activeGeneration.current = null;
        }
    };
    const returnToModelStep = () => {
        cancelGeneration();
        setGeneration({ status: 'idle', message: '' });
        setDraft(current => ({ ...current, step: 3 }));
    };
    return <main className="workspace"><StepNavigation current={draft.step}/><section className="workspace__main">
        {draft.step === 1 && <LessonBasicsStep value={draft.basics} onChange={basics => setDraft({ ...draft, basics })} onNext={() => setDraft({ ...draft, step: 2 })}/>}
        {draft.step === 2 && <StandardsStep basics={draft.basics} selected={draft.standards || []} onChange={standards => setDraft({ ...draft, standards })} onBack={() => setDraft({ ...draft, step: 1 })} onNext={() => setDraft({ ...draft, step: 3 })}/>}
        {draft.step === 3 && <InstructionModelStep lessonIntent={draft.basics.intent} selected={draft.instructionModel} onChange={instructionModel => setDraft({ ...draft, instructionModel })} onBack={() => setDraft({ ...draft, step: 2 })} onNext={() => setDraft({ ...draft, step: 4 })}/>}
        {draft.step === 4 && <div>{!draft.plan && <><p className="eyebrow">4단계 · 지도안 완성</p><h1>지도안을 생성할 준비가 됐어요</h1><p>선택한 성취기준과 수업 모형을 바탕으로 초안을 만듭니다.</p><GenerationStatus {...generation}/><div className="step-actions"><button className="secondary-button" onClick={returnToModelStep}>이전</button><button disabled={generation.status === 'loading'} onClick={generatePlan}>지도안 생성하기</button></div></>}{draft.plan && <LessonPlanEditor plan={draft.plan} onChange={plan => setDraft({ ...draft, plan })}/>}</div>}
    </section></main>;
}
