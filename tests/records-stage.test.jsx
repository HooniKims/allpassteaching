import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordsStage } from '@/components/workflow/RecordsStage.jsx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';
import { gradingSourceHash, recordSourceHash } from '@/lib/workflow-lineage';
import { canonicalGradingOrigin, canonicalGradingSourceRef } from '@/lib/grading-evidence';

afterEach(() => vi.restoreAllMocks());
const recordElements = ['뿌리에 가는 털', '물을 흡수한다', '관찰 결과'].map((value, index) => ({ id: `e${index + 1}`, page: 1, category: 'text', text: value, confidence: .9, coordinates: [{ x: .1, y: .1 + index * .2 }, { x: .8, y: .2 + index * .2 }] }));
const grading = { criteria: [
    { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-1', selectedLevelId: 'proficient', score: 35, evidence: '뿌리에 가는 털', reason: '관찰 특징이 수준 설명에 부합합니다.', feedback: '구체적입니다.', confidence: .9, sourceRefs: [canonicalGradingSourceRef(recordElements[0])], teacherConfirmed: true },
    { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-2', selectedLevelId: 'proficient', score: 35, evidence: '물을 흡수한다', reason: '구조와 기능을 근거로 연결했습니다.', feedback: '연결했습니다.', confidence: .9, sourceRefs: [canonicalGradingSourceRef(recordElements[1])], teacherConfirmed: true },
    { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-3', selectedLevelId: 'proficient', score: 15, evidence: '관찰 결과', reason: '수정 과정의 근거가 드러납니다.', feedback: '수정 과정을 확인했습니다.', confidence: .9, sourceRefs: [canonicalGradingSourceRef(recordElements[2])], teacherConfirmed: true },
], provisionalTotal: 85, totalScore: 85, sourceHash: '', summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명합니다.', reviewOrigins: [{ criterionId: 'criterion-1', reviewRequired: false }, { criterionId: 'criterion-2', reviewRequired: false }, { criterionId: 'criterion-3', reviewRequired: false }], originToken: 'a'.repeat(64), approvalToken: 'b'.repeat(64) };
grading.reviewOrigins = grading.criteria.map(canonicalGradingOrigin);
const assessment = makeAssessment();
const submissions = [
    { id: 's1', studentId: 'student-1', studentName: '김학생', elements: recordElements, originalRevision: 2, approved: true, extractedText: '관찰 결과 뿌리에 가는 털이 있고 물을 흡수한다.', grading },
    { id: 's2', studentId: 'student-2', studentName: '이학생', elements: recordElements, originalRevision: 2, approved: false, extractedText: '관찰 결과 미승인 내용입니다.', grading },
].map(item => {
    const currentHash = gradingSourceHash(assessment, item.extractedText, item.elements, item.grading.criteria, item);
    return { ...item, grading: { ...item.grading, sourceHash: currentHash }, sourceHash: currentHash };
});
const generatedText = '관찰한 식물 기관의 특징을 구체적으로 기록하고 뿌리의 구조와 기능을 근거로 연결하여 설명함. 관찰 사실에서 결론을 이끌어내는 교과 탐구 과정이 드러남.';
const students = [
    { id: 'student-1', grade: '6', className: '1', number: 1, name: '김학생' },
    { id: 'student-2', grade: '6', className: '1', number: 2, name: '이학생' },
];

const fakeContext = { payload: { version: 1 }, token: 'a'.repeat(64) };
const candidateClaims = [{ text: generatedText, kind: 'performance', criterionIds: ['criterion-1'], evidenceQuotes: [{ criterionId: 'criterion-1', stage: 'performance', quote: '뿌리에 가는 털' }], sourceRefs: [{ criterionId: 'criterion-1', elementId: 'e1', page: 1 }] }];
function mockRecordFetch(...generationResponses) {
    let index = 0;
    return vi.fn((url, options) => {
        if (String(url).includes('/api/authorize-record-generation')) return Promise.resolve(Response.json({ context: fakeContext }));
        const response = generationResponses[index++];
        const resolved = typeof response === 'function' ? response(url, options) : Promise.resolve(response);
        return Promise.resolve(resolved).then(async value => {
            if (!(value instanceof Response)) return value;
            const body = await value.clone().json().catch(() => null);
            if (!body?.record?.text || body.record.claims) return value;
            return Response.json({ ...body, record: { ...body.record, claims: candidateClaims, evidenceCriterionIds: ['criterion-1'] } }, { status: value.status });
        });
    });
}

function Harness() { const [records, setRecords] = useState([]); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={students} submissions={submissions} records={records} onChange={setRecords}/>; }

test('shows only approved students and saves an editable generated draft', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockRecordFetch(Response.json({ record: { text: generatedText } })));
    render(<Harness/>);

    expect(screen.getByText('김학생')).toBeInTheDocument();
    expect(screen.queryByText('이학생')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '김학생 기록 근거' })).toHaveTextContent('6과11-02');
    expect(screen.getByRole('region', { name: '김학생 기록 근거' })).toHaveTextContent('식물 기관 탐구 보고서 만들기');
    expect(screen.getByRole('region', { name: '김학생 기록 근거' })).toHaveTextContent('관찰 특징이 수준 설명에 부합합니다.');
    expect(screen.getByRole('region', { name: '김학생 기록 근거' })).toHaveTextContent('수정 과정의 근거가 드러납니다.');
    await user.click(screen.getByRole('button', { name: '김학생 세특 생성' }));

    expect(await screen.findByDisplayValue(generatedText)).toBeInTheDocument();
    expect(screen.getByText(`${generatedText.length}자 · ${new TextEncoder().encode(generatedText).byteLength}byte / 1000byte`)).toBeInTheDocument();
});

