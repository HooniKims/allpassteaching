import { describe, expect, test } from 'vitest';
import { assessmentOutputSchema } from '@/lib/assessment-schema';
import { makeAssessment } from './fixtures/workflow.mjs';

describe('백워드 설계 수행평가 계약', () => {
    test('Given 교사가 정한 총점과 과정 비중 When 완성된 평가를 검증하면 Then 총점·과정 배점·수준 점수 사다리를 허용한다', () => {
        const assessment = makeAssessment();

        expect(assessmentOutputSchema.safeParse(assessment).success).toBe(true);
        expect(assessment.scoring.processTargetPoints).toBe(20);
        expect(assessment.rubric.criteria.filter(item => item.kind === 'process').reduce((sum, item) => sum + item.maxPoints, 0)).toBe(20);
    });

    test('Given 과정 점수를 포함한 평가 When 과정 영역 합계가 반올림 목표와 다르면 Then 승인을 막는다', () => {
        const assessment = makeAssessment();
        assessment.rubric.criteria.find(item => item.kind === 'process').maxPoints = 19;

        const parsed = assessmentOutputSchema.safeParse(assessment);

        expect(parsed.success).toBe(false);
        expect(parsed.error.issues.some(issue => issue.message.includes('과정'))).toBe(true);
    });

    test('Given 과정 점수를 제외한 평가 When 과정 평가영역이 남아 있으면 Then 승인을 막는다', () => {
        const assessment = makeAssessment();
        assessment.scoring = { includeProcessInScore: false, processWeightPercent: 0, processTargetPoints: 0 };

        const parsed = assessmentOutputSchema.safeParse(assessment);

        expect(parsed.success).toBe(false);
        expect(parsed.error.issues.some(issue => issue.message.includes('과정 평가영역'))).toBe(true);
    });

    test('Given 선택한 성취기준과 평가영역 When 연결표에서 하나라도 빠지면 Then 누락된 연결을 거부한다', () => {
        const assessment = makeAssessment();
        assessment.backwardDesign.evidenceMap[0].criterionIds = ['criterion-1'];

        const parsed = assessmentOutputSchema.safeParse(assessment);

        expect(parsed.success).toBe(false);
        expect(parsed.error.issues.some(issue => issue.message.includes('연결표'))).toBe(true);
    });

    test('Given 평가영역의 수준별 점수 When 점수가 중복되거나 내림차순이 아니면 Then 거부한다', () => {
        const assessment = makeAssessment();
        assessment.rubric.criteria[0].levels[1].score = assessment.rubric.criteria[0].levels[0].score;

        const parsed = assessmentOutputSchema.safeParse(assessment);

        expect(parsed.success).toBe(false);
        expect(parsed.error.issues.some(issue => issue.message.includes('높은 점수부터'))).toBe(true);
    });

    test('Given 표지 섹션 When id나 순서가 중복되면 Then 안정적인 편집 계약을 거부한다', () => {
        const assessment = makeAssessment();
        assessment.cover.sections[1].id = assessment.cover.sections[0].id;
        assessment.cover.sections[1].order = assessment.cover.sections[0].order;

        const parsed = assessmentOutputSchema.safeParse(assessment);

        expect(parsed.success).toBe(false);
        expect(parsed.error.issues.some(issue => issue.message.includes('표지'))).toBe(true);
    });

    test('Given 전체 수행 흐름 When 피드백과 수정 체크포인트가 없으면 Then 백워드 설계를 거부한다', () => {
        const assessment = makeAssessment();
        assessment.backwardDesign.checkpoints = [];

        expect(assessmentOutputSchema.safeParse(assessment).success).toBe(false);
    });

    test('Given 첫 질문만 필수인 요청 When AI 제안을 건너뛰면 Then 빈 두 보조 답변을 보존해도 평가 계약은 유효하다', () => {
        const assessment = makeAssessment();
        assessment.backwardDesign.teacherIntent.evidenceOfSuccess = '';
        assessment.backwardDesign.teacherIntent.growthProcess = '';

        expect(assessmentOutputSchema.safeParse(assessment).success).toBe(true);
    });
});
