import { useEffect, useMemo, useRef, useState } from 'react';
import catalog from '@/data/curriculum.json';
import { searchStandards } from '@/lib/curriculum/search';
import { subjectAreasForSelection } from '@/lib/curriculum/scope';
import { useOperation } from '@/components/workflow/OperationProvider.jsx';

const MAX_STANDARDS = 10;

function gradeBand({ schoolLevel, grade }) {
    if (schoolLevel === 'elementary') return Number(grade) <= 2 ? '1-2' : Number(grade) <= 4 ? '3-4' : '5-6';
    return schoolLevel === 'middle' ? '7-9' : '10-12';
}

function gradeBandLabel(basics) {
    const band = gradeBand(basics);
    if (basics.schoolLevel === 'middle') return '중학교 1~3학년군';
    if (basics.schoolLevel === 'high') return '고등학교 1~3학년';
    return `초등학교 ${band}학년군`;
}

function StandardList({ items, selected, onToggle, emptyMessage }) {
    if (!items.length) return <p className="empty-state">{emptyMessage}</p>;
    return <div className="standard-list">{items.map(item => <label className={selected.some(value => value.code === item.code) ? 'standard-item is-selected' : 'standard-item'} key={`${item.subject}:${item.code}`}>
        <input type="checkbox" aria-label={`${item.code} ${item.text}`} checked={selected.some(value => value.code === item.code)} onChange={() => onToggle(item)}/>
        <span><strong>{item.code}</strong><span>{item.text}</span>{item.subjectArea && <small>{item.subjectArea}</small>}{item.reason && <small><b>추천 이유</b> {item.reason}</small>}</span>
        {item.score != null && <em>{Math.round(item.score)}%</em>}
    </label>)}</div>;
}

