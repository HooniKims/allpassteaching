'use client';
import { useEffect, useState } from 'react';
import { loadDraft, saveDraft } from '@/lib/draft-store';
import { StepNavigation } from './StepNavigation.jsx';
import { LessonBasicsStep } from './LessonBasicsStep.jsx';
import { StandardsStep } from './StandardsStep.jsx';

const emptyBasics = { schoolLevel: '', grade: '', subject: '', mode: 'single', sessions: 1, intent: '', studentNeeds: '', error: '' };

export function LessonPlanWorkspace() {
    const [ready, setReady] = useState(false);
    const [draft, setDraft] = useState({ step: 1, basics: emptyBasics, standards: [] });
    useEffect(() => { setDraft(loadDraft() ?? { step: 1, basics: emptyBasics, standards: [] }); setReady(true); }, []);
    useEffect(() => { if (!ready) return; const timer = setTimeout(() => saveDraft(draft), 300); return () => clearTimeout(timer); }, [draft, ready]);
    return <main className="workspace"><StepNavigation current={draft.step}/><section className="workspace__main">
        {draft.step === 1 && <LessonBasicsStep value={draft.basics} onChange={basics => setDraft({ ...draft, basics })} onNext={() => setDraft({ ...draft, step: 2 })}/>}
        {draft.step === 2 && <StandardsStep basics={draft.basics} selected={draft.standards || []} onChange={standards => setDraft({ ...draft, standards })} onBack={() => setDraft({ ...draft, step: 1 })} onNext={() => setDraft({ ...draft, step: 3 })}/>}
        {draft.step === 3 && <div><p className="eyebrow">3단계 · 수업 모형</p><h1>수업 모형 선택</h1><button onClick={() => setDraft({ ...draft, step: 2 })}>이전으로</button></div>}
    </section></main>;
}
