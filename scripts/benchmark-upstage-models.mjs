import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { lessonPlanSchema } from '../lib/lesson-plan-schema.js';
import { chatJson } from '../lib/upstage/client.js';
import { lessonPlanMessages } from '../lib/upstage/prompts.js';
import { instructionModels } from '../data/instruction-models.js';

const envText = await readFile('.env', 'utf8').catch(() => '');
for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const models = (process.env.UPSTAGE_BENCHMARK_MODELS || 'solar-mini,solar-pro2,solar-pro3,syn-pro').split(',').map(value => value.trim()).filter(Boolean);
const draft = {
    basics: { schoolLevel: 'elementary', grade: '6', subject: '과학', mode: 'single', sessions: 1, sessionMinutes: 40, intent: '식물의 구조와 기능을 관찰하고 증거를 바탕으로 설명한다.', studentNeeds: '관찰 기록 문장 틀이 필요한 학생을 지원한다.' },
    standards: [{ code: '6과11-02', text: '식물의 각 기관의 구조와 기능을 설명할 수 있다.' }],
    instructionModel: instructionModels.find(item => item.id === 'inquiry'),
};

const results = [];
for (const model of models) {
    const started = performance.now();
    try {
        const value = await chatJson({ messages: lessonPlanMessages(draft), schema: z.unknown(), timeoutMs: 90000, model });
        const parsed = lessonPlanSchema.safeParse(value);
        const exact = parsed.success && parsed.data.sessions.length === 1 && parsed.data.sessions[0].sessionMinutes === 40 && parsed.data.standards.every(item => item.code === '6과11-02');
        const quality = parsed.success ? Math.min(100, 50 + parsed.data.learningGoals.length * 8 + parsed.data.assessment.length * 8 + parsed.data.supportStrategies.length * 6 + (exact ? 20 : 0)) : 0;
        results.push({ model, success: parsed.success && exact, elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(2)), quality, issues: parsed.success ? [] : parsed.error.issues.map(issue => issue.message) });
    } catch (error) {
        results.push({ model, success: false, elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(2)), quality: 0, issues: [error.message] });
    }
}
console.table(results.map(({ model, success, elapsedSeconds, quality }) => ({ model, success, elapsedSeconds, quality })));
console.log(JSON.stringify(results, null, 2));
if (!results.some(result => result.success)) process.exitCode = 1;
