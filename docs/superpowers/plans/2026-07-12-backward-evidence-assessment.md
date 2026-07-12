# Backward Evidence Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing five-stage teacher workflow with backward-designed performance assessment, editable variable-score rubrics, roster and combined-PDF handling, source-linked PDF review, growth-aware grading, editable records, and honest global progress feedback.

**Architecture:** Keep `TeachingWorkflow` as the project owner, add focused domain modules for rubric scoring, roster/Excel, student packet mapping, document elements, and operation state, and keep all Upstage calls behind validated route handlers. Persist JSON-only drafts in session storage; retain PDF `File`/`Blob` objects only in memory, render them with PDF.js, and require source review before approval.

**Tech Stack:** Next.js 16 App Router, React 19, JavaScript, Zod 4, Upstage Solar Pro 3, Upstage Document Parse/Enhanced, `pdf-lib`, `pdfjs-dist`, `exceljs`, Vitest, Testing Library, Playwright, Paperlogy.

---

## Scope split and dependency order

This plan is intentionally ordered into independently testable slices:

1. assessment contracts and scoring,
2. teacher intent and generation,
3. rubric/cover editing and export,
4. worksheet authoring,
5. roster and Excel,
6. PDF packet mapping and original viewer,
7. structured Upstage evidence,
8. rubric-constrained grading and records,
9. shared operation progress,
10. integrated QA.

Each slice must leave the existing app usable and its focused tests green before the next slice starts.

## File responsibility map

- `lib/rubric-score.js`: derive level scores and validate editable score ladders.
- `lib/assessment-schema.js`: backward design, task, cover, and variable rubric contracts.
- `lib/student-roster.js`: roster normalization and validation.
- `lib/student-roster-excel.js`: in-browser Excel template/import conversion.
- `lib/pdf/student-packets.js`: page arithmetic and per-student PDF splitting.
- `lib/upstage/document-parse.js`: normalize text plus bounded page/coordinate elements.
- `lib/operation-state.js`: progress phase and ETA calculations without React.
- `components/workflow/OperationProvider.jsx`: global operation lifecycle.
- `components/workflow/OperationOverlay.jsx`: blocking accessible progress presentation.
- `components/workflow/BackwardDesignForm.jsx`: three teacher questions and AI suggestions.
- `components/workflow/AssessmentCoverEditor.jsx`: live student cover editing.
- `components/workflow/StudentRosterEditor.jsx`: direct and Excel roster UI.
- `components/workflow/StudentPdfUpload.jsx`: individual/combined mapping controls.
- `components/workflow/PdfEvidenceViewer.jsx`: PDF.js rendering and evidence highlighting.
- Existing stage, route, export, prompt, lineage, fixture, and test files are modified only for their existing responsibilities.

### Task 1: Install document-viewer and Excel dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install pinned dependencies**

Run:

```bash
npm install exceljs@4.4.0 pdfjs-dist@5.4.624
```

Expected: `package.json` lists both packages under `dependencies` and npm exits 0.

- [ ] **Step 2: Verify the Node and browser entry points**

Run:

```bash
node -e "Promise.all([import('exceljs'), import('pdfjs-dist/legacy/build/pdf.mjs')]).then(([, pdfjs]) => { if (typeof pdfjs.getDocument !== 'function') throw new Error('pdfjs getDocument unavailable'); console.log('artifact-deps-ok'); })"
node --input-type=module -e "const entry = import.meta.resolve('pdfjs-dist/build/pdf.mjs'); if (!entry.endsWith('/pdfjs-dist/build/pdf.mjs')) throw new Error('unexpected browser entry'); console.log(entry)"
```

Expected: the Node-compatible legacy ESM entry exposes `getDocument` and prints `artifact-deps-ok`; the modern browser entry resolves without being executed in Node. Future browser viewer code must import `pdfjs-dist/build/pdf.mjs` only inside a client runtime boundary and pair it with `pdfjs-dist/build/pdf.worker.min.mjs` from the same pinned package version. The bare package entry targets the modern build and is not the Node import probe.

- [ ] **Step 3: Commit dependency lock changes**

```bash
git add package.json package-lock.json
git commit -m "chore: add roster and PDF viewer dependencies"
```

### Task 2: Replace the fixed rubric contract with backward-design scoring

**Files:**
- Create: `lib/rubric-score.js`
- Modify: `lib/assessment-schema.js`
- Modify: `tests/assessment-schema.test.mjs`
- Modify: `tests/fixtures/workflow.mjs`

- [ ] **Step 1: Write failing score-ladder and schema tests**

Add these contracts to `tests/assessment-schema.test.mjs`:

```js
import { deriveLevelScores } from '@/lib/rubric-score.js';

test('derives fixed interval scores without going below zero', () => {
    expect(deriveLevelScores(20, 5, 4)).toEqual([20, 15, 10, 5]);
    expect(() => deriveLevelScores(10, 5, 4)).toThrow('0점 미만');
});

test('accepts editable total points and a descending score ladder', () => {
    const assessment = makeAssessment({ totalPoints: 60 });
    assessment.rubric.criteria[0].maxPoints = 30;
    assessment.rubric.criteria[1].maxPoints = 30;
    assessment.rubric.criteria.forEach(criterion => {
        criterion.intervalPoints = 5;
        criterion.levels = criterion.levels.map((level, index) => ({ ...level, score: 30 - index * 5 }));
    });
    expect(assessmentOutputSchema.safeParse(assessment).success).toBe(true);
});

test('rejects criteria that omit selected standards or repeat level scores', () => {
    const assessment = makeAssessment();
    assessment.rubric.criteria[0].standardCodes = [];
    assessment.rubric.criteria[1].levels[1].score = assessment.rubric.criteria[1].levels[0].score;
    expect(assessmentOutputSchema.safeParse(assessment).success).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- tests/assessment-schema.test.mjs`

