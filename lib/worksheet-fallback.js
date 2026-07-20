import { worksheetFormatById } from './worksheet-formats.js';
import { worksheetQuestionTypes } from './worksheet-schema.js';
import { integrationSubjectGroups } from './integration-evidence.js';

export function createWorksheetQuestion(type, index, standardCodes, prompt = `${worksheetQuestionTypes.find(item => item.id === type)?.label ?? type} 문항`) {
    const common = { id: `q-${index + 1}`, type, prompt, standardCodes };
    if (type === 'multiple-choice-5') return { ...common, choices: ['선택지 1', '선택지 2', '선택지 3', '선택지 4', '선택지 5'], responseLines: 1 };
    if (type === 'table-chart' || type === 'drawing-diagram') return { ...common, responseAreaHeight: 180 };
    return { ...common, responseLines: type === 'essay' ? 10 : 4 };
}

export function createWorksheetFallback(lessonPlan, selectedFormatId, generationRequest) {
    const format = worksheetFormatById(selectedFormatId);
    const groups = integrationSubjectGroups(lessonPlan);
    const evidenceSets = groups.length === 2
        ? [...groups.map(group => ({ kind: 'disciplinary', label: `${group.subject} 관점`, codes: group.codes })), { kind: 'integration', label: `${groups.map(group => group.subject).join('·')} 관점 통합`, codes: groups.flatMap(group => group.codes.slice(0, 1)) }]
        : lessonPlan.standards.map(standard => ({ kind: 'disciplinary', label: `${standard.subject || lessonPlan.subject} 관점`, codes: [standard.code] }));
    const specifications = evidenceSets.map((evidence, index) => ({ evidence, type: evidence.kind === 'integration' ? 'descriptive' : generationRequest.questionTypes[index % generationRequest.questionTypes.length] }));
    const usedTypes = new Set(specifications.map(specification => specification.type));
    for (const type of generationRequest.questionTypes) {
        if (!usedTypes.has(type)) specifications.push({ evidence: evidenceSets[specifications.length % evidenceSets.length], type });
    }
    while (specifications.length < format.sections.length) specifications.push({ evidence: evidenceSets[specifications.length % evidenceSets.length], type: generationRequest.questionTypes[specifications.length % generationRequest.questionTypes.length] });
    const questions = specifications.map(({ evidence, type }, index) => createWorksheetQuestion(
        type,
        index,
        evidence.codes,
        evidence.kind === 'integration'
            ? `${groups.map(group => group.subject).join('와 ')}에서 얻은 근거를 각각 제시하고, 두 근거를 연결해 ${lessonPlan.essentialQuestion}에 대한 통합 설명이나 공동 산출물 초안을 만드세요.`
            : `${lessonPlan.title}에서 ${evidence.label}의 근거를 찾아 설명하고, 그 근거가 핵심 질문 해결에 어떻게 쓰이는지 기록하세요.`,
    ));
    const sections = format.sections.map((title, index) => ({ id: `section-${index + 1}`, title, purpose: `${title} 단계의 생각과 근거를 기록한다.`, questions: questions.filter((_question, questionIndex) => questionIndex % format.sections.length === index) }));
    return {
        formatId: format.id,
        formatName: format.name,
        selectionReason: `${lessonPlan.instructionModel.name}의 학습 흐름과 학생 산출물을 기록하기에 알맞습니다.`,
        standards: lessonPlan.standards,
        generationRequest,
        document: { title: `${lessonPlan.title} 학습지`, instructions: '각 교과의 근거를 구분해 기록하고 마지막에는 근거 사이의 관계를 설명하세요.', studentFields: ['이름', '학년·반', '날짜'], sections },
        teacherKey: { answers: questions.map(question => ({ questionId: question.id, answer: `성취기준 ${question.standardCodes.join(', ')}의 근거가 구체적이며 핵심 질문 또는 공동 산출물과 연결되는지 확인한다.` })) },
    };
}
