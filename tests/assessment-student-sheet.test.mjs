import { expect, test } from 'vitest';
import { createAssessmentStudentSheetTemplate } from '@/lib/assessment-student-sheet';

test('서술형 목표 문장을 조사 오류 없이 학생용 수행 문항으로 바꾼다', () => {
    const sheet = createAssessmentStudentSheetTemplate({
        title: '식물 탐구 수행평가',
        standards: [{ code: '6과11-02', text: '식물 기관의 구조와 기능을 관찰한다.' }],
        answerTypes: ['표·그래프 작성', '서술형'],
        stages: { draft: true, final: true },
        goal: '관찰 자료를 근거로 식물 기관의 구조와 기능의 관계를 설명한다.',
        successCriteria: '기관별 관찰 표와 구조·기능의 관계를 근거로 제시한다.',
    });
    const prompts = sheet.document.sections.flatMap(section => section.questions.map(question => question.prompt));

    expect(prompts.join('\n')).not.toContain('한다.을');
    expect(prompts[0]).toContain('「관찰 자료를 근거로 식물 기관의 구조와 기능의 관계를 설명한다.」');
    expect(prompts[0]).toContain('표 또는 그래프');
});
