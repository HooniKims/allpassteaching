const stageDefinitions = Object.freeze([
    ['draft', '수행 계획과 초안', '과제 해결 계획을 세우고 첫 수행 증거를 남긴다.'],
    ['checkpoint', '중간 점검', '현재 수행을 성공 기준과 비교하고 피드백을 기록한다.'],
    ['revision', '수정과 보완', '피드백을 반영해 수행을 고치고 수정 이유를 설명한다.'],
    ['final', '최종 수행', '성취기준에 맞는 최종 결과와 근거를 제시한다.'],
]);

const answerTypeMappings = Object.freeze([
    ['multiple-choice-5', ['5지', '선다', '객관식']],
    ['true-false', ['참거짓', '참·거짓', 'o/x', 'ox']],
    ['table-chart', ['표', '그래프', '도표']],
    ['drawing-diagram', ['그림', '다이어그램']],
    ['experiment-record', ['실험', '관찰 기록']],
    ['self-assessment', ['자기평가', '성찰']],
    ['essay', ['논술']],
    ['short-answer', ['단답']],
    ['blank', ['빈칸']],
    ['descriptive', ['서술']],
]);

export function assessmentQuestionTypeFromLabel(label) {
    const normalized = String(label ?? '').trim().toLowerCase();
    return answerTypeMappings.find(([_type, keywords]) => keywords.some(keyword => normalized.includes(keyword)))?.[0] ?? 'descriptive';
}

function questionShape(type, id, prompt, standardCodes) {
    const common = { id, type, prompt, standardCodes };
    if (type === 'multiple-choice-5') return { ...common, choices: ['선택지 1', '선택지 2', '선택지 3', '선택지 4', '선택지 5'], responseLines: 1 };
    if (type === 'table-chart' || type === 'drawing-diagram') return { ...common, responseAreaHeight: 180 };
    return { ...common, responseLines: type === 'essay' ? 12 : type === 'short-answer' || type === 'blank' || type === 'true-false' ? 2 : 6 };
}

function responseTypeInstruction(type) {
    const instructions = {
        'table-chart': '답은 비교 항목과 단위가 드러나는 표 또는 그래프로 정리하세요.',
        'drawing-diagram': '핵심 구조와 관계가 드러나도록 그림이나 다이어그램으로 나타내고 설명을 붙이세요.',
        'experiment-record': '관찰 조건, 과정, 결과와 해석이 구분되도록 기록하세요.',
        'self-assessment': '판단 근거가 되는 자신의 수행 증거를 함께 쓰세요.',
        essay: '주장, 근거와 설명이 이어지는 한 편의 글로 작성하세요.',
        descriptive: '판단의 근거가 드러나는 완전한 문장으로 작성하세요.',
    };
    return instructions[type] ?? '';
}

function performancePrompt(stageId, goal, successCriteria, type) {
    const target = goal || '성취기준에 맞는 수행 결과';
    const success = successCriteria || '관찰 가능한 근거와 결과';
    const prompts = {
        draft: `목표 「${target}」를 달성하기 위해 필요한 자료, 수행 순서와 예상 결과를 구체적으로 계획하세요.`,
        checkpoint: `현재까지 만든 결과를 '${success}'와 비교하고, 잘된 점과 보완할 점을 근거와 함께 기록하세요.`,
        revision: '받은 피드백의 핵심, 실제로 수정한 내용, 그렇게 수정한 이유를 전후가 드러나도록 설명하세요.',
        final: `목표 「${target}」에 대한 최종 결과를 제시하고, 그 결과가 타당한 이유를 구체적인 수행 증거로 설명하세요.`,
    };
    return [prompts[stageId] ?? `목표 「${target}」를 보여주는 수행 결과와 근거를 기록하세요.`, responseTypeInstruction(type)].filter(Boolean).join(' ');
}

export function createAssessmentStudentSheetTemplate({ title, standards, answerTypes, stages, goal, successCriteria }) {
    const activeStages = stageDefinitions.filter(([id]) => stages?.[id]);
    const stageList = activeStages.length ? activeStages : [stageDefinitions.at(-1)];
    const typeList = answerTypes?.length ? answerTypes.map(assessmentQuestionTypeFromLabel) : ['descriptive'];
    const questionCount = Math.max(stageList.length, typeList.length, standards.length, 1);
    const sections = stageList.map(([id, sectionTitle, purpose]) => ({ id: `performance-${id}`, title: sectionTitle, purpose, questions: [] }));
    const answers = [];
    for (let index = 0; index < questionCount; index += 1) {
        const stage = stageList[index % stageList.length];
        const section = sections[index % sections.length];
        const type = typeList[index % typeList.length];
        const standard = standards[index % standards.length];
        const questionId = `performance-q-${index + 1}`;
        section.questions.push(questionShape(type, questionId, performancePrompt(stage[0], goal, successCriteria, type), [standard.code]));
        answers.push({ questionId, answer: '루브릭과 성취기준에 따라 확인할 수행 증거와 가능한 응답 예시' });
    }
    return {
        document: {
            title: String(title || '수행평가').endsWith('수행평가') ? `${title || '수행평가'} 문제지` : `${title || '수행평가'} 수행평가지`,
            instructions: `안내문과 루브릭을 확인한 뒤 문항별 수행 과정과 결과를 기록하세요. 목표: ${goal || '성취기준에 맞는 수행 결과를 제시한다.'}`,
            studentFields: ['학년·반', '번호', '이름'],
            sections,
        },
        teacherKey: { answers: answers.map(answer => ({ ...answer, answer: `${answer.answer} · 성공 기준: ${successCriteria || '관찰 가능한 근거를 확인한다.'}` })) },
    };
}

export function upgradeAssessmentStudentSheet(assessment) {
    if (!assessment) return assessment;
    if (assessment.studentSheet?.document?.sections?.length) {
        const questions = assessment.studentSheet.document.sections.flatMap(section => section.questions ?? []);
        const existingAnswers = Array.isArray(assessment.studentSheet.teacherKey?.answers) ? assessment.studentSheet.teacherKey.answers : [];
        const answersByQuestionId = new Map();
        for (const answer of existingAnswers) {
            if (typeof answer?.questionId === 'string' && typeof answer?.answer === 'string' && answer.answer.trim() && !answersByQuestionId.has(answer.questionId)) {
                answersByQuestionId.set(answer.questionId, answer);
            }
        }
        const answers = questions.map(question => answersByQuestionId.get(question.id) ?? {
            questionId: question.id,
            answer: `성취기준 ${question.standardCodes?.join(', ') || '연결 기준'}과 성공 기준에 비추어 학생이 제시한 수행 과정, 결과 및 근거를 확인한다.`,
        });
        const isAlreadyComplete = existingAnswers.length === answers.length && answers.every((answer, index) => answer === existingAnswers[index]);
        if (isAlreadyComplete) return assessment;
        return {
            ...assessment,
            studentSheet: {
                ...assessment.studentSheet,
                teacherKey: { answers },
            },
        };
    }
    const standards = assessment.task?.standards;
    if (!Array.isArray(standards) || standards.length === 0) return assessment;
    return {
        ...assessment,
        studentSheet: createAssessmentStudentSheetTemplate({
            title: assessment.assessmentName || assessment.task?.title,
            standards,
            answerTypes: assessment.generationSettings?.answerTypes,
            stages: assessment.generationSettings?.stages,
            goal: assessment.task?.goal,
            successCriteria: assessment.task?.successCriteria,
        }),
    };
}