Expected: FAIL because `deriveLevelScores` and the variable rubric structure do not exist.

- [ ] **Step 3: Implement score derivation**

Create `lib/rubric-score.js`:

```js
export function deriveLevelScores(maxPoints, intervalPoints, levelCount) {
    if (![maxPoints, intervalPoints, levelCount].every(Number.isInteger)) throw new Error('배점과 급간은 정수여야 합니다.');
    if (maxPoints < 1 || maxPoints > 1000 || intervalPoints < 1 || intervalPoints > 1000 || levelCount < 2 || levelCount > 6) throw new Error('배점, 급간, 수준 수를 확인해주세요.');
    const scores = Array.from({ length: levelCount }, (_, index) => maxPoints - intervalPoints * index);
    if (scores.some(score => score < 0)) throw new Error('급간 계산 결과는 0점 미만이 될 수 없습니다.');
    return scores;
}

export function scoreLadderIsValid(levels, maxPoints) {
    if (!Array.isArray(levels) || levels.length < 2 || levels.length > 6) return false;
    return levels.every((level, index) => Number.isInteger(level.score)
        && level.score >= 0
        && level.score <= maxPoints
        && (index === 0 || levels[index - 1].score > level.score));
}
```

- [ ] **Step 4: Implement the new assessment schema and fixture**

Replace fixed tuple/object levels with this shape in `lib/assessment-schema.js` and update `makeAssessment` to return it:

```js
const levelDefinitionSchema = z.object({ id: shortText, label: shortText });
const criterionLevelSchema = z.object({ levelId: shortText, score: z.number().int().min(0).max(1000), description: text });

const teacherIntentSchema = z.object({
    desiredResult: text,
    evidenceOfSuccess: text,
    growthProcess: text,
});

const taskSchema = z.object({
    title: shortText,
    standards: z.array(z.object({ code: shortText, text })).min(1).max(10),
    situation: text,
    role: text,
    audience: text,
    product: text,
    procedure: z.array(text).min(1).max(20),
    conditions: z.array(text).min(1).max(20),
    materials: z.array(text).max(30),
    cautions: z.array(text).max(20),
});

export const assessmentOutputSchema = z.object({
    backwardDesign: z.object({
        teacherIntent: teacherIntentSchema,
        transferGoal: text,
        enduringUnderstanding: text,
        essentialQuestions: z.array(text).min(1).max(8),
        knowledge: z.array(text).min(1).max(20),
        skills: z.array(text).min(1).max(20),
        evidenceMap: z.array(z.object({ standardCode: shortText, criterionIds: z.array(shortText).min(1).max(15), evidenceTypes: z.array(shortText).min(1).max(10) })).min(1).max(20),
        checkpoints: z.array(z.object({ id: shortText, title: shortText, evidence: text, feedbackPurpose: text })).min(1).max(10),
    }),
    task: taskSchema,
    cover: z.object({ title: shortText, purpose: text, studentDirections: z.array(text).min(1).max(20), selfChecklist: z.array(text).min(1).max(20) }),
    rubric: z.object({
        levels: z.array(levelDefinitionSchema).min(2).max(6),
        criteria: z.array(z.object({
            id: shortText,
            name: shortText,
            description: text,
            standardCodes: z.array(shortText).min(1).max(10),
            kind: z.enum(['outcome', 'process']),
            maxPoints: z.number().int().min(1).max(1000),
            intervalPoints: z.number().int().min(1).max(1000),
            evidence: text,
            levels: z.array(criterionLevelSchema).min(2).max(6),
        })).min(2).max(15),
    }),
    totalPoints: z.number().int().min(1).max(1000),
    visualAnalysisRequired: z.boolean(),
}).superRefine(validateAssessmentRelationships);
```

Define `validateAssessmentRelationships` before the schema:

```js
function validateAssessmentRelationships(assessment, context) {
    const criteria = assessment.rubric.criteria;
    const criterionIds = criteria.map(item => item.id);
    const levelIds = assessment.rubric.levels.map(item => item.id);
    const standardCodes = assessment.task.standards.map(item => item.code);
    const issue = (path, message) => context.addIssue({ code: 'custom', path, message });
    if (criteria.reduce((sum, item) => sum + item.maxPoints, 0) !== assessment.totalPoints) issue(['rubric', 'criteria'], '평가영역 총점 합은 전체 총점과 같아야 합니다.');
    if (new Set(criterionIds).size !== criterionIds.length) issue(['rubric', 'criteria'], '평가영역 id는 서로 달라야 합니다.');
    if (new Set(levelIds).size !== levelIds.length) issue(['rubric', 'levels'], '성취수준 id는 서로 달라야 합니다.');
    for (const [index, criterion] of criteria.entries()) {
        if (!scoreLadderIsValid(criterion.levels, criterion.maxPoints)) issue(['rubric', 'criteria', index, 'levels'], '수준 점수는 중복 없이 높은 점수부터 낮아져야 합니다.');
        if (criterion.levels.map(item => item.levelId).join('|') !== levelIds.join('|')) issue(['rubric', 'criteria', index, 'levels'], '모든 평가영역은 같은 성취수준 순서를 사용해야 합니다.');
        if (criterion.standardCodes.some(code => !standardCodes.includes(code))) issue(['rubric', 'criteria', index, 'standardCodes'], '선택하지 않은 성취기준은 연결할 수 없습니다.');
    }
    for (const code of standardCodes) if (!criteria.some(item => item.standardCodes.includes(code))) issue(['rubric', 'criteria'], `${code} 성취기준에 연결된 평가영역이 없습니다.`);
    for (const [index, mapping] of assessment.backwardDesign.evidenceMap.entries()) if (mapping.criterionIds.some(id => !criterionIds.includes(id))) issue(['backwardDesign', 'evidenceMap', index], '존재하지 않는 평가영역 연결이 있습니다.');
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/assessment-schema.test.mjs tests/workflow-lineage.test.mjs`

