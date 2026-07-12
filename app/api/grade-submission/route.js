import { z } from 'zod';
import { approvedAssessmentSchema } from '@/lib/assessment-schema';
import { gradingOutputSchema, MAX_OCR_TEXT_LENGTH } from '@/lib/grading-schema';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { gradingMessages, repairGradingMessages } from '@/lib/workflow-prompts';

const requestSchema = z.object({ assessment: approvedAssessmentSchema, studentName: z.string().trim().min(1).max(100), extractedText: z.string().trim().min(20).max(MAX_OCR_TEXT_LENGTH) });

function parseGrading(content, input) {
    try {
        const value = JSON.parse(content);
        const parsed = gradingOutputSchema.safeParse(value);
        if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
        const expected = input.assessment.rubric.criteria;
        const actual = parsed.data.criteria;
        const issues = [];
        if (actual.length !== expected.length || expected.some((criterion, index) => actual[index]?.criterionId !== criterion.id)) issues.push({ path: ['criteria'], message: '루브릭 평가 요소 id와 순서를 정확히 보존해야 합니다.' });
        expected.forEach((criterion, index) => {
            if ((actual[index]?.score ?? 0) > criterion.maxPoints) issues.push({ path: ['criteria', index, 'score'], message: `${criterion.name} 점수는 최대 ${criterion.maxPoints}점입니다.` });
            if (actual[index]?.evidence && !input.extractedText.includes(actual[index].evidence)) issues.push({ path: ['criteria', index, 'evidence'], message: '근거는 학생 제출물에 실제로 연속해서 존재하는 문구여야 합니다.' });
        });
        if (issues.length) return { success: false, value, issues };
        return { success: true, data: { ...parsed.data, totalScore: actual.reduce((sum, item) => sum + item.score, 0) } };
    } catch (error) { return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] }; }
}

export async function POST(request) {
    let body;
    try { body = await request.json(); } catch { return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_request', message: '채점할 학생 내용과 루브릭을 확인해주세요.', issues: parsed.error.issues }, { status: 400 });
    const input = parsed.data;
    if (input.assessment.visualAnalysisRequired) {
        return Response.json({
            code: 'visual_review_required',
            message: '수식·도표·그림이 포함된 평가는 원본 PDF를 교사가 확인한 뒤 점수를 확정할 수 있습니다.',
            teacherReview: {
                status: 'required', totalScore: null,
                criteria: input.assessment.rubric.criteria.map(criterion => ({ criterionId: criterion.id, score: null, reason: '원본 시각 증거 확인 필요' })),
            },
        }, { status: 409 });
    }
    try {
        const first = await chatContent({ messages: gradingMessages(input), timeoutMs: 60000 });
        let checked = parseGrading(first, input);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairGradingMessages(input, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseGrading(repaired, input);
        }
        if (!checked.success) return Response.json({ code: 'invalid_generation', message: '채점 결과의 점수와 근거를 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return Response.json({ grading: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
