function guide(stages, teacherMoves, studentEvidence, antiPatterns, sources) {
    return Object.freeze({ stages, teacherMoves, studentEvidence, antiPatterns, sources });
}

export const instructionModelGuides = Object.freeze({
    direct: guide(
        ['설명', '시범', '안내된 연습', '독립 연습'],
        ['학습 목표와 절차를 짧고 명료하게 설명한다.', '사고 과정을 말로 드러내며 정확한 수행을 시범 보인다.', '단계별 단서와 즉각 피드백으로 함께 연습한다.', '도움을 줄이고 개별 수행과 전이를 확인한다.'],
        ['절차를 자신의 말로 재진술한다.', '관찰 기준에 따라 시범의 핵심을 기록한다.', '단서에 따라 수행하고 오류를 고친다.', '도움 없이 완성한 수행 결과를 제출한다.'],
        ['교사 설명만 이어지고 학생의 안내된 연습과 독립 수행이 없는 흐름'],
        [{ title: 'IES Practice Guide: Organizing Instruction and Study', url: 'https://ies.ed.gov/ncee/wwc/PracticeGuide/1' }],
    ),
    concept: guide(
        ['사례 제시', '속성 탐색', '개념 명명', '적용'],
        ['정례와 비례를 함께 제시한다.', '사례를 비교하도록 질문해 결정적 속성을 찾게 한다.', '학생이 찾은 속성을 개념어와 정의로 정교화한다.', '새 사례의 포함 여부를 근거로 판단하게 한다.'],
        ['사례를 분류한다.', '공통점과 차이점 표를 만든다.', '속성에 근거해 개념을 정의한다.', '새 사례를 분류하고 이유를 설명한다.'],
        ['개념 정의를 먼저 암기시킨 뒤 같은 예만 반복하는 흐름'],
        [{ title: 'Cornell Concept Mapping', url: 'https://teaching.cornell.edu/teaching-resources/assessment-evaluation/concept-maps' }],
    ),
    inquiry: guide(
        ['문제 인식', '가설 설정', '탐구 수행', '결론'],
        ['관찰 가능한 현상에서 탐구 문제를 도출하게 한다.', '검증 가능한 가설과 근거를 구분해 묻는다.', '변인·절차·증거 수집과 안전을 점검한다.', '증거가 가설을 지지하는지 검토하고 한계를 묻는다.'],
        ['탐구 질문을 만든다.', '가설과 예상 근거를 기록한다.', '관찰·측정 자료를 수집하고 해석한다.', '증거 기반 결론과 남은 질문을 제시한다.'],
        ['교사가 결론을 먼저 설명하고 학생이 확인 활동만 하는 흐름'],
        [{ title: '교수학습 모형 분류 연구', url: 'https://dcoll.ajou.ac.kr/dcollection/srch/srchDetail/000000029737' }],
    ),
    'problem-solving': guide(
        ['문제 이해', '계획', '실행', '반성'],
        ['실제적이고 열린 문제의 조건과 목표를 명료화한다.', '이미 아는 것과 더 알아야 할 것을 구분하게 한다.', '여러 전략을 시도하고 근거를 기록하도록 코칭한다.', '해결안의 효과와 다른 적용 가능성을 평가하게 한다.'],
        ['문제를 자신의 말로 정의한다.', '필요 지식과 해결 계획을 만든다.', '전략을 실행하고 결과를 비교한다.', '해결 과정과 개선점을 설명한다.'],
        ['정답과 절차가 이미 정해진 연습문제를 열린 문제로 포장하는 흐름'],
        [{ title: 'Cornell Problem-Based Learning', url: 'https://teaching.cornell.edu/teaching-resources/active-collaborative-learning/problem-based-learning' }],
    ),
    project: guide(
        ['주제 선정', '계획', '실행', '공유·성찰'],
        ['성취기준과 연결된 실제적 주제와 최종 산출물 기준을 안내한다.', '역할·일정·자료·중간 점검 계획을 구체화하게 한다.', '진행 증거를 확인하고 필요한 자원과 피드백을 제공한다.', '공유 대상의 반응과 평가 기준으로 과정과 결과를 성찰하게 한다.'],
        ['탐구할 주제와 산출물을 선택한다.', '역할·일정·자료 계획표를 만든다.', '조사·제작·수정을 반복하고 진행 기록을 남긴다.', '산출물을 공유하고 동료 피드백으로 개선점을 찾는다.'],
        ['예쁜 결과물 제작만 남고 성취기준·탐구 과정·중간 피드백이 없는 흐름'],
        [{ title: 'Cornell Designing Longer-Term Team Projects', url: 'https://teaching.cornell.edu/teaching-resources/active-collaborative-learning/collaborative-learning/designing-longer-term-team-projects' }],
    ),
    cooperative: guide(
        ['과제 안내', '역할 분담', '협력 수행', '상호 평가'],
        ['공동 목표와 개인 책무가 모두 보이는 과제를 안내한다.', '역할별 책임과 상호의존 관계를 확인한다.', '참여 균형과 설명·질문·도움 행동을 관찰해 코칭한다.', '개인 학습과 모둠 협력 과정을 함께 평가하게 한다.'],
        ['공동 목표와 성공 기준을 확인한다.', '역할을 정하고 각자의 기여 계획을 말한다.', '서로 설명하고 확인하며 공동 산출물을 만든다.', '자기·동료 기여와 협력 과정을 근거로 평가한다.'],
        ['한 학생이 대부분 수행하고 나머지는 결과만 공유하는 무임승차 구조'],
        [{ title: 'Cornell Collaborative Learning', url: 'https://teaching.cornell.edu/teaching-resources/active-collaborative-learning/collaborative-learning' }],
    ),
    discussion: guide(
        ['쟁점 확인', '근거 탐색', '토의·토론', '정리'],
        ['여러 관점이 가능한 쟁점과 안전한 대화 규칙을 제시한다.', '주장과 근거의 출처·관련성을 점검하게 한다.', '발언 균형과 반론·재반론을 촉진하는 질문을 한다.', '합의점·차이점·입장 변화를 근거와 함께 정리하게 한다.'],
        ['쟁점과 자신의 잠정 입장을 적는다.', '자료에서 주장 근거와 반대 근거를 찾는다.', '경청·질문·반론으로 관점을 비교한다.', '논의 결과와 남은 쟁점을 정리한다.'],
        ['근거 없이 찬반 의견만 차례로 말하거나 교사가 결론을 대신 정하는 흐름'],
        [{ title: 'Cornell Active Learning', url: 'https://teaching.cornell.edu/teaching-resources/active-collaborative-learning/active-learning' }],
    ),
    simulation: guide(
        ['상황 안내', '역할 준비', '실행', '성찰'],
        ['학습 목표와 연결된 상황·역할·규칙·안전 장치를 명확히 안내한다.', '역할의 관점과 사용할 자료를 준비하게 한다.', '개입을 최소화하되 규칙과 학습 초점을 지키도록 지원한다.', '역할에서 벗어나 실제 개념·관점·의사결정을 성찰하게 한다.'],
        ['상황과 역할의 목표를 확인한다.', '역할 자료를 분석하고 행동 계획을 세운다.', '상황 속에서 결정하고 다른 역할과 상호작용한다.', '경험을 개념과 연결해 판단의 이유와 변화를 설명한다.'],
        ['재미있는 연기에 머물고 명확한 학습 목표와 디브리핑이 없는 흐름'],
        [{ title: 'UNSW Role Plays and Simulations', url: 'https://www.teaching.unsw.edu.au/assessing-role-play-and-simulation' }],
    ),
    experiment: guide(
        ['안전·문제 확인', '실험 설계', '실행·관찰', '결과 해석'],
        ['안전 규칙과 탐구 문제·측정 기준을 확인한다.', '변인·도구·절차와 기록 방법을 검토한다.', '안전한 조작과 정확한 관찰·측정을 코칭한다.', '자료의 패턴·오차·한계를 근거로 해석하게 한다.'],
        ['안전과 문제를 자신의 말로 확인한다.', '절차와 기록표를 설계한다.', '조작·관찰·측정 결과를 빠짐없이 기록한다.', '자료로 결론을 설명하고 오차와 개선점을 찾는다.'],
        ['요리책처럼 절차만 따라 하고 예상·측정·해석이 없는 실습'],
        [{ title: 'UNSW Laboratory Teaching', url: 'https://www.teaching.unsw.edu.au/laboratory-teaching' }],
    ),
    'design-thinking': guide(
        ['공감', '문제 정의', '아이디어', '시제품·검증'],
        ['사용자의 말과 행동을 관찰·질문하게 한다.', '수집한 정보에서 필요와 통찰을 한 문장 문제로 정리하게 한다.', '판단을 늦추고 다양한 해결 아이디어를 확장하게 한다.', '빠른 시제품을 실제 사용자 반응으로 시험하고 반복하게 한다.'],
        ['사용자 관찰·인터뷰 기록을 만든다.', '사용자 필요가 드러나는 문제 정의문을 만든다.', '다양한 아이디어를 시각화하고 선택 근거를 남긴다.', '시제품과 사용자 피드백을 근거로 수정한다.'],
        ['사용자 공감 없이 교사가 정한 문제의 장식적 결과물만 만드는 흐름'],
        [{ title: 'Stanford d.school Design Thinking Bootleg', url: 'https://dschool.stanford.edu/tools/design-thinking-bootleg' }],
    ),
    blended: guide(
        ['사전 학습', '확인', '적용 활동', '피드백'],
        ['짧고 접근 가능한 사전 자료와 명확한 과제를 제공한다.', '사전 학습 증거와 오개념을 빠르게 확인한다.', '교실 시간을 고차적 적용·협력·문제 해결에 사용한다.', '수행 증거에 맞춘 즉각 피드백과 후속 학습을 연결한다.'],
        ['사전 자료를 자신의 속도로 학습하고 질문을 남긴다.', '핵심 개념 확인에 응답한다.', '교실에서 개념을 적용하고 동료와 해결한다.', '피드백으로 오개념을 고치고 후속 과제를 수행한다.'],
        ['사전 영상 시청 여부만 확인하고 교실에서 같은 내용을 다시 강의하는 흐름'],
        [{ title: 'University of Florida Flipping a Class', url: 'https://citt.ufl.edu/resources/student-engagement/adopting-active-learning-approaches/flipping-a-class/' }],
    ),
    'subject-specific': guide(
        ['맥락 확인', '교과 탐구', '표현·적용', '성찰'],
        ['교과의 핵심 개념과 고유한 탐구·표현 관습을 확인한다.', '교과 자료와 도구를 사용해 사고 과정을 코칭한다.', '교과에 맞는 언어·기호·작품·수행으로 적용하게 한다.', '교과 기준에 따라 과정과 결과를 성찰하게 한다.'],
        ['교과 맥락과 핵심 질문을 확인한다.', '교과 고유 자료·도구·방법으로 탐구한다.', '교과의 표현 방식으로 결과를 적용·공유한다.', '교과 기준으로 자기 수행과 다음 학습을 점검한다.'],
        ['과목 이름만 바꾸고 모든 교과에 동일한 일반 활동을 적용하는 흐름'],
        [{ title: 'KERIS 교육혁신 선도교사 교수학습 자료', url: 'https://educator.keris.or.kr/hp/hm/htmlConvert.do?menuId=3000001728' }],
    ),
});

export function instructionModelGuide(modelId) {
    const value = instructionModelGuides[modelId];
    if (!value) throw new Error(`지원하지 않는 수업 모형입니다: ${modelId}`);
    return value;
}