Expected: PASS.

```bash
git add lib/rubric-score.js lib/assessment-schema.js tests/assessment-schema.test.mjs tests/fixtures/workflow.mjs
git commit -m "feat: model backward assessment rubrics"
```

### Task 3: Persist teacher intent and generate AI suggestions

**Files:**
- Create: `components/workflow/BackwardDesignForm.jsx`
- Create: `app/api/suggest-assessment-intent/route.js`
- Modify: `components/workflow/TeachingWorkflow.jsx`
- Modify: `components/workflow/AssessmentStage.jsx`
- Modify: `lib/workflow-store.js`
- Modify: `lib/workflow-prompts.js`
- Modify: `app/api/generate-assessment/route.js`
- Create: `tests/suggest-assessment-intent-route.test.mjs`
- Modify: `tests/assessment-stage.test.jsx`
- Modify: `tests/workflow-store.test.mjs`

- [ ] **Step 1: Write failing UI and route tests**

In `tests/assessment-stage.test.jsx`, assert the exact approved copy and mandatory first answer:

```jsx
expect(screen.getByRole('heading', { name: '평가의 도착점을 먼저 정해볼까요?' })).toBeInTheDocument();
expect(screen.getByLabelText('이 평가를 마친 학생이 무엇을 이해하고, 스스로 해낼 수 있길 바라나요?')).toBeRequired();
expect(screen.getByRole('button', { name: '백워드 설계 AI 초안 제안' })).toBeDisabled();
```

In `tests/suggest-assessment-intent-route.test.mjs`, mock Solar and expect:

```js
expect(body.suggestion).toEqual({
    evidenceOfSuccess: expect.any(String),
    growthProcess: expect.any(String),
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- tests/assessment-stage.test.jsx tests/suggest-assessment-intent-route.test.mjs tests/workflow-store.test.mjs`

Expected: FAIL because the form, route, and persisted `assessmentRequest` do not exist.

- [ ] **Step 3: Add persisted request state**

Change the empty project and sanitizer to include:

```js
assessmentRequest: {
    teacherIntent: { desiredResult: '', evidenceOfSuccess: '', growthProcess: '' },
    totalPoints: 100,
    levelCount: 4,
    includeProcessInScore: true,
    processWeightPercent: 20,
    visualAnalysisRequired: false,
    includeStudentCover: true,
    additionalRequirements: '',
}
```

Pass `request` and `onRequestChange` from `TeachingWorkflow` to `AssessmentStage` so tab changes do not erase teacher input.

- [ ] **Step 4: Implement suggestion route and form**

`POST /api/suggest-assessment-intent` accepts `lessonPlan` and non-empty `desiredResult`, calls Solar with canonical standards, and returns only:

```js
{
    suggestion: {
        evidenceOfSuccess: '학생이 제출하거나 수행해 보여줄 관찰 가능한 증거',
        growthProcess: '초안, 피드백 반영, 수정 이유에서 확인할 과정 증거',
    },
}
```

`BackwardDesignForm` renders the three approved questions, one contextual example per question, configuration fields, and an AI suggestion button. Placeholder examples must never be copied into state.

- [ ] **Step 5: Pass the request through full assessment generation**

Update request validation and call:

```js
assessmentMessages(parsed.data.lessonPlan, parsed.data.assessmentRequest)
```

