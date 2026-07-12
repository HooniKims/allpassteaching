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

const levelDefinitions = [
    { id: 'excellent', label: '탁월' },
    { id: 'proficient', label: '충실' },
    { id: 'developing', label: '기초' },
    { id: 'beginning', label: '보완 필요' },
];

function criterionLevels(maxPoints, intervalPoints, descriptions) {
    return levelDefinitions.map((level, index) => ({ levelId: level.id, score: maxPoints - intervalPoints * index, description: descriptions[index] }));
}

export function makeAssessment() {
    return {
        backwardDesign: {
            teacherIntent: {
                desiredResult: '식물 기관의 구조와 기능을 관찰 근거로 설명한다.',
                evidenceOfSuccess: '기관별 관찰 기록과 구조·기능을 연결한 보고서를 보여준다.',
                growthProcess: '초안의 근거를 동료 피드백으로 보완하고 수정 이유를 설명한다.',
            },
            transferGoal: '새로운 식물을 관찰할 때도 구조와 기능의 관계를 근거로 설명한다.',
            enduringUnderstanding: '생물의 구조는 그 기능과 관련되며 관찰 증거로 설명할 수 있다.',
            essentialQuestions: ['식물 기관의 생김새는 하는 일과 어떤 관련이 있을까?'],
            knowledge: ['뿌리, 줄기, 잎의 구조와 기능'],
            skills: ['관찰 기록하기', '증거로 설명하기', '피드백을 반영해 수정하기'],
            evidenceMap: [{
                standardCode: '6과11-02',
                taskEvidenceTypes: ['관찰 기록', '탐구 보고서'],
                criterionIds: ['criterion-1', 'criterion-2', 'criterion-3'],
                evidenceTypes: ['결과 증거', '과정 증거'],
                scoreBasis: '루브릭의 정의된 수준별 점수',
            }],
            checkpoints: [
                { id: 'checkpoint-1', title: '관찰 기록 초안', evidence: '기관별 관찰 기록', feedbackPurpose: '사실과 추론을 구분한다.', order: 1 },
                { id: 'checkpoint-2', title: '피드백 반영본', evidence: '수정 표시와 수정 이유', feedbackPurpose: '근거가 설명을 뒷받침하는지 보완한다.', order: 2 },
            ],
            supportPlan: [
                { id: 'support-1', order: 1, title: '관찰 언어 준비', purpose: '관찰 사실을 구체화한다.', teacherAction: '기관별 관찰 어휘 예시를 제공한다.', studentEvidence: '관찰 어휘를 사용한 초안' },
                { id: 'support-2', order: 2, title: '근거 연결 피드백', purpose: '주장과 근거를 연결한다.', teacherAction: '근거가 부족한 문장에 질문 피드백을 준다.', studentEvidence: '피드백을 반영한 수정본과 수정 이유' },
            ],
            alignmentIssues: [],
        },
        task: {
            title: '식물 기관 탐구 보고서 만들기',
            standards: [{ code: '6과11-02', text: '식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.' }],
            situation: '학교 화단 식물의 건강 상태를 설명해야 한다.',
            role: '식물 탐구자',
            audience: '학급 친구',
            product: '관찰 근거가 담긴 한 쪽 탐구 보고서',
            procedure: ['기관별 특징을 관찰한다.', '관찰 기록 초안을 작성한다.', '피드백을 받아 구조와 기능 설명을 수정한다.'],
            conditions: ['수업 시간 40분', '관찰 기록을 근거로 사용'],
            materials: ['식물 표본', '돋보기', '기록지'],
            cautions: ['식물을 훼손하지 않는다.'],
        },
        cover: {
            title: '식물 기관 탐구 수행평가 안내',
            sections: [
                { id: 'cover-purpose', type: 'purpose', label: '평가 목표', content: '구조와 기능을 관찰 근거로 설명합니다.', visible: true, order: 1 },
                { id: 'cover-standards', type: 'standards', label: '성취기준', content: '평가와 연결된 성취기준을 확인하세요.', visible: true, order: 2 },
                { id: 'cover-task', type: 'task', label: '수행과제', content: '관찰 보고서를 작성합니다.', visible: true, order: 3 },
                { id: 'cover-checkpoints', type: 'checkpoints', label: '수행 과정', content: '초안과 피드백 반영본을 제출합니다.', visible: true, order: 4 },
                { id: 'cover-rubric', type: 'rubric', label: '평가 기준', content: '아래 표의 기준과 점수를 확인하세요.', visible: true, order: 5 },
                { id: 'cover-self-checklist', type: 'self-checklist', label: '제출 전 확인', content: '관찰 근거를 구체적으로 썼는가?\n피드백을 반영하고 수정 이유를 설명했는가?', visible: true, order: 6 },
            ],
        },
        rubric: {
            levels: levelDefinitions.map(item => ({ ...item })),
            criteria: [
                { id: 'criterion-1', name: '관찰 근거', description: '관찰 사실을 구체적으로 기록한다.', standardCodes: ['6과11-02'], kind: 'outcome', maxPoints: 40, intervalPoints: 5, evidence: '기관별 생김새 기록', levels: criterionLevels(40, 5, ['모든 기관을 구체적으로 기록함', '대부분의 기관을 구체적으로 기록함', '일부 기관의 특징을 기록함', '관찰 기록이 매우 제한적임']) },
                { id: 'criterion-2', name: '구조와 기능 설명', description: '구조와 기능의 관계를 관찰 근거로 설명한다.', standardCodes: ['6과11-02'], kind: 'outcome', maxPoints: 40, intervalPoints: 5, evidence: '관찰 사실과 기능을 연결한 문장', levels: criterionLevels(40, 5, ['정확한 근거로 관계를 설명함', '근거로 관계를 대체로 설명함', '관계 설명 일부가 불명확함', '관계를 설명하지 못함']) },
                { id: 'criterion-3', name: '피드백 반영과 수정', description: '피드백을 반영하고 수정 이유를 근거로 설명한다.', standardCodes: ['6과11-02'], kind: 'process', maxPoints: 20, intervalPoints: 5, evidence: '초안, 피드백 표시, 수정본과 수정 이유', levels: criterionLevels(20, 5, ['피드백을 선별해 반영하고 수정 이유를 분명히 설명함', '피드백을 반영하고 수정 이유를 설명함', '피드백을 일부 반영하였으나 이유가 모호함', '피드백 반영 증거가 없음']) },
            ],
        },
        scoring: { includeProcessInScore: true, processWeightPercent: 20, processTargetPoints: 20 },
        totalPoints: 100,
        visualAnalysisRequired: false,
    };
}
