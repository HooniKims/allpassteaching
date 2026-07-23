import { worksheetFormatById } from './worksheet-formats.js';
import { recordEvidenceBundle } from './record-evidence.js';
import { DEFAULT_RECORD_TARGET_BYTES, recordTargetCharacterGuide } from './record-length.js';
import { assessmentApproachById } from './assessment-approaches.js';
import { instructionModelTypeLabel, isInstructionDesignFramework } from '../data/instruction-models.js';
import { integrationSubjectGroups } from './integration-evidence.js';
import { createWorksheetQuestion } from './worksheet-fallback.js';
import { createAssessmentFallback } from './assessment-fallback.js';

export function worksheetMessages(lessonPlan, selectedFormatId, generationRequest) {
    const format = worksheetFormatById(selectedFormatId);
    const designFramework = isInstructionDesignFramework(lessonPlan.instructionModel);
    const instructionModelLabel = instructionModelTypeLabel(lessonPlan.instructionModel);
    const modelDirective = designFramework
        ? '선택된 설계 틀은 시간 순서형 단계가 아닙니다. 설계 틀 이름이나 점검 항목을 문항 순서로 복사하지 말고, 지도안에 구현된 실제 학생 활동과 기술 활용 근거를 학생이 사고·기록·표현할 문항으로 바꾸세요.'
        : '선택된 수업 모형의 단계와 학생 활동이 실제로 드러나는 학습지를 만드세요.';
    const questions = generationRequest.questionTypes.map((type, index) => createWorksheetQuestion(type, index, [lessonPlan.standards[0].code]));
    const integrationGroups = integrationSubjectGroups(lessonPlan);
    const integrationDirective = integrationGroups.length === 2
        ? `${integrationGroups.map(group => `${group.subject}(${group.codes.join(', ')})`).join('와 ')}의 고유한 관점·방법을 각각 확인하는 문항을 만들고, 두 교과 성취기준을 동시에 연결한 문항에서 학생이 두 근거를 비교·번역·통합하여 하나의 설명이나 공동 산출물을 만들게 하세요.`
        : '';
    const shape = {
        formatId: format.id,
        formatName: format.name,
        selectionReason: `지도안과 ${instructionModelLabel}에 이 형식이 맞는 이유`,
        standards: lessonPlan.standards,
        generationRequest,
        document: { title: '학습지 제목', instructions: '학생 안내', studentFields: ['이름', '학년·반', '날짜'], sections: [
            { id: 'section-1', title: format.sections[0], purpose: '이 섹션의 학습 목적', questions },
        ] },
        teacherKey: { answers: questions.map(question => ({ questionId: question.id, answer: '교사용 예시 답안과 확인할 핵심 근거' })) },
    };
    return [
        { role: 'system', content: `당신은 한국 교사의 학습지 설계 전문가입니다. ${modelDirective} ${integrationDirective} 교사의 지도안을 그대로 요약하지 말고 학생이 사고·기록·표현할 문항과 충분한 응답 공간을 설계하세요. 선택 형식은 ${format.name}(${format.id})이며 바꾸지 마세요. 형식 원리: ${format.guide} 필수 섹션 흐름: ${format.sections.join(' → ')}. standards와 generationRequest는 입력값을 글자 하나도 바꾸지 말고 그대로 반환하세요. 요청 유형 ${generationRequest.questionTypes.join(', ')}을 각각 한 문항 이상 포함하세요. 모든 문항은 standards에 있는 성취기준 코드를 하나 이상 연결하세요. multiple-choice-5는 choices를 정확히 다섯 개 두고, table-chart와 drawing-diagram은 responseAreaHeight를 80~400으로 두며, 나머지 유형은 responseLines를 1~16으로 두세요. 모든 문항 id는 고유해야 하고 teacherKey에는 각 문항과 같은 questionId의 예시 답안을 정확히 하나씩 넣으세요. 정답이 하나가 아닌 문항은 판단 기준과 가능한 응답 예를 쓰세요. 교사 추가 요구: ${generationRequest.additionalRequirements || '없음'}. 다음 JSON 키와 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ lessonPlan, generationRequest }) },
    ];
}

export function repairWorksheetMessages(lessonPlan, selectedFormatId, generationRequest, invalid, issues) {
    return [...worksheetMessages(lessonPlan, selectedFormatId, generationRequest), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `교사 요청과 성취기준은 바꾸지 말고 다음 형식·문항 유형·연결 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}

export function assessmentMessages(lessonPlan, assessmentRequest) {
    const approach = assessmentApproachById(assessmentRequest.assessmentApproachId);
    const taskDesignDirective = approach.id === 'authentic-performance'
        ? 'GRASPS 수행과제는 task.goal(G), task.role(R), task.audience(A), task.situation(S), task.product(P), task.successCriteria(S)의 여섯 요소를 모두 구체적으로 작성하세요.'
        : 'task.goal과 task.successCriteria는 선택한 평가 설계 방식의 목표와 성공 증거로 작성하고, 나머지 수행과제 맥락도 그 방식에 맞게 구체화하세요.';
    const processTargetPoints = assessmentRequest.includeProcessInScore ? Math.round(assessmentRequest.totalPoints * assessmentRequest.processWeightPercent / 100) : 0;
    const shape = createAssessmentFallback(lessonPlan, assessmentRequest);
    const integrationGroups = integrationSubjectGroups(lessonPlan);
    const integrationDirective = integrationGroups.length === 2
        ? `${integrationGroups.map(group => `${group.subject}(${group.codes.join(', ')})`).join('와 ')}를 융합합니다. 결과 평가영역은 각 교과의 고유한 개념·자료·방법을 확인하는 영역을 교과별로 하나 이상 두고, 별도의 통합 영역에서 두 교과 근거를 연결해 발전시킨 설명·해결안·공동 산출물을 평가하세요. 학생 수행평가지에도 교과별 문항과 두 교과 성취기준을 동시에 연결한 통합 문항을 모두 두세요.`
        : '';
    return [
        { role: 'system', content: `당신은 한국 학교의 수행평가 설계 전문가입니다. 선택한 평가 설계 방식은 ${approach.name}입니다. 설계 원리: ${approach.promptDirective} 교사의 도착점에서 성공 증거, 실제적 수행과제, 피드백·수정 과정, 수업 중 지원 계획을 설계하세요. ${taskDesignDirective} ${integrationDirective} 제공된 성취기준 코드와 원문을 정확히 보존하세요. studentSheet에는 과제 안내를 반복하지 말고 학생이 실제로 읽고 답하거나 작성할 번호 있는 실제 문항과 학생 응답 공간을 만드세요. JSON 예시의 prompt와 teacherKey 문구를 그대로 반환하지 말고, 교과 개념·자료·상황·산출물이 드러나는 구체적인 문항과 채점 참고로 반드시 다시 쓰세요. 선택한 수행 단계마다 문항을 한 개 이상 두고, 요청 응답 유형(${assessmentRequest.answerTypes.join(', ')})을 모두 반영하세요. 모든 문항은 성취기준을 하나 이상 연결하고, 모든 성취기준은 최소 한 문항에서 직접 확인해야 합니다. studentSheet.teacherKey에는 각 문항과 같은 questionId의 교사 채점 참고를 정확히 하나씩 두세요. 모든 성취기준과 모든 평가영역을 양방향 evidenceMap에 빠짐없이 연결하세요. 각 연결 행에는 그 성취기준을 실제 선언한 criterion만 넣고, taskEvidenceTypes에는 연결 criterion의 evidence 원문을 모두 넣으며, evidenceTypes에는 결과/과정 구분을, scoreBasis에는 각 영역명과 배점을 쓰세요. 평가영역은 수행과제의 서로 다른 핵심 수행과 성취기준에 따라 3개 이상으로 세분화하고(최대 15개), 이해·탐구 설계·자료 분석·결론 도출·의사소통처럼 구분되는 능력을 한 영역에 뭉뚱그리지 마세요. 각 평가영역의 name·description·evidence와 수준 설명은 이 수업의 실제 개념·자료·산출물로 구체적으로 쓰고 일반적 문구는 피하세요. 전체 배점 합은 ${assessmentRequest.totalPoints}점이어야 합니다. ${assessmentRequest.includeProcessInScore ? `kind=process 영역 배점 합은 반올림한 ${processTargetPoints}점이어야 합니다.` : 'kind=process 평가영역을 만들지 마세요.'} 수준은 정확히 ${assessmentRequest.levelCount}개이며 각 영역의 수준 점수는 최고 수준을 그 영역 배점 만점으로 두고 최저 수준까지 큰 폭으로 고르게 낮아지도록 매기세요(예: 배점 80점·4수준이면 80·60·40·20). 1~2점씩만 차이나는 촘촘한 사다리는 만들지 마세요. teacherIntent는 교사 입력을 그대로 보존하세요. phase=feedback 뒤 phase=revision 체크포인트를 반드시 포함하세요. alignmentIssues는 임의 차단을 만들지 말고 알려진 warning 코드와 구체적 repairAction만 사용하세요. 결과 증거와 과정 증거를 구분하고, 성실성·태도·인성이나 제출물에 없는 수행을 추정하지 마세요. 학생 표지를 쓰면 subject, transfer-goal, standards, grasps, submission, checkpoints, rubric 참조 섹션을 각각 하나씩 두세요. 추가 요구: ${assessmentRequest.additionalRequirements || '없음'}. 다음 JSON 키와 구조만 사용하세요: ${JSON.stringify(shape)}` },
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
        { role: 'system', content: `당신은 교사의 수행평가 채점 보조자입니다. 제공된 학생 제출물 텍스트, OCR 요소, 현재 루브릭만 사용하세요. criteria는 제공된 모든 criterion id를 정확히 한 번씩 같은 순서로 반환하세요. 확실한 텍스트 근거가 있으면 status=scored로 현재 criterion levels 중 하나의 levelId와 그 수준에 정의된 정확한 score를 선택하세요. 각 수준 설명과 학생 근거를 대조해 가장 잘 맞는 수준 하나를 고르고, 그 수준의 score를 그대로 사용하세요(임의로 점수를 바꾸지 마세요). evidence는 제출물에 실제로 연속해서 존재하는 문구이며 reason은 그 근거가 선택 수준 설명에 부합하는 이유, feedback은 다음 성장을 위한 구체적인 제안입니다. 모든 평가영역에는 판단 확신도를 0과 1 사이 숫자 confidence로 반드시 포함하세요(scored·teacher_review 모두). 근거가 분명하면 0.85 이상, 애매하면 0.85 미만으로 두세요. 수식·도표·그림, 낮은 신뢰도, 생략된 요소, Enhanced 실패, 연결되지 않은 근거 또는 불확실한 판독은 status=teacher_review로 두고 selectedLevelId와 score는 반드시 null로 하며 reviewReason을 쓰세요. 불확실성을 낮은 점수로 바꾸지 마세요. sourceRefs는 제공된 element id와 page만 사용하세요. teacherConfirmed는 항상 false입니다. 제출물에 없는 수행·태도·의도·인성을 추정하지 마세요. 총점은 반환하지 마세요. 서버가 검증·계산합니다. 다음 JSON 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ studentName, standards: assessment.task.standards, task: assessment.task, criteria, extractedText, elements, elementsTruncated, visualAnalysisStatus }) },
    ];
}

export function repairGradingMessages(input, invalid, issues) {
    return [...gradingMessages(input), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `다음 채점 형식과 근거 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}

export function recordMessages({ lessonPlan, assessment, submission, targetBytes = DEFAULT_RECORD_TARGET_BYTES }) {
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
        { role: 'system', content: `당신은 한국 학교생활기록부 과목별 세부능력 및 특기사항 작성 보조자입니다. 교사가 승인한 수행 증거만 사용해 UTF-8 기준 ${targetBytes}byte 이내의 한 문단이 되도록 주장 단위를 작성하세요. 한글은 보통 한 글자당 3byte이므로 약 ${recordTargetCharacterGuide(targetBytes)}자 안팎을 참고하되, 실제 byte 상한을 절대 넘기지 마세요. byte 수치나 분량 설명을 본문에 쓰지 마세요. criterionIds에는 approvedCitations의 criterionId만 쓰며, standards의 성취기준 코드는 criterionId로 절대 쓰지 마세요. performance·next_step 주장은 stage=performance인 approvedCitations의 evidence 원문 전체를 글자 하나도 바꾸지 않고 인용하세요. revision 주장은 growthEvidence에 있는 모든 criterion id마다 stage=before와 stage=after approvedCitations의 evidence 원문과 원본 위치를 각각 정확히 한 번씩 인용하세요. sourceRefs에는 인용한 같은 criterionId·stage의 elementId와 page만 그대로 복사하세요. 각 주장은 승인된 criterion id, 직접 인용, 원본 위치를 하나 이상 정확히 연결해야 합니다. 학생 이름, 점수, 배점, 등급을 나열하지 마세요. 다른 학생과 비교하거나 성실성·책임감·적극성·인성·성격을 추정하지 마세요. 제출물에 없는 활동, 성장, 동기, 발언을 만들지 마세요. ${growthRule} 성취기준에 연결된 학습 과정, 관찰 가능한 수행 특성, 활용한 근거, 다음 학습 방향을 교과 용어로 자연스럽게 서술하세요. 학교생활기록부 문체인 명사형 종결(-함, -임, -보임)을 사용하되 같은 표현을 기계적으로 반복하지 마세요. 다음 JSON 키와 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ schoolLevel: lessonPlan.schoolLevel, grade: lessonPlan.grade, subject: lessonPlan.subject, evidence, approvedCitations }) },
    ];
}

export function repairRecordMessages(input, invalid, issues) {
    return [...recordMessages(input), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `다음 형식·길이·기록 문체 오류를 모두 고쳐 전체 JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}

export function compressRecordMessages(input, invalid) {
    const targetBytes = input.targetBytes ?? DEFAULT_RECORD_TARGET_BYTES;
    return [...recordMessages(input), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `본문 전체가 UTF-8 기준 ${targetBytes}byte 상한을 넘었습니다. evidenceQuotes와 sourceRefs의 인용·원본 위치는 글자 하나도 바꾸지 말고 그대로 유지한 채, 각 주장의 text만 핵심 수행 중심으로 짧게 압축해 전체 본문을 약 ${recordTargetCharacterGuide(targetBytes)}자(${targetBytes}byte) 이내로 줄이세요. 덜 중요한 주장은 삭제해도 되지만 주장은 최소 1개 남기고, 전체 JSON만 다시 반환하세요.` }];
}
