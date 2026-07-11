import { useRef, useState } from 'react';
import { buildDocumentModel, lessonPlanLines } from '@/lib/export/document-model.js';
import { AssessmentEditor } from './AssessmentEditor.jsx';
import { OverviewTable } from './OverviewTable.jsx';
import { SessionEditor } from './SessionEditor.jsx';
import { normalizeEditorLines, splitEditorLines } from './editor-lines.js';

export function LessonPlanEditor({ plan, onChange }) {
    const original = useRef(null);
    if (original.current === null) original.current = structuredClone(plan);
    const [value, setValue] = useState(() => structuredClone(plan));
    const [format, setFormat] = useState('hwpx');
    const [exporting, setExporting] = useState(false);
    const documentModel = buildDocumentModel(value);
    const update = next => {
        setValue(next);
        onChange(next);
    };
    const updateSession = (index, session) => update({
        ...value,
        sessions: value.sessions.map((item, itemIndex) => itemIndex === index ? session : item),
    });
    const restore = () => {
        if (!window.confirm('수정 내용을 지우고 생성 원본으로 되돌릴까요?')) return;
        update(structuredClone(original.current));
    };
    const download = async () => {
        setExporting(true);
        try {
            const response = await fetch(`/api/export/${format}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(value),
            });
            if (!response.ok) throw new Error('내보내기 파일을 만들지 못했습니다.');
            const url = URL.createObjectURL(await response.blob());
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${value.title}.${format}`;
            anchor.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            window.alert(error.message);
        } finally {
            setExporting(false);
        }
    };

    return <article className="plan-editor">
        <header className="plan-editor__header">
            <div>
                <p className="eyebrow">AI 초안 · 교사 확인 필요</p>
                <p className="plan-editor__summary">표 안의 내용을 직접 다듬은 뒤 원하는 형식으로 저장하세요.</p>
            </div>
            <div className="editor-actions">
                <label className="export-format">
                    <span className="sr-only">내보내기 형식</span>
                    <select aria-label="내보내기 형식" value={format} onChange={event => setFormat(event.target.value)}>
                        <option value="hwpx">한글 HWPX</option>
                        <option value="docx">Word DOCX</option>
                        <option value="pdf">PDF</option>
                    </select>
                </label>
                <button type="button" className="primary-button" onClick={download} disabled={exporting}>{exporting ? '파일 만드는 중…' : '파일로 저장'}</button>
                <button type="button" className="secondary-button" onClick={() => navigator.clipboard.writeText(lessonPlanLines(value).join('\n'))}>텍스트 복사</button>
                <button type="button" className="secondary-button" onClick={restore}>생성 원본으로 되돌리기</button>
            </div>
        </header>

        <div className="lesson-document-stack">
            {value.sessions.map((session, index) => {
                const model = documentModel.sessions[index];
                const connectionLabel = index === value.sessions.length - 1 ? '후속 학습 및 정리' : '다음 차시 연결';
                return <div className="lesson-document-session" key={session.id ?? `session-${index + 1}`}>
                    <section className="lesson-document-page lesson-document-page--process" aria-labelledby={`session-${index + 1}-process-title`}>
                        {index === 0
                            ? <h1>교수·학습 과정안</h1>
                            : <p className="lesson-document-page__running-title" aria-hidden="true">교수·학습 과정안</p>}
                        <h2 id={`session-${index + 1}-process-title`}>{session.order}차시 수업 설계</h2>
                        <OverviewTable
                            plan={value}
                            session={session}
                            overview={model.overview}
                            onPlanChange={update}
                            onSessionChange={next => updateSession(index, next)}
                        />
                        <SessionEditor session={session} onChange={next => updateSession(index, next)} />
                    </section>

                    <section className="lesson-document-page lesson-document-page--assessment" aria-labelledby={`session-${index + 1}-assessment-title`}>
                        <p className="lesson-document-page__running-title" aria-hidden="true">교수·학습 과정안</p>
                        <h2 id={`session-${index + 1}-assessment-title`}>{session.order}차시 평가·지원 및 성찰</h2>
                        <AssessmentEditor
                            sessionOrder={session.order}
                            items={value.assessment ?? []}
                            onChange={assessment => update({ ...value, assessment })}
                        />
                        <div className="document-followup-grid">
                            <label>
                                <span>개별화·지원 전략</span>
                                <textarea
                                    aria-label={`${session.order}차시 개별화·지원 전략`}
                                    value={(value.supportStrategies ?? []).join('\n')}
                                    onChange={event => update({ ...value, supportStrategies: splitEditorLines(event.target.value) })}
                                    onBlur={event => update({ ...value, supportStrategies: normalizeEditorLines(event.target.value) })}
                                />
                            </label>
                            <label>
                                <span>수업 후 성찰</span>
                                <textarea
                                    aria-label={`${session.order}차시 수업 후 성찰`}
                                    value={value.reflectionPrompt ?? ''}
                                    onChange={event => update({ ...value, reflectionPrompt: event.target.value })}
                                />
                            </label>
                            <label className="document-followup-grid__wide">
                                <span>{connectionLabel}</span>
                                <textarea
                                    aria-label={`${session.order}차시 ${connectionLabel}`}
                                    value={session.nextSessionConnection ?? ''}
                                    onChange={event => updateSession(index, { ...session, nextSessionConnection: event.target.value })}
                                />
                            </label>
                        </div>
                    </section>
                </div>;
            })}
        </div>
    </article>;
}
