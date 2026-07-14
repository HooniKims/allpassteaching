import { WorksheetEditor } from './WorksheetEditor.jsx';

export function AssessmentSheetEditor({ value, onChange }) {
    const editorValue = {
        standards: value.task.standards,
        document: value.studentSheet.document,
        teacherKey: value.studentSheet.teacherKey,
    };
    return <WorksheetEditor
        mode="assessment"
        value={editorValue}
        onChange={next => onChange({ ...value, studentSheet: { document: next.document, teacherKey: next.teacherKey } })}
    />;
}