test('defaults to a 1000byte record limit and sends a teacher-entered custom byte target', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', mockRecordFetch(Response.json({ record: { text: generatedText } })));
    render(<Harness/>);

    expect(screen.getByRole('combobox', { name: '세특 분량 선택' })).toHaveValue('1000');
    await user.selectOptions(screen.getByRole('combobox', { name: '세특 분량 선택' }), 'custom');
    const customInput = screen.getByRole('spinbutton', { name: '직접 입력 분량(byte)' });
    await user.clear(customInput);
    await user.type(customInput, '850');
    await user.tab();
    await user.click(screen.getByRole('button', { name: '김학생 세특 생성' }));

    await screen.findByDisplayValue(generatedText);
    const generationCall = fetch.mock.calls.find(([url]) => String(url).includes('/api/generate-record'));
    expect(JSON.parse(generationCall[1].body).targetBytes).toBe(850);
    expect(screen.getByText(new RegExp(`${generatedText.length}자.*850byte`))).toBeInTheDocument();
});

test('allows a teacher to shorten an existing draft after choosing a lower byte limit', async () => {
    const overFiveHundredBytes = '가'.repeat(234);
    const shortenedDraft = '가'.repeat(233);
    const currentHash = recordSourceHash(assessment, submissions[0]);
    function LongDraftHarness() {
        const [records, setRecords] = useState([{ submissionId: 's1', studentId: 'student-1', studentName: '김학생', sourceHash: currentHash, status: 'done', text: overFiveHundredBytes, claims: [], evidenceCriterionIds: [], error: '', approved: false }]);
        return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={students} submissions={submissions} records={records} onChange={setRecords}/>;
    }
    const user = userEvent.setup();
    render(<LongDraftHarness/>);

    await user.selectOptions(screen.getByRole('combobox', { name: '세특 분량 선택' }), '500');
    const draft = screen.getByRole('textbox', { name: '김학생 세특 초안' });
    fireEvent.change(draft, { target: { value: shortenedDraft } });

    expect(draft).toHaveValue(shortenedDraft);
});

