function nextId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function WorksheetEditor({ value, onChange }) {
    const updateDocument = patch => onChange({ ...value, document: { ...value.document, ...patch } });
    const updateSection = (sectionIndex, patch) => updateDocument({ sections: value.document.sections.map((section, index) => index === sectionIndex ? { ...section, ...patch } : section) });
    const updateQuestion = (sectionIndex, questionIndex, patch) => {
        const section = value.document.sections[sectionIndex];
        updateSection(sectionIndex, { questions: section.questions.map((question, index) => index === questionIndex ? { ...question, ...patch } : question) });
    };
    const updateAnswer = (questionId, answer) => onChange({
        ...value,
        teacherKey: { answers: value.teacherKey.answers.map(item => item.questionId === questionId ? { ...item, answer } : item) },
    });
    const addQuestion = sectionIndex => {
        const id = nextId('q');
        const section = value.document.sections[sectionIndex];
        onChange({
            ...value,
            document: { ...value.document, sections: value.document.sections.map((item, index) => index === sectionIndex ? { ...item, questions: [...section.questions, { id, prompt: '새 문항', responseLines: 4 }] } : item) },
            teacherKey: { answers: [...value.teacherKey.answers, { questionId: id, answer: '예시 답안을 입력하세요.' }] },
        });
    };
    const removeQuestion = (sectionIndex, questionIndex) => {
        const question = value.document.sections[sectionIndex].questions[questionIndex];
        onChange({
            ...value,
            document: { ...value.document, sections: value.document.sections.map((section, index) => index === sectionIndex ? { ...section, questions: section.questions.filter((_, itemIndex) => itemIndex !== questionIndex) } : section) },
            teacherKey: { answers: value.teacherKey.answers.filter(answer => answer.questionId !== question.id) },
        });
    };
    let questionNumber = 0;
    return <div className="structured-editor worksheet-editor">
        <section className="document-section">
            <label>학습지 제목<input value={value.document.title} onChange={event => updateDocument({ title: event.target.value })}/></label>
            <label>학생 안내<textarea rows="3" value={value.document.instructions} onChange={event => updateDocument({ instructions: event.target.value })}/></label>
            <label>학생 정보란 <span className="optional">쉼표로 구분</span><input value={value.document.studentFields.join(', ')} onChange={event => updateDocument({ studentFields: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })}/></label>
        </section>
        {value.document.sections.map((section, sectionIndex) => <section className="document-section" key={section.id}>
            <div className="document-section__heading"><strong>{sectionIndex + 1}. 학습 활동</strong></div>
            <div className="field-grid field-grid--two"><label>섹션 제목<input value={section.title} onChange={event => updateSection(sectionIndex, { title: event.target.value })}/></label><label>학습 목적<input value={section.purpose} onChange={event => updateSection(sectionIndex, { purpose: event.target.value })}/></label></div>
            {section.questions.map((question, questionIndex) => {
                questionNumber += 1;
                const currentNumber = questionNumber;
                const answer = value.teacherKey.answers.find(item => item.questionId === question.id)?.answer ?? '';
                return <div className="worksheet-question" key={question.id}>
                    <div className="worksheet-question__grid"><label>문항 {currentNumber}<textarea rows="3" value={question.prompt} onChange={event => updateQuestion(sectionIndex, questionIndex, { prompt: event.target.value })}/></label><label>응답 줄 수<input type="number" min="1" max="16" value={question.responseLines} onChange={event => updateQuestion(sectionIndex, questionIndex, { responseLines: Number(event.target.value) })}/></label></div>
                    <label className="teacher-key-field">문항 {currentNumber} 예시 답안<textarea rows="3" value={answer} onChange={event => updateAnswer(question.id, event.target.value)}/></label>
                    {section.questions.length > 1 && <button type="button" className="text-button" onClick={() => removeQuestion(sectionIndex, questionIndex)}>문항 {currentNumber} 삭제</button>}
                </div>;
            })}
            <button type="button" className="secondary-button" onClick={() => addQuestion(sectionIndex)}>문항 추가</button>
        </section>)}
    </div>;
}
