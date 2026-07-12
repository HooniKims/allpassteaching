import { useState } from 'react';
import ExcelJS from 'exceljs';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { StudentRosterEditor } from '@/components/workflow/StudentRosterEditor.jsx';

function Harness({ initialStudents = [], submissions = [], records = [] }) {
    const [state, setState] = useState({ students: initialStudents, submissions, records });
    const deleteStudent = id => setState(current => ({
        students: current.students.filter(student => student.id !== id),
        submissions: current.submissions.filter(submission => submission.studentId !== id),
        records: current.records.filter(record => record.studentId !== id),
    }));
    return <>
        <StudentRosterEditor
            students={state.students}
            submissions={state.submissions}
            records={state.records}
            onChange={students => setState(current => ({ ...current, students }))}
            onDeleteStudent={deleteStudent}
        />
        <output data-testid="state">{JSON.stringify(state)}</output>
    </>;
}

async function rosterFile(rows, name = '학생명단.xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('학생 명단');
    sheet.addRow(['학년', '반', '번호', '이름']);
    rows.forEach(row => sheet.addRow(row));
    const bytes = await workbook.xlsx.writeBuffer();
    return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

test('Given an empty roster When a teacher adds and edits a student Then the generated identifier remains stable', async () => {
    const user = userEvent.setup();
    render(<Harness/>);

    await user.click(screen.getByRole('button', { name: '학생 직접 추가' }));
    const initial = JSON.parse(screen.getByTestId('state').textContent);
    const id = initial.students[0].id;
    await user.type(screen.getByRole('textbox', { name: '1번 학생 이름' }), '김하늘');
    await user.clear(screen.getByRole('spinbutton', { name: '1번 학생 번호' }));
    await user.type(screen.getByRole('spinbutton', { name: '1번 학생 번호' }), '7');

    const edited = JSON.parse(screen.getByTestId('state').textContent);
    expect(edited.students[0]).toMatchObject({ id, number: 7, name: '김하늘' });
    expect(id).toMatch(/^student-[0-9a-f-]{36}$/);
});

test('Given two students When the teacher reorders them Then only list order changes', async () => {
    const user = userEvent.setup();
    const students = [
        { id: 'student-a', grade: '2', className: '1', number: 1, name: '김하늘' },
        { id: 'student-b', grade: '2', className: '1', number: 2, name: '이바다' },
    ];
    render(<Harness initialStudents={students}/>);

    await user.click(screen.getByRole('button', { name: '이바다 위로 이동' }));

    const state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.students.map(student => student.id)).toEqual(['student-b', 'student-a']);
});

test('Given a student with linked results When deleting Then confirmation removes only that student data', async () => {
    const user = userEvent.setup();
    const students = [
        { id: 'student-a', grade: '2', className: '1', number: 1, name: '김하늘' },
        { id: 'student-b', grade: '2', className: '1', number: 2, name: '이바다' },
    ];
    render(<Harness
        initialStudents={students}
        submissions={[{ id: 'submission-a', studentId: 'student-a' }, { id: 'submission-b', studentId: 'student-b' }]}
        records={[{ submissionId: 'submission-a', studentId: 'student-a' }, { submissionId: 'submission-b', studentId: 'student-b' }]}
    />);

    await user.click(screen.getByRole('button', { name: '김하늘 삭제' }));
    const dialog = screen.getByRole('alertdialog', { name: '학생 삭제 확인' });
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveTextContent('김하늘 학생의 제출물과 세특도 함께 삭제');
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '학생과 연결 자료 삭제' }));

    const state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.students.map(student => student.id)).toEqual(['student-b']);
    expect(state.submissions.map(item => item.id)).toEqual(['submission-b']);
    expect(state.records.map(item => item.submissionId)).toEqual(['submission-b']);
});

test('Given an invalid workbook and an existing roster When importing Then the roster remains byte-for-byte unchanged and errors name row and column', async () => {
    const user = userEvent.setup();
    const initialStudents = [{ id: 'student-existing', grade: '2', className: '1', number: 1, name: '기존학생' }];
    render(<Harness initialStudents={initialStudents}/>);
    const before = screen.getByTestId('state').textContent;
    const file = await rosterFile([['2', '1', 1, '김하늘'], ['2', '1', 1, '이바다']]);

    await user.upload(screen.getByLabelText('학생 명단 Excel 업로드'), file);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('3행 · 번호'));
    expect(screen.getByTestId('state').textContent).toBe(before);
});

test('Given a valid workbook When importing Then it atomically replaces the roster in spreadsheet order', async () => {
    const user = userEvent.setup();
    render(<Harness initialStudents={[{ id: 'student-existing', grade: '2', className: '1', number: 1, name: '기존학생' }]}/>);
    const file = await rosterFile([['3', '2', 8, '첫학생'], ['', '', '', ''], ['3', '2', 9, '둘학생']]);

    await user.upload(screen.getByLabelText('학생 명단 Excel 업로드'), file);

    await waitFor(() => expect(screen.getByText(/2명을 불러왔습니다/)).toBeInTheDocument());
    const state = JSON.parse(screen.getByTestId('state').textContent);
    expect(state.students.map(student => student.name)).toEqual(['첫학생', '둘학생']);
});
