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

export function teachingToolRecommendationMessages({ lessonIntent, schoolLevel, grade, subject }) {
    return [
        { role: 'system', content: '당신은 한국 학교의 에듀테크 활용 전문가입니다. 제시된 수업 내용에 실제로 도움이 되는 AI·에듀테크 도구 2~3개를 JSON으로 반환하세요. 실재하는 도구의 정식 이름만 쓰고 이름을 지어내지 마세요. name은 검색할 수 있는 도구 이름 하나로만 쓰고 설명이나 수식어를 붙이지 마세요. reason은 이 수업의 어떤 활동에 왜 쓰는지 한 문장으로 쓰세요. tools 배열의 각 항목은 name, reason을 포함합니다.' },
        { role: 'user', content: JSON.stringify({ lessonIntent, schoolLevel, grade, subject }) },
    ];
}

export function lessonPlanMessages(draft) {
    const metadata = { date: '', period: '', place: '', className: '', teacherName: '', ...draft.basics.metadata };
    const modelGuide = instructionModelGuide(draft.instructionModel.id);
    const isDesignFramework = modelGuide.applicationMode === 'design-check';
    const instructionModelPhaseMap = isDesignFramework
        ? ['도입', '전개', '정리'].map(phase => ({ phase, requiredStageNames: [] }))
        : [
            { phase: '도입', requiredStageNames: [modelGuide.stages[0]] },
            { phase: '전개', requiredStageNames: modelGuide.stages.slice(1, -1) },
            { phase: '정리', requiredStageNames: [modelGuide.stages.at(-1)] },
        ];
    const instructionModelDesignChecks = isDesignFramework ? modelGuide.stages : [];
    const instructionModelDesignCheckMode = isDesignFramework ? modelGuide.designCheckMode : 'none';
    const designCheckNote = instructionModelDesignCheckMode === 'select-one'
        ? `설계 점검: ${instructionModelDesignChecks[2] ?? instructionModelDesignChecks[0]} · 선택 이유: 학습 목표 달성에 필요한 이유 · 과제 변화: 기술 활용 전후의 과제 차이`
        : `설계 점검: ${instructionModelDesignChecks.join(' · ')}`;
    const promptDraft = { ...draft, basics: { ...draft.basics, metadata }, instructionModelGuide: modelGuide, instructionModelPhaseMap, instructionModelDesignChecks, instructionModelDesignCheckMode };
    const learningElements = isDesignFramework
        ? ['수업 맥락과 목표 확인', '핵심 학습 활동', '학습 결과와 기술 활용 성찰']
        : instructionModelPhaseMap.map(item => item.requiredStageNames.join(' · '));
    const activityExamples = (phaseIndex, actor) => {
        const required = isDesignFramework
            ? instructionModelDesignCheckMode === 'select-one'
                ? phaseIndex === 1 ? [instructionModelDesignChecks[2] ?? instructionModelDesignChecks[0]] : []
                : instructionModelDesignChecks.filter((_stageName, index) => index % 3 === phaseIndex)
            : instructionModelPhaseMap[phaseIndex].requiredStageNames;
        const generic = actor === 'teacher' ? '교사의 구체적인 발화와 지원' : '학생의 구체적인 수행과 산출물';
        const examples = required.map(stageName => `${stageName}: ${generic}`);
        while (examples.length < 2) examples.push(`${generic} ${examples.length + 1}`);
        return examples;
    };
    const modelApplicationInstruction = isDesignFramework
        ? instructionModelDesignCheckMode === 'select-one'
            ? `선택한 설계 틀은 시간 순서형 수업 단계가 아닙니다. instructionModelDesignChecks를 도입·전개·정리에 순서대로 강제 배치하지 마세요. 각 차시에서 학습 목표에 맞는 SAMR 수준을 1개 이상 선택하고 재정의를 무조건 목표로 삼지 마세요. materialsAndNotes의 하나 이상의 항목을 '${designCheckNote}' 형식으로 작성해 정확한 수준 이름, 선택 이유, 기술 활용 전후의 과제 변화를 남기세요. 선택한 정확한 수준 이름을 teacherActivities 또는 studentActivities의 실제 활동에도 포함하고 teacherMoves와 studentEvidence를 관찰 가능한 증거로 반영하세요.`
            : `선택한 설계 틀은 시간 순서형 수업 단계가 아닙니다. instructionModelDesignChecks를 도입·전개·정리에 순서대로 강제 배치하지 마세요. 각 차시 전체에서 모든 설계 점검을 순서와 무관하게 실제 활동과 관찰 가능한 증거에 반영하고, materialsAndNotes의 하나 이상의 항목을 '${designCheckNote}'처럼 시작해 점검 이름을 정확히 남기세요. 각 설계 점검 이름을 teacherActivities 또는 studentActivities의 관련 활동에도 정확히 포함하세요. instructionModelGuide의 teacherMoves와 studentEvidence는 같은 순번을 같은 phase에 억지로 대응시키지 말고 차시 전체에 통합하세요.`
        : '선택한 수업 모형의 각 단계를 모든 차시의 learningElement에 모형 단계명을 순서대로 명시하고 실제 교수·학생 활동과 관찰 가능한 산출물로 구현하세요. 각 phase의 learningElement는 instructionModelPhaseMap의 requiredStageNames를 표시된 순서와 철자로 그대로 \' · \'로 연결해 시작하세요. 단계명을 동의어로 바꾸거나 줄이지 마세요. teacherActivities와 studentActivities에 해당 단계명을 정확히 포함해 각 단계가 실제로 무엇을 하는지 확인할 수 있게 하세요. instructionModelGuide의 같은 순번 teacherMoves와 studentEvidence가 해당 phase의 활동·예상 반응·산출물에 드러나야 합니다.';
    const shape = {
        metadata,
        title: '수업 제목', schoolLevel: draft.basics.schoolLevel, grade: draft.basics.grade, subject: draft.basics.subject,
        unitTitle: '단원명', essentialQuestion: '학생의 사고를 이끄는 핵심 질문',
        standards: [{ code: '제공된 코드', text: '제공된 원문', subject: '해당 교과' }], learningGoals: ['관찰 가능한 목표 1', '관찰 가능한 목표 2'], materials: ['준비물'],
        instructionModel: { id: draft.instructionModel.id, name: draft.instructionModel.name, reason: '적용 이유' },
        sessions: [{ id: 'session-1', order: 1, title: '차시 제목', sessionMinutes: draft.basics.sessionMinutes, nextSessionConnection: '다음 차시 학습과의 연결', stages: [
            { phase: '도입', learningElement: learningElements[0], teacherActivities: activityExamples(0, 'teacher'), studentActivities: activityExamples(0, 'student'), teacherQuestions: ['학생에게 실제로 묻는 질문?'], expectedStudentResponses: ['관찰 가능한 예상 응답'], supportNotes: ['학생별 지원 사항'], minutes: 5, materialsAndNotes: isDesignFramework ? [designCheckNote] : ['자료·유의점'], remarks: [] },
            { phase: '전개', learningElement: learningElements[1], teacherActivities: activityExamples(1, 'teacher'), studentActivities: activityExamples(1, 'student'), teacherQuestions: ['학생에게 실제로 묻는 질문?'], expectedStudentResponses: ['관찰 가능한 예상 응답'], supportNotes: [], minutes: draft.basics.sessionMinutes - 10, materialsAndNotes: [], remarks: [] },
            { phase: '정리', learningElement: learningElements[2], teacherActivities: activityExamples(2, 'teacher'), studentActivities: activityExamples(2, 'student'), teacherQuestions: ['학생에게 실제로 묻는 질문?'], expectedStudentResponses: ['관찰 가능한 예상 응답'], supportNotes: [], minutes: 5, materialsAndNotes: [], remarks: [] },
        ] }],
        assessment: [{ element: '평가 요소', method: '평가 방법', evidence: '관찰 가능한 응답 또는 산출물', feedback: '피드백 방법', levelFeedback: { needsSupport: '도움이 필요한 학생 피드백', meets: '기준에 도달한 학생 피드백', exceeds: '기준을 넘어선 학생 피드백' } }],
        supportStrategies: ['어떤 학생에게 무엇을 어떻게 제공할지 담은 구체적인 지원 문장'], reflectionPrompt: '수업 후 성찰 질문',
        detailedPlan: {
            teacherIntent: '성취기준과 학생 특성을 바탕으로 한 수업자 의도 및 지도 중점',
            unitOverview: '단원의 성격, 핵심 개념, 실생활 및 다른 교과와의 연결을 포함한 단원 개관',
            unitGoals: ['지식·이해 목표', '과정·기능 및 가치·태도 목표'],
            learnerAnalysis: '선수 학습 수준, 예상 어려움, 학생 특성과 그에 따른 구체적인 지도 대책',
            teachingStrategy: '선택한 수업 모형 또는 설계 틀을 본 수업에 적용하는 이유와 단계별 전략',
            unitSequence: [
                { session: '1차시', topic: '단원 도입', learningGoal: '관찰 가능한 차시 목표', focus: '지도 및 평가 중점' },
                { session: '2차시', topic: '핵심 탐구', learningGoal: '관찰 가능한 차시 목표', focus: '지도 및 평가 중점' },
                { session: '3차시', topic: '적용과 성찰', learningGoal: '관찰 가능한 차시 목표', focus: '지도 및 평가 중점' },
            ],
            boardPlan: ['판서 또는 화면 구성 계획 1', '판서 또는 화면 구성 계획 2'],
            references: ['교과서 또는 교사용 지도서 등 실제 참고 자료'],
        },
    };
    return [
        { role: 'system', content: `당신은 한국 교사의 수업 설계 전문가입니다. 같은 생성 결과에서 약안과 세안을 모두 만들 수 있도록 본시 수업 흐름뿐 아니라 detailedPlan도 충분히 구체적으로 작성하세요. 약안은 본시의 목표·도입·전개·정리·평가 중심으로 사용하고, 세안은 수업자 의도·단원 개관·단원 목표·학습자 분석·지도 전략·단원 지도 계획·판서 및 자료 계획까지 사용합니다. basics.metadata를 metadata에 그대로 복사하고, 제공된 모든 성취기준 코드와 원문을 정확히 보존하며 subject도 바꾸지 마세요. integration이 있으면 두 교과 성취기준을 각각 최소 1개 이상 유지하고, integration.primarySubject와 integration.secondarySubject의 과목명을 실제 teacherActivities·studentActivities·assessment evidence에 명시하세요. 두 교과가 실제로 만나는 공동 문제, 교과별 탐구, 관점의 연결·통합 과정, 학생이 만드는 공동 산출물이 활동에 모두 드러나야 합니다. ${modelApplicationInstruction} 모형이나 설계 틀의 이름만 복사한 일반적인 수업안을 만들지 말고 instructionModelGuide의 antiPatterns를 피하세요. 추상적인 표현 대신 교실에서 바로 사용할 수 있는 구체적인 한국어 발화와 활동을 쓰고, 모든 단계의 teacherActivities와 studentActivities는 각각 2개 이상 작성하세요. teacherQuestions는 교사가 학생에게 던질 실제 질문으로 작성하세요. 학습 목표, expectedStudentResponses, assessment evidence는 관찰 가능한 응답·행동·산출물로 작성하세요. levelFeedback의 needsSupport, meets, exceeds에는 수준별로 구분되는 구체적인 피드백을 작성하세요. supportStrategies에는 basics.studentNeeds에 적힌 학생 특성에 대응하는 지원을 '어떤 학생에게 무엇을 어떻게 제공한다'가 드러나는 문장으로 2개 이상 작성하세요. '개별화 지원'처럼 범주 이름만 나열하지 마세요. basics.studentNeeds가 비어 있으면 특정 학생이 실재하는 것처럼 쓰지 말고 이 수업 내용에서 일반적으로 예상되는 어려움에 대한 지원으로 작성하세요. basics.teachingTools에 교사가 적은 도구가 있으면 그 도구를 materials에 포함하고 teacherActivities·studentActivities·assessment evidence에서 실제로 무엇을 하는 데 쓰는지 구체적으로 드러내세요. basics.toolEvidence.summary는 그 도구를 검색해 확인한 근거이므로 도구의 기능을 지어내지 말고 이 근거에 있는 기능 범위 안에서만 활용하세요. basics.toolEvidence.verified가 false이면 도구의 세부 기능을 단정하지 말고 일반적인 사용 수준으로만 쓰세요. basics.teachingTools가 비어 있으면 특정 도구나 앱 이름을 지어내지 마세요. detailedPlan.unitSequence는 단원 도입부터 적용·성찰까지 3~6개 차시로 작성하고 현재 요청 차시를 포함하세요. 요청된 차시 수와 정확히 같은 sessions를 만들고 각 차시 stages의 minutes 합은 sessionMinutes와 같아야 합니다. 모든 차시의 단계 phase는 도입, 전개, 정리를 포함하고 이 값만 사용하세요. 키 이름을 번역하거나 중첩을 바꾸지 말고 다음 JSON 구조를 정확히 복제하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify(promptDraft) },
    ];
}

export function repairLessonPlanMessages(draft, invalidPlan, issues) {
    const invalidContent = typeof invalidPlan === 'string' ? invalidPlan : JSON.stringify(invalidPlan);
    return [...lessonPlanMessages(draft), { role: 'assistant', content: invalidContent }, { role: 'user', content: `다음 JSON 및 형식 검증 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}
