import { useEffect, useState } from 'react';
import { deriveLevelScores } from '@/lib/rubric-score';
import { sourceHash } from '@/lib/source-hash';
import { useOperation } from './OperationProvider.jsx';

const splitLines = value => value.split('\n').map(item => item.trim()).filter(Boolean);
const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
const move = (items, index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
};
const synchronizeEvidenceMap = (backwardDesign, criteria) => ({
    ...backwardDesign,
    evidenceMap: backwardDesign.evidenceMap.map(mapping => {
        const linked = criteria.filter(criterion => criterion.standardCodes.includes(mapping.standardCode));
        return {
            ...mapping,
            criterionIds: linked.map(criterion => criterion.id),
            taskEvidenceTypes: linked.map(criterion => criterion.evidence),
            evidenceTypes: [...new Set(linked.map(criterion => criterion.kind === 'process' ? '과정 증거' : '결과 증거'))],
            scoreBasis: `${linked.map(criterion => `${criterion.name} ${criterion.maxPoints}점`).join(', ')} · 수준별 정의 점수`,
        };
    }),
});

function allocatePoints(criteria, target, minimum) {
    if (!criteria.length) {
        if (target !== 0) throw new Error('배점을 적용할 평가영역이 없습니다.');
        return new Map();
    }
    if (target < criteria.length * minimum) throw new Error(`${criteria.length}개 평가영역과 현재 성취수준에는 최소 ${criteria.length * minimum}점이 필요합니다.`);
    const remaining = target - criteria.length * minimum;
    const weightTotal = criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    const weighted = criteria.map(criterion => {
        const exact = weightTotal ? remaining * criterion.maxPoints / weightTotal : remaining / criteria.length;
        return { criterion, points: minimum + Math.floor(exact), fraction: exact - Math.floor(exact) };
    });
    let unassigned = target - weighted.reduce((sum, item) => sum + item.points, 0);
    weighted.toSorted((left, right) => right.fraction - left.fraction).forEach(item => { if (unassigned > 0) { item.points += 1; unassigned -= 1; } });
    return new Map(weighted.map(item => [item.criterion.id, item.points]));
}

function criterionWithMaximum(criterion, maxPoints, levelCount) {
    const intervalPoints = Math.max(1, Math.min(criterion.intervalPoints, Math.floor(maxPoints / (levelCount - 1))));
    const scores = deriveLevelScores(maxPoints, intervalPoints, levelCount);
    return { ...criterion, maxPoints, intervalPoints, levels: criterion.levels.map((level, index) => ({ ...level, score: scores[index] })) };
}

function percentForPoints(totalPoints, processPoints, preferred) {
    const matches = Array.from({ length: 101 }, (_, percent) => percent).filter(percent => Math.round(totalPoints * percent / 100) === processPoints);
    if (!matches.length) throw new Error('현재 전체 총점에서는 과정 배점을 정확한 비율로 표현할 수 없습니다. 다른 배점을 입력해주세요.');
    return matches.toSorted((left, right) => Math.abs(left - preferred) - Math.abs(right - preferred))[0];
}