The prompt must preserve all selected standards, use the teacher answers as source constraints, allocate criterion totals to `totalPoints`, generate fixed-interval score ladders, include at least one feedback/revision checkpoint, and avoid personality judgments.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- tests/assessment-stage.test.jsx tests/suggest-assessment-intent-route.test.mjs tests/generate-assessment-route.test.mjs tests/workflow-store.test.mjs`

Expected: PASS.

```bash
git add components/workflow/BackwardDesignForm.jsx components/workflow/AssessmentStage.jsx components/workflow/TeachingWorkflow.jsx lib/workflow-store.js lib/workflow-prompts.js app/api/suggest-assessment-intent/route.js app/api/generate-assessment/route.js tests
git commit -m "feat: collect backward assessment intent"
```

### Task 4: Build editable dynamic rubric and live student cover

**Files:**
- Modify: `components/workflow/RubricEditor.jsx`
- Create: `components/workflow/AssessmentCoverEditor.jsx`
- Create: `app/api/regenerate-assessment-criterion/route.js`
- Modify: `components/workflow/AssessmentStage.jsx`
- Modify: `lib/export/workflow-pdf.js`
- Modify: `tests/assessment-stage.test.jsx`
- Create: `tests/regenerate-assessment-criterion-route.test.mjs`
- Modify: `tests/workflow-pdf.test.mjs`

- [ ] **Step 1: Write failing editor tests**

Cover these observable behaviors:

```jsx
await user.clear(screen.getByLabelText('전체 총점'));
await user.type(screen.getByLabelText('전체 총점'), '60');
await user.clear(screen.getByLabelText('관찰 근거 영역 총점'));
await user.type(screen.getByLabelText('관찰 근거 영역 총점'), '30');
await user.clear(screen.getByLabelText('관찰 근거 급간 점수'));
await user.type(screen.getByLabelText('관찰 근거 급간 점수'), '5');
await user.click(screen.getByRole('button', { name: '관찰 근거 급간으로 다시 계산' }));
expect(screen.getByLabelText('관찰 근거 탁월 점수')).toHaveValue(30);
expect(screen.getByLabelText('관찰 근거 충실 점수')).toHaveValue(25);
await user.type(screen.getByLabelText('학생 자기 점검표'), '\n수정 이유를 설명했는가?');
expect(screen.getByText('수정 이유를 설명했는가?')).toBeInTheDocument();
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- tests/assessment-stage.test.jsx tests/workflow-pdf.test.mjs`

Expected: FAIL because fixed rubric cells and no cover editor are rendered.

- [ ] **Step 3: Implement rubric mutations**

Add pure immutable operations inside `RubricEditor` for criterion/level add, remove, duplicate, reorder, level label editing, max/interval editing, score recalculation via `deriveLevelScores`, and per-level score/description editing. Every mutation calls the parent with `approved: false`; cap criteria at 15 and levels at 6.

- [ ] **Step 4: Implement live cover editing**

`AssessmentCoverEditor` edits `cover.title`, `cover.purpose`, line-based `studentDirections`, and `selfChecklist`, then renders a read-only live preview using the current task, checkpoints, and rubric. It must not store a duplicated rubric.

- [ ] **Step 5: Add safe selected-criterion regeneration**

`POST /api/regenerate-assessment-criterion` accepts the current validated assessment and one `criterionId`. Solar receives the canonical standards, current task, level definitions, total/max/interval values, and the selected criterion only. The response may replace only `name`, `description`, `standardCodes`, `kind`, `evidence`, and level descriptions; it must preserve criterion ID, max points, interval, level IDs, and level scores. The editor shows old/new comparison and applies only after teacher confirmation.

- [ ] **Step 6: Render cover and scored rubric in PDF**

Update `drawAssessment` so page one includes student fields, purpose, standards, steps, self-checklist, and a score-bearing rubric. Continue long rubric rows on later pages without clipping and repeat criterion headings.

Add an assessment-cover export kind that calls the same cover renderer without task answer pages, so `표지만 PDF 저장` and `수행평가 전체 PDF 저장` cannot diverge.

- [ ] **Step 7: Test and commit**

Run: `npm test -- tests/assessment-stage.test.jsx tests/regenerate-assessment-criterion-route.test.mjs tests/workflow-pdf.test.mjs tests/workflow-export-route.test.mjs`

Expected: PASS.

```bash
git add components/workflow/RubricEditor.jsx components/workflow/AssessmentCoverEditor.jsx components/workflow/AssessmentStage.jsx app/api/regenerate-assessment-criterion/route.js lib/export/workflow-pdf.js tests
git commit -m "feat: edit rubric scores and student cover"
```

### Task 5: Add teacher-directed worksheet types and section editing

**Files:**
- Modify: `lib/worksheet-schema.js`
- Modify: `lib/workflow-prompts.js`
- Modify: `app/api/generate-worksheet/route.js`
- Modify: `components/workflow/WorksheetStage.jsx`
- Modify: `components/workflow/WorksheetEditor.jsx`
- Modify: `lib/export/workflow-pdf.js`
- Modify: `tests/worksheet-schema.test.mjs`
- Modify: `tests/worksheet-stage.test.jsx`

- [ ] **Step 1: Write failing worksheet authoring tests**

Add a `type` enum and type-specific fields:

```js
const question = {
    id: 'q-choice',
    type: 'multiple-choice-5',
    prompt: '옳은 설명을 고르세요.',
    choices: ['①', '②', '③', '④', '⑤'],
    responseLines: 1,
    standardCodes: ['[6과01-01]'],
};
const makeWorksheetWith = value => {
    const worksheet = makeWorksheet();
    worksheet.document.sections[0].questions = [value];
    worksheet.teacherKey.answers = [{ questionId: value.id, answer: '예시 답안' }];
    return worksheet;
};
expect(worksheetOutputSchema.safeParse(makeWorksheetWith(question)).success).toBe(true);
```

UI tests must add, duplicate, reorder, and remove a section and preserve teacher answers by question ID.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/worksheet-schema.test.mjs tests/worksheet-stage.test.jsx`

Expected: FAIL on missing type controls and section actions.

- [ ] **Step 3: Implement structured request and editor**

Add `generationRequest` with `additionalRequirements` and selected question types. Support `blank`, `short-answer`, `descriptive`, `essay`, `true-false`, `multiple-choice-5`, `table-chart`, `drawing-diagram`, `experiment-record`, and `self-assessment`. Render five editable choices only for `multiple-choice-5` and keep every question connected to at least one task standard.

- [ ] **Step 4: Update prompt/route and test**

Pass the request to Solar and require requested types while preserving the selected worksheet format and all standard links.

Extend the worksheet PDF renderer so five-choice questions print all choices, table/chart and drawing/diagram questions reserve a bordered response area, and teacher keys stay in the separate answer document.

Run: `npm test -- tests/worksheet-schema.test.mjs tests/worksheet-stage.test.jsx tests/generate-worksheet-route.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/worksheet-schema.js lib/workflow-prompts.js app/api/generate-worksheet/route.js components/workflow/WorksheetStage.jsx components/workflow/WorksheetEditor.jsx tests
git commit -m "feat: add editable worksheet question types"
```

### Task 6: Add shared roster and private Excel import/export

**Files:**
- Create: `lib/student-roster.js`
- Create: `lib/student-roster-excel.js`
- Create: `components/workflow/StudentRosterEditor.jsx`
- Modify: `components/workflow/TeachingWorkflow.jsx`
- Modify: `components/workflow/OcrGradingStage.jsx`
- Modify: `lib/workflow-store.js`
- Create: `tests/student-roster.test.mjs`
- Create: `tests/student-roster-excel.test.mjs`
- Create: `tests/student-roster-editor.test.jsx`

