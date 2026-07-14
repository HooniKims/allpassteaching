const ALL_SCHOOLS = ['elementary', 'middle', 'high'];
const DEFAULT_CATEGORY = '수업 흐름 중심';

function model(id, name, summary, plainGuide, stages, keywords, options = {}) {
    const category = options.category ?? DEFAULT_CATEGORY;
    const cautions = options.cautions ?? ['학습자의 사전 지식과 수업 시간을 확인한다.'];
    const applicationMode = options.applicationMode ?? 'lesson-sequence';
    return { id, name, summary, summaryParts: options.summaryParts, plainGuide, plainGuideParts: options.plainGuideParts, bestFor: summary, category, applicationMode, schoolLevels: ALL_SCHOOLS, subjects: ['전체'], stages, keywords, cautions };
}

export const instructionModelCategories = Object.freeze([
    Object.freeze({ name: DEFAULT_CATEGORY, description: '도입부터 정리까지 학생의 학습 활동이 이어지는 대표적인 수업 흐름입니다.' }),
    Object.freeze({ name: '융합 수업 설계', description: '두 개 이상 교과의 개념과 방법을 실제 문제 안에서 연결하는 설계입니다.' }),
    Object.freeze({ name: '에듀테크 설계', description: 'TPACK과 SAMR은 시간 순서형 모형이 아니라 기술을 수업에 맞게 선택·점검하는 설계 틀입니다.' }),
]);

