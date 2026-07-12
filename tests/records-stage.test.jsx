import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordsStage } from '@/components/workflow/RecordsStage.jsx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';
import { gradingSourceHash } from '@/lib/workflow-lineage';

afterEach(() => vi.restoreAllMocks());
const grading = { criteria: [
    { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털', feedback: '구체적입니다.' },
    { criterionId: 'criterion-2', score: 35, evidence: '물을 흡수한다', feedback: '연결했습니다.' },
    { criterionId: 'criterion-3', score: 15, evidence: '관찰 결과', feedback: '수정 과정을 확인했습니다.' },
], totalScore: 85, summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명합니다.' };
const assessment = makeAssessment();
const submissions = [
    { id: 's1', studentName: '김학생', approved: true, extractedText: '관찰 결과 뿌리에 가는 털이 있고 물을 흡수한다.', grading },
    { id: 's2', studentName: '이학생', approved: false, extractedText: '관찰 결과 미승인 내용입니다.', grading },
].map(item => ({ ...item, sourceHash: gradingSourceHash(assessment, item.extractedText) }));
const generatedText = '관찰한 식물 기관의 특징을 구체적으로 기록하고 뿌리의 구조와 기능을 근거로 연결하여 설명함. 관찰 사실에서 결론을 이끌어내는 교과 탐구 과정이 드러남.';

function Harness() { const [records, setRecords] = useState([]); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} submissions={submissions} records={records} onChange={setRecords}/>; }

test('shows only approved students and saves an editable generated draft', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ record: { text: generatedText } })));
    render(<Harness/>);

    expect(screen.getByText('김학생')).toBeInTheDocument();
    expect(screen.queryByText('이학생')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '김학생 세특 생성' }));

    expect(await screen.findByDisplayValue(generatedText)).toBeInTheDocument();
    expect(screen.getByText(`${generatedText.length}자 / 500자`)).toBeInTheDocument();
});

test('batch generation isolates a student failure', async () => {
    const approved = [...submissions, { ...submissions[0], id: 's3', studentName: '박학생' }];
    function BatchHarness() { const [records, setRecords] = useState([]); return <RecordsStage lessonPlan={makeGeneratedPlan()} assessment={assessment} submissions={approved} records={records} onChange={setRecords}/>; }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ record: { text: generatedText } })).mockResolvedValueOnce(Response.json({ message: '생성 실패' }, { status: 503 })));
    const user = userEvent.setup(); render(<BatchHarness/>);
    await user.click(screen.getByRole('button', { name: '미생성 학생 전체 생성' }));

    expect(await screen.findByDisplayValue(generatedText)).toBeInTheDocument();
    expect(await screen.findByText('생성 실패')).toBeInTheDocument();
});
