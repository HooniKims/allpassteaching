import { useRef, useState } from 'react';
import { SessionEditor } from './SessionEditor.jsx';

function asText(plan) {
    return [plan.title, `성취기준: ${plan.standards.map(item => `[${item.code}] ${item.text}`).join('\n')}`, `학습 목표: ${plan.learningGoals.join('\n')}`, ...plan.sessions.map(session => `${session.order}차시 ${session.title}\n${session.stages.map(stage => `${stage.phase}(${stage.minutes}분)\n교사: ${stage.teacherActivities.join(' ')}\n학생: ${stage.studentActivities.join(' ')}`).join('\n')}`)].join('\n\n');
}

export function LessonPlanEditor({ plan, onChange }) {
    const original = useRef(null);
    if (original.current === null) original.current = structuredClone(plan);
    const [value, setValue] = useState(() => structuredClone(plan));
    const [format, setFormat] = useState('hwpx');
    const [exporting, setExporting] = useState(false);
    const update = next => { setValue(next); onChange(next); };
    const restore = () => { if (!window.confirm('수정 내용을 지우고 생성 원본으로 되돌릴까요?')) return; update(structuredClone(original.current)); };
    const download = async () => {
        setExporting(true);
        try {
            const response = await fetch(`/api/export/${format}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
            if (!response.ok) throw new Error('내보내기 파일을 만들지 못했습니다.');
            const url = URL.createObjectURL(await response.blob());
            const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${value.title}.${format}`; anchor.click(); URL.revokeObjectURL(url);
        } catch (error) { window.alert(error.message); } finally { setExporting(false); }
    };
    return <article className="plan-editor"><header className="plan-editor__header"><div><p className="eyebrow">AI 초안 · 교사 확인 필요</p><input className="plan-title" aria-label="지도안 제목" value={value.title} onChange={event => update({ ...value, title: event.target.value })}/><p>{value.grade}학년 {value.subject} · {value.instructionModel.name}</p></div><div className="editor-actions"><label className="export-format"><span className="sr-only">내보내기 형식</span><select aria-label="내보내기 형식" value={format} onChange={event => setFormat(event.target.value)}><option value="hwpx">한글 HWPX</option><option value="docx">Word DOCX</option><option value="pdf">PDF</option></select></label><button className="primary-button" onClick={download} disabled={exporting}>{exporting ? '파일 만드는 중…' : '파일로 저장'}</button><button className="secondary-button" onClick={() => navigator.clipboard.writeText(asText(value))}>텍스트 복사</button><button className="secondary-button" onClick={restore}>생성 원본으로 되돌리기</button></div></header>
        <section className="document-section"><h2>성취기준</h2>{value.standards.map(item => <p key={item.code}><strong>[{item.code}]</strong> {item.text}</p>)}</section>
        <section className="document-section"><h2>학습 목표</h2>{value.learningGoals.map((goal, index) => <textarea key={index} aria-label={`학습 목표 ${index + 1}`} value={goal} onChange={event => update({ ...value, learningGoals: value.learningGoals.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })}/>)}</section>
        <section className="document-section"><h2>준비물</h2><textarea aria-label="준비물" value={value.materials.join(', ')} onChange={event => update({ ...value, materials: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })}/></section>
        {value.sessions.map((session, index) => <SessionEditor key={session.id} session={session} onChange={next => update({ ...value, sessions: value.sessions.map((item, itemIndex) => itemIndex === index ? next : item) })}/>) }
        <section className="document-section"><h2>과정중심평가</h2>{value.assessment.map((item, index) => <p key={index}><strong>{item.element}</strong> · {item.evidence}<br/>{item.feedback}</p>)}</section>
        <section className="document-section"><h2>개별화·지원 전략</h2>{value.supportStrategies.map((item, index) => <p key={index}>{item}</p>)}</section>
        <section className="document-section"><h2>수업 후 성찰</h2><textarea aria-label="수업 후 성찰" value={value.reflectionPrompt} onChange={event => update({ ...value, reflectionPrompt: event.target.value })}/></section>
    </article>;
}
