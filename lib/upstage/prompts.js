import { instructionModelGuide } from '../instruction-model-guides.js';

export function standardsRecommendationMessages({ query, candidates }) {
    return [
        { role: 'system', content: '당신은 2022 개정 교육과정 분석가입니다. 제공된 후보 코드만 사용하고, 적합한 3~5개를 JSON으로 반환하세요. recommendations 배열의 각 항목은 code, score(0~100), reason, keyPhrase를 포함합니다.' },
        { role: 'user', content: JSON.stringify({ lessonIntent: query, candidates: candidates.map(({ code, text }) => ({ code, text })) }) },
    ];
}

export function subjectMappingMessages({ displaySubject, lessonIntent, candidates }) {
    return [
        { role: 'system', content: '당신은 2022 개정 교육과정 분석가입니다. 제공된 공식 과목 후보만 사용해 관련 과목 1~3개를 JSON으로 반환하세요. mappings 배열의 각 항목은 subject, score(0~100), reason을 포함합니다.' },
        { role: 'user', content: JSON.stringify({ displaySubject, lessonIntent, candidates }) },
    ];
}

export function lessonPlanMessages(draft) {
    const metadata = { date: '', period: '', place: '', className: '', teacherName: '', ...draft.basics.metadata };
    const modelGuide = instructionModelGuide(draft.instructionModel.id);
    const instructionModelPhaseMap = [
        { phase: '도입', requiredStageNames: [modelGuide.stages[0]] },
        { phase: '전개', requiredStageNames: modelGuide.stages.slice(1, -1) },
        { phase: '정리', requiredStageNames: [modelGuide.stages.at(-1)] },
    ];
    const promptDraft = { ...draft, basics: { ...draft.basics, metadata }, instructionModelGuide: modelGuide, instructionModelPhaseMap };
    const shape = {
        metadata,
        title: '수업 제목', schoolLevel: draft.basics.schoolLevel, grade: draft.basics.grade, subject: draft.basics.subject,
        unitTitle: '단원명', essentialQuestion: '학생의 사고를 이끄는 핵심 질문',
        standards: [{ code: '제공된 코드', text: '제공된 원문' }], learningGoals: ['관찰 가능한 목표'], materials: ['준비물'],
        instructionModel: { id: draft.instructionModel.id, name: draft.instructionModel.name, reason: '적용 이유' },
        sessions: [{ id: 'session-1', order: 1, title: '차시 제목', sessionMinutes: draft.basics.sessionMinutes, nextSessionConnection: '다음 차시 학습과의 연결', stages: [
            { phase: '도입', learningElement: instructionModelPhaseMap[0].requiredStageNames.join(' · '), teacherActivities: ['교사의 구체적인 발화와 활동'], studentActivities: ['학생의 구체적인 활동'], teacherQuestions: ['학생에게 실제로 묻는 질문?'], expectedStudentResponses: ['관찰 가능한 예상 응답'], supportNotes: ['학생별 지원 사항'], minutes: 5, materialsAndNotes: ['자료·유의점'] },
            { phase: '전개', learningElement: instructionModelPhaseMap[1].requiredStageNames.join(' · '), teacherActivities: ['교사의 구체적인 발화와 활동'], studentActivities: ['학생의 구체적인 활동'], teacherQuestions: ['학생에게 실제로 묻는 질문?'], expectedStudentResponses: ['관찰 가능한 예상 응답'], supportNotes: [], minutes: draft.basics.sessionMinutes - 10, materialsAndNotes: [] },
            { phase: '정리', learningElement: instructionModelPhaseMap[2].requiredStageNames.join(' · '), teacherActivities: ['교사의 구체적인 발화와 활동'], studentActivities: ['학생의 구체적인 활동'], teacherQuestions: ['학생에게 실제로 묻는 질문?'], expectedStudentResponses: ['관찰 가능한 예상 응답'], supportNotes: [], minutes: 5, materialsAndNotes: [] },
        ] }],
        assessment: [{ element: '평가 요소', method: '평가 방법', evidence: '관찰 가능한 응답 또는 산출물', feedback: '피드백 방법', levelFeedback: { needsSupport: '도움이 필요한 학생 피드백', meets: '기준에 도달한 학생 피드백', exceeds: '기준을 넘어선 학생 피드백' } }],
        supportStrategies: ['개별화 지원'], reflectionPrompt: '수업 후 성찰 질문',
    };
    return [
        { role: 'system', content: `당신은 한국 교사의 수업 설계 전문가입니다. basics.metadata를 metadata에 그대로 복사하고, 제공된 모든 성취기준 코드와 원문을 정확히 보존하세요. 선택한 수업 모형의 각 단계를 모든 차시의 learningElement에 모형 단계명을 순서대로 명시하고 실제 교수·학생 활동과 관찰 가능한 산출물로 구현하세요. 각 phase의 learningElement는 instructionModelPhaseMap의 requiredStageNames를 표시된 순서와 철자로 그대로 ' · '로 연결해 시작하세요. 단계명을 동의어로 바꾸거나 줄이지 마세요. 모형 이름만 복사한 일반적인 수업안을 만들지 마세요. instructionModelGuide의 같은 순번 teacherMoves와 studentEvidence가 해당 phase의 활동·예상 반응·산출물에 드러나야 하며 antiPatterns를 피하세요. 추상적인 표현 대신 교실에서 바로 사용할 수 있는 구체적인 한국어 발화와 활동을 쓰세요. teacherQuestions는 교사가 학생에게 던질 실제 질문으로 작성하세요. 학습 목표, expectedStudentResponses, assessment evidence는 관찰 가능한 응답·행동·산출물로 작성하세요. levelFeedback의 needsSupport, meets, exceeds에는 수준별로 구분되는 구체적인 피드백을 작성하세요. 요청된 차시 수와 정확히 같은 sessions를 만들고 각 차시 stages의 minutes 합은 sessionMinutes와 같아야 합니다. 모든 차시의 단계 phase는 도입, 전개, 정리를 포함하고 이 값만 사용하세요. 키 이름을 번역하거나 중첩을 바꾸지 말고 다음 JSON 구조를 정확히 복제하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify(promptDraft) },
    ];
}

export function repairLessonPlanMessages(draft, invalidPlan, issues) {
    const invalidContent = typeof invalidPlan === 'string' ? invalidPlan : JSON.stringify(invalidPlan);
    return [...lessonPlanMessages(draft), { role: 'assistant', content: invalidContent }, { role: 'user', content: `다음 JSON 및 형식 검증 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}
