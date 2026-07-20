export function makeGeneratedPlan(overrides = {}) {
    return {
        metadata: { date: '', period: '', place: '', className: '', teacherName: '' },
        title: '식물의 구조와 기능', schoolLevel: 'elementary', grade: '5', subject: '과학',
        unitTitle: '식물의 구조와 기능', essentialQuestion: '식물의 각 기관은 생존에 어떤 도움을 줄까?',
        standards: [{ code: '6과11-02', text: '식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.', subject: '과학' }],
        learningGoals: ['식물 기관의 구조와 기능을 관찰 결과로 설명할 수 있다.'], materials: ['식물 표본', '관찰 기록지'],
        instructionModel: { id: 'inquiry', name: '탐구·발견 학습', reason: '관찰과 증거 중심 수업' },
        sessions: [{ id: 'session-1', order: 1, title: '식물 기관 관찰', sessionMinutes: 40, nextSessionConnection: '관찰 결과를 식물 기관의 기능과 연결한다.', stages: [
            { phase: '도입', learningElement: '문제 인식 · 가설 설정', teacherActivities: ['문제 인식: 질문을 제시한다.', '가설 설정: 식물 사진을 보여주고 예상 근거를 묻는다.'], studentActivities: ['문제 인식: 관찰할 문제를 확인한다.', '가설 설정: 예상하고 친구와 근거를 나눈다.'], teacherQuestions: ['식물의 기관은 어떤 일을 할까요?'], expectedStudentResponses: ['기관마다 하는 일이 다를 것 같습니다.'], supportNotes: [], minutes: 5, materialsAndNotes: [], remarks: [] },
            { phase: '전개', learningElement: '탐구 수행 · 식물 기관 관찰', teacherActivities: ['탐구 수행: 관찰을 안내한다.', '탐구 수행: 근거를 기록하도록 돕는다.'], studentActivities: ['탐구 수행: 관찰하고 기록한다.', '탐구 수행: 모둠의 기록을 비교한다.'], teacherQuestions: ['관찰한 구조에서 어떤 특징을 찾았나요?'], expectedStudentResponses: ['뿌리에는 가는 털이 있습니다.'], supportNotes: ['관찰 문장 틀을 제공한다.'], minutes: 30, materialsAndNotes: ['안전하게 다룬다.'], remarks: ['모둠별 관찰 순서를 확인한다.'] },
            { phase: '정리', learningElement: '결론 · 관찰 결과 공유', teacherActivities: ['결론: 핵심을 정리한다.', '결론: 관찰 근거를 공유하게 한다.'], studentActivities: ['결론: 결과를 설명한다.', '결론: 다른 모둠과 비교한다.'], teacherQuestions: ['관찰 결과로 알게 된 점은 무엇인가요?'], expectedStudentResponses: ['기관의 구조와 기능이 관련되어 있습니다.'], supportNotes: [], minutes: 5, materialsAndNotes: [], remarks: [] },
        ] }],
        assessment: [{ element: '관찰 결과 설명', method: '관찰 및 산출물 확인', evidence: '관찰 기록지', feedback: '근거를 구체화하도록 피드백한다.', levelFeedback: { needsSupport: '관찰 문장 틀로 구조를 설명하도록 돕는다.', meets: '구조와 기능을 연결해 설명하도록 한다.', exceeds: '여러 기관을 비교해 설명하도록 한다.' } }],
        supportStrategies: ['관찰 문장 틀을 제공한다.'], reflectionPrompt: '학생이 증거를 바탕으로 설명했는가?',
        detailedPlan: {
            teacherIntent: '학생이 식물 기관의 생김새를 단순히 외우는 데 그치지 않고, 직접 관찰한 증거를 바탕으로 구조와 기능의 관계를 설명하도록 지도한다.',
            unitOverview: '이 단원은 식물의 뿌리, 줄기, 잎과 꽃의 구조를 관찰하고 각 기관이 생존과 번식에 하는 일을 이해하도록 구성된다. 실제 식물 관찰을 통해 생명 시스템의 상호 관련성을 탐구한다.',
            unitGoals: ['식물 기관의 구조와 기능을 관찰 결과로 설명할 수 있다.', '관찰 계획을 세우고 결과를 기록하며 생명을 존중하는 태도로 탐구할 수 있다.'],
            learnerAnalysis: '학생들은 식물의 기관 이름은 알고 있으나 구조와 기능을 관찰 근거로 연결하는 데 어려움을 보일 수 있다. 관찰 초점과 문장 틀을 제공해 근거 중심 설명을 지원한다.',
            teachingStrategy: '탐구·발견 학습의 문제 인식, 가설 설정, 탐구 수행, 결론 단계를 적용한다. 실물 관찰과 모둠 대화를 연결하고 각 단계에서 관찰 기록을 형성평가 자료로 활용한다.',
            unitSequence: [
                { session: '1차시', topic: '식물 기관 살펴보기', learningGoal: '식물 기관을 구분하고 탐구 문제를 정할 수 있다.', focus: '선개념 확인과 탐구 질문 만들기' },
                { session: '2차시', topic: '뿌리와 줄기 관찰', learningGoal: '뿌리와 줄기의 구조를 관찰해 기능을 추론할 수 있다.', focus: '관찰 근거를 기록하고 설명하기' },
                { session: '3차시', topic: '잎과 꽃 관찰', learningGoal: '잎과 꽃의 구조와 기능을 설명할 수 있다.', focus: '기관 사이의 관계를 종합하기' },
            ],
            boardPlan: ['왼쪽에 핵심 질문과 가설, 가운데에 기관별 관찰 근거, 오른쪽에 구조와 기능의 관계를 정리한다.', '모둠별 관찰 결과를 공통점과 차이점으로 나누어 화면에 공유한다.'],
            references: ['2022 개정 과학과 교육과정', '초등학교 과학 교사용 지도서'],
        },
        ...overrides,
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

export function makeLanguageScienceIntegratedPlan() {
    return makeGeneratedPlan({
        title: '생태계 보전 제안문 쓰기',
        subject: '국어',
        standards: [
            { code: '6국03-04', text: '적절한 근거와 알맞은 표현을 사용하여 주장하는 글을 쓴다.', subject: '국어' },
            { code: '6과16-01', text: '생태계 구성 요소의 관계를 이해하고 환경 보전의 필요성을 설명할 수 있다.', subject: '과학' },
        ],
        instructionModel: { id: 'integrated', name: '융합수업', reason: '두 교과의 근거를 연결한 공동 제안문을 만든다.' },
    });
}

export const generationDraft = {
    basics: { schoolLevel: 'elementary', grade: '5', subject: '과학', subjectMode: 'official', displaySubject: '과학', mappedSubjects: ['과학'], mode: 'single', sessions: 1, sessionMinutes: 40, intent: '식물 기관을 관찰하고 구조와 기능을 설명한다.', studentNeeds: '', metadata: { date: '', period: '', place: '', className: '', teacherName: '' } },
    standards: [{ code: '6과11-02', text: '식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.', subject: '과학' }],
    instructionModel: { id: 'inquiry', name: '탐구·발견 학습', stages: ['문제 인식', '가설 설정', '탐구 수행', '결론'] },
};
