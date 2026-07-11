function format(id, name, guide, sections, modelIds) {
    return Object.freeze({ id, name, guide, sections, modelIds });
}

export const worksheetFormats = Object.freeze([
    format('guided-practice', '설명·연습 학습지', '설명 확인 뒤 안내된 연습에서 독립 수행으로 도움을 줄인다.', ['핵심 설명 확인', '안내된 연습', '독립 연습'], ['direct']),
    format('concept-comparison', '개념 비교·적용지', '정례와 비례를 비교해 결정적 속성을 찾고 새 사례에 적용한다.', ['사례 분류', '속성 비교', '개념 적용'], ['concept']),
    format('inquiry-experiment', '탐구·실험 기록지', '문제, 가설, 변인, 관찰 자료, 증거 기반 결론을 한 흐름으로 남긴다.', ['문제와 가설', '탐구·관찰 기록', '결론과 한계'], ['inquiry', 'experiment']),
    format('problem-solving', '문제 해결 기록지', '문제의 조건을 해석하고 계획, 실행, 검토의 사고 과정을 보이게 한다.', ['문제 이해', '해결 계획과 실행', '검토와 반성'], ['problem-solving']),
    format('project-planner', '프로젝트 계획·점검지', '역할, 일정, 자료, 산출물 기준과 중간 피드백을 지속해서 기록한다.', ['목표와 역할', '실행 일정과 증거', '공유와 성찰'], ['project']),
    format('cooperative-accountability', '협동 학습 역할·책무 기록지', '공동 목표와 개인 책무, 설명·질문·도움 행동을 함께 확인한다.', ['공동 목표와 역할', '개인·모둠 수행', '상호 평가'], ['cooperative']),
    format('discussion-evidence', '토의·토론 근거 기록지', '쟁점, 주장, 출처가 있는 근거, 반론, 합의와 남은 차이를 구분한다.', ['쟁점과 입장', '근거·반론 기록', '합의와 성찰'], ['discussion']),
    format('role-simulation', '역할놀이·시뮬레이션 기록지', '역할 관점에서 결정한 뒤 역할에서 벗어나 개념과 판단을 성찰한다.', ['상황과 역할', '결정과 상호작용', '디브리핑'], ['simulation']),
    format('design-cycle', '디자인 사고 기록지', '사용자 공감, 문제 정의, 아이디어, 시제품 피드백의 반복을 남긴다.', ['공감과 문제 정의', '아이디어와 선택', '시제품·검증'], ['design-thinking']),
    format('blended-learning', '블렌디드 학습 확인·적용지', '사전 학습 증거와 오개념을 확인하고 교실 적용 및 후속 피드백을 연결한다.', ['사전 학습 확인', '교실 적용', '피드백과 후속 학습'], ['blended']),
    format('subject-practice', '교과 탐구·표현지', '교과 고유 자료와 도구, 표현 방식, 자기 점검 기준을 사용한다.', ['교과 맥락', '교과 탐구·표현', '적용과 성찰'], ['subject-specific']),
]);

export function worksheetFormatById(id) {
    return worksheetFormats.find(item => item.id === id) ?? null;
}

export function recommendWorksheetFormat(instructionModel) {
    return worksheetFormats.find(item => item.modelIds.includes(instructionModel?.id)) ?? worksheetFormats.at(-1);
}
