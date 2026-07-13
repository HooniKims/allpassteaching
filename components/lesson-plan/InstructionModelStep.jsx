import { instructionModels, recommendModels } from '@/data/instruction-models';

export function InstructionModelStep({ lessonIntent, selected, onChange, onBack, onNext }) {
    const recommendations = recommendModels(lessonIntent, 3);
    const recommendedIds = new Set(recommendations.map(item => item.id));
    const selectedModel = instructionModels.find(item => item.id === selected?.id);
    return <div className="model-step"><header><p className="eyebrow">3단계 · 수업 모형</p><h1>수업의 흐름을 선택해주세요</h1><p>추천은 참고용이며, 전체 목록에서 원하는 모형을 직접 선택할 수 있습니다.</p></header>
        <h2>이 수업에 어울리는 모형</h2><div className="model-grid">{instructionModels.map(item => <label className={selected?.id === item.id ? 'model-option is-selected' : 'model-option'} key={item.id}>
            <input aria-label={`${item.name} 선택`} type="radio" name="instruction-model" checked={selected?.id === item.id} onChange={() => onChange(item)}/><span className="model-option__head"><strong>{item.name}</strong>{recommendedIds.has(item.id) && <em>추천</em>}</span><span>{item.summary}</span><details><summary>단계와 유의점 보기</summary><ol>{item.stages.map(stage => <li key={stage}>{stage}</li>)}</ol><p>{item.cautions[0]}</p></details>
        </label>)}</div>
        {selectedModel && <aside className="selection-explainer" role="status"><strong>{selectedModel.name}을(를) 쉽게 말하면</strong><p>쉽게 말하면, {selectedModel.plainGuide}</p><span>수업 흐름: {selectedModel.stages.join(' → ')}</span></aside>}
        <footer className="step-actions"><button className="secondary-button" type="button" onClick={onBack}>이전</button><span>{selected ? `${selected.name} 선택됨` : '모형을 선택해주세요'}</span><button type="button" disabled={!selected} onClick={onNext}>지도안 생성 →</button></footer>
    </div>;
}
