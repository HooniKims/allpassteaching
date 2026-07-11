import { test, expect } from 'vitest';
import { instructionModels } from '@/data/instruction-models';
import { validateInstructionModelAlignment } from '@/lib/instruction-model-alignment';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

const inquiry = instructionModels.find(model => model.id === 'inquiry');

test('rejects an inquiry plan that only copies the model name', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages.forEach(stage => { stage.learningElement = stage.phase; });

    expect(validateInstructionModelAlignment(plan, inquiry)).toEqual({
        success: false,
        missingStages: ['문제 인식', '가설 설정', '탐구 수행', '결론'],
    });
});

test('accepts ordered inquiry evidence across the formal lesson phases', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages[0].learningElement = '문제 인식 · 가설 설정';
    plan.sessions[0].stages[1].learningElement = '탐구 수행';
    plan.sessions[0].stages[2].learningElement = '결론';

    expect(validateInstructionModelAlignment(plan, inquiry)).toEqual({ success: true, missingStages: [] });
});

test('rejects model evidence that appears out of order', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages[0].learningElement = '결론';
    plan.sessions[0].stages[1].learningElement = '탐구 수행';
    plan.sessions[0].stages[2].learningElement = '문제 인식 · 가설 설정';

    expect(validateInstructionModelAlignment(plan, inquiry).success).toBe(false);
});