export function StandardsStep({ basics, selected, onChange, onBack, onNext }) {
    const { runOperation } = useOperation();
    const [query, setQuery] = useState(basics.intent);
    const [directQuery, setDirectQuery] = useState('');
    const [areaFilter, setAreaFilter] = useState('all');
    const [recommendations, setRecommendations] = useState([]);
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');
    const [selectionMessage, setSelectionMessage] = useState('');
    const activeRecommendation = useRef(null);
    const subjectAreas = useMemo(() => subjectAreasForSelection(basics), [basics]);
    const scopeBase = useMemo(() => ({
        schoolLevel: basics.schoolLevel,
        gradeBand: gradeBand(basics),
        subject: basics.subject,
        subjects: basics.mappedSubjects?.length ? basics.mappedSubjects : [basics.subject],
        subjectAreas,
    }), [basics, subjectAreas]);
    const recommendationScope = useMemo(() => ({ ...scopeBase, query: [basics.displaySubject, query].filter(Boolean).join(' ') }), [basics.displaySubject, query, scopeBase]);
    const direct = useMemo(() => searchStandards(catalog, {
        ...scopeBase,
        subjectAreas: areaFilter === 'all' ? subjectAreas : [areaFilter],
        query: directQuery,
    }, catalog.length), [areaFilter, directQuery, scopeBase, subjectAreas]);
    useEffect(() => () => { activeRecommendation.current?.abort(); activeRecommendation.current = null; }, []);
    const toggle = item => {
        const exists = selected.some(value => value.code === item.code);
        if (!exists && selected.length >= MAX_STANDARDS) {
            setSelectionMessage(`성취기준은 최대 ${MAX_STANDARDS}개까지 선택할 수 있습니다. 기존 기준을 해제한 뒤 추가해주세요.`);
            return;
        }
        setSelectionMessage('');
        onChange(exists ? selected.filter(value => value.code !== item.code) : [...selected, item]);
    };
    const recommend = async () => {
        activeRecommendation.current?.abort();
        const controller = new AbortController();
        activeRecommendation.current = controller;
        setStatus('loading'); setMessage('');
        try {
            const result = await runOperation({ kind: 'standards-recommendation', label: '성취기준 추천 분석', phase: 'upstageWaiting', cancelable: true, model: 'configured-generation-model' }, async ({ signal }) => {
                const response = await fetch('/api/recommend-standards', { method: 'POST', signal: AbortSignal.any([controller.signal, signal]), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recommendationScope) });
                return { body: await response.json(), ok: response.ok };
            });
            if (!result) { setStatus('idle'); return; }
            const { body, ok } = result;
            if (activeRecommendation.current !== controller) return;
            if (!ok) { setStatus('error'); setMessage(body.message || 'AI 추천을 불러오지 못했습니다. 직접 검색은 계속 사용할 수 있어요.'); return; }
            setRecommendations(body.recommendations); setStatus('done');
        } catch {
            if (activeRecommendation.current !== controller) return;
            setStatus('error');
            setMessage('AI 추천을 불러오지 못했습니다. 직접 검색은 계속 사용할 수 있어요.');
        } finally {
            if (activeRecommendation.current === controller) activeRecommendation.current = null;
        }
    };
    return <div className="standards-step">
        <header><p className="eyebrow">2단계 · 성취기준</p><h1>성취기준을 하나 이상 선택해주세요</h1><p>{gradeBandLabel(basics)} · {basics.displaySubject || basics.subject}{subjectAreas.length ? ` · ${subjectAreas.join('/')}` : ''} 공식 기준만 보여드립니다. AI 추천을 참고하거나 전체 목록에서 직접 선택할 수 있어요.</p></header>
        <aside className="standards-selection-summary" role="status" aria-live="polite" aria-label="선택한 성취기준">
            <div><strong>선택한 성취기준 · {selected.length}/{MAX_STANDARDS}</strong><span>{selected.length ? `${selected.length}개를 모두 지도안 생성에 반영합니다.` : '관련 성취기준을 여러 개 함께 선택할 수 있습니다.'}</span></div>
            {selected.length > 0 && <ul>{selected.map(item => <li key={item.code}><strong>{item.code}</strong><span>{item.text}</span><button type="button" className="text-button" aria-label={`${item.code} 성취기준 선택 해제`} onClick={() => toggle(item)}>선택 해제</button></li>)}</ul>}
        </aside>
        {selectionMessage && <p className="form-alert" role="alert">{selectionMessage}</p>}
        <section className="standards-source-section" aria-labelledby="recommended-standards-title"><div className="section-heading"><div><h2 id="recommended-standards-title">AI 추천</h2><p>수업 주제와 가까운 공식 기준을 3~5개로 좁혀봅니다.</p></div></div>
            <div className="standards-toolbar"><label>AI가 참고할 수업 내용<input aria-label="성취기준 검색" value={query} onChange={event => {
                activeRecommendation.current?.abort(); activeRecommendation.current = null;
                setQuery(event.target.value); setRecommendations([]); setStatus('idle'); setMessage('');
            }}/></label><button type="button" onClick={recommend} disabled={status === 'loading'}>{status === 'loading' ? '분석 중…' : 'AI로 추천받기'}</button></div>
            {message && <p className="form-alert" role="alert">{message}</p>}
            {status === 'done' && <p className="recommendation-note">입력한 수업 내용과 가까운 성취기준입니다. 추천 이유를 확인하고 직접 선택해주세요.</p>}
            {recommendations.length > 0 && <StandardList items={recommendations} selected={selected} onToggle={toggle} emptyMessage="추천 결과가 없습니다."/>}
        </section>
        <section className="standards-source-section" aria-labelledby="official-standards-title"><div className="section-heading"><div><h2 id="official-standards-title">교육과정에서 직접 선택</h2><p>현재 범위의 공식 성취기준 전체에서 직접 찾을 수 있습니다.</p></div></div>
            <div className="standards-direct-filters"><label>코드 또는 내용 검색<input aria-label="공식 성취기준 검색" value={directQuery} onChange={event => setDirectQuery(event.target.value)}/></label>{subjectAreas.length > 1 && <label>영역<select aria-label="성취기준 영역" value={areaFilter} onChange={event => setAreaFilter(event.target.value)}><option value="all">전체</option>{subjectAreas.map(area => <option value={area} key={area}>{area}</option>)}</select></label>}</div>
            <StandardList items={direct} selected={selected} onToggle={toggle} emptyMessage="검색 결과가 없습니다. 더 넓은 개념어로 검색해보세요."/>
        </section>
        <footer className="step-actions"><button className="secondary-button" type="button" onClick={onBack}>이전</button><span>{selected.length ? `${selected.length}개 선택됨 · 모두 생성에 반영` : '성취기준을 1개 이상 선택해주세요'}</span><button type="button" disabled={!selected.length} onClick={onNext}>수업 설계 선택 →</button></footer>
    </div>;
}
