import { instructionModelCategories, instructionModels, recommendModels } from '@/data/instruction-models';
import { FlowSequence } from '@/components/FlowSequence.jsx';
import { IntegrationStandardsPicker } from './IntegrationStandardsPicker.jsx';

export function InstructionModelStep({ basics, primaryStandards = [], lessonIntent, selected, onChange, onBack, onNext }) {
    const recommendations = recommendModels(lessonIntent, 3);
    const recommendedIds = new Set(recommendations.map(item => item.id));
    const selectedModel = instructionModels.find(item => item.id === selected?.id);
    const integratedStandardsCount = primaryStandards.length + (selected?.integrationStandards?.length ?? 0);
    const integratedSelectionReady = selected?.id === 'integrated'
        && Boolean(selected.integrationSubject)
        && Boolean(selected.integrationStandards?.length)
        && integratedStandardsCount <= 10;
    return <div className="model-step"><header><p className="eyebrow">3단계 · 수업 설계</p><h1>수업의 흐름이나 설계 틀을 선택해주세요</h1><p>추천은 참고용이며, 목적에 맞는 모형이나 설계 틀을 직접 선택할 수 있습니다.</p></header>
        <h2>이 수업에 어울리는 설계</h2>{instructionModelCategories.map((category, categoryIndex) => <section className="model-group" aria-labelledby={`model-category-${categoryIndex}`} key={category.name}>
            <h3 id={`model-category-${categoryIndex}`}>{category.name}</h3><p>{category.description}</p><div className="model-grid">{instructionModels.filter(item => item.category === category.name).map(item => <label className={selected?.id === item.id ? 'model-option is-selected' : 'model-option'} key={item.id}>
                <input aria-label={`${item.name} 선택`} type="radio" name="instruction-model" checked={selected?.id === item.id} onChange={() => onChange(item.id === 'integrated' ? { ...item, integrationSubject: '', integrationStandards: [] } : item)}/><span className="model-option__head"><strong>{item.name}</strong>{recommendedIds.has(item.id) && <em>추천</em>}</span><span>{item.summaryParts ? item.summaryParts.map(part => <span className="keep-together" key={part}>{part}{' '}</span>) : item.summary}</span><details><summary>{item.applicationMode === 'design-check' ? '점검 기준과 유의점 보기' : '단계와 유의점 보기'}</summary><ol>{item.stages.map(stage => <li key={stage}>{stage}</li>)}</ol><p>{item.cautions[0]}</p></details>
            </label>)}</div>
        </section>)}
        {selectedModel && <aside className="selection-explainer" role="status"><strong>{selectedModel.name} · 쉬운 설명</strong><p>쉽게 말하면, {selectedModel.plainGuideParts ? selectedModel.plainGuideParts.map(part => <span className="keep-together" key={part}>{part}{' '}</span>) : selectedModel.plainGuide}</p><FlowSequence label={selectedModel.applicationMode === 'design-check' ? '설계 점검 기준' : '수업 흐름'} items={selectedModel.stages} ordered={selectedModel.applicationMode !== 'design-check'}/></aside>}
        {selected?.id === 'integrated' && basics && <IntegrationStandardsPicker basics={basics} primaryStandards={primaryStandards} value={selected} onChange={onChange}/>}
        <footer className="step-actions"><button className="secondary-button" type="button" onClick={onBack}>이전</button><span>{selected?.id === 'integrated' ? integratedSelectionReady ? `${selected.name} · 두 교과 기준 ${integratedStandardsCount}개 선택 완료` : integratedStandardsCount > 10 ? '두 교과 성취기준은 합계 10개까지 선택할 수 있습니다' : '연계 교과 성취기준을 선택해주세요' : selected ? `${selected.name} 선택됨` : '모형 또는 설계 틀을 선택해주세요'}</span><button type="button" disabled={!selected || (selected.id === 'integrated' && !integratedSelectionReady)} onClick={onNext}>지도안 생성 →</button></footer>
    </div>;
}
