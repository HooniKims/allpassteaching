import { test, expect } from 'vitest';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';

function plan(overrides = {}) {
    return {
        title: '식물의 성장 조건', schoolLevel: 'elementary', grade: '5', subject: '과학',
        standards: [{ code: '6과12-01', text: '식물의 성장 조건을 탐구한다.' }],
        learningGoals: ['성장 조건을 설명할 수 있다.'], materials: ['화분'], instructionModel: { id: 'inquiry', name: '탐구·발견 학습', reason: '관찰 중심' },
        sessions: [{ id: 'session-1', order: 1, title: '조건 탐구', sessionMinutes: 40, stages: [
            { phase: '도입', teacherActivities: ['질문한다.'], studentActivities: ['예상한다.'], minutes: 5, materialsAndNotes: [] },
            { phase: '전개', teacherActivities: ['안내한다.'], studentActivities: ['관찰한다.'], minutes: 30, materialsAndNotes: ['안전'] },
            { phase: '정리', teacherActivities: ['정리한다.'], studentActivities: ['설명한다.'], minutes: 5, materialsAndNotes: [] },
        ] }], assessment: [{ element: '관찰', evidence: '기록지', feedback: '즉시 피드백' }], supportStrategies: ['문장 틀 제공'], reflectionPrompt: '다음 수업에서 보완할 점은?', ...overrides,
    };
}

test('accepts a complete plan with exact session minutes', () => expect(lessonPlanSchema.safeParse(plan()).success).toBe(true));
test('rejects a session whose stage minutes do not match', () => {
    const invalid = plan(); invalid.sessions[0].stages[1].minutes = 20;
    expect(lessonPlanSchema.safeParse(invalid).success).toBe(false);
});
