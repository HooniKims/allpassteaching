import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { instructionModels } from '../data/instruction-models.js';
import { validateInstructionModelAlignment } from '../lib/instruction-model-alignment.js';
import { lessonPlanSchema } from '../lib/lesson-plan-schema.js';
import { chatContent, UpstageError } from '../lib/upstage/client.js';
import { lessonPlanMessages, repairLessonPlanMessages } from '../lib/upstage/prompts.js';

const envCandidates = ['.env', path.resolve(process.cwd(), '../..', '.env')];
for (const envPath of envCandidates) {
    const envText = await readFile(envPath, 'utf8').catch(() => '');
    if (!envText) continue;
    for (const line of envText.split(/\r?\n/)) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
    break;
}

const sampleModelIds = (process.env.INSTRUCTION_MODEL_SAMPLE_IDS || 'direct,inquiry,cooperative,project,discussion')
    .split(',').map(value => value.trim()).filter(Boolean);
const apiModel = process.env.UPSTAGE_MODEL || 'solar-pro3';

function sampleDraft(instructionModel) {
    return {
        basics: {
            schoolLevel: 'elementary', grade: '6', subject: '과학', subjectMode: 'official',
            displaySubject: '과학', mappedSubjects: ['과학'], mode: 'single', sessions: 1,
            sessionMinutes: 40, intent: '학교에서 일회용 플라스틱 사용을 줄이는 방법을 증거를 바탕으로 제안한다.',
            studentNeeds: '근거 문장을 구성하기 어려운 학생에게 문장 틀을 제공한다.',
            metadata: { date: '2026-07-11', period: '3', place: '과학실', className: '6학년 1반', teacherName: '김교사' },
        },
        standards: [{ code: '6과16-01', text: '생태계 구성 요소의 관계를 이해하고 환경 보전의 필요성을 설명할 수 있다.' }],
        instructionModel,
    };
}

function inspectPlan(content, draft) {
    let value;
    try {
        value = JSON.parse(content);
    } catch {
        return { success: false, value: content, issues: [{ message: 'JSON 형식 오류' }], missingStages: [], failureReason: 'json' };
    }
    const parsed = lessonPlanSchema.safeParse(value);
    if (!parsed.success) return { success: false, value, issues: parsed.error.issues, missingStages: [], failureReason: 'schema' };
    const alignment = validateInstructionModelAlignment(parsed.data, draft.instructionModel);
    const identityMatches = parsed.data.instructionModel.id === draft.instructionModel.id
        && parsed.data.instructionModel.name === draft.instructionModel.name;
    const standardMatches = parsed.data.standards.length === 1
        && parsed.data.standards[0].code === draft.standards[0].code
        && parsed.data.standards[0].text === draft.standards[0].text;
    const basicsMatch = parsed.data.schoolLevel === draft.basics.schoolLevel
        && parsed.data.grade === draft.basics.grade
        && parsed.data.subject === draft.basics.subject
        && Object.entries(draft.basics.metadata).every(([key, expected]) => parsed.data.metadata[key] === expected);
    const sessionMatches = parsed.data.sessions.length === 1
        && parsed.data.sessions[0].sessionMinutes === 40;
    const contractMatches = identityMatches && standardMatches && basicsMatch && sessionMatches;
    if (alignment.success && contractMatches) return { success: true, plan: parsed.data, missingStages: [], failureReason: null };
    const missingStages = alignment.missingStages;
    const failureReason = !alignment.success ? 'alignment'
        : !identityMatches ? 'instructionModel'
            : !standardMatches ? 'standard'
                : !basicsMatch ? 'basicsMetadata'
                    : 'session';
    return {
        success: false,
        value,
        issues: [{ message: contractMatches ? '수업 모형 단계 누락' : '요청 계약 불일치', missingStages }],
        missingStages,
        failureReason,
    };
}

const results = [];
for (const modelId of sampleModelIds) {
    const instructionModel = instructionModels.find(item => item.id === modelId);
    const draft = sampleDraft(instructionModel);
    const started = performance.now();
    try {
        const firstContent = await chatContent({ messages: lessonPlanMessages(draft), timeoutMs: 90000, model: apiModel });
        let checked = inspectPlan(firstContent, draft);
        if (!checked.success) {
            const repairedContent = await chatContent({ messages: repairLessonPlanMessages(draft, checked.value, checked.issues), timeoutMs: 90000, model: apiModel });
            checked = inspectPlan(repairedContent, draft);
        }
        results.push({
            modelId,
            instructionModel: instructionModel.name,
            apiModel,
            status: checked.success ? 'PASS' : 'FAIL',
            missingStages: checked.missingStages,
            failureReason: checked.failureReason,
            elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
        });
    } catch (error) {
        results.push({
            modelId,
            instructionModel: instructionModel.name,
            apiModel,
            status: 'ERROR',
            httpStatus: error instanceof UpstageError ? error.status : null,
            elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(2)),
        });
    }
}

for (const result of results) console.log(JSON.stringify(result));
if (results.some(result => result.status !== 'PASS')) process.exitCode = 1;
