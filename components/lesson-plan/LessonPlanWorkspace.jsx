'use client';
import { useEffect, useState } from 'react';
import { loadDraft, saveDraft } from '@/lib/draft-store';
import { StepNavigation } from './StepNavigation.jsx';
import { LessonBasicsStep } from './LessonBasicsStep.jsx';
import { StandardsStep } from './StandardsStep.jsx';
import { InstructionModelStep } from './InstructionModelStep.jsx';

const emptyBasics = { schoolLevel: '', grade: '', subject: '', mode: 'single', sessions: 1, intent: '', studentNeeds: '', error: '' };

export function LessonPlanWorkspace() {
    const [ready, setReady] = useState(false);
    const [draft, setDraft] = useState({ step: 1, basics: emptyBasics, standards: [] });
    useEffect(() => { setDraft(loadDraft() ?? { step: 1, basics: emptyBasics, standards: [] }); setReady(true); }, []);
    useEffect(() => { if (!ready) return; const timer = setTimeout(() => saveDraft(draft), 300); return () => clearTimeout(timer); }, [draft, ready]);
    return <main className="workspace"><StepNavigation current={draft.step}/><section className="workspace__main">
        {draft.step === 1 && <LessonBasicsStep value={draft.basics} onChange={basics => setDraft({ ...draft, basics })} onNext={() => setDraft({ ...draft, step: 2 })}/>}
        {draft.step === 2 && <StandardsStep basics={draft.basics} selected={draft.standards || []} onChange={standards => setDraft({ ...draft, standards })} onBack={() => setDraft({ ...draft, step: 1 })} onNext={() => setDraft({ ...draft, step: 3 })}/>}
        {draft.step === 3 && <InstructionModelStep lessonIntent={draft.basics.intent} selected={draft.instructionModel} onChange={instructionModel => setDraft({ ...draft, instructionModel })} onBack={() => setDraft({ ...draft, step: 2 })} onNext={() => setDraft({ ...draft, step: 4 })}/>}
        {draft.step === 4 && <div><p className="eyebrow">4단계 · 지도안 완성</p><h1>지도안을 생성할 준비가 됐어요</h1><p>다음 작업에서 Upstage 생성과 편집기를 연결합니다.</p><button className="secondary-button" onClick={() => setDraft({ ...draft, step: 3 })}>이전으로</button></div>}
    </section></main>;
}
