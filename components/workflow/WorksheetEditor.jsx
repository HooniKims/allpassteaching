import { WORKSHEET_LIMITS, worksheetQuestionTypes } from '@/lib/worksheet-schema';

function nextId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ordinal = index => ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '열한', '열두'][index] ?? `${index + 1}`;

function createQuestion(type, standardCode) {
    const common = { id: nextId('q'), type, prompt: '새 문항을 입력하세요.', standardCodes: [standardCode] };
    if (type === 'multiple-choice-5') return { ...common, choices: ['선택지 1', '선택지 2', '선택지 3', '선택지 4', '선택지 5'], responseLines: 1 };
    if (type === 'table-chart' || type === 'drawing-diagram') return { ...common, responseAreaHeight: 180 };
    return { ...common, responseLines: type === 'essay' ? 10 : 4 };
}

function changeQuestionType(question, type) {
    const common = { id: question.id, type, prompt: question.prompt, standardCodes: question.standardCodes };
    if (type === 'multiple-choice-5') return { ...common, choices: question.choices?.slice(0, 5) ?? ['선택지 1', '선택지 2', '선택지 3', '선택지 4', '선택지 5'], responseLines: 1 };
    if (type === 'table-chart' || type === 'drawing-diagram') return { ...common, responseAreaHeight: question.responseAreaHeight ?? 180 };
    return { ...common, responseLines: question.responseLines ?? (type === 'essay' ? 10 : 4) };
}

