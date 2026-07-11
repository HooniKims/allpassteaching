import { useMemo, useState } from 'react';
import catalog from '@/data/curriculum.json';
import { searchStandards } from '@/lib/curriculum/search';

function gradeBand({ schoolLevel, grade }) {
    if (schoolLevel === 'elementary') return Number(grade) <= 2 ? '1-2' : Number(grade) <= 4 ? '3-4' : '5-6';
    return schoolLevel === 'middle' ? '7-9' : '10-12';
}

export function StandardsStep({ basics, selected, onChange, onBack, onNext }) {
    const [query, setQuery] = useState(basics.intent);
    const [recommendations, setRecommendations] = useState([]);
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');
    const scope = useMemo(() => ({ schoolLevel: basics.schoolLevel, gradeBand: gradeBand(basics), subject: basics.subject, query }), [basics, query]);
    const direct = useMemo(() => searchStandards(catalog, scope, 30), [scope]);
    const visible = recommendations.length ? recommendations : direct;
    const toggle = item => onChange(selected.some(value => value.code === item.code) ? selected.filter(value => value.code !== item.code) : [...selected, item]);
    const recommend = async () => {
        setStatus('loading'); setMessage('');
        const response = await fetch('/api/recommend-standards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scope) });
        const body = await response.json();
        if (!response.ok) { setStatus('error'); setMessage(body.message || 'AI 추천을 불러오지 못했습니다. 직접 검색은 계속 사용할 수 있어요.'); return; }
        setRecommendations(body.recommendations); setStatus('done');
    };
    return <div className="standards-step">
        <header><p className="eyebrow">2단계 · 성취기준</p><h1>성취기준을 선택해주세요</h1><p>{basics.subject} · {gradeBand(basics)}학년군에 맞는 기준만 보여드립니다.</p></header>
        <div className="standards-toolbar"><label>코드 또는 내용 검색<input aria-label="성취기준 검색" value={query} onChange={event => { setQuery(event.target.value); setRecommendations([]); }}/></label><button type="button" onClick={recommend} disabled={status === 'loading'}>{status === 'loading' ? '분석 중…' : 'AI로 추천받기'}</button></div>
        {message && <p className="form-alert" role="alert">{message}</p>}
        {status === 'done' && <p className="recommendation-note">입력한 수업 내용과 가까운 성취기준입니다. 추천 이유를 확인하고 직접 선택해주세요.</p>}
        <div className="standard-list">{visible.map(item => <label className={selected.some(value => value.code === item.code) ? 'standard-item is-selected' : 'standard-item'} key={item.code}>
            <input type="checkbox" aria-label={`${item.code} ${item.text}`} checked={selected.some(value => value.code === item.code)} onChange={() => toggle(item)}/>
            <span><strong>{item.code}</strong><span>{item.text}</span>{item.reason && <small><b>추천 이유</b> {item.reason}</small>}</span>
            {item.score != null && <em>{Math.round(item.score)}%</em>}
        </label>)}</div>
        {!visible.length && <p className="empty-state">검색 결과가 없습니다. 더 넓은 개념어로 검색해보세요.</p>}
        <footer className="step-actions"><button className="secondary-button" type="button" onClick={onBack}>이전</button><span>{selected.length}개 선택됨</span><button type="button" disabled={!selected.length} onClick={onNext}>수업 모형 선택 →</button></footer>
    </div>;
}
