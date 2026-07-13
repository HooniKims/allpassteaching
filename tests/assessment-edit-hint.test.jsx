import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssessmentStage } from '@/components/workflow/AssessmentStage.jsx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';
import { sourceHash } from '@/lib/source-hash';

const request = {
    assessmentName: '식물 기관 탐구 수행평가',
    teacherIntent: { desiredResult: '식물 기관의 구조와 기능을 관찰 근거로 설명한다.', evidenceOfSuccess: '', growthProcess: '' },
    totalPoints: 100, levelCount: 4, includeProcessInScore: true, processWeightPercent: 20,
    outputTypes: ['탐구 보고서'], answerTypes: ['서술형'], stages: { draft: true, checkpoint: true, revision: true, final: true },
    visualAnalysisRequired: false, includeStudentCover: true, additionalRequirements: '',
};

test('생성된 수행평가에서 교사 편집 범위와 확인 상태 변경을 안내한다', () => {
    const lessonPlan = makeGeneratedPlan();
    render(<AssessmentStage lessonPlan={lessonPlan} value={{ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false }} request={request} onRequestChange={() => {}} onChange={() => {}}/>);

    expect(screen.getByText('과제, 루브릭, 학생 안내 표지의 문구와 배점은 아래에서 직접 수정할 수 있어요. 수정하면 확인 완료 상태가 해제됩니다.')).toBeInTheDocument();
});