- [ ] **Step 1: Write failing roster and workbook tests**

```js
expect(normalizeRosterRows([
    { 학년: '2', 반: '3', 번호: 7, 이름: '김하늘' },
])).toEqual({ students: [{ id: expect.stringMatching(/^student-/), grade: '2', className: '3', number: 7, name: '김하늘' }], issues: [] });

const bytes = await createRosterTemplate();
const parsed = await parseRosterWorkbook(bytes);
expect(parsed.headers).toEqual(['학년', '반', '번호', '이름']);
```

Add cases for blank rows, duplicate grade/class/number, missing name, row order, and more than 50 students.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/student-roster.test.mjs tests/student-roster-excel.test.mjs tests/student-roster-editor.test.jsx`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement roster domain and Excel adapter**

Use deterministic IDs for imported rows:

```js
export function studentKey(student) {
    return `${student.grade}:${student.className}:${student.number}`;
}
```

`createRosterTemplate` and `parseRosterWorkbook` dynamically import `exceljs`; parsing happens on the client and returns row-numbered issues without uploading the workbook.

- [ ] **Step 4: Implement roster UI and persistence**

Provide direct row add/edit/delete/reorder, `.xlsx` download/upload, issue table, and a 50-student count. Store `students` on the project and pass it to grading and records. Deleting a student with results requires confirmation and removes only that student's submissions/records.

- [ ] **Step 5: Test and commit**

Run: `npm test -- tests/student-roster.test.mjs tests/student-roster-excel.test.mjs tests/student-roster-editor.test.jsx tests/workflow-store.test.mjs tests/teaching-workflow.test.jsx`

Expected: PASS.

```bash
git add lib/student-roster.js lib/student-roster-excel.js components/workflow/StudentRosterEditor.jsx components/workflow/TeachingWorkflow.jsx components/workflow/OcrGradingStage.jsx lib/workflow-store.js tests
git commit -m "feat: manage shared student roster"
```

### Task 7: Map individual and combined PDFs to student packets

**Files:**
- Create: `lib/pdf/student-packets.js`
- Create: `components/workflow/StudentPdfUpload.jsx`
- Modify: `components/workflow/OcrGradingStage.jsx`
- Create: `tests/student-packets.test.mjs`
- Create: `tests/student-pdf-upload.test.jsx`

- [ ] **Step 1: Write failing page-mapping tests**

```js
expect(buildPacketMap({ students: roster(2), answerPagesPerStudent: 2, hasCoverPerStudent: true, actualPages: 6 })).toEqual([
    { studentId: 's1', coverPages: [1], answerPages: [2, 3] },
    { studentId: 's2', coverPages: [4], answerPages: [5, 6] },
]);
expect(() => buildPacketMap({ students: roster(2), answerPagesPerStudent: 2, hasCoverPerStudent: true, actualPages: 5 })).toThrow('예상 6쪽, 실제 5쪽');
```

Define the helper in the same test file:

```js
const roster = count => Array.from({ length: count }, (_, index) => ({ id: `s${index + 1}`, grade: '2', className: '3', number: index + 1, name: `학생${index + 1}` }));
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/student-packets.test.mjs tests/student-pdf-upload.test.jsx`

Expected: FAIL because packet mapping does not exist.

- [ ] **Step 3: Implement arithmetic and splitting**

Export `buildPacketMap`, `splitCombinedPdf`, and `attachIndividualFiles`. `splitCombinedPdf` loads bytes with `PDFDocument`, copies the full packet for viewing and a second answer-only PDF for OCR, and returns in-memory `File` objects; it never uploads the combined original.

Reject individual files over 10MB, more files than the 50-student roster, combined files over 100MB, combined documents over 300 pages, invalid PDF signatures, duplicate student links, and any page-count mismatch before splitting.

- [ ] **Step 4: Implement upload UI**

Offer `학생별 개별 PDF` and `명단 순서 합본 PDF`. Combined mode requires answer pages per student and the explicit checkbox `각 학생 묶음 첫 페이지가 수행평가 안내 표지`. Show expected/actual page count and student ranges before enabling split.

- [ ] **Step 5: Test and commit**

Run: `npm test -- tests/student-packets.test.mjs tests/student-pdf-upload.test.jsx tests/ocr-grading-stage.test.jsx`

Expected: PASS and the old ten-file tests are replaced by roster-size tests.

```bash
git add lib/pdf/student-packets.js components/workflow/StudentPdfUpload.jsx components/workflow/OcrGradingStage.jsx tests
git commit -m "feat: split student PDF packets"
```

### Task 8: Preserve safe Upstage element coordinates and visual mode

**Files:**
- Modify: `lib/upstage/document-parse.js`
- Modify: `app/api/ocr/route.js`
- Modify: `tests/document-parse.test.mjs`
- Modify: `tests/ocr-route.test.mjs`
- Modify: `scripts/check-upstage-ocr.mjs`

- [ ] **Step 1: Write failing normalization tests**

```js
expect(normalizeDocumentElements({ elements: [{
    id: 7,
    category: 'equation',
    page: 2,
    coordinates: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.3 }],
    content: { text: 'x²=4' },
    confidence: 0.71,
}] })).toEqual([{ id: '7', category: 'equation', page: 2, text: 'x²=4', coordinates: expect.any(Array), confidence: 0.71 }]);
```

Add rejection/truncation cases for non-finite coordinates, text over 2,000 characters per element, more than 2,000 elements, and raw/base64 fields.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/document-parse.test.mjs tests/ocr-route.test.mjs`

Expected: FAIL because only normalized text is returned.

- [ ] **Step 3: Implement bounded element output and mode selection**