test('keeps the initial blank editor read-only until the first generated draft arrives', async () => {
    const pending = deferredResponse();
    vi.stubGlobal('fetch', mockRecordFetch(() => pending.promise));
    const user = userEvent.setup();
    render(<Harness/>);

    await user.click(screen.getByRole('button', { name: '김학생 세특 생성' }));
    expect(await screen.findByRole('textbox', { name: '김학생 세특 초안' })).toBeDisabled();
    pending.resolve(Response.json({ record: { text: generatedText } }));
    expect(await screen.findByDisplayValue(generatedText)).toBeEnabled();
});

test('batch generation isolates a student failure', async () => {
    const third = { ...submissions[0], id: 's3', studentId: 'student-3', studentName: '박학생' };
    const thirdHash = gradingSourceHash(assessment, third.extractedText, third.elements, third.grading.criteria, third);
    const approved = [...submissions, { ...third, grading: { ...third.grading, sourceHash: thirdHash }, sourceHash: thirdHash }];
    const batchStudents = [...students, { id: 'student-3', grade: '6', className: '1', number: 3, name: '박학생' }];
    function BatchHarness() { const [records, setRecords] = useState([]); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={batchStudents} submissions={approved} records={records} onChange={setRecords}/>; }
    vi.stubGlobal('fetch', mockRecordFetch(Response.json({ record: { text: generatedText } }), Response.json({ message: '생성 실패' }, { status: 503 })));
    const user = userEvent.setup(); render(<BatchHarness/>);
    await user.click(screen.getByRole('button', { name: '미생성 학생 전체 생성' }));

    expect(await screen.findByDisplayValue(generatedText)).toBeInTheDocument();
    expect(await screen.findByText('생성 실패')).toBeInTheDocument();
});

test('does not expose a client-flagged approval without a finalized server token', () => {
    const unsigned = submissions.map(item => ({ ...item, grading: { ...item.grading, approvalToken: undefined } }));
    function UnsignedHarness() { const [records, setRecords] = useState([]); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={students} submissions={unsigned} records={records} onChange={setRecords}/>; }

    render(<UnsignedHarness/>);

    expect(screen.queryByText('김학생')).not.toBeInTheDocument();
    expect(screen.getByText('현재 학생 명단과 연결된 승인 채점이 없습니다. OCR·채점 단계에서 학생별 근거를 확인하고 승인해주세요.')).toBeInTheDocument();
});

test('does not expose an otherwise approved submission after its student id is removed from the current roster', () => {
    function RemovedStudentHarness() { const [records, setRecords] = useState([]); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={[students[1]]} submissions={submissions} records={records} onChange={setRecords}/>; }

    render(<RemovedStudentHarness/>);

    expect(screen.queryByText('김학생')).not.toBeInTheDocument();
    expect(screen.getByText('현재 학생 명단과 연결된 승인 채점이 없습니다. OCR·채점 단계에서 학생별 근거를 확인하고 승인해주세요.')).toBeInTheDocument();
});

function approvedClass() {
    const second = { ...submissions[0], id: 's2', studentId: 'student-2', studentName: '이학생', extractedText: '관찰 결과 줄기로 물을 운반하고 수정 이유를 표시했다.' };
    const secondHash = gradingSourceHash(assessment, second.extractedText, second.elements, second.grading.criteria, second);
    return [submissions[0], { ...second, grading: { ...second.grading, sourceHash: secondHash }, sourceHash: secondHash }];
}

