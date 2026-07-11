import { normalizeEditorLines, splitEditorLines } from './editor-lines.js';

const rowValue = (overview, key) => overview.rows.find(row => row.key === key)?.value ?? '';

function EditableCell({ label, value, onChange, onBlur, multiline = false, readOnly = false }) {
    const Control = multiline ? 'textarea' : 'input';
    return <td data-label={label}>
        <Control aria-label={label} value={value} onChange={onChange} onBlur={onBlur} readOnly={readOnly} />
    </td>;
}

export function OverviewTable({ plan, session, overview, onPlanChange, onSessionChange }) {
    const prefix = `${session.order}차시`;
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
                <th scope="row">일시</th>
                <EditableCell label={`${prefix} 수업 일자`} value={metadata.date ?? ''} onChange={event => updateMetadata('date', event.target.value)} />
                <th scope="row">장소</th>
                <EditableCell label={`${prefix} 수업 장소`} value={metadata.place ?? ''} onChange={event => updateMetadata('place', event.target.value)} />
            </tr>
            <tr>
                <th scope="row">대상 학급</th>
                <EditableCell label={`${prefix} 대상 학급`} value={metadata.className ?? ''} onChange={event => updateMetadata('className', event.target.value)} />
                <th scope="row">수업자</th>
                <EditableCell label={`${prefix} 수업자`} value={metadata.teacherName ?? ''} onChange={event => updateMetadata('teacherName', event.target.value)} />
            </tr>
            <tr>
                <th scope="row">학교급</th>
                <EditableCell label={`${prefix} 학교급`} value={String(rowValue(overview, 'schoolGrade')).replace(/\s+\S+학년$/, '')} readOnly />
                <th scope="row">학년</th>
                <EditableCell label={`${prefix} 학년`} value={`${plan.grade ?? ''}학년`} readOnly />
            </tr>
            <tr>
                <th scope="row">과목</th>
                <EditableCell label={`${prefix} 과목`} value={plan.subject ?? ''} readOnly />
                <th scope="row">차시</th>
                <EditableCell label={`${prefix} 차시`} value={rowValue(overview, 'session')} readOnly />
            </tr>
            <tr>
                <th scope="row">단원명</th>
                <EditableCell label={`${prefix} 단원명`} value={plan.unitTitle ?? ''} onChange={event => onPlanChange({ ...plan, unitTitle: event.target.value })} />
                <th scope="row">수업 모형</th>
                <EditableCell label={`${prefix} 수업 모형`} value={rowValue(overview, 'instructionModel')} readOnly />
            </tr>
            <tr>
                <th scope="row">지도안 제목</th>
                <EditableCell label={`${prefix} 지도안 제목`} value={plan.title ?? ''} onChange={event => onPlanChange({ ...plan, title: event.target.value })} />
                <th scope="row">차시명</th>
                <EditableCell label={`${prefix} 제목`} value={session.title ?? ''} onChange={event => onSessionChange({ ...session, title: event.target.value })} />
            </tr>
            <tr>
                <th scope="row">성취기준</th>
                <EditableCell label={`${prefix} 성취기준`} value={standards.map(item => `[${item.code}] ${item.text}`).join('\n')} multiline readOnly />
                <th scope="row">핵심 질문</th>
                <EditableCell label={`${prefix} 핵심 질문`} value={plan.essentialQuestion ?? ''} multiline onChange={event => onPlanChange({ ...plan, essentialQuestion: event.target.value })} />
            </tr>
            <tr>
                <th scope="row">학습 목표</th>
                <EditableCell label={`${prefix} 학습 목표`} value={(plan.learningGoals ?? []).join('\n')} multiline onChange={event => onPlanChange({ ...plan, learningGoals: splitEditorLines(event.target.value) })} onBlur={event => onPlanChange({ ...plan, learningGoals: normalizeEditorLines(event.target.value) })} />
                <th scope="row">준비물</th>
                <EditableCell label={`${prefix} 준비물`} value={(plan.materials ?? []).join('\n')} multiline onChange={event => onPlanChange({ ...plan, materials: splitEditorLines(event.target.value) })} onBlur={event => onPlanChange({ ...plan, materials: normalizeEditorLines(event.target.value) })} />
            </tr>
        </tbody>
    </table>;
}
