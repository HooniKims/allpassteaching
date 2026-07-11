import { readFile } from 'node:fs/promises';
import { test, expect } from 'vitest';
import { instructionModels } from '@/data/instruction-models';
import { instructionModelGuide } from '@/lib/instruction-model-guides';

test.each(instructionModels)('$name has a complete local guide and source document', async model => {
    const guide = instructionModelGuide(model.id);
    const markdown = await readFile(`docs/instruction-models/${model.id}.md`, 'utf8');

    expect(guide.stages).toEqual(model.stages);
    expect(guide.teacherMoves).toHaveLength(model.stages.length);
    expect(guide.studentEvidence).toHaveLength(model.stages.length);
    expect(guide.antiPatterns.length).toBeGreaterThan(0);
    expect(guide.sources.length).toBeGreaterThan(0);
    expect(guide.sources.every(source => /^https:\/\//.test(source.url))).toBe(true);
    expect(markdown).toContain(`id: ${model.id}`);
    expect(markdown).toContain('verifiedAt: 2026-07-11');
    expect(markdown).toMatch(/https:\/\//);
});

test('throws for an unknown instruction model guide', () => {
    expect(() => instructionModelGuide('unknown-model')).toThrow('지원하지 않는 수업 모형');
});