test('Given two current drafts When regenerating the class Then one can be applied and the other kept without automatic overwrite', async () => {
    const oldOne = '김학생 기존 문장 그대로 유지';
    const oldTwo = '이학생 기존 문장 그대로 유지';
    const candidateOne = `${generatedText} 김학생 새 초안.`;
    const candidateTwo = `${generatedText} 이학생 새 초안.`;
    const initial = [
        { submissionId: 's1', studentId: 'student-1', studentName: '김학생', sourceHash: 'old-source-1', status: 'done', text: oldOne, error: '', approved: true },
        { submissionId: 's2', studentId: 'student-2', studentName: '이학생', sourceHash: 'old-source-2', status: 'done', text: oldTwo, error: '', approved: true },
    ];
    function CompareHarness() { const [records, setRecords] = useState(initial); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={students} submissions={approvedClass()} records={records} onChange={setRecords}/>; }
    vi.stubGlobal('fetch', mockRecordFetch(
        Response.json({ record: { text: candidateOne } }),
        Response.json({ record: { text: candidateTwo } })));
    const user = userEvent.setup();
    render(<CompareHarness/>);

    await user.click(screen.getByRole('button', { name: '전체 다시 생성' }));

    expect(await screen.findByText(candidateOne)).toBeInTheDocument();
    expect(screen.getByText(candidateTwo)).toBeInTheDocument();
    expect(screen.getByDisplayValue(oldOne)).toBeInTheDocument();
    expect(screen.getByDisplayValue(oldTwo)).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: '김학생 세특 초안' }));
    await user.type(screen.getByRole('textbox', { name: '김학생 세특 초안' }), '후보를 검토하며 고친 현재 교사 문장');
    expect(screen.getByRole('region', { name: '김학생 기존 문장과 새 초안 비교' })).toHaveTextContent('후보를 검토하며 고친 현재 교사 문장');
    await user.click(screen.getByRole('button', { name: '김학생 새 초안 적용' }));
    await user.click(screen.getByRole('button', { name: '이학생 기존 문장 유지' }));

    expect(screen.getByDisplayValue(candidateOne)).toBeInTheDocument();
    expect(screen.getByDisplayValue(oldTwo)).toBeInTheDocument();
    expect(screen.queryByText(candidateTwo)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('이학생 기존 문장을 유지했습니다.');
});

test('refreshes the signed context when each queued student starts', async () => {
    const third = { ...submissions[0], id: 's3', studentId: 'student-3', studentName: '박학생' };
    const thirdHash = gradingSourceHash(assessment, third.extractedText, third.elements, third.grading.criteria, third);
    const approved = [...approvedClass(), { ...third, grading: { ...third.grading, sourceHash: thirdHash }, sourceHash: thirdHash }];
    const batchStudents = [...students, { id: 'student-3', grade: '6', className: '1', number: 3, name: '박학생' }];
    function RefreshHarness() { const [records, setRecords] = useState([]); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={batchStudents} submissions={approved} records={records} onChange={setRecords}/>; }
    vi.stubGlobal('fetch', mockRecordFetch(
        Response.json({ record: { text: generatedText } }),
        Response.json({ record: { text: generatedText } }),
        Response.json({ record: { text: generatedText } })));
    const user = userEvent.setup();
    render(<RefreshHarness/>);

    await user.click(screen.getByRole('button', { name: '미생성 학생 전체 생성' }));
    await waitFor(() => expect(screen.getAllByDisplayValue(generatedText)).toHaveLength(3));
    expect(fetch.mock.calls.filter(([url]) => String(url).includes('/api/authorize-record-generation'))).toHaveLength(3);
});

test('Given one failed regeneration When retrying failed only Then every current draft is preserved byte-for-byte', async () => {
    const oldOne = '김학생 현재 문장  A  공백 유지';
    const oldTwo = '이학생 현재 문장  B  공백 유지';
    const candidateOne = `${generatedText} 첫 후보.`;
    const candidateTwo = `${generatedText} 재시도 후보.`;
    const initial = [
        { submissionId: 's1', studentId: 'student-1', studentName: '김학생', sourceHash: 'source-1', status: 'done', text: oldOne, error: '', approved: false },
        { submissionId: 's2', studentId: 'student-2', studentName: '이학생', sourceHash: 'source-2', status: 'done', text: oldTwo, error: '', approved: false },
    ];
    function RetryHarness() { const [records, setRecords] = useState(initial); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={students} submissions={approvedClass()} records={records} onChange={setRecords}/>; }
    vi.stubGlobal('fetch', mockRecordFetch(
        Response.json({ record: { text: candidateOne } }),
        Response.json({ message: '이학생 생성 실패' }, { status: 503 }),
        Response.json({ record: { text: candidateTwo } })));
    const user = userEvent.setup();
    render(<RetryHarness/>);

    await user.click(screen.getByRole('button', { name: '전체 다시 생성' }));
    expect(await screen.findByText('이학생 생성 실패')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '김학생 세특 초안' })).toHaveValue(oldOne);
    expect(screen.getByRole('textbox', { name: '이학생 세특 초안' })).toHaveValue(oldTwo);
    await user.click(screen.getByRole('button', { name: '실패 학생만 다시 시도' }));

    expect(await screen.findByText(candidateTwo)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '김학생 세특 초안' })).toHaveValue(oldOne);
    expect(screen.getByRole('textbox', { name: '이학생 세특 초안' })).toHaveValue(oldTwo);
    expect(fetch).toHaveBeenCalledTimes(6);
});

