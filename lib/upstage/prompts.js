export function standardsRecommendationMessages({ query, candidates }) {
    return [
        { role: 'system', content: '당신은 2022 개정 교육과정 분석가입니다. 제공된 후보 코드만 사용하고, 적합한 3~5개를 JSON으로 반환하세요. recommendations 배열의 각 항목은 code, score(0~100), reason, keyPhrase를 포함합니다.' },
        { role: 'user', content: JSON.stringify({ lessonIntent: query, candidates: candidates.map(({ code, text }) => ({ code, text })) }) },
    ];
}

export function lessonPlanMessages(draft) {
    const shape = { title: '수업 제목', schoolLevel: draft.basics.schoolLevel, grade: draft.basics.grade, subject: draft.basics.subject, standards: [{ code: '제공된 코드', text: '제공된 원문' }], learningGoals: ['관찰 가능한 목표'], materials: ['준비물'], instructionModel: { id: draft.instructionModel.id, name: draft.instructionModel.name, reason: '적용 이유' }, sessions: [{ id: 'session-1', order: 1, title: '차시 제목', sessionMinutes: draft.basics.sessionMinutes, stages: [{ phase: '도입', teacherActivities: ['교사 활동'], studentActivities: ['학생 활동'], minutes: 5, materialsAndNotes: ['자료·유의점'] }, { phase: '전개', teacherActivities: ['교사 활동'], studentActivities: ['학생 활동'], minutes: draft.basics.sessionMinutes - 10, materialsAndNotes: [] }, { phase: '정리', teacherActivities: ['교사 활동'], studentActivities: ['학생 활동'], minutes: 5, materialsAndNotes: [] }] }], assessment: [{ element: '평가 요소', evidence: '관찰 또는 산출물', feedback: '피드백 방법' }], supportStrategies: ['개별화 지원'], reflectionPrompt: '수업 후 성찰 질문' };
    return [
        { role: 'system', content: `당신은 한국 교사의 수업 설계 전문가입니다. 제공된 성취기준만 사용하세요. 선택한 수업 모형의 단계를 실제 교수·학생 활동에 반영하세요. 관찰 가능한 학습 목표, 과정중심평가, 개별화 지원을 포함하세요. 요청된 차시 수와 정확히 같은 sessions를 만들고 각 차시 stages의 minutes 합은 sessionMinutes와 같아야 합니다. 단계 phase는 도입, 전개, 정리만 사용하세요. 키 이름을 번역하거나 중첩하지 말고 다음 JSON 구조를 정확히 복제하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify(draft) },
    ];
}

export function repairLessonPlanMessages(draft, invalidPlan, issues) {
    return [...lessonPlanMessages(draft), { role: 'assistant', content: JSON.stringify(invalidPlan) }, { role: 'user', content: `다음 검증 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}
