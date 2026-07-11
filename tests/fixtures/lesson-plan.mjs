export function makeGeneratedPlan(overrides = {}) {
    return {
        metadata: { date: '', period: '', place: '', className: '', teacherName: '' },
        title: '식물의 구조와 기능', schoolLevel: 'elementary', grade: '5', subject: '과학',
        unitTitle: '식물의 구조와 기능', essentialQuestion: '식물의 각 기관은 생존에 어떤 도움을 줄까?',
        standards: [{ code: '6과11-02', text: '식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.' }],
        learningGoals: ['식물 기관의 구조와 기능을 관찰 결과로 설명할 수 있다.'], materials: ['식물 표본', '관찰 기록지'],
        instructionModel: { id: 'inquiry', name: '탐구·발견 학습', reason: '관찰과 증거 중심 수업' },
        sessions: [{ id: 'session-1', order: 1, title: '식물 기관 관찰', sessionMinutes: 40, nextSessionConnection: '관찰 결과를 식물 기관의 기능과 연결한다.', stages: [
            { phase: '도입', learningElement: '문제 인식 · 가설 설정', teacherActivities: ['질문을 제시한다.'], studentActivities: ['예상한다.'], teacherQuestions: ['식물의 기관은 어떤 일을 할까요?'], expectedStudentResponses: ['기관마다 하는 일이 다를 것 같습니다.'], supportNotes: [], minutes: 5, materialsAndNotes: [] },
            { phase: '전개', learningElement: '탐구 수행 · 식물 기관 관찰', teacherActivities: ['관찰을 안내한다.'], studentActivities: ['관찰하고 기록한다.'], teacherQuestions: ['관찰한 구조에서 어떤 특징을 찾았나요?'], expectedStudentResponses: ['뿌리에는 가는 털이 있습니다.'], supportNotes: ['관찰 문장 틀을 제공한다.'], minutes: 30, materialsAndNotes: ['안전하게 다룬다.'] },
            { phase: '정리', learningElement: '결론 · 관찰 결과 공유', teacherActivities: ['핵심을 정리한다.'], studentActivities: ['결과를 설명한다.'], teacherQuestions: ['관찰 결과로 알게 된 점은 무엇인가요?'], expectedStudentResponses: ['기관의 구조와 기능이 관련되어 있습니다.'], supportNotes: [], minutes: 5, materialsAndNotes: [] },
        ] }],
        assessment: [{ element: '관찰 결과 설명', method: '관찰 및 산출물 확인', evidence: '관찰 기록지', feedback: '근거를 구체화하도록 피드백한다.', levelFeedback: { needsSupport: '관찰 문장 틀로 구조를 설명하도록 돕는다.', meets: '구조와 기능을 연결해 설명하도록 한다.', exceeds: '여러 기관을 비교해 설명하도록 한다.' } }],
        supportStrategies: ['관찰 문장 틀을 제공한다.'], reflectionPrompt: '학생이 증거를 바탕으로 설명했는가?', ...overrides,
    };
}

export function makeTwoSessionPlan() {
    const plan = makeGeneratedPlan();
    const secondSession = structuredClone(plan.sessions[0]);
    secondSession.id = 'session-2';
    secondSession.order = 2;
    secondSession.title = '식물 기관의 기능 설명';
    return { ...plan, sessions: [...plan.sessions, secondSession] };
}

export const generationDraft = {
    basics: { schoolLevel: 'elementary', grade: '5', subject: '과학', subjectMode: 'official', displaySubject: '과학', mappedSubjects: ['과학'], mode: 'single', sessions: 1, sessionMinutes: 40, intent: '식물 기관을 관찰하고 구조와 기능을 설명한다.', studentNeeds: '', metadata: { date: '', period: '', place: '', className: '', teacherName: '' } },
    standards: [{ code: '6과11-02', text: '식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.' }],
    instructionModel: { id: 'inquiry', name: '탐구·발견 학습', stages: ['문제 인식', '가설 설정', '탐구 수행', '결론'] },
};