export function RubricEditor({ value, request, onRequestChange, onChange }) {
    const { runOperation } = useOperation();
    const [criterionCandidate, setCriterionCandidate] = useState(null);
    const [error, setError] = useState('');
    const [totalDraft, setTotalDraft] = useState(String(value.totalPoints));
    const [pointDrafts, setPointDrafts] = useState(() => Object.fromEntries(value.rubric.criteria.map(criterion => [criterion.id, String(criterion.maxPoints)])));
    const [levelScoreDrafts, setLevelScoreDrafts] = useState(() => Object.fromEntries(value.rubric.criteria.flatMap(criterion => criterion.levels.map(level => [`${criterion.id}:${level.levelId}`, String(level.score)]))));
    const usesGrasps = (value.generationSettings?.assessmentApproachId ?? request.assessmentApproachId) === 'authentic-performance';
    const taskFieldLabels = usesGrasps
        ? ['평가 목표(G)', '학생 역할(R)', '공유 대상(A)', '상황(S)', '산출물(P)', '성공 기준(S)']
        : ['평가 목표', '학생 역할', '공유 대상', '상황', '산출물', '성공 기준'];
    const pointContractFingerprint = value.rubric.criteria.map(criterion => `${criterion.id}:${criterion.maxPoints}`).join('|');
    const levelScoreFingerprint = value.rubric.criteria.flatMap(criterion => criterion.levels.map(level => `${criterion.id}:${level.levelId}:${level.score}`)).join('|');
    useEffect(() => setTotalDraft(String(value.totalPoints)), [value.totalPoints]);
    useEffect(() => setPointDrafts(Object.fromEntries(value.rubric.criteria.map(criterion => [criterion.id, String(criterion.maxPoints)]))), [pointContractFingerprint]);
    useEffect(() => setLevelScoreDrafts(Object.fromEntries(value.rubric.criteria.flatMap(criterion => criterion.levels.map(level => [`${criterion.id}:${level.levelId}`, String(level.score)])))), [levelScoreFingerprint]);
    const commit = patch => onChange({ ...value, ...patch });
    const updateTask = patch => commit({ task: { ...value.task, ...patch } });
    const commitCriteria = criteria => commit({ rubric: { ...value.rubric, criteria }, backwardDesign: synchronizeEvidenceMap(value.backwardDesign, criteria) });
    const updateCriterion = (index, patch) => commitCriteria(value.rubric.criteria.map((criterion, current) => current === index ? { ...criterion, ...patch } : criterion));
    const commitContract = (criteria, nextRequest, scoring) => {
        onChange({ ...value, totalPoints: nextRequest.totalPoints, scoring, rubric: { ...value.rubric, criteria }, backwardDesign: synchronizeEvidenceMap(value.backwardDesign, criteria) });
        onRequestChange(nextRequest);
        setError('');
    };
    const applyCriteriaContract = criteria => {
        try {
            const totalPoints = criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
            const processPoints = criteria.filter(criterion => criterion.kind === 'process').reduce((sum, criterion) => sum + criterion.maxPoints, 0);
            const includeProcessInScore = processPoints > 0;
            const processWeightPercent = includeProcessInScore ? percentForPoints(totalPoints, processPoints, request.processWeightPercent) : 0;
            commitContract(criteria, { ...request, totalPoints, includeProcessInScore, processWeightPercent }, { includeProcessInScore, processWeightPercent, processTargetPoints: processPoints });
            return true;
        } catch (cause) {
            setError(`배점 변경을 적용할 수 없습니다. ${cause.message}`);
            return false;
        }
    };
    const applyTotalPoints = () => {
        try {
            const totalPoints = Number(totalDraft);
            if (!Number.isInteger(totalPoints) || totalPoints < 1 || totalPoints > 1000) throw new Error('전체 총점은 1~1,000의 정수여야 합니다.');
            const levelMinimum = value.rubric.levels.length - 1;
            const processTargetPoints = request.includeProcessInScore ? Math.round(totalPoints * request.processWeightPercent / 100) : 0;
            const process = value.rubric.criteria.filter(criterion => criterion.kind === 'process');
            const outcome = value.rubric.criteria.filter(criterion => criterion.kind === 'outcome');
            const allocations = new Map([...allocatePoints(process, processTargetPoints, levelMinimum), ...allocatePoints(outcome, totalPoints - processTargetPoints, levelMinimum)]);
            const criteria = value.rubric.criteria.map(criterion => criterionWithMaximum(criterion, allocations.get(criterion.id), value.rubric.levels.length));
            commitContract(criteria, { ...request, totalPoints }, { ...value.scoring, processTargetPoints });
        } catch (cause) { setError(`전체 총점을 적용할 수 없습니다. ${cause.message}`); }
    };
    const applyCriterionMaximum = index => {
        const criterion = value.rubric.criteria[index];
        const maxPoints = Number(pointDrafts[criterion.id]);
        const minimum = value.rubric.levels.length - 1;
        if (!Number.isInteger(maxPoints) || maxPoints < minimum || maxPoints > 1000) {
            setError(`배점 변경을 적용할 수 없습니다. 현재 ${value.rubric.levels.length}수준에는 영역별 최소 ${minimum}점이 필요합니다.`);
            return;
        }
        const criteria = value.rubric.criteria.map((item, current) => current === index ? criterionWithMaximum(item, maxPoints, value.rubric.levels.length) : item);
        applyCriteriaContract(criteria);
    };
    const toggleCriterionStandard = (index, code) => {
        const criterion = value.rubric.criteria[index];
        const standardCodes = criterion.standardCodes.includes(code) ? criterion.standardCodes.filter(item => item !== code) : [...criterion.standardCodes, code];
        const criteria = value.rubric.criteria.map((item, current) => current === index ? { ...item, standardCodes } : item);
        commitCriteria(criteria);
    };
    const updateLevel = (criterionIndex, levelIndex, patch) => {
        const criterion = value.rubric.criteria[criterionIndex];
        updateCriterion(criterionIndex, { levels: criterion.levels.map((level, current) => current === levelIndex ? { ...level, ...patch } : level) });
    };
    const commitLevelScore = (criterionIndex, levelIndex) => {
        const criterion = value.rubric.criteria[criterionIndex];
        const level = criterion.levels[levelIndex];
        const key = `${criterion.id}:${level.levelId}`;
        const score = Number(levelScoreDrafts[key]);
        if (!Number.isInteger(score) || score < 0 || score > criterion.maxPoints) {
            setLevelScoreDrafts(current => ({ ...current, [key]: String(level.score) }));
            setError(`${criterion.name} ${value.rubric.levels[levelIndex].label} 점수는 0~${criterion.maxPoints}의 정수여야 합니다.`);
            return;
        }
        updateLevel(criterionIndex, levelIndex, { score });
        setError('');
    };
    const commitLevelDefinitions = definitions => {
        const criteria = value.rubric.criteria.map(criterion => {
            const currentById = new Map(criterion.levels.map(level => [level.levelId, level]));
            const intervalPoints = Math.max(1, Math.min(criterion.intervalPoints, Math.floor(criterion.maxPoints / (definitions.length - 1))));
            const scores = deriveLevelScores(criterion.maxPoints, intervalPoints, definitions.length);
            return { ...criterion, intervalPoints, levels: definitions.map((definition, index) => ({ levelId: definition.id, score: scores[index], description: currentById.get(definition.id)?.description ?? '관찰 가능한 수행 수준을 입력하세요.' })) };
        });
        onChange({ ...value, rubric: { levels: definitions, criteria }, backwardDesign: synchronizeEvidenceMap(value.backwardDesign, criteria) });
        onRequestChange({ ...request, levelCount: definitions.length });
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
        applyCriteriaContract([...value.rubric.criteria, criterion]);
    };
    const duplicateCriterion = index => {
        if (value.rubric.criteria.length >= 15) return;
        const current = value.rubric.criteria[index];
        const copy = { ...structuredClone(current), id: uid('criterion'), name: `${current.name} 복사본` };
        applyCriteriaContract(value.rubric.criteria.toSpliced(index + 1, 0, copy));
    };
    const removeCriterion = index => {
        if (value.rubric.criteria.length <= 2) return;
        applyCriteriaContract(value.rubric.criteria.toSpliced(index, 1));
    };
    const moveCriterion = (index, offset) => commit({ rubric: { ...value.rubric, criteria: move(value.rubric.criteria, index, offset) } });
    const regenerate = async criterionId => {
        setError('');
        try {
            const body = await runOperation({ kind: 'criterion-regeneration', label: '선택 평가영역 다시 생성', phase: 'upstageWaiting', cancelable: true, model: 'configured-generation-model' }, async ({ signal }) => {
                const response = await fetch('/api/regenerate-assessment-criterion', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assessment: value, criterionId }) });
                const responseBody = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(responseBody.message || '평가영역을 다시 만들지 못했습니다.');
                return responseBody;
            });
            if (!body) return;
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
        if (applyCriteriaContract(criteria)) setCriterionCandidate(null);
    };
    return <div className="structured-editor assessment-editor">
        <section className="document-section"><h2>수행과제</h2>
            <label>과제명<input value={value.task.title} onChange={event => updateTask({ title: event.target.value })}/></label>
            <p className="section-help">{usesGrasps ? 'GRASPS의 평가 목표, 학생 역할, 공유 대상, 상황, 산출물과 성공 기준을 교사가 직접 다듬을 수 있습니다.' : '선택한 평가 설계 방식에 맞게 평가 목표, 학생 역할, 공유 대상, 상황, 산출물과 성공 기준을 직접 다듬을 수 있습니다.'}</p>
            <div className="field-grid field-grid--two"><label>{taskFieldLabels[0]}<textarea aria-label="평가 목표" rows="3" value={value.task.goal ?? ''} onChange={event => updateTask({ goal: event.target.value })}/></label><label>{taskFieldLabels[1]}<textarea aria-label="학생 역할" rows="3" value={value.task.role} onChange={event => updateTask({ role: event.target.value })}/></label><label>{taskFieldLabels[2]}<textarea aria-label="공유 대상" rows="3" value={value.task.audience} onChange={event => updateTask({ audience: event.target.value })}/></label><label>{taskFieldLabels[3]}<textarea aria-label="상황" rows="3" value={value.task.situation} onChange={event => updateTask({ situation: event.target.value })}/></label><label>{taskFieldLabels[4]}<textarea aria-label="산출물" rows="3" value={value.task.product} onChange={event => updateTask({ product: event.target.value })}/></label><label>{taskFieldLabels[5]}<textarea aria-label="성공 기준" rows="3" value={value.task.successCriteria ?? ''} onChange={event => updateTask({ successCriteria: event.target.value })}/></label></div>
            <div className="field-grid field-grid--two">{[['수행 절차', 'procedure'], ['제출 조건', 'conditions'], ['준비물', 'materials'], ['유의점', 'cautions']].map(([label, key]) => <label key={key}>{label} <span className="optional">한 줄에 하나</span><textarea rows="4" value={value.task[key].join('\n')} onChange={event => updateTask({ [key]: splitLines(event.target.value) })}/></label>)}</div>
        </section>
        <section className="document-section"><div className="section-heading"><div><h2>점수형 분석적 루브릭</h2><p>전체 총점, 영역별 총점, 급간과 수준별 점수를 교사가 직접 바꿀 수 있습니다.</p></div><button type="button" className="secondary-button" onClick={addCriterion} disabled={value.rubric.criteria.length >= 15}>평가영역 추가</button></div>
            <div className="inline-apply-field"><label className="compact-field">전체 총점<input aria-label="전체 총점" type="number" min="1" max="1000" value={totalDraft} onChange={event => setTotalDraft(event.target.value)}/></label><button type="button" className="secondary-button" aria-label="전체 총점과 배점 적용" onClick={applyTotalPoints}>총점과 영역 배점 적용</button></div>
            {error && <p className="form-alert" role="alert">{error}</p>}
            <section className="level-definition-editor"><div className="section-heading"><div><h3>성취수준</h3><p>2~6개 수준의 이름과 순서를 바꿀 수 있습니다.</p></div><button type="button" className="secondary-button" onClick={addLevelDefinition} disabled={value.rubric.levels.length >= 6}>성취수준 추가</button></div><div>{value.rubric.levels.map((level, index) => <article key={level.id}><label>{index + 1}수준 이름<input aria-label={`${index + 1}수준 이름`} value={level.label} onChange={event => renameLevelDefinition(index, event.target.value)}/></label><div className="row-actions"><button type="button" aria-label={`${index + 1}수준 왼쪽으로`} onClick={() => moveLevelDefinition(index, -1)} disabled={index === 0}>왼쪽</button><button type="button" aria-label={`${index + 1}수준 오른쪽으로`} onClick={() => moveLevelDefinition(index, 1)} disabled={index === value.rubric.levels.length - 1}>오른쪽</button><button type="button" aria-label={`${index + 1}수준 복제`} onClick={() => duplicateLevelDefinition(index)} disabled={value.rubric.levels.length >= 6}>복제</button><button type="button" aria-label={`${index + 1}수준 삭제`} onClick={() => removeLevelDefinition(index)} disabled={value.rubric.levels.length <= 2}>삭제</button></div></article>)}</div></section>
            <div className="rubric-criteria-editor">{value.rubric.criteria.map((criterion, index) => <fieldset className="rubric-criterion-card" key={criterion.id}><legend>{index + 1}. {criterion.name}</legend>
                <div className="row-actions"><button type="button" onClick={() => moveCriterion(index, -1)} disabled={index === 0}>위로</button><button type="button" onClick={() => moveCriterion(index, 1)} disabled={index === value.rubric.criteria.length - 1}>아래로</button><button type="button" onClick={() => duplicateCriterion(index)}>복제</button><button type="button" onClick={() => removeCriterion(index)} disabled={value.rubric.criteria.length <= 2}>삭제</button><button type="button" onClick={() => regenerate(criterion.id)}>이 영역만 AI 다시 생성</button></div>
                <div className="field-grid field-grid--two"><label>영역명<input value={criterion.name} onChange={event => updateCriterion(index, { name: event.target.value })}/></label><label>증거 구분<select value={criterion.kind} onChange={event => applyCriteriaContract(value.rubric.criteria.map((item, current) => current === index ? { ...item, kind: event.target.value } : item))}><option value="outcome">결과 증거</option><option value="process">과정 증거</option></select></label><div className="inline-apply-field"><label>{criterion.name} 영역 총점<input aria-label={`${criterion.name} 영역 총점`} type="number" min="1" max="1000" value={pointDrafts[criterion.id] ?? ''} onChange={event => setPointDrafts(current => ({ ...current, [criterion.id]: event.target.value }))}/></label><button type="button" className="secondary-button" aria-label={`${criterion.name} 영역 배점 적용`} onClick={() => applyCriterionMaximum(index)}>적용</button></div><label>{criterion.name} 급간 점수<input aria-label={`${criterion.name} 급간 점수`} type="number" min="1" max="1000" value={criterion.intervalPoints} onChange={event => updateCriterion(index, { intervalPoints: Number(event.target.value) })}/></label></div>
                <fieldset className="criterion-standard-links"><legend>연결 성취기준</legend>{value.task.standards.map(standard => <label key={standard.code}><input aria-label={`[${standard.code}] 연결`} type="checkbox" checked={criterion.standardCodes.includes(standard.code)} onChange={() => toggleCriterionStandard(index, standard.code)}/><span><strong>[{standard.code}]</strong> {standard.text}</span></label>)}</fieldset>
                <button type="button" className="secondary-button" onClick={() => recalculate(index)}>{criterion.name} 급간으로 다시 계산</button>
                <label>평가 내용<textarea rows="2" value={criterion.description} onChange={event => updateCriterion(index, { description: event.target.value })}/></label><label>관찰 증거<textarea rows="2" value={criterion.evidence} onChange={event => updateCriterion(index, { evidence: event.target.value })}/></label>
                <div className="rubric-level-grid">{value.rubric.levels.map((definition, levelIndex) => { const level = criterion.levels[levelIndex]; const scoreKey = `${criterion.id}:${level.levelId}`; return <section key={definition.id}><h3>{definition.label}</h3><label>{criterion.name} {definition.label} 점수<input aria-label={`${criterion.name} ${definition.label} 점수`} type="number" min="0" max={criterion.maxPoints} value={levelScoreDrafts[scoreKey] ?? ''} onFocus={event => event.currentTarget.select()} onChange={event => setLevelScoreDrafts(current => ({ ...current, [scoreKey]: event.target.value }))} onBlur={() => commitLevelScore(index, levelIndex)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.preventDefault(); setLevelScoreDrafts(current => ({ ...current, [scoreKey]: String(level.score) })); event.currentTarget.select(); } }}/></label><label>수행 기술<textarea rows="3" value={level.description ?? ''} onChange={event => updateLevel(index, levelIndex, { description: event.target.value })}/></label></section>; })}</div>
                {criterionCandidate?.criterionId === criterion.id && <div className="candidate-panel" role="status"><strong>선택 영역 변경 비교</strong><div className="criterion-comparison"><section><h4>현재 설명</h4><p><strong>{criterionCandidate.original.name}</strong></p><p>{criterionCandidate.original.description}</p><p>증거: {criterionCandidate.original.evidence}</p></section><section><h4>AI 제안 설명</h4><p><strong>{criterionCandidate.value.name}</strong></p><p>{criterionCandidate.value.description}</p><p>증거: {criterionCandidate.value.evidence}</p></section></div><button type="button" onClick={applyCandidate}>이 제안 적용</button><button type="button" className="secondary-button" onClick={() => setCriterionCandidate(null)}>현재 영역 유지</button></div>}
            </fieldset>)}</div>
        </section>
    </div>;
}