export const instructionModels = [
    model('direct', '직접 교수', '기능과 절차를 명료하게 시범 보일 때', '교사가 먼저 보여주고, 학생이 따라 해 본 뒤 혼자 해 보는 수업이에요.', ['설명', '시범', '안내된 연습', '독립 연습'], ['설명', '기능', '절차']),
    model('concept', '개념 학습', '사례를 비교하며 개념의 속성을 형성할 때', '여러 예를 비교해 공통점과 차이점을 찾으며 개념을 스스로 정리하는 수업이에요.', ['사례 제시', '속성 탐색', '개념 명명', '적용'], ['개념', '분류', '사례']),
    model('inquiry', '탐구·발견 학습', '질문을 세우고 증거로 설명을 구성할 때', '학생이 질문을 세우고 직접 관찰한 증거로 답을 찾는 수업이에요.', ['문제 인식', '가설 설정', '탐구 수행', '결론'], ['탐구', '관찰', '가설', '증거']),
    model('problem-solving', '문제 해결 학습', '실제 문제의 해결 전략을 찾고 검증할 때', '해결할 문제를 정한 뒤 방법을 세우고, 해 본 결과를 돌아보는 수업이에요.', ['문제 이해', '계획', '실행', '반성'], ['문제', '해결', '전략']),
    model('project', '프로젝트 학습', '여러 차시에 걸쳐 의미 있는 산출물을 만들 때', '여러 차시에 걸쳐 계획하고 만들고 발표하며 하나의 결과물을 완성하는 수업이에요.', ['주제 선정', '계획', '실행', '공유·성찰'], ['프로젝트', '산출물', '연속 차시']),
    model('cooperative', '협동 학습', '상호의존적인 모둠 과제로 함께 배울 때', '모둠 안에서 역할을 나누고 서로 도우며 공동 과제를 해결하는 수업이에요.', ['과제 안내', '역할 분담', '협력 수행', '상호 평가'], ['협동', '모둠', '협력']),
    model('discussion', '토의·토론 학습', '근거를 들어 관점을 비교하고 합의할 때', '서로의 생각과 근거를 듣고 비교하며 더 나은 결론을 만들어 가는 수업이에요.', ['쟁점 확인', '근거 탐색', '토의·토론', '정리'], ['토의', '토론', '근거']),
    model('simulation', '역할놀이·시뮬레이션', '상황과 관점을 체험하며 판단할 때', '실제와 비슷한 상황에서 역할을 맡아 보고 그 경험을 돌아보는 수업이에요.', ['상황 안내', '역할 준비', '실행', '성찰'], ['역할', '상황', '체험']),
    model('experiment', '실험·실습 학습', '조작과 관찰로 원리나 기능을 익힐 때', '직접 해 보고 관찰한 결과를 바탕으로 원리나 방법을 이해하는 수업이에요.', ['안전·문제 확인', '실험 설계', '실행·관찰', '결과 해석'], ['실험', '실습', '관찰', '측정']),
    model('design-thinking', '디자인 씽킹', '사용자 관점에서 창의적인 해결안을 설계할 때', '누가 불편한지 먼저 살피고, 해결 아이디어를 만들어 시험해 보는 수업이에요.', ['공감', '문제 정의', '아이디어', '시제품·검증'], ['디자인', '공감', '시제품']),
    model('blended', '거꾸로·블렌디드 학습', '사전 학습과 교실 활동을 연결할 때', '기본 내용은 미리 익히고, 교실에서는 적용하고 질문하며 깊게 배우는 수업이에요.', ['사전 학습', '확인', '적용 활동', '피드백'], ['거꾸로', '온라인', '블렌디드']),
    model('subject-specific', '교과별 특화 모형', '반응 중심·실천적 문제 해결·수학적 모델링 등 교과 고유 흐름이 필요할 때', '교과에서 자주 쓰는 생각의 순서를 따라 표현하고 적용해 보는 수업이에요.', ['맥락 확인', '교과 탐구', '표현·적용', '성찰'], ['반응', '실천적', '모델링']),
    model('integrated', '융합수업', '두 개 이상 교과의 개념과 방법을 연결해 복합 문제를 다룰 때', '여러 교과에서 배운 생각과 방법을 한 문제에 연결해 새로운 설명이나 결과물을 만드는 수업이에요.', ['공통 맥락·문제', '교과 관점 탐구', '관점 통합', '적용·성찰'], ['융합', '통합', '교과', 'STEAM', '복합', '주제'], {
        category: '융합 수업 설계',
        cautions: ['교과 이름만 여러 개 붙이고 실제 개념·방법의 연결이 없는 나열식 활동을 피한다.'],
        summaryParts: ['두 개 이상 교과의 개념과 방법을 연결해', '복합 문제를 다룰 때'],
    }),
    model('tpack', 'TPACK 수업 설계', '내용·교수법·기술을 수업 맥락에 맞게 함께 설계할 때', '무엇을 가르칠지, 어떻게 가르칠지, 어떤 기술이 도움이 되는지를 함께 맞춰 보는 설계 틀이에요.', ['내용·목표 확인', '교수법 선택', '기술 적합성 검토', '통합·맥락 점검'], ['디지털', '에듀테크', 'AI', '기술', '온라인', '미디어'], {
        category: '에듀테크 설계',
        applicationMode: 'design-check',
        cautions: ['도구를 먼저 정한 뒤 학습 목표와 교수법을 끼워 맞추지 않는다.'],
        plainGuideParts: ['무엇을 가르칠지,', '어떻게 가르칠지,', '어떤 기술이 도움이 되는지를', '함께 맞춰 보는', '설계 틀이에요.'],
    }),
    model('samr', 'SAMR 에듀테크 설계', '디지털 기술이 과제를 단순 대체하는지 새롭게 바꾸는지 점검할 때', '기술 활용을 대체, 증강, 수정, 재정의의 네 수준으로 살펴보고 학습 목표에 맞게 과제를 바꾸는 틀이에요.', ['대체(Substitution)', '증강(Augmentation)', '수정(Modification)', '재정의(Redefinition)'], ['디지털', '에듀테크', '기술', '변형', '재설계', '온라인'], {
        category: '에듀테크 설계',
        applicationMode: 'design-check',
        cautions: ['재정의를 무조건 목표로 삼지 말고 학습 목표와 학생의 접근성에 맞는 수준을 선택한다.'],
        summaryParts: ['디지털 기술이 과제를 단순 대체하는지', '새롭게 바꾸는지 점검할 때'],
        plainGuideParts: ['기술 활용을 대체, 증강, 수정, 재정의의 네 수준으로 살펴보고', '학습 목표에 맞게', '과제를 바꾸는 틀이에요.'],
    }),
];

export function isInstructionDesignFramework(instructionModel) {
    if (!instructionModel) return false;
    const registered = instructionModels.find(item => item.id === instructionModel.id);
    return (registered ?? instructionModel).applicationMode === 'design-check';
}

export function instructionModelTypeLabel(instructionModel) {
    return isInstructionDesignFramework(instructionModel) ? '설계 틀' : '수업 모형';
}

export function recommendModels(lessonIntent, limit = 3) {
    const normalized = lessonIntent.toLowerCase();
    return instructionModels
        .map(item => ({ ...item, matchScore: item.keywords.reduce((score, keyword) => score + (normalized.includes(keyword) ? 1 : 0), 0) }))
        .sort((a, b) => b.matchScore - a.matchScore || instructionModels.indexOf(a) - instructionModels.indexOf(b))
        .slice(0, limit);
}