`parseDocument(file, { visualAnalysis })` sets Standard fields by default. If visual analysis is true and `UPSTAGE_DOCUMENT_PARSE_ENHANCED_MODEL` is configured, add its model/mode fields; on Enhanced failure return an explicit error rather than silently grading Standard output. Return:

```js
{ extractedText, elements, ocrModel, ocrMode, pageCount, requiresVisualReview }
```

Set `requiresVisualReview` when elements include `equation`, `chart`, or `figure`, or when a confidence value is below `0.85`.

- [ ] **Step 4: Update route and smoke summary**

Accept a boolean-like `visualAnalysis` multipart field, return only bounded normalized fields, and keep keys/raw payload/base64 out of logs and response.

- [ ] **Step 5: Test and commit**

Run: `npm test -- tests/document-parse.test.mjs tests/ocr-route.test.mjs tests/ocr-smoke-script.test.mjs`

Expected: PASS.

```bash
git add lib/upstage/document-parse.js app/api/ocr/route.js scripts/check-upstage-ocr.mjs tests
git commit -m "feat: retain OCR evidence coordinates"
```

### Task 9: Render the original PDF and link grading evidence

**Files:**
- Create: `components/workflow/PdfEvidenceViewer.jsx`
- Modify: `components/workflow/OcrGradingStage.jsx`
- Modify: `app/globals.css`
- Create: `tests/pdf-evidence-viewer.test.jsx`
- Modify: `tests/ocr-grading-stage.test.jsx`

- [ ] **Step 1: Write failing viewer and review-gate tests**

```jsx
expect(screen.getByRole('tab', { name: '원본 답안' })).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: '관찰 근거 원본에서 보기' }));
expect(screen.getByLabelText('PDF 페이지')).toHaveValue(2);
expect(screen.getByTestId('evidence-highlight')).toBeVisible();
expect(screen.getByRole('button', { name: '김하늘 채점 승인' })).toBeDisabled();
await user.click(screen.getByLabelText('김하늘 원본 답안 확인 완료'));
expect(screen.getByRole('button', { name: '김하늘 채점 승인' })).toBeEnabled();
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/pdf-evidence-viewer.test.jsx tests/ocr-grading-stage.test.jsx`

Expected: FAIL because no viewer or review gate exists.

- [ ] **Step 3: Implement PDF.js viewer**

Dynamically import `pdfjs-dist`, configure its worker with `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`, render one page to canvas, and provide previous/next, page input, zoom, rotate, fit-width, and fullscreen controls. Translate normalized source coordinates into overlay rectangles on the rendered viewport.

- [ ] **Step 4: Integrate desktop/mobile layouts and lifecycle**

Desktop uses a two-column viewer/editor. Mobile uses tabs `원본 답안`, `OCR 결과`, `채점 결과`. Create and revoke Blob URLs in an effect. Show covers with `채점 제외 표지`. If the file is lost after refresh, show `원본 PDF 다시 연결` and block approval.

- [ ] **Step 5: Add mandatory original review state**

Store `originalAttached`, `originalReviewedAt`, and `originalRevision`. Any PDF reconnect, OCR edit, rubric change, score/evidence/reason change, or regrade clears review and approval. Approval requires a current PDF, current grading, all required source checks, and `originalReviewedAt`.

- [ ] **Step 6: Test and commit**

Run: `npm test -- tests/pdf-evidence-viewer.test.jsx tests/ocr-grading-stage.test.jsx tests/workflow-lineage.test.mjs`

Expected: PASS.

```bash
git add components/workflow/PdfEvidenceViewer.jsx components/workflow/OcrGradingStage.jsx app/globals.css tests
git commit -m "feat: review grading against original PDFs"
```

### Task 10: Constrain grading to rubric levels and explain every score

**Files:**
- Modify: `lib/grading-schema.js`
- Modify: `lib/workflow-prompts.js`
- Modify: `app/api/grade-submission/route.js`
- Modify: `lib/workflow-lineage.js`
- Modify: `components/workflow/GradingEditor.jsx`
- Modify: `tests/grading-schema.test.mjs`
- Modify: `tests/grade-submission-route.test.mjs`
- Modify: `tests/grading-editor.test.jsx`

- [ ] **Step 1: Write failing allowed-score and reason tests**

```js
const result = {
    criterionId: 'criterion-1',
    selectedLevelId: 'proficient',
    score: 25,
    evidence: '뿌리에 가는 털이 있다',
    reason: '관찰 사실을 정확히 제시했으나 다른 기관과의 비교 증거는 없다.',
    feedback: '다른 기관과 비교해 설명해보세요.',
    confidence: 0.82,
    sourceRefs: [{ elementId: '7', page: 2 }],
    teacherConfirmed: false,
};
expect(gradingOutputSchema.safeParse({ criteria: [result], summary: '요약', nextSteps: '다음 단계' }).success).toBe(true);
```

