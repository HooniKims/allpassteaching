import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

test('representative Upstage check covers five models without logging secrets or raw responses', async () => {
    // Given the model-alignment verification entrypoint
    const source = await readFile('scripts/check-instruction-model-samples.mjs', 'utf8');

    // When its sample and output contracts are inspected
    // Then all representative models are checked and sensitive payloads are never printed
    expect(source).toContain('direct,inquiry,cooperative,project,discussion');
    expect(source).toContain('validateInstructionModelAlignment');
    expect(source).toContain('lessonPlanSchema.safeParse');
    expect(source).toContain('INSTRUCTION_MODEL_SAMPLE_IDS');
    expect(source).toContain('failureReason');
    expect(source).not.toMatch(/console\.(?:log|table|error)\([^\n]*(?:API_KEY|content|response)/);
});