function deferredResponse() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

test('Given a teacher edit during regeneration When the candidate arrives Then the live teacher text is not rolled back', async () => {
    const pending = deferredResponse();
    const currentText = '요청 전 교사 문장';
    const editedText = '응답 대기 중 교사가 직접 고친 문장';
    const initial = [{ submissionId: 's1', studentId: 'student-1', studentName: '김학생', sourceHash: 'old-source', status: 'done', text: currentText, error: '', approved: false }];
    function LiveEditHarness() { const [records, setRecords] = useState(initial); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={students} submissions={[submissions[0]]} records={records} onChange={setRecords}/>; }
    vi.stubGlobal('fetch', mockRecordFetch(() => pending.promise));
    const user = userEvent.setup();
    render(<LiveEditHarness/>);

    await user.click(screen.getByRole('button', { name: '김학생 다시 생성' }));
    expect(screen.getByRole('status')).toHaveTextContent('김학생 세특 생성 중');
    await user.clear(screen.getByRole('textbox', { name: '김학생 세특 초안' }));
    await user.type(screen.getByRole('textbox', { name: '김학생 세특 초안' }), editedText);
    pending.resolve(Response.json({ record: { text: `${generatedText} 후보` } }));

    expect(await screen.findByText(`${generatedText} 후보`)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '김학생 세특 초안' })).toHaveValue(editedText);
    expect(screen.getByRole('status')).toHaveTextContent('김학생 새 초안을 비교할 수 있습니다.');
});

test('Given a teacher edit during regeneration When that request fails Then the live teacher text is not rolled back', async () => {
    const pending = deferredResponse();
    const editedText = '실패 응답 전 교사가 직접 고친 문장';
    const initial = [{ submissionId: 's1', studentId: 'student-1', studentName: '김학생', sourceHash: 'old-source', status: 'done', text: '요청 전 교사 문장', error: '', approved: false }];
    function LiveFailureHarness() { const [records, setRecords] = useState(initial); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={students} submissions={[submissions[0]]} records={records} onChange={setRecords}/>; }
    vi.stubGlobal('fetch', mockRecordFetch(() => pending.promise));
    const user = userEvent.setup();
    render(<LiveFailureHarness/>);

    await user.click(screen.getByRole('button', { name: '김학생 다시 생성' }));
    await user.clear(screen.getByRole('textbox', { name: '김학생 세특 초안' }));
    await user.type(screen.getByRole('textbox', { name: '김학생 세특 초안' }), editedText);
    pending.resolve(Response.json({ message: '지연 응답 실패' }, { status: 503 }));

    expect(await screen.findByText('지연 응답 실패')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '김학생 세특 초안' })).toHaveValue(editedText);
});

test('Given a malformed successful response When regenerating Then the current draft remains done and a controlled error is shown', async () => {
    const currentText = '교사가 보존해야 하는 현재 문장';
    const initial = [{ submissionId: 's1', studentId: 'student-1', studentName: '김학생', sourceHash: 'old-source', status: 'done', text: currentText, error: '', approved: true }];
    function MalformedHarness() { const [records, setRecords] = useState(initial); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={students} submissions={[submissions[0]]} records={records} onChange={setRecords}/>; }
    vi.stubGlobal('fetch', mockRecordFetch(new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } })));
    const user = userEvent.setup();
    render(<MalformedHarness/>);

    await user.click(screen.getByRole('button', { name: '김학생 다시 생성' }));

    expect(await screen.findByText('생성 결과 형식을 확인하지 못했습니다. 다시 시도해주세요.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '김학생 세특 초안' })).toHaveValue(currentText);
    expect(screen.getByRole('button', { name: '확인 완료 취소' })).toBeInTheDocument();
});

