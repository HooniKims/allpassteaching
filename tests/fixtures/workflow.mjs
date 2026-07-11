export function makeWorksheet() {
    return {
        formatId: 'inquiry-experiment',
        formatName: '탐구·실험 기록지',
        selectionReason: '가설을 세우고 관찰 증거로 결론을 내리는 수업 흐름에 맞습니다.',
        document: {
            title: '식물의 구조와 기능 탐구 학습지',
            instructions: '관찰한 사실과 생각을 구분하여 기록하세요.',
            studentFields: ['이름', '학년·반', '날짜'],
            sections: [
                { id: 'section-1', title: '문제와 가설', purpose: '탐구 문제를 이해하고 예상하기', questions: [
                    { id: 'q-1', prompt: '식물의 각 기관은 어떤 일을 할까요?', responseLines: 4 },
                ] },
                { id: 'section-2', title: '관찰과 결론', purpose: '관찰 증거로 설명하기', questions: [
                    { id: 'q-2', prompt: '관찰한 특징과 그 기능을 연결해 설명하세요.', responseLines: 6 },
                ] },
            ],
        },
        teacherKey: { answers: [
            { questionId: 'q-1', answer: '뿌리는 물을 흡수하고 줄기는 물질을 운반한다고 예상할 수 있다.' },
            { questionId: 'q-2', answer: '기관의 생김새를 실제 관찰 증거와 기능에 연결한다.' },
        ] },
    };
}

export function makeAssessment() {
    return {
        task: {
            title: '식물 기관 탐구 보고서 만들기',
            standards: [{ code: '6과11-02', text: '식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.' }],
            situation: '학교 화단 식물의 건강 상태를 설명해야 한다.',
            role: '식물 탐구자',
            audience: '학급 친구',
            product: '관찰 근거가 담긴 한 쪽 탐구 보고서',
            procedure: ['기관별 특징을 관찰한다.', '구조와 기능을 근거로 설명한다.'],
            conditions: ['수업 시간 40분', '관찰 기록을 근거로 사용'],
            materials: ['식물 표본', '돋보기', '기록지'],
            cautions: ['식물을 훼손하지 않는다.'],
        },
        rubric: {
            levels: [
                { id: 'excellent', label: '탁월' }, { id: 'proficient', label: '충실' },
                { id: 'developing', label: '기초' }, { id: 'beginning', label: '보완 필요' },
            ],
            criteria: [
                { id: 'criterion-1', name: '관찰 근거', description: '관찰 사실을 구체적으로 기록한다.', maxPoints: 40, evidence: '기관별 생김새 기록', levels: { excellent: '모든 기관을 구체적으로 기록함', proficient: '대부분의 기관을 기록함', developing: '일부 기관만 기록함', beginning: '관찰 기록이 거의 없음' } },
                { id: 'criterion-2', name: '구조와 기능 설명', description: '구조와 기능의 관계를 설명한다.', maxPoints: 60, evidence: '관찰 사실과 기능을 연결한 문장', levels: { excellent: '정확한 근거로 관계를 설명함', proficient: '관계를 대체로 정확히 설명함', developing: '설명 일부가 불명확함', beginning: '관계를 설명하지 못함' } },
            ],
        },
        totalPoints: 100,
    };
}
