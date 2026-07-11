import { worksheetFormatById } from './worksheet-formats.js';

export function worksheetMessages(lessonPlan, selectedFormatId) {
    const format = worksheetFormatById(selectedFormatId);
    const shape = {
        formatId: format.id,
        formatName: format.name,
        selectionReason: '지도안과 수업 모형에 이 형식이 맞는 이유',
        document: { title: '학습지 제목', instructions: '학생 안내', studentFields: ['이름', '학년·반', '날짜'], sections: [
            { id: 'section-1', title: format.sections[0], purpose: '이 섹션의 학습 목적', questions: [{ id: 'q-1', prompt: '학생이 실제로 답할 구체적인 문항', responseLines: 4 }] },
        ] },
        teacherKey: { answers: [{ questionId: 'q-1', answer: '교사용 예시 답안과 확인할 핵심 근거' }] },
    };
    return [
        { role: 'system', content: `당신은 한국 교사의 학습지 설계 전문가입니다. 선택된 수업 모형의 단계와 학생 활동이 실제로 드러나는 학습지를 만드세요. 교사의 지도안을 그대로 요약하지 말고 학생이 사고·기록·표현할 문항과 충분한 응답 공간을 설계하세요. 선택 형식은 ${format.name}(${format.id})이며 바꾸지 마세요. 형식 원리: ${format.guide} 필수 섹션 흐름: ${format.sections.join(' → ')}. 모든 문항 id는 고유해야 하고 teacherKey에는 각 문항과 같은 questionId의 예시 답안을 정확히 하나씩 넣으세요. 정답이 하나가 아닌 문항은 판단 기준과 가능한 응답 예를 쓰세요. 다음 JSON 키와 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ lessonPlan }) },
    ];
}

export function repairWorksheetMessages(lessonPlan, selectedFormatId, invalid, issues) {
    return [...worksheetMessages(lessonPlan, selectedFormatId), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `다음 형식 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}

export function assessmentMessages(lessonPlan) {
    const standards = lessonPlan.standards;
    const shape = {
        task: { title: '수행과제명', standards, situation: '실제적 상황', role: '학생 역할', audience: '공유 대상', product: '관찰 가능한 산출물', procedure: ['수행 절차'], conditions: ['제출 조건'], materials: ['준비물'], cautions: ['유의점'] },
        rubric: { levels: [
            { id: 'excellent', label: '탁월' }, { id: 'proficient', label: '충실' }, { id: 'developing', label: '기초' }, { id: 'beginning', label: '보완 필요' },
        ], criteria: [{ id: 'criterion-1', name: '평가 요소', description: '성취기준에서 도출한 평가 내용', maxPoints: 100, evidence: '산출물에서 직접 찾을 수 있는 증거', levels: { excellent: '탁월 수준의 관찰 가능한 기술', proficient: '충실 수준의 관찰 가능한 기술', developing: '기초 수준의 관찰 가능한 기술', beginning: '보완 필요 수준의 관찰 가능한 기술' } }] },
        totalPoints: 100,
    };
    return [
        { role: 'system', content: `당신은 한국 학교의 수행평가와 루브릭 설계 전문가입니다. 제공된 성취기준 코드와 원문을 정확히 보존하고 지도안의 실제 활동과 산출물을 평가하도록 설계하세요. 상황·역할·대상·산출물이 분명한 실제적 과제를 만드세요. 최소 2개의 분석적 평가 요소를 만들고 배점 합은 정확히 100점이어야 합니다. 네 수준 id와 순서는 excellent, proficient, developing, beginning으로 고정합니다. 각 수준은 산출물에서 직접 확인 가능한 질적 차이를 기술하고, 태도나 성실성만으로 점수를 결정하지 마세요. OCR에 없는 수행을 추정하도록 요구하지 마세요. 다음 JSON 키와 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ lessonPlan }) },
    ];
}

export function repairAssessmentMessages(lessonPlan, invalid, issues) {
    return [...assessmentMessages(lessonPlan), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `다음 형식 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}

export function gradingMessages({ assessment, studentName, extractedText }) {
    const criteria = assessment.rubric.criteria.map(item => ({ id: item.id, name: item.name, maxPoints: item.maxPoints, description: item.description, evidence: item.evidence, levels: item.levels }));
    const shape = { criteria: criteria.map(item => ({ criterionId: item.id, score: 0, evidence: '학생 제출물에서 그대로 가져온 짧은 근거', feedback: '근거와 루브릭에 연결된 피드백' })), summary: '수행의 강점을 근거 중심으로 요약', nextSteps: '다음 학습에서 시도할 구체적인 한 가지' };
    return [
        { role: 'system', content: `당신은 교사의 수행평가 채점 보조자입니다. 제공된 학생 제출물 텍스트와 루브릭만 사용하세요. criteria는 제공된 모든 criterion id를 정확히 한 번씩, 같은 순서로 반환하세요. score는 0 이상 해당 maxPoints 이하의 정수입니다. evidence는 학생 제출물에 실제로 연속해서 존재하는 짧은 문구를 그대로 복사하세요. 제출물에 없는 수행, 태도, 의도, 인성을 추정하지 마세요. 정보가 부족하면 점수를 높여 추정하지 말고 피드백에 필요한 보완 증거를 쓰세요. 총점은 반환하지 마세요. 서버가 계산합니다. 다음 JSON 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ studentName, standards: assessment.task.standards, task: assessment.task, criteria, extractedText }) },
    ];
}

export function repairGradingMessages(input, invalid, issues) {
    return [...gradingMessages(input), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `다음 채점 형식과 근거 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}

export function recordMessages({ lessonPlan, assessment, submission, targetLength }) {
    const evidence = submission.grading.criteria.map(item => ({ criterionId: item.criterionId, evidence: item.evidence, feedback: item.feedback }));
    return [
        { role: 'system', content: `당신은 한국 학교생활기록부 과목별 세부능력 및 특기사항 작성 보조자입니다. 교사가 승인한 수행 증거만 사용해 ${targetLength}자 이내의 한 문단을 JSON {"text":"..."}로 반환하세요. 학생 이름, 점수, 배점, 등급을 나열하지 마세요. 다른 학생과 비교하거나 인성·성격을 단정하지 마세요. 제출물에 없는 활동, 성장, 동기, 발언을 만들지 마세요. 성취기준에 연결된 학습 과정, 관찰 가능한 수행 특성, 활용한 근거, 다음 학습 방향을 교과 용어로 자연스럽게 서술하세요. 학교생활기록부 문체인 명사형 종결(-함, -임, -보임)을 사용하되 같은 표현을 기계적으로 반복하지 마세요.` },
        { role: 'user', content: JSON.stringify({ schoolLevel: lessonPlan.schoolLevel, grade: lessonPlan.grade, subject: lessonPlan.subject, standards: assessment.task.standards, task: assessment.task, gradingSummary: submission.grading.summary, nextSteps: submission.grading.nextSteps, evidence }) },
    ];
}

export function repairRecordMessages(input, invalid, issues) {
    return [...recordMessages(input), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `다음 형식·길이·기록 문체 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}
