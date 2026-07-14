const topLevelLabels = {
    metadata: '수업 정보',
    title: '수업 제목',
    schoolLevel: '학교급',
    grade: '학년',
    subject: '과목',
    unitTitle: '단원명',
    essentialQuestion: '핵심 질문',
    standards: '성취기준',
    learningGoals: '학습 목표',
    materials: '준비물',
    instructionModel: '수업 설계',
    sessions: '차시 구성',
    assessment: '평가 계획',
    supportStrategies: '개별화·지원 전략',
    reflectionPrompt: '수업 후 성찰',
};

const sharedControlLabels = {
    title: '수업 제목',
    unitTitle: '단원명',
    essentialQuestion: '핵심 질문',
    learningGoals: '학습 목표',
    materials: '준비물',
    supportStrategies: '개별화·지원 전략',
    reflectionPrompt: '수업 후 성찰',
};

const metadataControlLabels = {
    date: '수업 일자',
    place: '수업 장소',
    className: '대상 학급',
    teacherName: '수업자',
};

const stageFieldLabels = {
    learningElement: '학습 요소',
    teacherActivities: '교사 활동',
    teacherQuestions: '주요 발문',
    studentActivities: '학생 활동',
    expectedStudentResponses: '예상 학생 반응',
    minutes: '시간',
    materialsAndNotes: '자료 및 유의점',
    supportNotes: '지원 사항',
};

const assessmentFieldLabels = {
    element: '평가 요소',
    method: '평가 방법',
    evidence: '관찰 증거',
    feedback: '공통 피드백',
};

const levelFeedbackLabels = {
    needsSupport: '도움이 필요한 학생 피드백',
    meets: '기대 수준 학생 피드백',
    exceeds: '심화 수준 학생 피드백',
};

function issueDetail(issue) {
    if (issue.code === 'custom') return issue.message;
    if (issue.code === 'too_small') return '내용을 입력해주세요.';
    if (issue.code === 'too_big') {
        const unit = issue.origin === 'array' ? '개' : '자';
        return `${issue.maximum}${unit} 이하로 줄여주세요.`;
    }
    return issue.message;
}

export function formatLessonPlanIssue(issue, plan) {
    const [root, sessionIndex, sessionField, stageIndex, stageField] = issue.path;
    const firstSessionOrder = plan.sessions?.[0]?.order ?? 1;
    let label = topLevelLabels[root] ?? '입력 내용';
    if (sharedControlLabels[root]) {
        label = `${firstSessionOrder}차시 ${sharedControlLabels[root]}`;
    }
    if (root === 'metadata' && metadataControlLabels[sessionIndex]) {
        label = `${firstSessionOrder}차시 ${metadataControlLabels[sessionIndex]}`;
    }
    if (root === 'sessions' && Number.isInteger(sessionIndex) && sessionField === 'title') {
        label = `${sessionIndex + 1}차시 제목`;
    }
    if (root === 'sessions' && Number.isInteger(sessionIndex) && sessionField === 'nextSessionConnection') {
        const connectionLabel = sessionIndex === plan.sessions.length - 1 ? '후속 학습 및 정리' : '다음 차시 연결';
        label = `${sessionIndex + 1}차시 ${connectionLabel}`;
    }
    if (root === 'sessions' && Number.isInteger(sessionIndex)
        && sessionField === 'stages' && Number.isInteger(stageIndex)
        && stageFieldLabels[stageField]) {
        const phase = plan.sessions?.[sessionIndex]?.stages?.[stageIndex]?.phase ?? `${stageIndex + 1}단계`;
        label = `${sessionIndex + 1}차시 ${phase} ${stageFieldLabels[stageField]}`;
    }
    if (root === 'assessment' && Number.isInteger(sessionIndex)) {
        const feedbackKey = sessionField === 'levelFeedback' ? stageIndex : null;
        const fieldLabel = feedbackKey ? levelFeedbackLabels[feedbackKey] : assessmentFieldLabels[sessionField];
        if (fieldLabel) label = `${firstSessionOrder}차시 평가 ${sessionIndex + 1} ${fieldLabel}`;
    }
    return { label, message: `${label}: ${issueDetail(issue)}` };
}
