export function makeGeneratedPlan(overrides = {}) {
    return {
        title: '식물의 구조와 기능', schoolLevel: 'elementary', grade: '5', subject: '과학',
        standards: [{ code: '6과11-02', text: '식물의 각 기관의 구조와 기능을 설명할 수 있다.' }],
        learningGoals: ['식물 기관의 구조와 기능을 관찰 결과로 설명할 수 있다.'], materials: ['식물 표본', '관찰 기록지'],
        instructionModel: { id: 'inquiry', name: '탐구·발견 학습', reason: '관찰과 증거 중심 수업' },
        sessions: [{ id: 'session-1', order: 1, title: '식물 기관 관찰', sessionMinutes: 40, stages: [
            { phase: '도입', teacherActivities: ['질문을 제시한다.'], studentActivities: ['예상한다.'], minutes: 5, materialsAndNotes: [] },
            { phase: '전개', teacherActivities: ['관찰을 안내한다.'], studentActivities: ['관찰하고 기록한다.'], minutes: 30, materialsAndNotes: ['안전하게 다룬다.'] },
            { phase: '정리', teacherActivities: ['핵심을 정리한다.'], studentActivities: ['결과를 설명한다.'], minutes: 5, materialsAndNotes: [] },
        ] }],
        assessment: [{ element: '관찰 결과 설명', evidence: '관찰 기록지', feedback: '근거를 구체화하도록 피드백한다.' }],
        supportStrategies: ['관찰 문장 틀을 제공한다.'], reflectionPrompt: '학생이 증거를 바탕으로 설명했는가?', ...overrides,
    };
}

export const generationDraft = {
    basics: { schoolLevel: 'elementary', grade: '5', subject: '과학', mode: 'single', sessions: 1, sessionMinutes: 40, intent: '식물 기관을 관찰하고 구조와 기능을 설명한다.', studentNeeds: '' },
    standards: [{ code: '6과11-02', text: '식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.' }],
    instructionModel: { id: 'inquiry', name: '탐구·발견 학습', stages: ['문제 인식', '탐구 수행', '결론'] },
};
