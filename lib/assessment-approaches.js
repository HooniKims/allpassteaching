export const ASSESSMENT_APPROACHES = Object.freeze([
    {
        id: 'backward-design',
        name: '백워드 설계',
        summary: '성취기준과 도착점에서 시작해 성공 증거와 수행 과제를 거꾸로 설계합니다.',
        plainGuide: '학생이 마지막에 무엇을 할 수 있어야 하는지 먼저 정하고, 그에 맞는 과제와 수업을 거꾸로 만드는 방식이에요.',
        flow: ['도착점', '성공 증거', '수행 과제', '수업 지원'],
        useWhen: '단원 전체의 이해·전이 목표를 분명히 하고 싶을 때',
        promptDirective: '도착점 → 수용 가능한 증거 → 수행·지원 계획 순서로 설계하고, 한 번의 결과보다 여러 증거를 연결하세요.',
    },
    {
        id: 'authentic-performance',
        name: '실제적 수행과제',
        summary: '현실의 역할·청중·상황을 두고 지식과 기능의 적용을 확인합니다.',
        plainGuide: '학생이 실제와 비슷한 역할과 상황에서 배운 내용을 실제 상황에 적용해 보게 하는 평가예요.',
        flow: ['실제 상황', '역할·청중', '산출물', '성공 기준'],
        useWhen: '학생이 배운 내용을 실제 맥락에서 적용·설명·제안해야 할 때',
        promptDirective: '분명한 목표·역할·청중·상황·산출물·성공 기준을 제시하고, 실제 맥락에서의 적용과 근거 제시를 평가하세요.',
    },
    {
        id: 'project-based',
        name: '프로젝트 기반 평가',
        summary: '핵심 질문을 중심으로 탐구, 제작, 비평·수정, 공유의 과정을 평가합니다.',
        plainGuide: '하나의 중요한 질문을 오래 탐구하며 만들고, 고치고, 나누는 과정을 함께 보는 평가예요.',
        flow: ['핵심 질문', '탐구·제작', '비평·수정', '공유·성찰'],
        useWhen: '여러 차시에 걸쳐 산출물과 과정 모두를 남기고 싶을 때',
        promptDirective: '도전적인 핵심 질문, 학생 선택, 탐구·제작, 비평·수정, 성찰과 공유 단계를 포함하고 과정 산출물을 증거로 연결하세요.',
    },
    {
        id: 'inquiry-problem-solving',
        name: '탐구·문제해결 평가',
        summary: '문제 설정, 가설·전략, 자료 해석, 해결안 검증의 사고 과정을 봅니다.',
        plainGuide: '답만 보지 않고 학생이 문제를 어떻게 풀고 근거를 어떻게 썼는지 보는 평가예요.',
        flow: ['문제 설정', '가설·전략', '자료 해석', '해결안 검증'],
        useWhen: '과학 탐구·수학적 문제해결·사회 현안 분석처럼 추론 과정이 중요한 때',
        promptDirective: '문제 정의, 가설 또는 해결 전략, 자료·근거 수집, 해석, 결론 또는 해결안 검증을 명시하고 각 단계의 사고 근거를 평가하세요.',
    },
    {
        id: 'portfolio-growth',
        name: '포트폴리오 성장 평가',
        summary: '여러 시점의 산출물과 학생의 선택·성찰을 모아 성장의 근거를 봅니다.',
        plainGuide: '한 번의 결과만 보지 않고 초안부터 수정본까지 학생이 어떻게 달라졌는지 함께 보는 평가예요.',
        flow: ['초기 산출물', '피드백', '수정본', '성찰'],
        useWhen: '초안부터 수정본까지의 변화와 성찰을 평가하고 싶을 때',
        promptDirective: '초기 산출물, 피드백, 수정본, 학생의 선택 이유와 성찰을 포트폴리오 증거로 구성하세요. 성장은 전후 자료가 있을 때만 서술하세요.',
    },
    {
        id: 'discussion-presentation',
        name: '토의·토론·발표 평가',
        summary: '주장과 근거, 경청·응답, 질의응답, 발표 자료를 관찰 가능한 증거로 평가합니다.',
        plainGuide: '말을 잘했는지만 보지 않고, 근거를 들어 말하고 다른 의견에 답하는 모습을 보는 평가예요.',
        flow: ['주장 준비', '근거 제시', '경청·응답', '성찰'],
        useWhen: '구술 표현·논증·협업적 소통이 성취기준의 핵심일 때',
        promptDirective: '주장·근거·반론 또는 질문에 대한 응답·청중을 고려한 표현을 구분하고, 교사 관찰 기록과 발표 산출물을 함께 증거로 사용하세요.',
    },
    {
        id: 'self-peer-feedback',
        name: '자기·동료 피드백 연계',
        summary: '공개된 기준을 활용해 자기 점검과 동료 피드백 뒤 수정한 증거를 봅니다.',
        plainGuide: '학생이 기준을 보고 스스로 점검하고, 친구 의견을 반영해 고친 과정을 보는 평가예요.',
        flow: ['자기 점검', '동료 피드백', '수정', '교사 확인'],
        useWhen: '루브릭 이해와 피드백을 활용한 수정 과정을 학습으로 만들고 싶을 때',
        promptDirective: '자기 점검, 구조화된 동료 피드백, 교사 확인, 수정본과 수정 이유를 포함하세요. 동료 평가는 교사의 최종 판단을 대체하지 않습니다.',
    },
]);

export const ASSESSMENT_APPROACH_IDS = Object.freeze(ASSESSMENT_APPROACHES.map(approach => approach.id));

export function assessmentApproachById(id) {
    return ASSESSMENT_APPROACHES.find(approach => approach.id === id) ?? ASSESSMENT_APPROACHES[0];
}
