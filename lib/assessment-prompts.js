import { assessmentApproachById } from './assessment-approaches.js';
import { createAssessmentFallback } from './assessment-fallback.js';
import { extractAssessmentDesign, assessmentRequestFromDesign, assessmentSupplementFrom } from './assessment-design.js';

export function assessmentDesignMessages(lessonPlan, assessmentRequest) {
    const approach = assessmentApproachById(assessmentRequest.assessmentApproachId);
    const shape = extractAssessmentDesign(createAssessmentFallback(lessonPlan, assessmentRequest));
    return [
        { role: 'system', content: `당신은 한국 학교의 수행평가 설계 전문가입니다. ${approach.name} 원리(${approach.promptDirective})에 따라 교사가 수정할 수행과제와 분석적 루브릭 초안을 만드세요. 학생용 문제지와 표지는 아직 만들지 마세요. 성취기준 코드와 원문, teacherIntent, 교사가 정한 총점·수준 수·과정 배점·생성 설정을 정확히 보존하세요. 평가영역 배점 합은 ${assessmentRequest.totalPoints}점이어야 합니다. 각 평가영역의 수준 점수는 최고 수준을 그 영역 배점 만점으로 두고 최저 수준까지 큰 폭으로 고르게 낮아지도록 매기세요(예: 배점 80점·4수준이면 80·60·40·20처럼 수준 사이 간격을 넓게). 1점이나 2점씩만 차이나는 촘촘한 사다리는 만들지 마세요. 각 수준은 산출물이나 수행 과정에서 직접 관찰할 수 있는 서로 다른 기술로 쓰세요. 모든 성취기준과 평가영역을 evidenceMap에 양방향으로 연결하고 피드백 뒤 수정 체크포인트를 두세요. JSON 이외의 문장은 쓰지 마세요. 다음 키와 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ lessonPlan, assessmentRequest }) },
    ];
}

export function repairAssessmentDesignMessages(lessonPlan, assessmentRequest, invalid, issues) {
    return [...assessmentDesignMessages(lessonPlan, assessmentRequest), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `교사 입력과 성취기준은 바꾸지 말고 다음 형식·배점·연결 오류를 모두 고쳐 설계 JSON 전체만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}

export function assessmentStudentSheetMessages(lessonPlan, design) {
    const assessmentRequest = assessmentRequestFromDesign(design);
    const shape = assessmentSupplementFrom(createAssessmentFallback(lessonPlan, assessmentRequest));
    return [
        { role: 'system', content: `당신은 확정된 수행평가 설계를 학생용 문서로 바꾸는 전문가입니다. 제공된 설계의 수행과제·루브릭·배점·성취기준은 수정하지 말고 studentSheet와 cover만 만드세요. 학생 문제지에는 학생이 실제로 읽고 답할 구체적인 번호 문항과 충분한 응답 공간을 두고, 모든 성취기준을 최소 한 문항에서 직접 확인하세요. teacherKey에는 모든 문항과 같은 questionId의 채점 참고를 하나씩 두세요. 표지를 사용하면 성취기준·전이 목표·과제·제출·과정·루브릭 연결 항목을 포함하세요. JSON 이외의 문장은 쓰지 마세요. 다음 키와 구조만 사용하세요: ${JSON.stringify(shape)}` },
        { role: 'user', content: JSON.stringify({ lessonPlan, assessmentDesign: design }) },
    ];
}

export function repairAssessmentStudentSheetMessages(lessonPlan, design, invalid, issues) {
    return [...assessmentStudentSheetMessages(lessonPlan, design), { role: 'assistant', content: typeof invalid === 'string' ? invalid : JSON.stringify(invalid) }, { role: 'user', content: `확정된 설계는 바꾸지 말고 다음 학생용 문서 오류를 모두 고쳐 studentSheet와 cover JSON만 다시 반환하세요: ${JSON.stringify(issues)}` }];
}
