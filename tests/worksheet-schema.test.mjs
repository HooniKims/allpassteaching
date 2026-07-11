import { expect, test } from 'vitest';
import { worksheetOutputSchema } from '@/lib/worksheet-schema';
import { makeWorksheet } from './fixtures/workflow.mjs';

test('accepts an editable worksheet with a separate teacher key', () => {
    expect(worksheetOutputSchema.safeParse(makeWorksheet()).success).toBe(true);
});

test('rejects an answer key that references a missing question', () => {
    const worksheet = makeWorksheet();
    worksheet.teacherKey.answers[0].questionId = 'missing';
    expect(worksheetOutputSchema.safeParse(worksheet).success).toBe(false);
});

test('rejects duplicate question and answer ids', () => {
    const worksheet = makeWorksheet();
    worksheet.document.sections[1].questions[0].id = 'q-1';
    worksheet.teacherKey.answers[1].questionId = 'q-1';
    expect(worksheetOutputSchema.safeParse(worksheet).success).toBe(false);
});