Route tests must reject score 24 when allowed criterion scores are `[30, 25, 20, 15]`, mismatched level IDs, missing reason, and source refs to unknown elements.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/grading-schema.test.mjs tests/grade-submission-route.test.mjs tests/grading-editor.test.jsx`

Expected: FAIL on the new fields and exact-score validation.

- [ ] **Step 3: Implement grading contract and server validation**

Accept `elements` in the route request. For every criterion, require the exact rubric `levelId` and score pair, direct evidence, level-matching reason, feedback, confidence `0..1`, source refs, and teacher confirmation state. Calculate total on the server. If a visual criterion has no usable source ref, return `requiresTeacherReview: true` and do not invent a high score.

- [ ] **Step 4: Implement level-first editing**

Render a level selector instead of arbitrary numeric input. Display score read-only from the level, then editable evidence, reason, feedback, confidence badge, `원본에서 보기`, and `이 근거 확인` checkbox. Recompute total and revoke approval on every edit.

- [ ] **Step 5: Test and commit**

Run: `npm test -- tests/grading-schema.test.mjs tests/grade-submission-route.test.mjs tests/grading-editor.test.jsx tests/workflow-lineage.test.mjs`

Expected: PASS.

```bash
git add lib/grading-schema.js lib/workflow-prompts.js app/api/grade-submission/route.js lib/workflow-lineage.js components/workflow/GradingEditor.jsx tests
git commit -m "feat: grade only from rubric evidence levels"
```

### Task 11: Add whole-class and individual record regeneration

**Files:**
- Modify: `components/workflow/RecordsStage.jsx`
- Modify: `lib/workflow-prompts.js`
- Modify: `tests/records-stage.test.jsx`
- Modify: `tests/generate-record-route.test.mjs`

- [ ] **Step 1: Write failing regeneration tests**

```jsx
expect(screen.getByRole('button', { name: '전체 다시 생성' })).toBeEnabled();
await user.click(screen.getByRole('button', { name: '전체 다시 생성' }));
expect(await screen.findByText('기존 문장')).toBeInTheDocument();
expect(await screen.findByText('새 AI 초안')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: '김하늘 새 초안 적용' }));
expect(screen.getByDisplayValue('새 AI 초안')).toBeInTheDocument();
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/records-stage.test.jsx tests/generate-record-route.test.mjs`

Expected: FAIL because regeneration overwrites current text immediately.

- [ ] **Step 3: Preserve and compare drafts**

Store `text`, `candidateText`, and `previousText`. Provide `미생성 학생 생성`, `전체 다시 생성`, per-student `생성/다시 생성`, `새 초안 적용`, and `기존 문장 유지`. Include approved reason and observable growth/revision evidence in record prompts; continue forbidding scores, comparison, and personality inference.

- [ ] **Step 4: Test and commit**

Run: `npm test -- tests/records-stage.test.jsx tests/generate-record-route.test.mjs tests/record-schema.test.mjs`

Expected: PASS.

```bash
git add components/workflow/RecordsStage.jsx lib/workflow-prompts.js tests
git commit -m "feat: compare regenerated student records"
```

### Task 12: Add honest global progress and cancellation

**Files:**
- Create: `lib/operation-state.js`
- Create: `components/workflow/OperationProvider.jsx`
- Create: `components/workflow/OperationOverlay.jsx`
- Modify: `components/workflow/TeachingWorkflow.jsx`
- Modify: `components/lesson-plan/LessonPlanWorkspace.jsx`
- Modify: `components/lesson-plan/StandardsStep.jsx`
- Modify: `components/workflow/WorksheetStage.jsx`
- Modify: `components/workflow/AssessmentStage.jsx`
- Modify: `components/workflow/OcrGradingStage.jsx`
- Modify: `components/workflow/RecordsStage.jsx`
- Modify: `app/globals.css`
- Create: `tests/operation-state.test.mjs`
- Create: `tests/operation-overlay.test.jsx`
- Modify: `tests/teaching-workflow.test.jsx`
- Modify: `tests/standards-step.test.jsx`

- [ ] **Step 1: Write failing operation-state tests**

```js
const operation = createOperation({ kind: 'ocr', label: '학생 답안 분석', totalItems: 20, estimateSeconds: 120 });
expect(advanceOperation(operation, { completedItems: 5, phase: 'analyzing' })).toMatchObject({ progress: 25, progressKind: 'actual' });
expect(formatRemainingSeconds(75)).toBe('약 1~2분 남음');
```

Overlay tests assert `role=progressbar`, `aria-valuenow`, current phase, elapsed fallback, cancel after five seconds, focus containment, and reduced-motion class.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/operation-state.test.mjs tests/operation-overlay.test.jsx tests/teaching-workflow.test.jsx`

Expected: FAIL because no shared operation state exists.

- [ ] **Step 3: Implement pure progress calculations**

Define weighted estimated phases:

```js
export const OPERATION_PHASES = {
    preparing: [0, 10],
    uploading: [10, 20],
    parsing: [20, 50],
    generating: [50, 80],
    validating: [80, 95],
    applying: [95, 100],
};
```

Batch progress uses actual `completedItems / totalItems`; single-request progress remains inside its current weighted interval and is labelled `예상 진행률`. Keep session-only moving averages by operation kind, model, pages, and item count.

- [ ] **Step 4: Implement provider and overlay**

The provider owns one active operation and an `AbortController`. The overlay dims the page, renders an opaque panel with label, percent, phase, item counts, remaining range, elapsed overrun message, and cancel. Cancel aborts client fetches, keeps completed batch items, and warns that an already-started Upstage request may still be billed.

- [ ] **Step 5: Replace local loading flags stage by stage**

Wrap standard recommendation, worksheet generation/export, assessment suggestions/generation/export, PDF split/OCR, batch grading, record generation, and document export in the provider. Do not show the overlay for work that finishes in under one second; never allow duplicate submission while active.

- [ ] **Step 6: Test and commit**

Run: `npm test -- tests/operation-state.test.mjs tests/operation-overlay.test.jsx tests/teaching-workflow.test.jsx tests/worksheet-stage.test.jsx tests/assessment-stage.test.jsx tests/ocr-grading-stage.test.jsx tests/records-stage.test.jsx`

Expected: PASS.

```bash
git add lib/operation-state.js components/workflow/OperationProvider.jsx components/workflow/OperationOverlay.jsx components/workflow app/globals.css tests
git commit -m "feat: show honest workflow progress"
```

### Task 13: Migrate workflow storage and stale-state rules

