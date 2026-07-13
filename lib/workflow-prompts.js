import { worksheetFormatById } from './worksheet-formats.js';
import { worksheetQuestionTypes } from './worksheet-schema.js';
import { recordEvidenceBundle } from './record-evidence.js';
import { assessmentApproachById } from './assessment-approaches.js';

function worksheetQuestionShape(type, index, standardCode) {
    const common = { id: `q-${index + 1}`, type, prompt: `${worksheetQuestionTypes.find(item => item.id === type)?.label ?? type} 문항`, standardCodes: [standardCode] };
    if (type === 'multiple-choice-5') return { ...common, choices: ['선택지 1', '선택지 2', '선택지 3', '선택지 4', '선택지 5'], responseLines: 1 };
    if (type === 'table-chart' || type === 'drawing-diagram') return { ...common, responseAreaHeight: 180 };
    return { ...common, responseLines: type === 'essay' ? 10 : 4 };
}

export function worksheetMessages(lessonPlan, selectedFormatId, generationRequest) {
    const format = worksheetFormatById(selectedFormatId);
    const questions = generationRequest.questionTypes.map((type, index) => worksheetQuestionShape(type, index, lessonPlan.standards[0].code));
    const shape = {
        formatId: format.id,
        formatName: format.name,
        selectionReason: '지도안과 수업 모형에 이 형식이 맞는 이유',
        standards: lessonPlan.standards,
        generationRequest,
        document: { title: '학습지 제목', instructions: '학생 안내', studentFields: ['이름', '학년·반', '날짜'], sections: [
            { id: 'section-1', title: format.sections[0], purpose: '이 섹션의 학습 목적', questions },
        ] },
        teacherKey: { answers: questions.map(question => ({ questionId: question.id, answer: '교사용 예시 답안과 확인할 핵심 근거' })) },
    };
    return [
        { role: 'system', content: `당신은 한국 교사의 학습지 설계 전문가입니다. 선택된 수업 모형의 단계와 학생 활동이 실제로 드러나는 학습지를 만드세요. 교사의 지도안을 그대로 요약하지 말고 학생이 사고·기록·표현할 문항과 충분한 응답 공간을 설계하세요. 선택 형식은 ${format.name}(${format.id})이며 바꾸지 마세요. 형식 원리: ${format.guide} 필수 섹션 흐름: ${format.sections.join(' → ')}. standards와 generationRequest는 입력값을 글자 하나도 바꾸지 말고 그대로 반환하세요. 요청 유형 ${generationRequest.questionTypes.join(', ')}을 각각 한 문항 이상 포함하세요. 모든 문항은 standards에 있는 성취기준 코드를 하나 이상 연결하세요. multiple-choice-5는 choices를 정확히 다섯 개 두고, table-chart와 drawing-diagram은 responseAreaHeight를 80~400으로 두며, 나머지 유형은 responseLines를 1~16으로 두세요. 모든 문항 id는 고유해야 하고 teacherKey에는 각 문항과 같은 questionId의 예시 답안을 정확히 하나씩 넣으세요. 정답이 하나가 아닌 문항은 판단 기준과 가능한 응답 예를 쓰세요. 교사 추가 요구: ${generationRequest.additionalRequirements || '없음'}. 다음 JSON 키와 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ lessonPlan, generationRequest }) },
    ];
}

export function repairWorksheetMessages(lessonPlan, selectedFormatId, generationRequest, invalid, issues) {
    return [...worksheetMessages(lessonPlan, selectedFormatId, generationRequest), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `교사 요청과 성취기준은 바꾸지 말고 다음 형식·문항 유형·연결 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}

export function assessmentMessages(lessonPlan, assessmentRequest) {
    const standards = lessonPlan.standards;
    const approach = assessmentApproachById(assessmentRequest.assessmentApproachId);
    const processTargetPoints = assessmentRequest.includeProcessInScore ? Math.round(assessmentRequest.totalPoints * assessmentRequest.processWeightPercent / 100) : 0;
    const levels = Array.from({ length: assessmentRequest.levelCount }, (_, index) => ({ id: `level-${index + 1}`, label: `${index + 1}수준` }));
    const criterionShape = (id, name, kind, maxPoints, evidence) => ({
        id, name, description: '성취기준에서 도출한 평가 내용', standardCodes: standards.map(item => item.code), kind, maxPoints, intervalPoints: 1, evidence,
        levels: levels.map((level, index) => ({ levelId: level.id, score: Math.max(0, maxPoints - index), description: '해당 수준의 관찰 가능한 수행 기술' })),
    });
    const rubricCriteria = assessmentRequest.includeProcessInScore
        ? [
            criterionShape('criterion-outcome', '결과 증거', 'outcome', assessmentRequest.totalPoints - processTargetPoints, '산출물에서 직접 찾을 수 있는 결과 증거'),
            criterionShape('criterion-process', '피드백 반영 과정', 'process', processTargetPoints, '초안, 피드백 표시, 수정본과 수정 이유'),
        ]
        : [
            criterionShape('criterion-outcome-1', '결과 증거 1', 'outcome', Math.ceil(assessmentRequest.totalPoints / 2), '산출물에서 직접 찾을 수 있는 결과 증거'),
            criterionShape('criterion-outcome-2', '결과 증거 2', 'outcome', Math.floor(assessmentRequest.totalPoints / 2), '산출물에서 직접 찾을 수 있는 결과 증거'),
        ];
    const shape = {
        assessmentName: assessmentRequest.assessmentName,
        subject: lessonPlan.subject,
        backwardDesign: {
            teacherIntent: assessmentRequest.teacherIntent,
            transferGoal: '새로운 맥락에서도 스스로 적용할 장기 전이 목표', enduringUnderstanding: '평가 뒤에도 남아야 할 핵심 이해', essentialQuestions: ['핵심 질문'], knowledge: ['알아야 할 지식'], skills: ['스스로 해낼 기능'],
            evidenceMap: standards.map(standard => ({ standardCode: standard.code, taskEvidenceTypes: ['각 연결 평가영역의 evidence 원문'], criterionIds: ['이 성취기준을 선언한 criterion id'], evidenceTypes: ['결과 증거', '과정 증거'], scoreBasis: '평가영역명 배점점 · 수준별 정의 점수' })),
            checkpoints: [{ id: 'checkpoint-feedback', phase: 'feedback', title: '초안 피드백', evidence: '초안과 피드백 표시', feedbackPurpose: '근거를 보완하도록 피드백함', order: 1 }, { id: 'checkpoint-revision', phase: 'revision', title: '수정본', evidence: '수정 표시와 이유', feedbackPurpose: '피드백을 반영해 수정함', order: 2 }],
            supportPlan: [{ id: 'support-1', order: 1, title: '수행 준비', purpose: '목표 증거를 준비함', teacherAction: '필요한 발판과 피드백을 제공함', studentEvidence: '지원 뒤 달라진 수행 증거' }],
            alignmentIssues: [],
        },
        task: { title: assessmentRequest.assessmentName || '수행과제명', standards, situation: '실제적 상황', role: '학생 역할', audience: '공유 대상', product: assessmentRequest.outputTypes.join(', '), procedure: ['수행 절차'], conditions: ['제출 조건'], materials: ['준비물'], cautions: ['유의점'] },
        cover: { title: `${assessmentRequest.assessmentName || '수행평가'} 안내`, sections: [
            { id: 'cover-subject', type: 'subject', label: '과목', content: '', visible: true, order: 1 },
            { id: 'cover-transfer', type: 'transfer-goal', label: '전이 목표', content: '', visible: true, order: 2 },
            { id: 'cover-standards', type: 'standards', label: '성취기준', content: '', visible: true, order: 3 },
            { id: 'cover-grasps', type: 'grasps', label: '수행과제 맥락', content: '', visible: true, order: 4 },
            { id: 'cover-submission', type: 'submission', label: '제출 안내', content: '', visible: true, order: 5 },
            { id: 'cover-checkpoints', type: 'checkpoints', label: '수행 과정', content: '', visible: true, order: 6 },
            { id: 'cover-rubric', type: 'rubric', label: '평가 기준', content: '', visible: true, order: 7 },
            { id: 'cover-self-checklist', type: 'self-checklist', label: '제출 전 확인', content: '성취기준에 맞는 증거를 제시했는가?', visible: true, order: 8 },
        ] },
        rubric: { levels, criteria: rubricCriteria },
        scoring: { includeProcessInScore: assessmentRequest.includeProcessInScore, processWeightPercent: assessmentRequest.processWeightPercent, processTargetPoints },
        totalPoints: assessmentRequest.totalPoints,
        visualAnalysisRequired: assessmentRequest.visualAnalysisRequired,
        includeStudentCover: assessmentRequest.includeStudentCover,
        generationSettings: { outputTypes: assessmentRequest.outputTypes, answerTypes: assessmentRequest.answerTypes, stages: assessmentRequest.stages, additionalRequirements: assessmentRequest.additionalRequirements, assessmentApproachId: approach.id },
    };
    return [
        { role: 'system', content: `당신은 한국 학교의 수행평가 설계 전문가입니다. 선택한 평가 설계 방식은 ${approach.name}입니다. 설계 원리: ${approach.promptDirective} 교사의 도착점에서 성공 증거, 실제적 수행과제, 피드백·수정 과정, 수업 중 지원 계획을 설계하세요. 제공된 성취기준 코드와 원문을 정확히 보존하세요. 모든 성취기준과 모든 평가영역을 양방향 evidenceMap에 빠짐없이 연결하세요. 각 연결 행에는 그 성취기준을 실제 선언한 criterion만 넣고, taskEvidenceTypes에는 연결 criterion의 evidence 원문을 모두 넣으며, evidenceTypes에는 결과/과정 구분을, scoreBasis에는 각 영역명과 배점을 쓰세요. 최소 2개, 최대 15개의 분석적 평가영역을 만들고 전체 배점 합은 ${assessmentRequest.totalPoints}점이어야 합니다. ${assessmentRequest.includeProcessInScore ? `kind=process 영역 배점 합은 반올림한 ${processTargetPoints}점이어야 합니다.` : 'kind=process 평가영역을 만들지 마세요.'} 수준은 정확히 ${assessmentRequest.levelCount}개이며 각 영역의 수준 점수는 최대점 이하의 서로 다른 정수로 높은 점수부터 낮아져야 합니다. teacherIntent는 교사 입력을 그대로 보존하세요. phase=feedback 뒤 phase=revision 체크포인트를 반드시 포함하세요. alignmentIssues는 임의 차단을 만들지 말고 알려진 warning 코드와 구체적 repairAction만 사용하세요. 결과 증거와 과정 증거를 구분하고, 성실성·태도·인성이나 제출물에 없는 수행을 추정하지 마세요. 학생 표지를 쓰면 subject, transfer-goal, standards, grasps, submission, checkpoints, rubric 참조 섹션을 각각 하나씩 두세요. 추가 요구: ${assessmentRequest.additionalRequirements || '없음'}. 다음 JSON 키와 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ lessonPlan, assessmentRequest }) },
    ];
}

export function repairAssessmentMessages(lessonPlan, assessmentRequest, invalid, issues) {
    return [...assessmentMessages(lessonPlan, assessmentRequest), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `교사 입력과 성취기준은 바꾸지 말고 다음 형식·배점·연결 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}

export function assessmentIntentSuggestionMessages(lessonPlan, desiredResult) {
    return [
        { role: 'system', content: '한국 교사의 백워드 설계 보조자입니다. 성취기준과 교사의 도착점을 바꾸지 말고 관찰 가능한 성공 증거와 피드백·수정 과정 증거를 각각 제안하세요. 태도, 성실성, 인성을 추정하지 마세요. JSON {"evidenceOfSuccess":"...","growthProcess":"..."}만 반환하세요.' },
        { role: 'user', content: JSON.stringify({ standards: lessonPlan.standards, lessonTitle: lessonPlan.title, learningGoals: lessonPlan.learningGoals, desiredResult }) },
    ];
}

export function criterionRegenerationMessages(assessment, criterion) {
    return [
        { role: 'system', content: `한국 학교 루브릭 전문가입니다. 선택한 평가영역의 문구만 개선하세요. criterion id, maxPoints, intervalPoints와 수준 점수는 반환하지도 바꾸지도 마세요. levels에는 제공된 levelId를 같은 순서로 보존하고 설명만 새로 쓰세요. 성취기준은 제공된 코드 안에서만 선택하고, 산출물 또는 수행 과정에서 직접 확인 가능한 기술을 쓰며 태도·인성을 추정하지 마세요. JSON {"name":"...","description":"...","standardCodes":["..."],"kind":"outcome 또는 process","evidence":"...","levels":[{"levelId":"...","description":"..."}]}만 반환하세요.` },
        { role: 'user', content: JSON.stringify({ standards: assessment.task.standards, task: assessment.task, levelDefinitions: assessment.rubric.levels, scoring: assessment.scoring, currentCriterion: criterion }) },
    ];
}

export function gradingMessages({ assessment, studentName, extractedText, elements = [], elementsTruncated = false, visualAnalysisStatus = 'not_requested' }) {
    const criteria = assessment.rubric.criteria.map(item => ({ id: item.id, name: item.name, maxPoints: item.maxPoints, description: item.description, evidence: item.evidence, levels: item.levels }));
    const shape = { criteria: criteria.map(item => ({ status: 'scored 또는 teacher_review', criterionId: item.id, selectedLevelId: 'scored이면 현재 levels의 levelId, 아니면 null', score: 'scored이면 그 levelId의 정확한 score, 아니면 null', evidence: '학생 제출물에서 그대로 가져온 짧은 근거', reason: 'scored일 때 근거가 수준 설명에 부합하는 이유', feedback: 'scored일 때 다음 성장을 위한 피드백', reviewReason: 'teacher_review일 때 점수를 비워둔 이유', confidence: 0.8, sourceRefs: [{ elementId: '제공된 OCR 요소 id', page: 1 }], teacherConfirmed: false })), summary: '수행의 강점을 근거 중심으로 요약', nextSteps: '다음 학습에서 시도할 구체적인 한 가지' };
    return [
        { role: 'system', content: `당신은 교사의 수행평가 채점 보조자입니다. 제공된 학생 제출물 텍스트, OCR 요소, 현재 루브릭만 사용하세요. criteria는 제공된 모든 criterion id를 정확히 한 번씩 같은 순서로 반환하세요. 확실한 텍스트 근거가 있으면 status=scored로 현재 criterion levels 중 하나의 levelId와 그 수준에 정의된 정확한 score를 선택하세요. evidence는 제출물에 실제로 연속해서 존재하는 문구이며 reason은 그 근거가 선택 수준 설명에 부합하는 이유, feedback은 다음 성장을 위한 구체적인 제안입니다. 수식·도표·그림, 낮은 신뢰도, 생략된 요소, Enhanced 실패, 연결되지 않은 근거 또는 불확실한 판독은 status=teacher_review로 두고 selectedLevelId와 score는 반드시 null로 하며 reviewReason을 쓰세요. 불확실성을 낮은 점수로 바꾸지 마세요. sourceRefs는 제공된 element id와 page만 사용하세요. teacherConfirmed는 항상 false입니다. 제출물에 없는 수행·태도·의도·인성을 추정하지 마세요. 총점은 반환하지 마세요. 서버가 검증·계산합니다. 다음 JSON 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ studentName, standards: assessment.task.standards, task: assessment.task, criteria, extractedText, elements, elementsTruncated, visualAnalysisStatus }) },
    ];
}

export function repairGradingMessages(input, invalid, issues) {
    return [...gradingMessages(input), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `다음 채점 형식과 근거 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}

export function recordMessages({ lessonPlan, assessment, submission, targetLength }) {
    const evidence = recordEvidenceBundle(assessment, submission);
    const growthRule = evidence.growthEvidence.length
        ? '수정·성장 서술은 growthEvidence에 적힌 실제 수정 전후 근거 안에서만 쓰세요.'
        : '실제 수정·성장 근거가 없으므로 성장, 향상, 발전, 꾸준함을 서술하지 마세요.';
    const approvedCitations = [
        ...evidence.criteria.map(criterion => ({
            criterionId: criterion.criterionId,
            stage: 'performance',
            evidence: criterion.evidence,
            sourceRefs: criterion.sourceRefs.map(({ elementId, page }) => ({ elementId, page })),
        })),
        ...evidence.growthEvidence.flatMap(criterion => [
            { criterionId: criterion.criterionId, stage: 'before', evidence: criterion.revisionEvidence.beforeEvidence, sourceRefs: [criterion.revisionEvidence.beforeSourceRef] },
            { criterionId: criterion.criterionId, stage: 'after', evidence: criterion.revisionEvidence.afterEvidence, sourceRefs: [criterion.revisionEvidence.afterSourceRef] },
        ]),
    ];
    const citationExample = { criterionId: 'criterion-id', evidence: '승인 근거 원문', sourceRefs: [{ elementId: 'element-id', page: 1 }] };
    const shape = {
        claims: [{
            text: '승인 근거를 바탕으로 작성한 세특 문장', kind: 'performance', criterionIds: [citationExample.criterionId],
            evidenceQuotes: [{ criterionId: citationExample.criterionId, stage: 'performance', quote: citationExample.evidence }],
            sourceRefs: citationExample.sourceRefs.map(sourceRef => ({ criterionId: citationExample.criterionId, ...sourceRef })),
        }],
    };
    return [
        { role: 'system', content: `당신은 한국 학교생활기록부 과목별 세부능력 및 특기사항 작성 보조자입니다. 교사가 승인한 수행 증거만 사용해 ${targetLength}자 이내의 한 문단이 되도록 주장 단위를 작성하세요. criterionIds에는 approvedCitations의 criterionId만 쓰며, standards의 성취기준 코드는 criterionId로 절대 쓰지 마세요. performance·next_step 주장은 stage=performance인 approvedCitations의 evidence 원문 전체를 글자 하나도 바꾸지 않고 인용하세요. revision 주장은 growthEvidence에 있는 모든 criterion id마다 stage=before와 stage=after approvedCitations의 evidence 원문과 원본 위치를 각각 정확히 한 번씩 인용하세요. sourceRefs에는 인용한 같은 criterionId·stage의 elementId와 page만 그대로 복사하세요. 각 주장은 승인된 criterion id, 직접 인용, 원본 위치를 하나 이상 정확히 연결해야 합니다. 학생 이름, 점수, 배점, 등급을 나열하지 마세요. 다른 학생과 비교하거나 성실성·책임감·적극성·인성·성격을 추정하지 마세요. 제출물에 없는 활동, 성장, 동기, 발언을 만들지 마세요. ${growthRule} 성취기준에 연결된 학습 과정, 관찰 가능한 수행 특성, 활용한 근거, 다음 학습 방향을 교과 용어로 자연스럽게 서술하세요. 학교생활기록부 문체인 명사형 종결(-함, -임, -보임)을 사용하되 같은 표현을 기계적으로 반복하지 마세요. 다음 JSON 키와 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ schoolLevel: lessonPlan.schoolLevel, grade: lessonPlan.grade, subject: lessonPlan.subject, evidence, approvedCitations }) },
    ];
}

export function repairRecordMessages(input, invalid, issues) {
    return [...recordMessages(input), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `다음 형식·길이·기록 문체 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}
