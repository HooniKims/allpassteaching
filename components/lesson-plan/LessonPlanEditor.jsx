import { useEffect, useRef, useState } from 'react';
import { buildDocumentModel } from '@/lib/export/document-model.js';
import { formatLessonPlanIssue } from '@/lib/lesson-plan-issues.js';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema.js';
import { AssessmentEditor } from './AssessmentEditor.jsx';
import { OverviewTable } from './OverviewTable.jsx';
import { SessionEditor } from './SessionEditor.jsx';
import { normalizeEditorLines, splitEditorLines } from './editor-lines.js';
import { lessonPlanClipboardText } from './lesson-plan-clipboard.js';
import { useOperation } from '@/components/workflow/OperationProvider.jsx';
import { DetailedPlanEditor } from './DetailedPlanEditor.jsx';

const sharedFieldsNoteId = 'shared-plan-fields-note';

export function LessonPlanEditor({ plan, originalPlan = plan, onChange }) {
    const { runOperation } = useOperation();
    const original = useRef(null);
    if (original.current === null) original.current = structuredClone(originalPlan);
    const [value, setValue] = useState(() => structuredClone(plan));
    const [format, setFormat] = useState('hwpx');
    const [planVariant, setPlanVariant] = useState('detailed');
    const [exporting, setExporting] = useState(false);
    const [copyStatus, setCopyStatus] = useState('');
    const lastReceivedPlan = useRef(plan);
    const lastReceivedOriginalPlan = useRef(originalPlan);
    const lastEmittedPlan = useRef(null);
    const documentModel = buildDocumentModel(value, { variant: planVariant });
    const update = next => {
        lastEmittedPlan.current = next;
        setValue(next);
        onChange(next);
    };
    useEffect(() => {
        const planChanged = plan !== lastReceivedPlan.current;
        const originalPlanChanged = originalPlan !== lastReceivedOriginalPlan.current;
        if (!planChanged && !originalPlanChanged) return;
        lastReceivedPlan.current = plan;
        lastReceivedOriginalPlan.current = originalPlan;
        const emittedPlanEcho = plan === lastEmittedPlan.current
            && (!originalPlanChanged || originalPlan === plan);
        if (emittedPlanEcho) {
            lastEmittedPlan.current = null;
            return;
        }
        lastEmittedPlan.current = null;
        const replacement = structuredClone(plan);
        original.current = structuredClone(originalPlan);
        setValue(replacement);
    }, [plan, originalPlan]);
    const updateSession = (index, session) => update({
        ...value,
        sessions: value.sessions.map((item, itemIndex) => itemIndex === index ? session : item),
    });
    const selectPlanVariant = nextVariant => {
        setPlanVariant(nextVariant);
        requestAnimationFrame(() => document.getElementById(`plan-variant-${nextVariant}`)?.focus());
    };
    const handleVariantKeyDown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Home' || event.key === 'ArrowLeft') selectPlanVariant('brief');
        else selectPlanVariant('detailed');
    };
    const restore = () => {
        if (!window.confirm('수정 내용을 지우고 생성 원본으로 되돌릴까요?')) return;
        update(structuredClone(original.current));
    };
    const download = async () => {
        const checked = lessonPlanSchema.safeParse(value);
        if (!checked.success) {
            const formattedIssue = formatLessonPlanIssue(checked.error.issues[0], value);
            const issueControl = [...document.querySelectorAll('[aria-label]')]
                .find(element => element.getAttribute('aria-label') === formattedIssue.label);
            issueControl?.focus();
            window.alert(`입력 내용을 확인해주세요. ${formattedIssue.message}`);
            return;
        }
        const isSimpleHwpx = format === 'hwpx-simple';
        const exportFormat = isSimpleHwpx ? 'hwpx' : format;
        setExporting(true);
        try {
            await runOperation({ kind: 'lesson-export', label: `${isSimpleHwpx ? '간편 HWPX' : exportFormat.toUpperCase()} 지도안 파일 저장`, phase: 'serverWaiting', cancelable: true }, async ({ signal }) => {
                let response;
                try {
                    const search = new URLSearchParams({ plan: planVariant });
                    if (isSimpleHwpx) search.set('variant', 'simple');
                    response = await fetch(`/api/export/${exportFormat}?${search}`, {
                        method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checked.data),
                    });
                } catch (error) {
                    if (error instanceof DOMException && error.name === 'AbortError') throw error;
                    throw new Error('네트워크 오류로 내보내기를 요청하지 못했습니다. 다시 시도해주세요.');
                }
                if (!response.ok) {
                    let message = '내보내기 파일을 만들지 못했습니다.';
                    try {
                        const errorBody = await response.json();
                        if (typeof errorBody?.message === 'string' && errorBody.message) message = errorBody.message;
                    } catch {
                        // JSON이 아닌 오류 응답은 공통 메시지로 안내한다.
                    }
                    throw new Error(message);
                }
                const url = URL.createObjectURL(await response.blob());
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `${value.title}-${planVariant === 'detailed' ? '세안' : '약안'}.${exportFormat}`;
                anchor.click();
                URL.revokeObjectURL(url);
            });
        } catch (error) {
            window.alert(error instanceof Error ? error.message : '내보내기 파일을 만들지 못했습니다.');
        } finally {
            setExporting(false);
        }
    };
    const copyText = async () => {
        try {
            await navigator.clipboard.writeText(lessonPlanClipboardText(value, planVariant));
            setCopyStatus('지도안 전체 내용을 복사했습니다.');
        } catch {
            setCopyStatus('클립보드에 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.');
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
                        <option value="hwpx">한글 HWPX (PDF형 정식 표)</option>
                        <option value="hwpx-simple">간편 HWPX (호환성 우선 · 2열)</option>
                        <option value="docx">Word DOCX</option>
                        <option value="pdf">PDF</option>
                    </select>
                </label>
                <button type="button" className="primary-button" onClick={download} disabled={exporting}>{exporting ? '파일 만드는 중…' : '파일로 저장'}</button>
                <button type="button" className="secondary-button" onClick={copyText}>텍스트 복사</button>
                <button type="button" className="secondary-button" onClick={restore}>생성 원본으로 되돌리기</button>
                {copyStatus && <p className="copy-status" role="status">{copyStatus}</p>}
            </div>
        </header>

        <aside className="plan-editor__guidance" aria-label="편집 및 인쇄 안내">
            <p id={sharedFieldsNoteId}>학습 목표·준비물·평가·지원 전략·성찰은 전체 차시에 공통 적용되며 어느 차시에서 수정해도 함께 바뀝니다.</p>
            <p>내용이 매우 길면 인쇄 페이지가 늘어날 수 있습니다. 필요하면 문장을 간결하게 다듬어 주세요.</p>
        </aside>

        <section className="plan-variant-switcher" aria-labelledby="plan-variant-title">
            <div><strong id="plan-variant-title">지도안 형식</strong><p>{planVariant === 'brief' ? '약안은 본시의 핵심 흐름과 평가를 간결하게 보여줍니다.' : '세안은 단원 개관, 학습자 분석, 지도 전략과 단원 계획까지 포함합니다.'}</p></div>
            <div role="tablist" aria-label="지도안 형식 선택" onKeyDown={handleVariantKeyDown}>
                <button id="plan-variant-brief" type="button" role="tab" aria-controls="lesson-plan-variant-panel" aria-selected={planVariant === 'brief'} tabIndex={planVariant === 'brief' ? 0 : -1} onClick={() => setPlanVariant('brief')}>약안 보기</button>
                <button id="plan-variant-detailed" type="button" role="tab" aria-controls="lesson-plan-variant-panel" aria-selected={planVariant === 'detailed'} tabIndex={planVariant === 'detailed' ? 0 : -1} onClick={() => setPlanVariant('detailed')}>세안 보기</button>
            </div>
        </section>

        <div id="lesson-plan-variant-panel" className="lesson-document-stack" role="tabpanel" aria-labelledby={`plan-variant-${planVariant}`}>
            {planVariant === 'detailed' && <DetailedPlanEditor value={value} onChange={update}/>}
            {value.sessions.map((session, index) => {
                const model = documentModel.sessions[index];
                const connectionLabel = model.connectionLabel;
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
                            descriptionId={sharedFieldsNoteId}
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
                            descriptionId={sharedFieldsNoteId}
                            onChange={assessment => update({ ...value, assessment })}
                        />
                        <div className="document-followup-grid">
                            <label>
                                <span>개별화·지원 전략</span>
                                <textarea
                                    aria-label={`${session.order}차시 개별화·지원 전략`}
                                    aria-describedby={sharedFieldsNoteId}
                                    value={(value.supportStrategies ?? []).join('\n')}
                                    onChange={event => update({ ...value, supportStrategies: splitEditorLines(event.target.value) })}
                                    onBlur={event => update({ ...value, supportStrategies: normalizeEditorLines(event.target.value) })}
                                />
                            </label>
                            <label>
                                <span>수업 후 성찰</span>
                                <textarea
                                    aria-label={`${session.order}차시 수업 후 성찰`}
                                    aria-describedby={sharedFieldsNoteId}
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
