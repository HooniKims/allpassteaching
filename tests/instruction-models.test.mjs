import { test, expect } from 'vitest';
import { instructionModels, recommendModels } from '@/data/instruction-models';

test('covers the approved model catalog', () => {
    expect(instructionModels.length).toBeGreaterThanOrEqual(11);
    expect(instructionModels.every(model => model.stages.length > 1 && model.cautions.length > 0)).toBe(true);
});

test('recommends inquiry and experiment models for observation lessons', () => {
    expect(recommendModels('식물 성장 조건을 실험하고 관찰한다', 3).map(item => item.id)).toEqual(expect.arrayContaining(['inquiry', 'experiment']));
});
