import { useEffect, useMemo, useRef, useState } from 'react';
import catalog from '@/data/curriculum.json';
import { searchStandards } from '@/lib/curriculum/search';
import { catalogSubjectsFor, CUSTOM_SUBJECT_VALUE, subjectGroupsFor } from '@/lib/subject-options';
import { useOperation } from '@/components/workflow/OperationProvider.jsx';

function gradeBand({ schoolLevel, grade }) {
    if (schoolLevel === 'elementary') return Number(grade) <= 2 ? '1-2' : Number(grade) <= 4 ? '3-4' : '5-6';
    return schoolLevel === 'middle' ? '7-9' : '10-12';
}

function availableSubjects(basics) {
    const primarySubjects = new Set([
        basics.displaySubject,
        basics.subject,
        ...(basics.mappedSubjects ?? []),
    ].filter(Boolean));
    const seen = new Set();
    return subjectGroupsFor(basics.schoolLevel, basics.grade).flatMap(group => group.options)
        .filter(item => item.value !== CUSTOM_SUBJECT_VALUE && !primarySubjects.has(item.value))
        .filter(item => {
            if (seen.has(item.value)) return false;
            seen.add(item.value);
            return true;
        });
}

export function IntegrationStandardsPicker({ basics, primaryStandards, value, onChange }) {
    const { runOperation } = useOperation();
    const [query, setQuery] = useState(basics.intent);
    const [recommendations, setRecommendations] = useState([]);
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');
    const activeRecommendation = useRef(null);
    const subjects = useMemo(() => availableSubjects(basics), [basics]);
    const selectedSubject = value.integrationSubject ?? '';
    const selectedStandards = value.integrationStandards ?? [];
    const maximumSecondaryStandards = Math.max(0, 10 - primaryStandards.length);
    const selectionLimitReached = selectedStandards.length >= maximumSecondaryStandards;
    const mappedSubjects = useMemo(
        () => selectedSubject ? catalogSubjectsFor(basics.schoolLevel, basics.grade, selectedSubject) : [],
        [basics.grade, basics.schoolLevel, selectedSubject],
    );
    const scope = useMemo(() => ({
        schoolLevel: basics.schoolLevel,
        gradeBand: gradeBand(basics),
        subjects: mappedSubjects,
        query: [selectedSubject, query].filter(Boolean).join(' '),
    }), [basics, mappedSubjects, query, selectedSubject]);
    const direct = useMemo(
        () => mappedSubjects.length ? searchStandards(catalog, scope, 30) : [],
        [mappedSubjects.length, scope],
    );
    const visible = recommendations.length ? recommendations : direct;
    useEffect(() => () => { activeRecommendation.current?.abort(); }, []);

    const selectSubject = integrationSubject => {
        activeRecommendation.current?.abort();
        setRecommendations([]);
        setStatus('idle');
        setMessage('');
        onChange({ ...value, integrationSubject, integrationStandards: [] });
    };
    const toggle = item => {
        const itemKey = item.code;
        const exists = selectedStandards.some(standard => standard.code === itemKey);
        onChange({
            ...value,
            integrationStandards: exists
                ? selectedStandards.filter(standard => standard.code !== itemKey)
                : selectionLimitReached
                    ? selectedStandards
                : [...selectedStandards, { ...item, subject: selectedSubject }],
        });
    };
    const recommend = async () => {
        activeRecommendation.current?.abort();
        const controller = new AbortController();
        activeRecommendation.current = controller;
        setStatus('loading');
        setMessage('');
        try {
            const result = await runOperation({ kind: 'integration-standards-recommendation', label: '연계 교과 성취기준 추천', phase: 'upstageWaiting', cancelable: true, model: 'configured-generation-model' }, async ({ signal }) => {
                const response = await fetch('/api/recommend-standards', {
                    method: 'POST',
                    signal: AbortSignal.any([controller.signal, signal]),
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(scope),
                });
                return { ok: response.ok, body: await response.json() };
            });
            if (!result) { setStatus('idle'); return; }
            if (activeRecommendation.current !== controller) return;
            if (!result.ok) {
                setStatus('error');
                setMessage(result.body.message || 'AI 추천을 불러오지 못했습니다. 직접 검색은 계속 사용할 수 있어요.');
                return;
            }
            setRecommendations(result.body.recommendations);
            setStatus('done');
        } catch {
            if (activeRecommendation.current !== controller) return;
            setStatus('error');
            setMessage('AI 추천을 불러오지 못했습니다. 직접 검색은 계속 사용할 수 있어요.');
        } finally {
            if (activeRecommendation.current === controller) activeRecommendation.current = null;
        }
    };

    return <section className="integration-standards" aria-labelledby="integration-standards-title">
        <div className="integration-standards__heading">
            <div><p className="eyebrow">융합 교과 연결</p><h3 id="integration-standards-title">두 번째 교과와 성취기준을 선택해주세요</h3></div>
            <p><strong>{basics.displaySubject || basics.subject}</strong> 성취기준 {primaryStandards.length}개는 이미 선택되어 있습니다.</p>
        </div>
        <label className="integration-standards__subject">연계 교과
            <select aria-label="융합 연계 교과" value={selectedSubject} onChange={event => selectSubject(event.target.value)}>
                <option value="">선택</option>
                {subjects.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
        </label>
        {selectedSubject && <>
            <aside className="standards-selection-summary" role="status" aria-live="polite" aria-label="선택한 연계 교과 성취기준">
                <div><strong>{selectedSubject} 성취기준</strong><span>{selectedStandards.length ? `${selectedStandards.length}개 선택 · 두 교과 합계 ${primaryStandards.length + selectedStandards.length}/10개` : maximumSecondaryStandards ? '연계 교과 성취기준을 1개 이상 선택해주세요.' : '주교과 성취기준을 9개 이하로 줄여야 연계 교과 기준을 선택할 수 있습니다.'}</span></div>
                {selectedStandards.length > 0 && <ul>{selectedStandards.map(item => <li key={`${selectedSubject}:${item.code}`}><strong>{item.code}</strong><span>{item.text}</span><button type="button" className="text-button" aria-label={`${selectedSubject} ${item.code} 성취기준 선택 해제`} onClick={() => toggle(item)}>선택 해제</button></li>)}</ul>}
            </aside>
            <div className="standards-toolbar"><label>연계 교과 코드 또는 내용 검색<input aria-label="연계 교과 성취기준 검색" value={query} onChange={event => {
                activeRecommendation.current?.abort();
                setQuery(event.target.value);
                setRecommendations([]);
                setStatus('idle');
                setMessage('');
            }}/></label><button type="button" onClick={recommend} disabled={status === 'loading'}>{status === 'loading' ? '분석 중…' : 'AI로 추천받기'}</button></div>
            {message && <p className="form-alert" role="alert">{message}</p>}
            {status === 'done' && <p className="recommendation-note">연계 교과의 공식 성취기준 후보입니다. 융합 활동에서 실제로 다룰 기준을 직접 선택해주세요.</p>}
            <div className="standard-list integration-standards__list">{visible.map(item => {
                const selected = selectedStandards.some(valueItem => valueItem.code === item.code);
                return <label className={selected ? 'standard-item is-selected' : 'standard-item'} key={`${item.subject}:${item.code}`}>
                    <input type="checkbox" aria-label={`${selectedSubject} ${item.code} ${item.text}`} checked={selected} disabled={!selected && selectionLimitReached} onChange={() => toggle(item)}/>
                    <span><strong>{item.code}</strong><span>{item.text}</span>{item.reason && <small><b>추천 이유</b> {item.reason}</small>}</span>
                    {item.score != null && <em>{Math.round(item.score)}%</em>}
                </label>;
            })}</div>
            {!visible.length && <p className="empty-state">연계 교과에서 검색 결과를 찾지 못했습니다. 다른 개념어로 검색해보세요.</p>}
        </>}
    </section>;
}
