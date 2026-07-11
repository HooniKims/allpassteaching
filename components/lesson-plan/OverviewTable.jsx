import { normalizeEditorLines, splitEditorLines } from './editor-lines.js';

const rowValue = (overview, key) => overview.rows.find(row => row.key === key)?.value ?? '';

function EditableCell({ label, headerId, descriptionId, value, onChange, onBlur, multiline = false, readOnly = false }) {
    const Control = multiline ? 'textarea' : 'input';
    return <td data-label={label} headers={headerId}>
        <Control aria-label={label} aria-describedby={descriptionId} value={value} onChange={onChange} onBlur={onBlur} readOnly={readOnly} />
    </td>;
}

export function OverviewTable({ plan, session, overview, descriptionId, onPlanChange, onSessionChange }) {
    const prefix = `${session.order}차시`;
    const headerId = key => `session-${session.order}-overview-${key}`;
    const metadata = plan.metadata ?? {};
    const updateMetadata = (key, nextValue) => onPlanChange({
        ...plan,
        metadata: { ...metadata, [key]: nextValue },
    });
    const standards = rowValue(overview, 'standards');

    return <table className="formal-table overview-table" aria-label={`${prefix} 수업 개요`}>
        <caption>수업 개요</caption>
        <tbody>
            <tr>
                <th id={headerId('date')} scope="row">일시</th>
                <EditableCell label={`${prefix} 수업 일자`} headerId={headerId('date')} value={metadata.date ?? ''} onChange={event => updateMetadata('date', event.target.value)} />
                <th id={headerId('place')} scope="row">장소</th>
                <EditableCell label={`${prefix} 수업 장소`} headerId={headerId('place')} value={metadata.place ?? ''} onChange={event => updateMetadata('place', event.target.value)} />
            </tr>
            <tr>
                <th id={headerId('className')} scope="row">대상 학급</th>
                <EditableCell label={`${prefix} 대상 학급`} headerId={headerId('className')} value={metadata.className ?? ''} onChange={event => updateMetadata('className', event.target.value)} />
                <th id={headerId('teacherName')} scope="row">수업자</th>
                <EditableCell label={`${prefix} 수업자`} headerId={headerId('teacherName')} value={metadata.teacherName ?? ''} onChange={event => updateMetadata('teacherName', event.target.value)} />
            </tr>
            <tr>
                <th id={headerId('schoolLevel')} scope="row">학교급</th>
                <EditableCell label={`${prefix} 학교급`} headerId={headerId('schoolLevel')} value={String(rowValue(overview, 'schoolGrade')).replace(/\s+\S+학년$/, '')} readOnly />
                <th id={headerId('grade')} scope="row">학년</th>
                <EditableCell label={`${prefix} 학년`} headerId={headerId('grade')} value={`${plan.grade ?? ''}학년`} readOnly />
            </tr>
            <tr>
                <th id={headerId('subject')} scope="row">과목</th>
                <EditableCell label={`${prefix} 과목`} headerId={headerId('subject')} value={plan.subject ?? ''} readOnly />
                <th id={headerId('session')} scope="row">차시</th>
                <EditableCell label={`${prefix} 차시`} headerId={headerId('session')} value={rowValue(overview, 'session')} readOnly />
            </tr>
            <tr>
                <th id={headerId('unitTitle')} scope="row">단원명</th>
                <EditableCell label={`${prefix} 단원명`} headerId={headerId('unitTitle')} value={plan.unitTitle ?? ''} onChange={event => onPlanChange({ ...plan, unitTitle: event.target.value })} />
                <th id={headerId('lessonTitle')} scope="row">수업 제목</th>
                <EditableCell label={`${prefix} 수업 제목`} headerId={headerId('lessonTitle')} value={rowValue(overview, 'lessonTitle')} onChange={event => onPlanChange({ ...plan, title: event.target.value })} />
            </tr>
            <tr>
                <th id={headerId('instructionModel')} scope="row">수업 모형</th>
                <EditableCell label={`${prefix} 수업 모형`} headerId={headerId('instructionModel')} value={rowValue(overview, 'instructionModel')} readOnly />
                <th id={headerId('sessionTitle')} scope="row">차시명</th>
                <EditableCell label={`${prefix} 제목`} headerId={headerId('sessionTitle')} value={session.title ?? ''} onChange={event => onSessionChange({ ...session, title: event.target.value })} />
            </tr>
            <tr>
                <th id={headerId('standards')} scope="row">성취기준</th>
                <EditableCell label={`${prefix} 성취기준`} headerId={headerId('standards')} value={standards.map(item => `[${item.code}] ${item.text}`).join('\n')} multiline readOnly />
                <th id={headerId('essentialQuestion')} scope="row">핵심 질문</th>
                <EditableCell label={`${prefix} 핵심 질문`} headerId={headerId('essentialQuestion')} value={plan.essentialQuestion ?? ''} multiline onChange={event => onPlanChange({ ...plan, essentialQuestion: event.target.value })} />
            </tr>
            <tr>
                <th id={headerId('learningGoals')} scope="row">학습 목표</th>
                <EditableCell label={`${prefix} 학습 목표`} headerId={headerId('learningGoals')} descriptionId={descriptionId} value={(plan.learningGoals ?? []).join('\n')} multiline onChange={event => onPlanChange({ ...plan, learningGoals: splitEditorLines(event.target.value) })} onBlur={event => onPlanChange({ ...plan, learningGoals: normalizeEditorLines(event.target.value) })} />
                <th id={headerId('materials')} scope="row">준비물</th>
                <EditableCell label={`${prefix} 준비물`} headerId={headerId('materials')} descriptionId={descriptionId} value={(plan.materials ?? []).join('\n')} multiline onChange={event => onPlanChange({ ...plan, materials: splitEditorLines(event.target.value) })} onBlur={event => onPlanChange({ ...plan, materials: normalizeEditorLines(event.target.value) })} />
            </tr>
        </tbody>
    </table>;
}