function move(items, from, to) {
    if (to < 0 || to >= items.length) return items;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

function QuestionFields({ question, number, standards, onUpdate }) {
    const setChoice = (index, choice) => onUpdate({ choices: question.choices.map((item, current) => current === index ? choice : item) });
    return <>
        <div className="worksheet-question__grid">
            <label>문항 {number}<textarea rows="3" value={question.prompt} onChange={event => onUpdate({ prompt: event.target.value })}/></label>
            <label>문항 유형<select aria-label={`문항 ${number} 유형`} value={question.type} onChange={event => onUpdate(changeQuestionType(question, event.target.value), true)}>{worksheetQuestionTypes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
        </div>
        {question.type === 'multiple-choice-5' && <div className="worksheet-choices">{question.choices.map((choice, index) => <label key={index}>선택지 {index + 1}<input aria-label={`문항 ${number} 선택지 ${index + 1}`} value={choice} onChange={event => setChoice(index, event.target.value)}/></label>)}</div>}
        {(question.type === 'table-chart' || question.type === 'drawing-diagram')
            ? <label>응답 상자 높이<input aria-label={`문항 ${number} 응답 상자 높이`} type="number" min="80" max="400" value={question.responseAreaHeight} onChange={event => onUpdate({ responseAreaHeight: Number(event.target.value) })}/><small>PDF에서 학생이 작성할 테두리 상자의 높이입니다.</small></label>
            : <label>응답 줄 수<input aria-label={`문항 ${number} 응답 줄 수`} type="number" min="1" max="16" value={question.responseLines} onChange={event => onUpdate({ responseLines: Number(event.target.value) })}/></label>}
        <fieldset className="question-standard-links"><legend>문항 {number} 연결 성취기준</legend>{standards.map(standard => <label key={standard.code}><input aria-label={`문항 ${number} [${standard.code}] 연결`} type="checkbox" checked={question.standardCodes.includes(standard.code)} onChange={() => {
            const selected = question.standardCodes.includes(standard.code)
                ? question.standardCodes.length === 1 ? question.standardCodes : question.standardCodes.filter(code => code !== standard.code)
                : [...question.standardCodes, standard.code];
            onUpdate({ standardCodes: selected });
        }}/><span><strong>[{standard.code}]</strong> {standard.text}</span></label>)}</fieldset>
    </>;
}

export function WorksheetEditor({ value, onChange, mode = 'worksheet' }) {
    const copy = mode === 'assessment'
        ? { title: '실제 수행평가지 편집', titleField: '수행평가지 제목', section: '수행 영역', purpose: '수행 목적', defaultSection: '새 수행 영역', answer: '교사 채점 참고', addSection: '수행 영역 추가' }
        : { title: '문서 기본 정보', titleField: '학습지 제목', section: '학습 활동', purpose: '학습 목적', defaultSection: '새 학습 활동', answer: '예시 답안', addSection: '섹션 추가' };
    const updateDocument = patch => onChange({ ...value, document: { ...value.document, ...patch } });
    const updateSections = sections => updateDocument({ sections });
    const updateSection = (sectionIndex, patch) => updateSections(value.document.sections.map((section, index) => index === sectionIndex ? { ...section, ...patch } : section));
    const updateQuestion = (sectionIndex, questionIndex, patch, replace = false) => {
        const section = value.document.sections[sectionIndex];
        updateSection(sectionIndex, { questions: section.questions.map((question, index) => index === questionIndex ? replace ? patch : { ...question, ...patch } : question) });
    };
    const updateAnswer = (questionId, answer) => onChange({ ...value, teacherKey: { answers: value.teacherKey.answers.map(item => item.questionId === questionId ? { ...item, answer } : item) } });
    const addQuestion = sectionIndex => {
        if (value.document.sections[sectionIndex].questions.length >= WORKSHEET_LIMITS.questionsPerSection || value.teacherKey.answers.length >= WORKSHEET_LIMITS.answers) return;
        const question = createQuestion('descriptive', value.standards[0].code);
        const sections = value.document.sections.map((section, index) => index === sectionIndex ? { ...section, questions: [...section.questions, question] } : section);
        onChange({ ...value, document: { ...value.document, sections }, teacherKey: { answers: [...value.teacherKey.answers, { questionId: question.id, answer: '예시 답안과 확인할 핵심을 입력하세요.' }] } });
    };
    const duplicateQuestion = (sectionIndex, questionIndex) => {
        if (value.document.sections[sectionIndex].questions.length >= WORKSHEET_LIMITS.questionsPerSection || value.teacherKey.answers.length >= WORKSHEET_LIMITS.answers) return;
        const original = value.document.sections[sectionIndex].questions[questionIndex];
        const copy = { ...structuredClone(original), id: nextId('q') };
        const answer = value.teacherKey.answers.find(item => item.questionId === original.id)?.answer ?? '예시 답안을 입력하세요.';
        const sections = value.document.sections.map((section, index) => index === sectionIndex ? { ...section, questions: [...section.questions.slice(0, questionIndex + 1), copy, ...section.questions.slice(questionIndex + 1)] } : section);
        onChange({ ...value, document: { ...value.document, sections }, teacherKey: { answers: [...value.teacherKey.answers, { questionId: copy.id, answer }] } });
    };
    const removeQuestion = (sectionIndex, questionIndex) => {
        const question = value.document.sections[sectionIndex].questions[questionIndex];
        const sections = value.document.sections.map((section, index) => index === sectionIndex ? { ...section, questions: section.questions.filter((_, current) => current !== questionIndex) } : section);
        onChange({ ...value, document: { ...value.document, sections }, teacherKey: { answers: value.teacherKey.answers.filter(answer => answer.questionId !== question.id) } });
    };
    const addSection = () => {
        if (value.document.sections.length >= WORKSHEET_LIMITS.sections || value.teacherKey.answers.length >= WORKSHEET_LIMITS.answers) return;
        const question = createQuestion('descriptive', value.standards[0].code);
        updateWithAnswers([...value.document.sections, { id: nextId('section'), title: copy.defaultSection, purpose: `${copy.purpose}을 입력하세요.`, questions: [question] }], [...value.teacherKey.answers, { questionId: question.id, answer: `${copy.answer}와 확인할 핵심을 입력하세요.` }]);
    };
    const updateWithAnswers = (sections, answers) => onChange({ ...value, document: { ...value.document, sections }, teacherKey: { answers } });
    const duplicateSection = sectionIndex => {
        const original = value.document.sections[sectionIndex];
        if (value.document.sections.length >= WORKSHEET_LIMITS.sections || value.teacherKey.answers.length + original.questions.length > WORKSHEET_LIMITS.answers) return;
        const idMap = new Map();
        const questions = original.questions.map(question => { const id = nextId('q'); idMap.set(question.id, id); return { ...structuredClone(question), id }; });
        const copy = { ...structuredClone(original), id: nextId('section'), title: `${original.title} 복사본`, questions };
        const answers = [...value.teacherKey.answers, ...original.questions.map(question => ({ questionId: idMap.get(question.id), answer: value.teacherKey.answers.find(item => item.questionId === question.id)?.answer ?? '예시 답안을 입력하세요.' }))];
        updateWithAnswers([...value.document.sections.slice(0, sectionIndex + 1), copy, ...value.document.sections.slice(sectionIndex + 1)], answers);
    };
    const removeSection = sectionIndex => {
        const removedIds = new Set(value.document.sections[sectionIndex].questions.map(question => question.id));
        updateWithAnswers(value.document.sections.filter((_, index) => index !== sectionIndex), value.teacherKey.answers.filter(answer => !removedIds.has(answer.questionId)));
    };
    const moveQuestion = (sectionIndex, questionIndex, target) => updateSection(sectionIndex, { questions: move(value.document.sections[sectionIndex].questions, questionIndex, target) });
    let questionNumber = 0;
    return <div className="structured-editor worksheet-editor">
        <section className="document-section"><h2>{copy.title}</h2><p className="section-help">학생이 실제로 작성할 문항, 응답 공간과 연결 성취기준을 수정할 수 있습니다.</p><label>{copy.titleField}<input value={value.document.title} onChange={event => updateDocument({ title: event.target.value })}/></label><label>학생 안내<textarea rows="3" value={value.document.instructions} onChange={event => updateDocument({ instructions: event.target.value })}/></label><label>학생 정보란 <span className="optional">쉼표로 구분</span><input value={value.document.studentFields.join(', ')} onChange={event => updateDocument({ studentFields: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })}/></label></section>
        {value.document.sections.map((section, sectionIndex) => <section className="document-section" key={section.id}>
            <div className="document-section__heading section-heading"><strong>{sectionIndex + 1}. {copy.section}</strong><div className="compact-actions"><button type="button" className="secondary-button" disabled={sectionIndex === 0} aria-label={`${ordinal(sectionIndex)} 번째 섹션 위로 이동`} onClick={() => updateSections(move(value.document.sections, sectionIndex, sectionIndex - 1))}>위로</button><button type="button" className="secondary-button" disabled={sectionIndex === value.document.sections.length - 1} aria-label={`${ordinal(sectionIndex)} 번째 섹션 아래로 이동`} onClick={() => updateSections(move(value.document.sections, sectionIndex, sectionIndex + 1))}>아래로</button><button type="button" className="secondary-button" disabled={value.document.sections.length >= WORKSHEET_LIMITS.sections || value.teacherKey.answers.length + section.questions.length > WORKSHEET_LIMITS.answers} aria-label={`${ordinal(sectionIndex)} 번째 섹션 복제`} onClick={() => duplicateSection(sectionIndex)}>복제</button><button type="button" className="text-button" disabled={value.document.sections.length === 1} aria-label={`${ordinal(sectionIndex)} 번째 섹션 삭제`} onClick={() => removeSection(sectionIndex)}>삭제</button></div></div>
            <div className="field-grid field-grid--two"><label>섹션 제목<input value={section.title} onChange={event => updateSection(sectionIndex, { title: event.target.value })}/></label><label>{copy.purpose}<input value={section.purpose} onChange={event => updateSection(sectionIndex, { purpose: event.target.value })}/></label></div>
            {section.questions.map((question, questionIndex) => {
                questionNumber += 1;
                const currentNumber = questionNumber;
                const answer = value.teacherKey.answers.find(item => item.questionId === question.id)?.answer ?? '';
                return <article className="worksheet-question" key={question.id}>
                    <QuestionFields question={question} number={currentNumber} standards={value.standards} onUpdate={(patch, replace) => updateQuestion(sectionIndex, questionIndex, patch, replace)}/>
                    <label className="teacher-key-field">문항 {currentNumber} {copy.answer}<textarea rows="3" value={answer} onChange={event => updateAnswer(question.id, event.target.value)}/></label>
                    <div className="compact-actions"><button type="button" className="secondary-button" disabled={questionIndex === 0} aria-label={`문항 ${currentNumber} 위로 이동`} onClick={() => moveQuestion(sectionIndex, questionIndex, questionIndex - 1)}>위로</button><button type="button" className="secondary-button" disabled={questionIndex === section.questions.length - 1} aria-label={`문항 ${currentNumber} 아래로 이동`} onClick={() => moveQuestion(sectionIndex, questionIndex, questionIndex + 1)}>아래로</button><button type="button" className="secondary-button" disabled={section.questions.length >= WORKSHEET_LIMITS.questionsPerSection || value.teacherKey.answers.length >= WORKSHEET_LIMITS.answers} aria-label={`문항 ${currentNumber} 복제`} onClick={() => duplicateQuestion(sectionIndex, questionIndex)}>복제</button><button type="button" className="text-button" disabled={section.questions.length === 1} aria-label={`문항 ${currentNumber} 삭제`} onClick={() => removeQuestion(sectionIndex, questionIndex)}>삭제</button></div>
                </article>;
            })}
            <button type="button" className="secondary-button" onClick={() => addQuestion(sectionIndex)} disabled={section.questions.length >= WORKSHEET_LIMITS.questionsPerSection || value.teacherKey.answers.length >= WORKSHEET_LIMITS.answers}>문항 추가</button>
        </section>)}
        <button type="button" className="secondary-button worksheet-add-section" onClick={addSection} disabled={value.document.sections.length >= WORKSHEET_LIMITS.sections || value.teacherKey.answers.length >= WORKSHEET_LIMITS.answers}>{copy.addSection}</button>
    </div>;
}
