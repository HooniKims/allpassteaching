import { describe, expect, test } from 'vitest';
import { assessmentOutputSchema } from '@/lib/assessment-schema';
import { makeAssessment } from './fixtures/workflow.mjs';

describe('백워드 설계 수행평가 계약', () => {
    test('Given 교사가 정한 총점과 과정 비중 When 완성된 평가를 검증하면 Then 총점·과정 배점·수준 점수 사다리를 허용한다', () => {
        const assessment = makeAssessment();

        const parsed = assessmentOutputSchema.safeParse(assessment);

        expect(parsed.success).toBe(true);
        expect(parsed.data.task.goal).toBe(assessment.task.goal);
        expect(parsed.data.task.successCriteria).toBe(assessment.task.successCriteria);
        expect(assessment.scoring.processTargetPoints).toBe(20);
        expect(assessment.rubric.criteria.filter(item => item.kind === 'process').reduce((sum, item) => sum + item.maxPoints, 0)).toBe(20);
    });

    test('Given GRASPS 수행과제 When 목표나 성공 기준이 빠지면 Then 여섯 요소 계약을 거부한다', () => {
        const missingGoal = makeAssessment();
        const missingSuccessCriteria = makeAssessment();
        delete missingGoal.task.goal;
        delete missingSuccessCriteria.task.successCriteria;

        expect(assessmentOutputSchema.safeParse(missingGoal).success).toBe(false);
        expect(assessmentOutputSchema.safeParse(missingSuccessCriteria).success).toBe(false);
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

    test('Given 두 성취기준의 평가영역 When 연결표가 서로 바뀌면 Then 집합만 덮어도 거부한다', () => {
        const assessment = makeAssessment();
        assessment.task.standards.push({ code: '6과11-03', text: '생물과 환경의 관계를 설명한다.' });
        assessment.rubric.criteria[1].standardCodes = ['6과11-03'];
        assessment.rubric.criteria[2].standardCodes = ['6과11-03'];
        assessment.backwardDesign.evidenceMap = [
            { ...assessment.backwardDesign.evidenceMap[0], standardCode: '6과11-02', criterionIds: ['criterion-2'] },
            { ...assessment.backwardDesign.evidenceMap[0], standardCode: '6과11-03', criterionIds: ['criterion-1', 'criterion-3'] },
        ];

        expect(assessmentOutputSchema.safeParse(assessment).success).toBe(false);
    });

    test('Given 같은 성취기준 연결 행이 중복되면 Then 양방향 증거맵을 거부한다', () => {
        const assessment = makeAssessment();
        assessment.backwardDesign.evidenceMap.push(structuredClone(assessment.backwardDesign.evidenceMap[0]));

        expect(assessmentOutputSchema.safeParse(assessment).success).toBe(false);
    });

    test('Given 최종본만 있는 체크포인트 When 피드백 뒤 수정 단계가 없으면 Then 거부한다', () => {
        const assessment = makeAssessment();
        assessment.backwardDesign.checkpoints = [{ id: 'only-final', title: '최종 제출', evidence: '최종본', feedbackPurpose: '최종 결과 확인', order: 1 }];

        expect(assessmentOutputSchema.safeParse(assessment).success).toBe(false);
    });

    test('Given AI가 임의 blocking 코드를 만들면 Then 알려진 수선 가능한 경고만 허용한다', () => {
        const assessment = makeAssessment();
        assessment.backwardDesign.alignmentIssues = [{ id: 'ai-block', severity: 'blocking', code: 'invented-danger', message: 'AI 임의 차단', resolved: false }];

        expect(assessmentOutputSchema.safeParse(assessment).success).toBe(false);
    });

    test('Given 평가영역이 두 성취기준을 선언하면 Then 두 pair가 각각 정확히 한 번 연결되어야 한다', () => {
        const assessment = makeAssessment();
        assessment.task.standards.push({ code: '6과11-03', text: '생물과 환경의 관계를 설명한다.' });
        assessment.rubric.criteria[0].standardCodes = ['6과11-02', '6과11-03'];
        assessment.rubric.criteria[1].standardCodes = ['6과11-03'];
        assessment.backwardDesign.evidenceMap = [
            { ...assessment.backwardDesign.evidenceMap[0], standardCode: '6과11-02', criterionIds: ['criterion-1'], taskEvidenceTypes: [assessment.rubric.criteria[0].evidence], evidenceTypes: ['결과 증거'], scoreBasis: '관찰 근거 40점 · 수준별 정의 점수' },
            { ...assessment.backwardDesign.evidenceMap[0], standardCode: '6과11-03', criterionIds: ['criterion-2'], taskEvidenceTypes: [assessment.rubric.criteria[1].evidence], evidenceTypes: ['결과 증거'], scoreBasis: '구조와 기능 설명 40점 · 수준별 정의 점수' },
        ];

        expect(assessmentOutputSchema.safeParse(assessment).success).toBe(false);
    });

    test('Given 15개 평가영역이 한 성취기준에 연결되면 Then 실제 최대 계약으로 유효하다', () => {
        const assessment = makeAssessment();
        assessment.totalPoints = 150;
        assessment.scoring = { includeProcessInScore: false, processWeightPercent: 0, processTargetPoints: 0 };
        assessment.rubric.criteria = Array.from({ length: 15 }, (_, index) => ({ ...structuredClone(assessment.rubric.criteria[0]), id: `criterion-${index + 1}`, name: `영역 ${index + 1}`, kind: 'outcome', maxPoints: 10, intervalPoints: 1, evidence: `증거 ${index + 1}`, levels: assessment.rubric.levels.map((level, levelIndex) => ({ levelId: level.id, score: 10 - levelIndex, description: `수행 ${levelIndex + 1}` })) }));
        assessment.backwardDesign.evidenceMap = [{ standardCode: '6과11-02', taskEvidenceTypes: assessment.rubric.criteria.map(item => item.evidence), criterionIds: assessment.rubric.criteria.map(item => item.id), evidenceTypes: ['결과 증거'], scoreBasis: `${assessment.rubric.criteria.map(item => `${item.name} 10점`).join(', ')} · 수준별 정의 점수` }];

        expect(assessmentOutputSchema.safeParse(assessment).success).toBe(true);
    });

    test('Given 학생 표지를 쓰면 Then self-checklist도 보이는 singleton으로 필요하다', () => {
        const missing = makeAssessment();
        missing.cover.sections = missing.cover.sections.filter(section => section.type !== 'self-checklist');
        const duplicate = makeAssessment();
        duplicate.cover.sections.push({ ...duplicate.cover.sections.find(section => section.type === 'self-checklist'), id: 'check-2', order: 9 });

        expect(assessmentOutputSchema.safeParse(missing).success).toBe(false);
        expect(assessmentOutputSchema.safeParse(duplicate).success).toBe(false);
    });

    test('Given AI가 예시 문항을 그대로 복사하면 Then 실제 문제지로 승인하지 않는다', () => {
        const assessment = makeAssessment();
        assessment.studentSheet.document.sections.forEach(section => section.questions.forEach(question => {
            question.prompt = `${section.title}에서 학생이 직접 수행하고 기록할 문항`;
        }));

        const parsed = assessmentOutputSchema.safeParse(assessment);

        expect(parsed.success).toBe(false);
        expect(parsed.error.issues.some(issue => issue.message.includes('구체적인 실제 문항'))).toBe(true);
    });
});
