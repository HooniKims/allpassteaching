import { useState } from 'react';
import { normalizeLessonMetadata } from '@/lib/lesson-input';
import { CUSTOM_SUBJECT_VALUE, catalogSubjectsFor, subjectGroupsFor } from '@/lib/subject-options';
import { useOperation } from '@/components/workflow/OperationProvider.jsx';

const gradeOptions = { elementary: ['1','2','3','4','5','6'], middle: ['1','2','3'], high: ['1','2','3'] };

export function LessonBasicsStep({ value, onChange, onNext }) {
    const { runOperation } = useOperation();
    const subjectGroups = subjectGroupsFor(value.schoolLevel, value.grade);
    const officialValues = subjectGroups.flatMap(group => group.options.map(item => item.value));
    const storedSubject = value.displaySubject || value.subject || '';
    const subjectMode = value.subjectMode === 'custom' || (storedSubject && !officialValues.includes(storedSubject)) ? 'custom' : 'official';
    const selectedSubject = subjectMode === 'custom' ? CUSTOM_SUBJECT_VALUE : storedSubject;
    const [mappingOptions, setMappingOptions] = useState(() => (value.mappedSubjects ?? []).map(subject => ({ subject, reason: '' })));
    const [mappingStatus, setMappingStatus] = useState('idle');
    const [mappingMessage, setMappingMessage] = useState('');
    const update = (key, next) => onChange({ ...value, [key]: next });
    const metadata = normalizeLessonMetadata(value.metadata);
    const updateMetadata = (key, next) => onChange({ ...value, metadata: { ...metadata, [key]: next } });
    const submit = event => {
        event.preventDefault();
        const subjectReady = subjectMode === 'official' ? value.subject : value.displaySubject?.trim() && value.mappedSubjects?.length;
        if (!value.schoolLevel || !value.grade || !subjectReady || !value.intent.trim()) return update('error', '필수 정보를 확인해주세요');
        onNext();
    };
    const selectSubject = selected => {
        setMappingOptions([]);
        setMappingStatus('idle');
        setMappingMessage('');
        if (selected === CUSTOM_SUBJECT_VALUE) {
            onChange(current => ({ ...current, subjectMode: 'custom', subject: '', displaySubject: '', mappedSubjects: [], error: '' }));
            return;
        }
        onChange(current => ({
            ...current,
            subjectMode: 'official',
            subject: selected,
            displaySubject: selected,
            mappedSubjects: catalogSubjectsFor(current.schoolLevel, current.grade, selected),
            error: '',
        }));
    };
    const updateCustomSubject = displaySubject => {
        setMappingOptions([]);
        setMappingStatus('idle');
        setMappingMessage('');
        onChange({ ...value, subjectMode: 'custom', subject: displaySubject, displaySubject, mappedSubjects: [], error: '' });
    };
    const mapSubject = async () => {
        setMappingStatus('loading');
        setMappingMessage('');
        try {
            const result = await runOperation({ kind: 'subject-mapping', label: '관련 공식 과목 찾기', phase: 'upstageWaiting', cancelable: true, model: 'configured-generation-model' }, async ({ signal }) => {
            const response = await fetch('/api/map-subject', {
                method: 'POST',
                signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolLevel: value.schoolLevel,
                    gradeBand: value.schoolLevel === 'elementary' ? Number(value.grade) <= 2 ? '1-2' : Number(value.grade) <= 4 ? '3-4' : '5-6' : value.schoolLevel === 'middle' ? '7-9' : '10-12',
                    displaySubject: value.displaySubject,
                    lessonIntent: value.intent,
                }),
            });
            const body = await response.json();
            return { body, ok: response.ok };
            });
            if (!result) { setMappingStatus('idle'); return; }
            const { body, ok } = result;
            if (!ok) {
                const fallback = (body.directCandidates ?? []).map(subject => ({ subject, reason: '공식 과목에서 직접 선택할 수 있습니다.' }));
                setMappingOptions(fallback);
                setMappingStatus('error');
                setMappingMessage(body.message || '관련 과목을 찾지 못했습니다. 공식 과목을 직접 선택해주세요.');
                return;
            }
            setMappingOptions(body.mappings);
            setMappingStatus('done');
            onChange({ ...value, subject: value.displaySubject, displaySubject: value.displaySubject, mappedSubjects: body.mappings.map(item => item.subject), error: '' });
        } catch {
            setMappingStatus('error');
            setMappingMessage('관련 과목을 찾지 못했습니다. 다시 시도해주세요.');
        }
    };
    const toggleMappedSubject = subject => {
        const mappedSubjects = value.mappedSubjects?.includes(subject)
            ? value.mappedSubjects.filter(item => item !== subject)
            : [...(value.mappedSubjects ?? []), subject];
        onChange({ ...value, mappedSubjects, error: '' });
    };
    return <form className="basics" onSubmit={submit}>
        <header><p className="eyebrow">1단계 · 수업 정보</p><h1>어떤 수업을 준비하시나요?</h1><p>수업의 기본 정보를 알려주시면 교육과정 연결을 도와드릴게요.</p></header>
        {value.error && <p className="form-alert" role="alert">{value.error}</p>}
        <div className="field-grid">
            <label>학교급<select aria-label="학교급" value={value.schoolLevel} onChange={event => {
                const schoolLevel = event.target.value;
                onChange(current => ({ ...current, schoolLevel, grade: '', subject: '', displaySubject: '', mappedSubjects: [], error: '' }));
            }}><option value="">선택</option><option value="elementary">초등학교</option><option value="middle">중학교</option><option value="high">일반고등학교</option></select></label>
            <label>학년<select aria-label="학년" value={value.grade} disabled={!value.schoolLevel} onChange={event => {
                const grade = event.target.value;
                onChange(current => ({ ...current, grade, subjectMode: 'official', subject: '', displaySubject: '', mappedSubjects: [], error: '' }));
            }}><option value="">선택</option>{(gradeOptions[value.schoolLevel] || []).map(grade => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
            <label>과목<select aria-label="과목" value={selectedSubject} disabled={!value.schoolLevel || !value.grade} onChange={event => selectSubject(event.target.value)}><option value="">선택</option>{subjectGroups.map(group => <optgroup key={group.label} label={group.label}>{group.options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>)}</select></label>
        </div>
        {subjectMode === 'custom' && <section className="subject-mapping" aria-label="관련 공식 과목 확인">
            <label>직접 입력 과목<input aria-label="직접 입력 과목" value={value.displaySubject ?? ''} disabled={!value.schoolLevel} onChange={event => updateCustomSubject(event.target.value)} placeholder="예: 환경, 미디어 리터러시"/></label>
            <div className="subject-mapping__action"><p>직접 입력한 과목과 연결할 공식 과목을 확인해주세요.</p><button className="secondary-button" type="button" onClick={mapSubject} disabled={!value.schoolLevel || !value.grade || !value.displaySubject?.trim() || !value.intent?.trim() || mappingStatus === 'loading'}>{mappingStatus === 'loading' ? '찾는 중…' : '관련 공식 과목 찾기'}</button></div>
            {mappingMessage && <p className="form-alert" role="alert">{mappingMessage}</p>}
            {!!mappingOptions.length && <div className="subject-mapping-list">{mappingOptions.map(item => <label key={item.subject}>
                <input type="checkbox" checked={value.mappedSubjects?.includes(item.subject) ?? false} onChange={() => toggleMappedSubject(item.subject)}/>
                <span><strong>{item.subject}</strong>{item.reason && <small>{item.reason}</small>}</span>
            </label>)}</div>}
        </section>}
        <fieldset><legend>수업 범위</legend><div className="choice-row">
            <label className={value.mode === 'single' ? 'choice-tile is-selected' : 'choice-tile'}><input aria-label="한 차시 수업" type="radio" name="mode" checked={value.mode === 'single'} onChange={() => onChange({ ...value, mode: 'single', sessions: 1 })}/><strong>한 차시 수업</strong><span>한 번의 수업에서 완결되는 지도안</span></label>
            <label className={value.mode === 'multi' ? 'choice-tile is-selected' : 'choice-tile'}><input aria-label="연속 차시 수업" type="radio" name="mode" checked={value.mode === 'multi'} onChange={() => onChange({ ...value, mode: 'multi', sessions: 2 })}/><strong>연속 차시 수업</strong><span>전체 흐름과 차시별 지도안을 함께 생성</span></label>
        </div></fieldset>
        {value.mode === 'multi' && <label>차시 수<input aria-label="차시 수" type="number" min="2" max="10" value={value.sessions} onChange={event => update('sessions', Number(event.target.value))}/></label>}
        <div className="field-grid field-grid--metadata">
            <label>수업 날짜 <span className="optional">선택</span><input aria-label="수업 날짜" type="date" value={metadata.date} onChange={event => updateMetadata('date', event.target.value)}/></label>
            <label>교시 <span className="optional">선택</span><input aria-label="교시" type="number" min="1" max="12" value={metadata.period} onChange={event => updateMetadata('period', event.target.value)}/></label>
            <label>수업 장소 <span className="optional">선택</span><input aria-label="수업 장소" value={metadata.place} onChange={event => updateMetadata('place', event.target.value)}/></label>
            <label>대상 학급 <span className="optional">선택</span><input aria-label="대상 학급" value={metadata.className} onChange={event => updateMetadata('className', event.target.value)}/></label>
            <label>수업자 <span className="optional">선택</span><input aria-label="수업자" value={metadata.teacherName} onChange={event => updateMetadata('teacherName', event.target.value)}/></label>
        </div>
        <label>수업할 개념 및 내용<textarea aria-label="수업할 개념 및 내용" rows="5" value={value.intent} onChange={event => update('intent', event.target.value)} placeholder="예: 식물이 자라는 데 필요한 조건을 예상하고 실험으로 확인한다."/></label>
        <label>학생 특성 또는 지원 필요 사항 <span className="optional">선택</span><textarea rows="3" value={value.studentNeeds} onChange={event => update('studentNeeds', event.target.value)} placeholder="예: 관찰 기록에 어려움이 있는 학생에게 문장 틀을 제공해요."/></label>
        <footer><span>입력 내용은 이 브라우저에 저장됩니다.</span><button type="submit">성취기준 찾기 <span aria-hidden="true">→</span></button></footer>
    </form>;
}