**Files:**
- Modify: `lib/workflow-store.js`
- Modify: `lib/workflow-lineage.js`
- Modify: `tests/workflow-store.test.mjs`
- Modify: `tests/workflow-lineage.test.mjs`

- [ ] **Step 1: Write failing migration tests**

Create version-2 state with fixed rubrics and name-only submissions, load it, and assert version 3 keeps the old text as reference while requiring regenerated assessment/grading. Assert PDF/File/Blob fields are stripped while roster, assessment request, normalized elements, and review timestamps persist.

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/workflow-store.test.mjs tests/workflow-lineage.test.mjs`

Expected: FAIL because storage version 2 does not know the new project shape.

- [ ] **Step 3: Implement version-3 migration**

Set `WORKFLOW_VERSION = 3`. Keep every legacy name-only submission detached with `needsStudentLink: true`; never infer a student ID from a name, even when the name is unique. Mark fixed-rubric assessments `needsRegeneration: true`. Strip `file`, `packetFile`, `answerFile`, `objectUrl`, canvas state, and abort controllers.

- [ ] **Step 4: Update lineage rules**

Assessment changes stale grading; OCR/edit/source-ref changes clear original review and grading approval; roster reorder does not stale results; deleting a roster entry removes its result only after confirmation; record currentness includes reason/growth evidence hashes.

- [ ] **Step 5: Test and commit**

Run: `npm test -- tests/workflow-store.test.mjs tests/workflow-lineage.test.mjs tests/process-tabs.test.jsx`

Expected: PASS.

```bash
git add lib/workflow-store.js lib/workflow-lineage.js tests
git commit -m "feat: migrate evidence workflow state"
```

### Task 14: Complete integrated browser, export, and Upstage verification

**Files:**
- Modify: `e2e/five-stage-workflow.spec.mjs`
- Modify: `scripts/capture-workflow-visual-qa.mjs`
- Modify: `scripts/check-upstage-ocr.mjs`
- Create: `lib/upstage/smoke-contract.js`
- Create: `tests/ocr-smoke-contract.test.mjs`
- Modify: `docs/upstage-ocr-model-evaluation.md`
- Modify: `docs/change-log/2026/07/2026-07-12.md`
- Modify: `DESIGN.md`

- [ ] **Step 1: Extend deterministic E2E fixtures**

Cover this complete path in desktop and mobile projects:

```text
lesson → three backward questions → 60-point rubric → live cover
→ roster Excel import → two-student combined PDF with per-student covers
→ split preview → OCR with one equation review warning
→ source click/highlight → original review → approval
→ whole-class records → individual regeneration comparison
```

Assert every long operation shows progress and that one failed student can be retried without losing the other.

- [ ] **Step 2: Run full unit tests**

Run: `npm test`

Expected: all test files and tests pass with no unhandled rejection.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: curriculum build and Next.js production build exit 0.

- [ ] **Step 4: Run browser suites**

Run: `npm run test:e2e`

Expected: desktop and mobile Playwright projects pass; no console errors, horizontal clipping, or inaccessible controls.

- [ ] **Step 5: Run real Upstage smoke comparisons**

`scripts/check-upstage-ocr.mjs` must print only model/mode, pages, categories, sentinel matches, equation-critical-symbol match, elapsed time, and review-required state. It must not print keys, student names, PDF bytes, or raw OCR. Standard always runs. Enhanced runs only when `UPSTAGE_DOCUMENT_PARSE_ENHANCED_MODEL` is configured and must fail the probe if the response falls back to Standard.

Run:

```bash
npm run check:upstage-ocr
```

Expected: Standard sentinel and mode contract pass; configured Enhanced must return `enhanced_used`/`enhanced` rather than a Standard fallback; equation fixture remains `teacher_review` unless every critical symbol and the review contract permit otherwise. An unconfigured Enhanced model is reported as unavailable, never simulated.

- [ ] **Step 6: Inspect visual evidence**

Run: `node scripts/capture-workflow-visual-qa.mjs`

Inspect 375×812, 768×1024, and 1280×900 captures for the backward form, rubric editor, cover, roster, packet preview, PDF viewer, evidence highlights, progress overlay, errors, and record comparison.

- [ ] **Step 7: Update documentation with exact results**

Record test counts, E2E counts, build result, Upstage Standard/Enhanced result, known math/handwriting limits, and whether a real anonymized Korean student sample was available. Do not claim verified handwriting quality without that sample.

- [ ] **Step 8: Run LazyCodex review and final verification**

Use the LazyCodex code-review, QA, and gate-review workflows against the complete diff. Resolve every blocking correctness, privacy, accessibility, and evidence-traceability finding, then rerun the affected focused tests and the full gate.

- [ ] **Step 9: Commit verification artifacts**

```bash
git add e2e scripts docs DESIGN.md
git commit -m "test: verify backward evidence workflow"
```

## Completion gate

Do not report completion unless all of the following are true:

- variable totals and fixed intervals are editable and validated;
- all three approved teacher questions work and persist;
- every selected standard maps to evidence and rubric criteria;
- student cover reflects live rubric data;
- roster direct/Excel input and combined PDF splitting work in roster order;
- uploaded student originals are viewable on web and source evidence jumps to the page;
- original review is mandatory before final approval;
- math/visual uncertainty cannot silently become a final score;
- grading uses only defined level scores and gives evidence, reason, and feedback;
- worksheet, rubric, grading, and records remain editable;
- whole-class and individual regeneration preserve prior text for comparison;
- long operations show honest phase/progress/ETA and recover from cancellation/partial failure;
- unit tests, production build, desktop/mobile E2E, visual QA, and real Upstage smoke checks pass;
- dated change records contain exact outcomes and remaining limitations.
