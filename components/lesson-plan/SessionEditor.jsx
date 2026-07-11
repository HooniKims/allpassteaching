import { normalizeEditorLines, splitEditorLines } from './editor-lines.js';

function ActivityField({ label, value, onChange, onBlur }) {
    return <label className="document-field">
        <span>{label.replace(/^\d+차시\s+\S+\s+/, '')}</span>
        <textarea aria-label={label} value={value.join('\n')} onChange={onChange} onBlur={onBlur} />
    </label>;
}

export function SessionEditor({ session, onChange }) {
    const stages = session.stages ?? [];
    const total = stages.reduce((sum, stage) => sum + Number(stage.minutes || 0), 0);
    const tableId = `session-${session.order}-process`;
    const headerId = key => `${tableId}-${key}`;
    const updateStage = (index, key, nextValue) => onChange({
        ...session,
        stages: stages.map((stage, stageIndex) => stageIndex === index ? { ...stage, [key]: nextValue } : stage),
    });

    return <div className="session-editor">
        <table className="formal-table process-table" aria-label={`${session.order}차시 교수·학습 과정`}>
            <caption>{session.order}차시 교수·학습 과정</caption>
            <colgroup>
                <col className="process-table__phase" />
                <col className="process-table__element" />
                <col className="process-table__teacher" />
                <col className="process-table__student" />
                <col className="process-table__minutes" />
                <col className="process-table__notes" />
            </colgroup>
            <thead>
                <tr>
                    <th id={headerId('phase')} scope="col">단계</th>
                    <th id={headerId('element')} scope="col">학습 요소</th>
                    <th id={headerId('teacher')} scope="col">교사 활동</th>
                    <th id={headerId('student')} scope="col">학생 활동</th>
                    <th id={headerId('minutes')} scope="col">시간</th>
                    <th id={headerId('notes')} scope="col">자료·유의점</th>
                </tr>
            </thead>
            <tbody>
                {stages.map((stage, index) => {
                    const prefix = `${session.order}차시 ${stage.phase}`;
                    const rowHeaderId = `${tableId}-stage-${index}`;
                    return <tr key={`${stage.phase}-${index}`}>
                        <th id={rowHeaderId} headers={headerId('phase')} scope="row" data-label="단계">{stage.phase}</th>
                        <td data-label="학습 요소" headers={`${rowHeaderId} ${headerId('element')}`}>
                            <textarea aria-label={`${prefix} 학습 요소`} value={stage.learningElement ?? ''} onChange={event => updateStage(index, 'learningElement', event.target.value)} />
                        </td>
                        <td data-label="교사 활동" headers={`${rowHeaderId} ${headerId('teacher')}`}>
                            <ActivityField label={`${prefix} 교사 활동`} value={stage.teacherActivities ?? []} onChange={event => updateStage(index, 'teacherActivities', splitEditorLines(event.target.value))} onBlur={event => updateStage(index, 'teacherActivities', normalizeEditorLines(event.target.value))} />
                            <ActivityField label={`${prefix} 주요 발문`} value={stage.teacherQuestions ?? []} onChange={event => updateStage(index, 'teacherQuestions', splitEditorLines(event.target.value))} onBlur={event => updateStage(index, 'teacherQuestions', normalizeEditorLines(event.target.value))} />
                        </td>
                        <td data-label="학생 활동" headers={`${rowHeaderId} ${headerId('student')}`}>
                            <ActivityField label={`${prefix} 학생 활동`} value={stage.studentActivities ?? []} onChange={event => updateStage(index, 'studentActivities', splitEditorLines(event.target.value))} onBlur={event => updateStage(index, 'studentActivities', normalizeEditorLines(event.target.value))} />
                            <ActivityField label={`${prefix} 예상 학생 반응`} value={stage.expectedStudentResponses ?? []} onChange={event => updateStage(index, 'expectedStudentResponses', splitEditorLines(event.target.value))} onBlur={event => updateStage(index, 'expectedStudentResponses', normalizeEditorLines(event.target.value))} />
                        </td>
                        <td data-label="시간" headers={`${rowHeaderId} ${headerId('minutes')}`}>
                            <input aria-label={`${prefix} 시간`} type="number" min="0" value={stage.minutes ?? 0} onChange={event => updateStage(index, 'minutes', Number(event.target.value))} />
                        </td>
                        <td data-label="자료·유의점" headers={`${rowHeaderId} ${headerId('notes')}`}>
                            <ActivityField label={`${prefix} 자료 및 유의점`} value={stage.materialsAndNotes ?? []} onChange={event => updateStage(index, 'materialsAndNotes', splitEditorLines(event.target.value))} onBlur={event => updateStage(index, 'materialsAndNotes', normalizeEditorLines(event.target.value))} />
                            <ActivityField label={`${prefix} 지원 사항`} value={stage.supportNotes ?? []} onChange={event => updateStage(index, 'supportNotes', splitEditorLines(event.target.value))} onBlur={event => updateStage(index, 'supportNotes', normalizeEditorLines(event.target.value))} />
                        </td>
                    </tr>;
                })}
            </tbody>
            <tfoot>
                <tr>
                    <th id={headerId('total')} scope="row" colSpan="4">단계 시간 합계</th>
                    <td data-label="합계" headers={`${headerId('total')} ${headerId('minutes')}`}><strong className={total === session.sessionMinutes ? '' : 'time-error'}>총 {total}분</strong></td>
                    <td data-label="차시 시간" headers={`${headerId('total')} ${headerId('minutes')}`}>기준 {session.sessionMinutes}분</td>
                </tr>
            </tfoot>
        </table>
        {total !== session.sessionMinutes && <p className="form-alert time-mismatch-alert" role="alert">단계 시간 합계 {total}분이 차시 시간 {session.sessionMinutes}분과 다릅니다.</p>}
    </div>;
}
