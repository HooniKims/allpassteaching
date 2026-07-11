'use client';
import { useEffect, useState } from 'react';
import { loadDraft, saveDraft } from '@/lib/draft-store';
import { StepNavigation } from './StepNavigation.jsx';
import { LessonBasicsStep } from './LessonBasicsStep.jsx';
import { StandardsStep } from './StandardsStep.jsx';
import { InstructionModelStep } from './InstructionModelStep.jsx';
import { GenerationStatus } from './GenerationStatus.jsx';

const emptyBasics = { schoolLevel: '', grade: '', subject: '', mode: 'single', sessions: 1, intent: '', studentNeeds: '', error: '' };

export function LessonPlanWorkspace() {
    const [ready, setReady] = useState(false);
    const [draft, setDraft] = useState({ step: 1, basics: emptyBasics, standards: [] });
    const [generation, setGeneration] = useState({ status: 'idle', message: '' });
    useEffect(() => { setDraft(loadDraft() ?? { step: 1, basics: emptyBasics, standards: [] }); setReady(true); }, []);
    useEffect(() => { if (!ready) return; const timer = setTimeout(() => saveDraft(draft), 300); return () => clearTimeout(timer); }, [draft, ready]);
    return <main className="workspace"><StepNavigation current={draft.step}/><section className="workspace__main">
        {draft.step === 1 && <LessonBasicsStep value={draft.basics} onChange={basics => setDraft({ ...draft, basics })} onNext={() => setDraft({ ...draft, step: 2 })}/>}
        {draft.step === 2 && <StandardsStep basics={draft.basics} selected={draft.standards || []} onChange={standards => setDraft({ ...draft, standards })} onBack={() => setDraft({ ...draft, step: 1 })} onNext={() => setDraft({ ...draft, step: 3 })}/>}
        {draft.step === 3 && <InstructionModelStep lessonIntent={draft.basics.intent} selected={draft.instructionModel} onChange={instructionModel => setDraft({ ...draft, instructionModel })} onBack={() => setDraft({ ...draft, step: 2 })} onNext={() => setDraft({ ...draft, step: 4 })}/>}
        {draft.step === 4 && <div><p className="eyebrow">4단계 · 지도안 완성</p><h1>지도안을 생성할 준비가 됐어요</h1><p>선택한 성취기준과 수업 모형을 바탕으로 초안을 만듭니다.</p><GenerationStatus {...generation}/>{!draft.plan && <div className="step-actions"><button className="secondary-button" onClick={() => setDraft({ ...draft, step: 3 })}>이전</button><button disabled={generation.status === 'loading'} onClick={async () => { setGeneration({ status: 'loading', message: '' }); const response = await fetch('/api/generate-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ basics: { ...draft.basics, sessionMinutes: draft.basics.schoolLevel === 'elementary' ? 40 : 45 }, standards: draft.standards, instructionModel: draft.instructionModel }) }); const body = await response.json(); if (!response.ok) return setGeneration({ status: 'error', message: body.message || '다시 시도해주세요.' }); setDraft({ ...draft, plan: body.plan }); setGeneration({ status: 'done', message: '' }); }}>지도안 생성하기</button></div>}{draft.plan && <div className="generation-success"><strong>{draft.plan.title}</strong><span>{draft.plan.sessions.length}차시 지도안이 생성되었습니다.</span></div>}</div>}
    </section></main>;
}