test('Given a queued class generation When the teacher cancels Then no new student request starts', async () => {
    const third = { ...submissions[0], id: 's3', studentId: 'student-3', studentName: '박학생' };
    const thirdHash = gradingSourceHash(assessment, third.extractedText, third.elements, third.grading.criteria, third);
    const approved = [...approvedClass(), { ...third, grading: { ...third.grading, sourceHash: thirdHash }, sourceHash: thirdHash }];
    const batchStudents = [...students, { id: 'student-3', grade: '6', className: '1', number: 3, name: '박학생' }];
    function CancelHarness() { const [records, setRecords] = useState([]); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={batchStudents} submissions={approved} records={records} onChange={setRecords}/>; }
    const abortable = (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    vi.stubGlobal('fetch', mockRecordFetch(abortable, abortable, abortable));
    const user = userEvent.setup();
    render(<CancelHarness/>);

    await user.click(screen.getByRole('button', { name: '미생성 학생 전체 생성' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    await user.click(screen.getByRole('button', { name: '작업 취소' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('세특 생성 작업을 취소했습니다.'));
    expect(fetch).toHaveBeenCalledTimes(4);
});

test('shows typed candidate reasons for stale evidence, length limits, unsupported claims, and expired context', async () => {
    const currentHash = recordSourceHash(assessment, submissions[0]);
    const base = { submissionId: 's1', studentId: 'student-1', studentName: '김학생', sourceHash: currentHash, status: 'done', text: '현재 교사 문장', error: '', approved: false, candidateText: generatedText, candidateClaims, candidateEvidenceCriterionIds: ['criterion-1'], candidateSourceHash: currentHash, candidateTargetBytes: 1000 };
    function ReasonHarness({ initial }) { const [records, setRecords] = useState([initial]); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} students={students} submissions={[submissions[0]]} records={records} onChange={setRecords}/>; }

    const staleView = render(<ReasonHarness initial={{ ...base, candidateSourceHash: 'record-v2:stale' }}/>);
    expect(screen.getByText('현재 승인 근거가 후보 생성 시점과 달라졌습니다. 새 근거로 다시 생성해주세요.')).toHaveAttribute('data-reason', 'stale_evidence');
    staleView.unmount();

    const lengthView = render(<ReasonHarness initial={base}/>);
    await userEvent.setup().selectOptions(screen.getByRole('combobox', { name: '세특 분량 선택' }), '500');
    expect(screen.getByText('현재 분량 설정과 맞지 않는 후보입니다. 현재 설정으로 다시 생성해주세요.')).toHaveAttribute('data-reason', 'length_limit');
    lengthView.unmount();

    const unsupportedView = render(<ReasonHarness initial={{ ...base, candidateClaims: [] }}/>);
    expect(screen.getByText('승인 근거로 확인되지 않은 주장이 있어 이 후보를 적용할 수 없습니다.')).toHaveAttribute('data-reason', 'unsupported_claim');
    unsupportedView.unmount();

    vi.stubGlobal('fetch', mockRecordFetch(Response.json({ code: 'expired_context', message: '생성 권한 확인 시간이 만료되었습니다. 현재 상태를 다시 확인해주세요.' }, { status: 409 })));
    render(<ReasonHarness initial={base}/>);
    await userEvent.setup().click(screen.getByRole('button', { name: '김학생 다시 생성' }));
    expect(await screen.findByText('생성 권한 확인 시간이 만료되었습니다. 현재 상태를 다시 확인해주세요.', { selector: '[data-reason="expired_context"]' })).toBeInTheDocument();
});
