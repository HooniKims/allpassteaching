import { test, expect } from 'vitest';
import { buildPdf } from '@/lib/export/pdf';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

test('builds a non-empty PDF document', async () => {
    const bytes = await buildPdf(makeGeneratedPlan());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF'); expect(bytes.length).toBeGreaterThan(1000);
});
