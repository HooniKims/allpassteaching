import { expect, test } from 'vitest';
import { assessmentOutputSchema } from '@/lib/assessment-schema';
import { makeAssessment } from './fixtures/workflow.mjs';

test('accepts a 100-point four-level analytic rubric', () => {
    expect(assessmentOutputSchema.safeParse(makeAssessment()).success).toBe(true);
});

test('rejects a generated rubric whose criterion points do not total 100', () => {
    const assessment = makeAssessment();
    assessment.rubric.criteria[0].maxPoints = 20;
    expect(assessmentOutputSchema.safeParse(assessment).success).toBe(false);
});

test('rejects a rubric criterion without observable evidence', () => {
    const assessment = makeAssessment();
    assessment.rubric.criteria[0].evidence = '';
    expect(assessmentOutputSchema.safeParse(assessment).success).toBe(false);
});

test('rejects duplicate rubric criterion ids', () => {
    const assessment = makeAssessment();
    assessment.rubric.criteria[1].id = assessment.rubric.criteria[0].id;
    expect(assessmentOutputSchema.safeParse(assessment).success).toBe(false);
});
