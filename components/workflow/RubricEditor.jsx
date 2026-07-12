import { useState } from 'react';
import { deriveLevelScores } from '@/lib/rubric-score';
import { sourceHash } from '@/lib/source-hash';

const splitLines = value => value.split('\n').map(item => item.trim()).filter(Boolean);
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
const move = (items, index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
};

export function RubricEditor({ value, onChange }) {
    const [criterionCandidate, setCriterionCandidate] = useState(null);
    const [error, setError] = useState('');
    const commit = patch => onChange({ ...value, ...patch });
    const updateTask = patch => commit({ task: { ...value.task, ...patch } });
    const updateCriterion = (index, patch) => commit({ rubric: { ...value.rubric, criteria: value.rubric.criteria.map((criterion, current) => current === index ? { ...criterion, ...patch } : criterion) } });
    const evidenceMapWithCriterion = (criterionId, standardCodes, remove = false) => value.backwardDesign.evidenceMap.map(mapping => {
        const withoutCriterion = mapping.criterionIds.filter(id => id !== criterionId);
        return { ...mapping, criterionIds: !remove && standardCodes.includes(mapping.standardCode) ? [...withoutCriterion, criterionId] : withoutCriterion };
    });
    const toggleCriterionStandard = (index, code) => {
        const criterion = value.rubric.criteria[index];
        const standardCodes = criterion.standardCodes.includes(code) ? criterion.standardCodes.filter(item => item !== code) : [...criterion.standardCodes, code];
        const criteria = value.rubric.criteria.map((item, current) => current === index ? { ...item, standardCodes } : item);
        commit({ rubric: { ...value.rubric, criteria }, backwardDesign: { ...value.backwardDesign, evidenceMap: evidenceMapWithCriterion(criterion.id, standardCodes) } });
    };
    const updateLevel = (criterionIndex, levelIndex, patch) => {
        const criterion = value.rubric.criteria[criterionIndex];
        updateCriterion(criterionIndex, { levels: criterion.levels.map((level, current) => current === levelIndex ? { ...level, ...patch } : level) });
    };
    const commitLevelDefinitions = definitions => {
        const criteria = value.rubric.criteria.map(criterion => {
            const currentById = new Map(criterion.levels.map(level => [level.levelId, level]));
            const intervalPoints = Math.max(1, Math.min(criterion.intervalPoints, Math.floor(criterion.maxPoints / (definitions.length - 1))));
            const scores = deriveLevelScores(criterion.maxPoints, intervalPoints, definitions.length);
            return { ...criterion, intervalPoints, levels: definitions.map((definition, index) => ({ levelId: definition.id, score: scores[index], description: currentById.get(definition.id)?.description ?? '관찰 가능한 수행 수준을 입력하세요.' })) };
        });
        commit({ rubric: { levels: definitions, criteria } });
    };
    const addLevelDefinition = () => {
        if (value.rubric.levels.length >= 6) return;
        const count = value.rubric.levels.length + 1;
        try { commitLevelDefinitions([...value.rubric.levels, { id: uid('level'), label: `${count}수준` }]); setError(''); } catch (cause) { setError(cause.message); }
    };
    const duplicateLevelDefinition = index => {
        if (value.rubric.levels.length >= 6) return;
        const source = value.rubric.levels[index];
        try { commitLevelDefinitions(value.rubric.levels.toSpliced(index + 1, 0, { id: uid('level'), label: `${source.label} 복사본` })); setError(''); } catch (cause) { setError(cause.message); }
    };
    const removeLevelDefinition = index => {
        if (value.rubric.levels.length <= 2) return;
        try { commitLevelDefinitions(value.rubric.levels.toSpliced(index, 1)); setError(''); } catch (cause) { setError(cause.message); }
    };
    const moveLevelDefinition = (index, offset) => {
        try { commitLevelDefinitions(move(value.rubric.levels, index, offset)); setError(''); } catch (cause) { setError(cause.message); }
    };
    const renameLevelDefinition = (index, label) => commit({ rubric: { ...value.rubric, levels: value.rubric.levels.map((level, current) => current === index ? { ...level, label } : level) } });
    const recalculate = index => {
        try {
            const criterion = value.rubric.criteria[index];
            const scores = deriveLevelScores(criterion.maxPoints, criterion.intervalPoints, value.rubric.levels.length);
            updateCriterion(index, { levels: criterion.levels.map((level, current) => ({ ...level, score: scores[current] })) });
            setError('');
        } catch (cause) { setError(cause.message); }
    };
    const addCriterion = () => {
        if (value.rubric.criteria.length >= 15) return;
        const maxPoints = 10;
        const levels = value.rubric.levels.map((level, index) => ({ levelId: level.id, score: Math.max(0, maxPoints - index * 2), description: '관찰 가능한 수행 수준을 입력하세요.' }));
        const criterion = { id: uid('criterion'), name: '새 평가영역', description: '평가할 내용을 입력하세요.', standardCodes: [value.task.standards[0].code], kind: 'outcome', maxPoints, intervalPoints: 2, evidence: '학생 산출물에서 확인할 증거', levels };
        commit({ rubric: { ...value.rubric, criteria: [...value.rubric.criteria, criterion] }, backwardDesign: { ...value.backwardDesign, evidenceMap: evidenceMapWithCriterion(criterion.id, criterion.standardCodes) } });
    };
    const duplicateCriterion = index => {
        if (value.rubric.criteria.length >= 15) return;
        const current = value.rubric.criteria[index];
        const copy = { ...structuredClone(current), id: uid('criterion'), name: `${current.name} 복사본` };
        commit({ rubric: { ...value.rubric, criteria: value.rubric.criteria.toSpliced(index + 1, 0, copy) }, backwardDesign: { ...value.backwardDesign, evidenceMap: evidenceMapWithCriterion(copy.id, copy.standardCodes) } });
    };
    const removeCriterion = index => {
        if (value.rubric.criteria.length <= 2) return;
        const criterion = value.rubric.criteria[index];
        commit({ rubric: { ...value.rubric, criteria: value.rubric.criteria.toSpliced(index, 1) }, backwardDesign: { ...value.backwardDesign, evidenceMap: evidenceMapWithCriterion(criterion.id, [], true) } });
    };
    const moveCriterion = (index, offset) => commit({ rubric: { ...value.rubric, criteria: move(value.rubric.criteria, index, offset) } });
    const regenerate = async criterionId => {
        setError('');
        try {
            const response = await fetch('/api/regenerate-assessment-criterion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assessment: value, criterionId }) });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.message || '평가영역을 다시 만들지 못했습니다.');
            const original = structuredClone(value.rubric.criteria.find(item => item.id === criterionId));
            setCriterionCandidate({ criterionId, value: body.criterion, original, sourceFingerprint: sourceHash(original) });
        } catch (cause) { setError(cause.message); }
    };
    const applyCandidate = () => {
        const index = value.rubric.criteria.findIndex(item => item.id === criterionCandidate.criterionId);
        if (sourceHash(value.rubric.criteria[index]) !== criterionCandidate.sourceFingerprint) {
            setError('후보 생성 뒤 현재 평가영역이 수정되었습니다. 현재 내용을 유지하고 다시 생성해주세요.');
            return;
        }
        const criteria = value.rubric.criteria.map((item, current) => current === index ? criterionCandidate.value : item);
        commit({ rubric: { ...value.rubric, criteria }, backwardDesign: { ...value.backwardDesign, evidenceMap: evidenceMapWithCriterion(criterionCandidate.value.id, criterionCandidate.value.standardCodes) } });
        setCriterionCandidate(null);
    };
    return <div className="structured-editor assessment-editor">
        <section className="document-section"><h2>수행과제</h2>
            <label>과제명<input value={value.task.title} onChange={event => updateTask({ title: event.target.value })}/></label>
            <div className="field-grid field-grid--two"><label>상황<textarea rows="3" value={value.task.situation} onChange={event => updateTask({ situation: event.target.value })}/></label><label>학생 역할<textarea rows="3" value={value.task.role} onChange={event => updateTask({ role: event.target.value })}/></label><label>공유 대상<textarea rows="3" value={value.task.audience} onChange={event => updateTask({ audience: event.target.value })}/></label><label>산출물<textarea rows="3" value={value.task.product} onChange={event => updateTask({ product: event.target.value })}/></label></div>
            <div className="field-grid field-grid--two">{[['수행 절차', 'procedure'], ['제출 조건', 'conditions'], ['준비물', 'materials'], ['유의점', 'cautions']].map(([label, key]) => <label key={key}>{label} <span className="optional">한 줄에 하나</span><textarea rows="4" value={value.task[key].join('\n')} onChange={event => updateTask({ [key]: splitLines(event.target.value) })}/></label>)}</div>
        </section>
        <section className="document-section"><div className="section-heading"><div><h2>점수형 분석적 루브릭</h2><p>전체 총점, 영역별 총점, 급간과 수준별 점수를 교사가 직접 바꿀 수 있습니다.</p></div><button type="button" className="secondary-button" onClick={addCriterion} disabled={value.rubric.criteria.length >= 15}>평가영역 추가</button></div>
            <label className="compact-field">전체 총점<input aria-label="전체 총점" type="number" min="1" max="1000" value={value.totalPoints} onChange={event => commit({ totalPoints: Number(event.target.value) })}/></label>
            {error && <p className="form-alert" role="alert">{error}</p>}
            <section className="level-definition-editor"><div className="section-heading"><div><h3>성취수준</h3><p>2~6개 수준의 이름과 순서를 바꿀 수 있습니다.</p></div><button type="button" className="secondary-button" onClick={addLevelDefinition} disabled={value.rubric.levels.length >= 6}>성취수준 추가</button></div><div>{value.rubric.levels.map((level, index) => <article key={level.id}><label>{index + 1}수준 이름<input aria-label={`${index + 1}수준 이름`} value={level.label} onChange={event => renameLevelDefinition(index, event.target.value)}/></label><div className="row-actions"><button type="button" aria-label={`${index + 1}수준 왼쪽으로`} onClick={() => moveLevelDefinition(index, -1)} disabled={index === 0}>왼쪽</button><button type="button" aria-label={`${index + 1}수준 오른쪽으로`} onClick={() => moveLevelDefinition(index, 1)} disabled={index === value.rubric.levels.length - 1}>오른쪽</button><button type="button" aria-label={`${index + 1}수준 복제`} onClick={() => duplicateLevelDefinition(index)} disabled={value.rubric.levels.length >= 6}>복제</button><button type="button" aria-label={`${index + 1}수준 삭제`} onClick={() => removeLevelDefinition(index)} disabled={value.rubric.levels.length <= 2}>삭제</button></div></article>)}</div></section>
            <div className="rubric-criteria-editor">{value.rubric.criteria.map((criterion, index) => <fieldset className="rubric-criterion-card" key={criterion.id}><legend>{index + 1}. {criterion.name}</legend>
                <div className="row-actions"><button type="button" onClick={() => moveCriterion(index, -1)} disabled={index === 0}>위로</button><button type="button" onClick={() => moveCriterion(index, 1)} disabled={index === value.rubric.criteria.length - 1}>아래로</button><button type="button" onClick={() => duplicateCriterion(index)}>복제</button><button type="button" onClick={() => removeCriterion(index)} disabled={value.rubric.criteria.length <= 2}>삭제</button><button type="button" onClick={() => regenerate(criterion.id)}>이 영역만 AI 다시 생성</button></div>
                <div className="field-grid field-grid--two"><label>영역명<input value={criterion.name} onChange={event => updateCriterion(index, { name: event.target.value })}/></label><label>증거 구분<select value={criterion.kind} onChange={event => updateCriterion(index, { kind: event.target.value })}><option value="outcome">결과 증거</option><option value="process">과정 증거</option></select></label><label>{criterion.name} 영역 총점<input aria-label={`${criterion.name} 영역 총점`} type="number" min="1" max="1000" value={criterion.maxPoints} onChange={event => updateCriterion(index, { maxPoints: Number(event.target.value) })}/></label><label>{criterion.name} 급간 점수<input aria-label={`${criterion.name} 급간 점수`} type="number" min="1" max="1000" value={criterion.intervalPoints} onChange={event => updateCriterion(index, { intervalPoints: Number(event.target.value) })}/></label></div>
                <fieldset className="criterion-standard-links"><legend>연결 성취기준</legend>{value.task.standards.map(standard => <label key={standard.code}><input aria-label={`[${standard.code}] 연결`} type="checkbox" checked={criterion.standardCodes.includes(standard.code)} onChange={() => toggleCriterionStandard(index, standard.code)}/><span><strong>[{standard.code}]</strong> {standard.text}</span></label>)}</fieldset>
                <button type="button" className="secondary-button" onClick={() => recalculate(index)}>{criterion.name} 급간으로 다시 계산</button>
                <label>평가 내용<textarea rows="2" value={criterion.description} onChange={event => updateCriterion(index, { description: event.target.value })}/></label><label>관찰 증거<textarea rows="2" value={criterion.evidence} onChange={event => updateCriterion(index, { evidence: event.target.value })}/></label>
                <div className="rubric-level-grid">{value.rubric.levels.map((definition, levelIndex) => <section key={definition.id}><h3>{definition.label}</h3><label>{criterion.name} {definition.label} 점수<input aria-label={`${criterion.name} ${definition.label} 점수`} type="number" min="0" max={criterion.maxPoints} value={criterion.levels[levelIndex]?.score ?? 0} onChange={event => updateLevel(index, levelIndex, { score: Number(event.target.value) })}/></label><label>수행 기술<textarea rows="3" value={criterion.levels[levelIndex]?.description ?? ''} onChange={event => updateLevel(index, levelIndex, { description: event.target.value })}/></label></section>)}</div>
                {criterionCandidate?.criterionId === criterion.id && <div className="candidate-panel" role="status"><strong>선택 영역 변경 비교</strong><div className="criterion-comparison"><section><h4>현재 설명</h4><p><strong>{criterionCandidate.original.name}</strong></p><p>{criterionCandidate.original.description}</p><p>증거: {criterionCandidate.original.evidence}</p></section><section><h4>AI 제안 설명</h4><p><strong>{criterionCandidate.value.name}</strong></p><p>{criterionCandidate.value.description}</p><p>증거: {criterionCandidate.value.evidence}</p></section></div><button type="button" onClick={applyCandidate}>이 제안 적용</button><button type="button" className="secondary-button" onClick={() => setCriterionCandidate(null)}>현재 영역 유지</button></div>}
            </fieldset>)}</div>
        </section>
    </div>;
}
