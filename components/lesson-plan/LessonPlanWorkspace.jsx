'use client';
import { useEffect, useState } from 'react';
import { loadDraft, saveDraft } from '@/lib/draft-store';
import { StepNavigation } from './StepNavigation.jsx';
import { LessonBasicsStep } from './LessonBasicsStep.jsx';

const emptyBasics = { schoolLevel: '', grade: '', subject: '', mode: 'single', sessions: 1, intent: '', studentNeeds: '', error: '' };

export function LessonPlanWorkspace() {
    const [ready, setReady] = useState(false);
    const [draft, setDraft] = useState({ step: 1, basics: emptyBasics });
    useEffect(() => { setDraft(loadDraft() ?? { step: 1, basics: emptyBasics }); setReady(true); }, []);
    useEffect(() => { if (!ready) return; const timer = setTimeout(() => saveDraft(draft), 300); return () => clearTimeout(timer); }, [draft, ready]);
    return <main className="workspace"><StepNavigation current={draft.step}/><section className="workspace__main">
        {draft.step === 1 ? <LessonBasicsStep value={draft.basics} onChange={basics => setDraft({ ...draft, basics })} onNext={() => setDraft({ ...draft, step: 2 })}/> : <div><p className="eyebrow">2단계 · 성취기준</p><h1>성취기준 선택</h1><p>다음 작업에서 직접 검색과 AI 추천을 연결합니다.</p><button onClick={() => setDraft({ ...draft, step: 1 })}>이전으로</button></div>}
    </section></main>;
}
