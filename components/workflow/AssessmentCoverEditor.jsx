const uid = () => `cover-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
const typeLabels = { identity: '학생 정보', purpose: '평가 목표', standards: '성취기준', task: '수행과제', procedure: '수행 절차', checkpoints: '수행 과정', rubric: '평가 기준', 'self-checklist': '제출 전 확인', custom: '직접 입력' };
const move = (items, index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return items;
    const next = [...items]; [next[index], next[target]] = [next[target], next[index]];
    return next.map((item, order) => ({ ...item, order: order + 1 }));
};

export function AssessmentCoverEditor({ value, onChange }) {
    const updateCover = patch => onChange({ ...value, cover: { ...value.cover, ...patch } });
    const updateSection = (index, patch) => updateCover({ sections: value.cover.sections.map((section, current) => current === index ? { ...section, ...patch } : section) });
    const add = () => updateCover({ sections: [...value.cover.sections, { id: uid(), type: 'custom', label: '새 안내', content: '학생에게 안내할 내용을 입력하세요.', visible: true, order: value.cover.sections.length + 1 }] });
    const duplicate = index => {
        const copy = { ...value.cover.sections[index], id: uid(), label: `${value.cover.sections[index].label} 복사본` };
        updateCover({ sections: value.cover.sections.toSpliced(index + 1, 0, copy).map((item, order) => ({ ...item, order: order + 1 })) });
    };
    const remove = index => { if (value.cover.sections.length > 1) updateCover({ sections: value.cover.sections.toSpliced(index, 1).map((item, order) => ({ ...item, order: order + 1 })) }); };
    const renderSection = section => {
        const introduction = section.content.split('\n').filter(Boolean).map((line, index) => <p key={`${section.id}-intro-${index}`}>{line}</p>);
        if (section.type === 'standards') return <>{introduction}<ul>{value.task.standards.map(standard => <li key={standard.code}><strong>[{standard.code}]</strong> {standard.text}</li>)}</ul></>;
        if (section.type === 'task') return <>{introduction}<p><strong>산출물</strong> · {value.task.product}</p><ol>{value.task.procedure.map((step, index) => <li key={`${section.id}-step-${index}`}>{step}</li>)}</ol></>;
        if (section.type === 'procedure') return <>{introduction}<ol>{value.task.procedure.map((step, index) => <li key={`${section.id}-procedure-${index}`}>{step}</li>)}</ol></>;
        if (section.type === 'checkpoints') return <>{introduction}<ol>{value.backwardDesign.checkpoints.toSorted((left, right) => left.order - right.order).map(item => <li key={item.id}><strong>{item.title}</strong> · {item.evidence}<br/><span>{item.feedbackPurpose}</span></li>)}</ol></>;
        if (section.type === 'rubric') return <>{introduction}<table className="cover-rubric-table" aria-label="표 형식 평가 기준"><thead><tr><th>평가영역</th><th>총점</th>{value.rubric.levels.map(level => <th key={level.id}>{level.label}</th>)}</tr></thead><tbody>{value.rubric.criteria.map(criterion => <tr key={criterion.id}><td>{criterion.name}</td><td>{criterion.maxPoints}</td>{criterion.levels.map(level => <td key={level.levelId}>{level.score}</td>)}</tr>)}</tbody></table><div className="cover-rubric-cards" role="region" aria-label="모바일 평가 기준">{value.rubric.criteria.map(criterion => <article key={criterion.id}><h4>{criterion.name} · {criterion.maxPoints}점</h4><dl>{value.rubric.levels.map((level, index) => <div key={level.id}><dt>{level.label} · {criterion.levels[index].score}점</dt><dd>{criterion.levels[index].description}</dd></div>)}</dl></article>)}</div></>;
        return introduction;
    };
    return <section className="document-section cover-editor"><div className="section-heading"><div><h2>학생용 수행평가 안내 표지</h2><p>표지는 학생마다 붙는 안내 페이지입니다. 현재 루브릭을 실시간으로 보여주므로 점수표를 따로 복사하지 않습니다.</p></div><button type="button" className="secondary-button" onClick={add}>표지 항목 추가</button></div>
        <label>표지 제목<input value={value.cover.title} onChange={event => updateCover({ title: event.target.value })}/></label>
        <div className="cover-section-list">{value.cover.sections.map((section, index) => <fieldset key={section.id}><legend>{index + 1}. {section.label}</legend><div className="row-actions"><button type="button" onClick={() => updateCover({ sections: move(value.cover.sections, index, -1) })} disabled={index === 0}>위로</button><button type="button" onClick={() => updateCover({ sections: move(value.cover.sections, index, 1) })} disabled={index === value.cover.sections.length - 1}>아래로</button><button type="button" onClick={() => duplicate(index)}>복제</button><button type="button" onClick={() => remove(index)} disabled={value.cover.sections.length <= 1}>삭제</button></div><div className="field-grid field-grid--two"><label>항목 이름<input value={section.label} onChange={event => updateSection(index, { label: event.target.value })}/></label><label>항목 유형<select value={section.type} onChange={event => updateSection(index, { type: event.target.value })}>{Object.entries(typeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label></div><label>{section.type === 'self-checklist' ? '제출 전 확인 내용' : `${section.label} 내용`}<textarea aria-label={section.type === 'self-checklist' ? '제출 전 확인 내용' : `${section.label} 내용`} rows="4" value={section.content} onChange={event => updateSection(index, { content: event.target.value })}/></label><label className="inline-check"><input type="checkbox" checked={section.visible} onChange={event => updateSection(index, { visible: event.target.checked })}/> 표지에 표시</label></fieldset>)}</div>
        <section className="cover-preview" aria-label="학생용 안내 표지 미리보기"><p className="eyebrow">학생용 안내</p><h2>{value.cover.title}</h2><p className="student-fields">학년·반 __________ 번호 ____ 이름 __________</p>{value.cover.sections.filter(item => item.visible).toSorted((a, b) => a.order - b.order).map(section => <section key={section.id}><h3>{section.label}</h3>{renderSection(section)}</section>)}</section>
    </section>;
}
