import { test, expect } from 'vitest';
import { instructionModels, recommendModels } from '@/data/instruction-models';

test('covers the approved model catalog', () => {
    expect(instructionModels.length).toBeGreaterThanOrEqual(11);
    expect(instructionModels.every(model => model.stages.length > 1 && model.cautions.length > 0)).toBe(true);
});

test('recommends inquiry and experiment models for observation lessons', () => {
    expect(recommendModels('식물 성장 조건을 실험하고 관찰한다', 3).map(item => item.id)).toEqual(expect.arrayContaining(['inquiry', 'experiment']));
});

test('융합수업과 에듀테크 설계 프레임워크를 구분해 제공한다', () => {
    const requestedModels = Object.fromEntries(instructionModels
        .filter(model => ['integrated', 'tpack', 'samr'].includes(model.id))
        .map(model => [model.id, model]));

    expect(Object.keys(requestedModels)).toEqual(['integrated', 'tpack', 'samr']);
    expect(requestedModels.integrated.category).toBe('융합 수업 설계');
    expect(requestedModels.tpack.category).toBe('에듀테크 설계');
    expect(requestedModels.samr.category).toBe('에듀테크 설계');
    expect(requestedModels.tpack.stages).toEqual(['내용·목표 확인', '교수법 선택', '기술 적합성 검토', '통합·맥락 점검']);
    expect(requestedModels.samr.stages).toEqual(['대체(Substitution)', '증강(Augmentation)', '수정(Modification)', '재정의(Redefinition)']);
    expect(requestedModels.tpack.applicationMode).toBe('design-check');
    expect(requestedModels.samr.applicationMode).toBe('design-check');
});
