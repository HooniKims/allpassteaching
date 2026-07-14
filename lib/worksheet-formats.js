function format(id, name, guide, easyDescription, sections, modelIds) {
    return Object.freeze({ id, name, guide, easyDescription, sections, modelIds });
}

export const worksheetFormats = Object.freeze([
    format('guided-practice', '설명·연습 학습지', '설명 확인 뒤 안내된 연습에서 독립 수행으로 도움을 줄인다.', '교사가 먼저 설명하고, 학생이 따라 해 본 뒤 혼자 풀어 보게 할 때 알맞아요.', ['핵심 설명 확인', '안내된 연습', '독립 연습'], ['direct']),
    format('concept-comparison', '개념 비교·적용지', '정례와 비례를 비교해 결정적 속성을 찾고 새 사례에 적용한다.', '두 개념을 나란히 살펴 차이를 찾고 새 상황에 적용해 보게 할 때 좋아요.', ['사례 분류', '속성 비교', '개념 적용'], ['concept']),
    format('inquiry-experiment', '탐구·실험 기록지', '문제, 가설, 변인, 관찰 자료, 증거 기반 결론을 한 흐름으로 남긴다.', '학생이 스스로 질문하고 관찰·실험한 내용을 순서대로 기록하게 할 때 좋아요.', ['문제와 가설', '탐구·관찰 기록', '결론과 한계'], ['inquiry', 'experiment']),
    format('problem-solving', '문제 해결 기록지', '문제의 조건을 해석하고 계획, 실행, 검토의 사고 과정을 보이게 한다.', '문제를 어떻게 이해하고 어떤 방법으로 풀었는지 생각의 과정을 남기게 할 때 좋아요.', ['문제 이해', '해결 계획과 실행', '검토와 반성'], ['problem-solving']),
    format('project-planner', '프로젝트 계획·점검지', '역할, 일정, 자료, 산출물 기준과 중간 피드백을 지속해서 기록한다.', '모둠 프로젝트의 역할·일정·결과를 한 장에서 계획하고 점검할 때 좋아요.', ['목표와 역할', '실행 일정과 증거', '공유와 성찰'], ['project']),
    format('cooperative-accountability', '협동 학습 역할·책무 기록지', '공동 목표와 개인 책무, 설명·질문·도움 행동을 함께 확인한다.', '함께 공부할 때 각자 맡은 일과 서로 도운 모습을 확인하기 좋아요.', ['공동 목표와 역할', '개인·모둠 수행', '상호 평가'], ['cooperative']),
    format('discussion-evidence', '토의·토론 근거 기록지', '쟁점, 주장, 출처가 있는 근거, 반론, 합의와 남은 차이를 구분한다.', '자기 주장과 이유, 다른 의견에 대한 생각을 차례로 정리하게 할 때 좋아요.', ['쟁점과 입장', '근거·반론 기록', '합의와 성찰'], ['discussion']),
    format('role-simulation', '역할놀이·시뮬레이션 기록지', '역할 관점에서 결정한 뒤 역할에서 벗어나 개념과 판단을 성찰한다.', '역할을 맡아 상황을 경험한 뒤, 무엇을 배우고 판단했는지 돌아보게 할 때 좋아요.', ['상황과 역할', '결정과 상호작용', '디브리핑'], ['simulation']),
    format('design-cycle', '디자인 사고 기록지', '사용자 공감, 문제 정의, 아이디어, 시제품 피드백의 반복을 남긴다.', '사용자의 문제를 찾고 아이디어를 만들고 고쳐 보는 과정을 기록하기 좋아요.', ['공감과 문제 정의', '아이디어와 선택', '시제품·검증'], ['design-thinking']),
    format('blended-learning', '에듀테크 학습 확인·적용지', '사전 학습 증거와 오개념을 확인하고, 학습 목표에 맞는 기술 활용과 교실 적용 및 후속 피드백을 연결한다.', '디지털 기술을 왜 쓰는지 확인하고 학습 활동과 적용 결과를 이어서 점검할 때 좋아요.', ['학습 목표와 기술 선택', '수업 적용과 수행', '효과 점검과 성찰'], ['blended', 'tpack', 'samr']),
    format('subject-practice', '교과 탐구·표현지', '교과 고유 자료와 도구, 표현 방식, 자기 점검 기준을 사용한다.', '특정 교과의 자료·도구를 써서 탐구하고 표현한 결과를 남기기 좋아요.', ['교과 맥락', '교과 탐구·표현', '적용과 성찰'], ['subject-specific']),
    format('integrated-connections', '융합 연결·적용지', '공통 문제를 교과별 관점으로 탐구한 뒤 관계를 연결해 통합 설명이나 해결안을 만든다.', '여러 교과에서 배운 생각을 하나의 문제에 연결해 정리하고 적용할 때 좋아요.', ['공통 문제와 교과 관점', '교과별 탐구 증거', '관점 통합과 적용'], ['integrated']),
]);

export function worksheetFormatById(id) {
    return worksheetFormats.find(item => item.id === id) ?? null;
}

export function recommendWorksheetFormat(instructionModel) {
    return worksheetFormats.find(item => item.modelIds.includes(instructionModel?.id)) ?? worksheetFormats.at(-1);
}
