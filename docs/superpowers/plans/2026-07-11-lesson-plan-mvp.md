# Lesson Plan MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Next.js MVP that helps Korean elementary, middle, and general high-school teachers select 2022 curriculum standards, choose an instructional model, generate editable single- or multi-session lesson plans with Upstage Solar, and export HWPX, DOCX, or PDF.

**Architecture:** Preprocess the supplied curriculum Markdown into a source-linked static JSON catalog, then enforce school/grade/subject filtering in local code before any AI call. Use Next.js server routes for Upstage requests, a shared Zod lesson-plan schema across generation, browser drafts, and exporters, and a four-step client workspace using the approved Refero reference lock.

**Tech Stack:** Next.js 16.2.10, React 19.2.7, JavaScript with JSDoc types, Zod 4.4.3, Vitest 4.1.10, Testing Library 16.3.2, Playwright 1.61.1, docx 9.7.1, pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1, JSZip 3.10.1, Paperlogy 1.001.

---

## File map

```text
app/
  api/recommend-standards/route.js   # Upstage ranking with local allow-list verification
  api/generate-plan/route.js         # Upstage structured lesson-plan generation
  api/export/[format]/route.js        # HWPX/DOCX/PDF response dispatch
  globals.css                         # Approved tokens, Paperlogy faces, responsive rules
  layout.js                           # Metadata and font preload
  page.js                             # Workspace shell only
components/lesson-plan/
  LessonPlanWorkspace.js              # Four-step state orchestration and draft persistence
  StepNavigation.js                   # Desktop sidebar and mobile progress
  LessonBasicsStep.js                 # School, grade, subject, sessions, intent
  StandardsStep.js                    # Direct search and AI candidates
  InstructionModelStep.js             # Recommendation and final model selection
  LessonPlanEditor.js                 # Editable normalized output and export controls
data/
  curriculum.json                     # Generated canonical achievement standards
  instruction-models.js               # Curated model metadata and local scoring hints
lib/
  curriculum/extract.js               # Markdown parser and classification
  curriculum/search.js                # Strict scope filter and lexical candidate search
  draft-store.js                      # Versioned localStorage adapter
  lesson-plan-schema.js               # Shared Zod contracts and defaults
  upstage/client.js                    # Fetch client, timeout, parse, typed errors
  upstage/prompts.js                   # Recommendation and generation prompts
  export/docx.js                      # DOCX builder
  export/hwpx.js                      # OWPML ZIP builder
  export/pdf.js                       # PDF builder with embedded Paperlogy
public/fonts/paperlogy/                # Official local font files and OFL license
scripts/build-curriculum.mjs           # Reproducible catalog build entry point
tests/                                # Unit, route, exporter, and source-contract tests
e2e/lesson-plan.spec.js                # Happy path, failure path, responsive workflow
```

## Task 1: Scaffold the Next.js app and test harness

**Files:**
- Create: `package.json`
- Create: `jsconfig.json`
- Create: `next.config.mjs`
- Create: `vitest.config.mjs`
- Create: `vitest.setup.mjs`
- Create: `app/layout.js`
- Create: `app/page.js`
- Create: `app/globals.css`
- Create: `.gitignore`
- Create: `.env.example`
- Test: `tests/smoke.test.jsx`

- [ ] **Step 1: Write the failing application smoke test**

```jsx
// tests/smoke.test.jsx
import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

test('renders the lesson-plan product entry point', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: '수업 지도안 만들기' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Create package and test configuration, install dependencies, and verify RED**

```json
{
  "name": "allpass-teaching",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "npm run curriculum:build && next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "curriculum:build": "node scripts/build-curriculum.mjs"
  },
  "dependencies": {
    "@pdf-lib/fontkit": "1.1.1",
    "docx": "9.7.1",
    "jszip": "3.10.1",
    "next": "16.2.10",
    "pdf-lib": "1.17.1",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@vitejs/plugin-react": "6.0.3",
    "jsdom": "29.1.1",
    "vite-tsconfig-paths": "6.1.1",
    "vitest": "4.1.10"
  }
}
```

Run: `npm install && npm test -- tests/smoke.test.jsx`
Expected: FAIL because `app/page.js` does not exist.

- [ ] **Step 3: Add the minimum app shell and safe configuration**

```jsx
// app/page.js
export default function Home() {
    return <main><h1>수업 지도안 만들기</h1></main>;
}
```

```dotenv
# .env.example
UPSTAGE_API_KEY=
UPSTAGE_MODEL=solar-pro3
```

`.gitignore` must include `.next/`, `node_modules/`, `.env*`, `!.env.example`, `test-results/`, `playwright-report/`, `.superpowers/`, and `.DS_Store`.

- [ ] **Step 4: Verify GREEN and production compilation**

Run: `npm test -- tests/smoke.test.jsx && npm run build`
Expected: smoke test PASS and Next.js build PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json jsconfig.json next.config.mjs vitest.config.mjs vitest.setup.mjs app .gitignore .env.example tests/smoke.test.jsx
git commit -m "chore: scaffold lesson plan app"
```

## Task 2: Add the Paperlogy design foundation

**Files:**
- Create: `public/fonts/paperlogy/Paperlogy-4Regular.woff2`
- Create: `public/fonts/paperlogy/Paperlogy-5Medium.woff2`
- Create: `public/fonts/paperlogy/Paperlogy-6SemiBold.woff2`
- Create: `public/fonts/paperlogy/Paperlogy-7Bold.woff2`
- Create: `public/fonts/paperlogy/OFL.txt`
- Modify: `app/globals.css`
- Modify: `app/layout.js`
- Test: `tests/design-contract.test.mjs`

- [ ] **Step 1: Write a source-contract test for the approved reference lock**

```js
// tests/design-contract.test.mjs
import { readFile } from 'node:fs/promises';
import { test, expect } from 'vitest';

test('uses local Paperlogy and approved green action token', async () => {
    const css = await readFile('app/globals.css', 'utf8');
    expect(css).toContain("font-family: 'Paperlogy'");
    expect(css).toContain('--color-action: #176f5b');
    expect(css).not.toMatch(/#6366f1|#8b5cf6|linear-gradient/i);
});
```

- [ ] **Step 2: Run the contract test to verify RED**

Run: `npm test -- tests/design-contract.test.mjs`
Expected: FAIL because Paperlogy faces and tokens are absent.

- [ ] **Step 3: Download official v1.001, convert only required weights to WOFF2, preserve OFL, and define tokens**

```css
@font-face { font-family:'Paperlogy'; src:url('/fonts/paperlogy/Paperlogy-4Regular.woff2') format('woff2'); font-weight:400; font-display:swap; }
@font-face { font-family:'Paperlogy'; src:url('/fonts/paperlogy/Paperlogy-5Medium.woff2') format('woff2'); font-weight:500; font-display:swap; }
@font-face { font-family:'Paperlogy'; src:url('/fonts/paperlogy/Paperlogy-6SemiBold.woff2') format('woff2'); font-weight:600; font-display:swap; }
@font-face { font-family:'Paperlogy'; src:url('/fonts/paperlogy/Paperlogy-7Bold.woff2') format('woff2'); font-weight:700; font-display:swap; }
:root {
    --color-canvas:#f6f5f2; --color-surface:#ffffff; --color-ink:#2f302d;
    --color-muted:#65655f; --color-border:#d9d8d2; --color-action:#176f5b;
    --color-action-hover:#105947; --radius-control:7px; --radius-panel:10px;
    --shadow-focus:0 0 0 3px rgba(23,111,91,.18);
}
html { font-family:'Paperlogy',system-ui,sans-serif; background:var(--color-canvas); color:var(--color-ink); }
*:focus-visible { outline:2px solid var(--color-action); outline-offset:2px; }
```

- [ ] **Step 4: Verify font assets and design contract**

Run: `npm test -- tests/design-contract.test.mjs && test -s public/fonts/paperlogy/OFL.txt`
Expected: PASS; all four WOFF2 files and the license are non-empty.

- [ ] **Step 5: Commit**

```bash
git add public/fonts/paperlogy app/globals.css app/layout.js tests/design-contract.test.mjs
git commit -m "feat: add Paperlogy design foundation"
```

## Task 3: Extract a canonical curriculum catalog

**Files:**
- Create: `lib/curriculum/extract.js`
- Create: `scripts/build-curriculum.mjs`
- Create: `data/curriculum.json`
- Test: `tests/curriculum-extract.test.mjs`
- Test: `tests/curriculum-catalog.test.mjs`

- [ ] **Step 1: Write failing parser tests from real curriculum lines**

```js
import { test, expect } from 'vitest';
import { extractStandards } from '@/lib/curriculum/extract';

test('joins wrapped achievement-standard text and classifies elementary math', () => {
    const source = '[2수01-01] 수의 필요성을 인식하면서 0과 100까지의 수 개념을 이해하고, 수를 세고 읽고 쓸 수\n있다.';
    expect(extractStandards(source, { subject:'수학', sourceFile:'book_08.md' })).toEqual([
        expect.objectContaining({ code:'2수01-01', schoolLevel:'elementary', gradeBand:'1-2', subject:'수학', text:expect.stringContaining('쓸 수 있다.') })
    ]);
});
```

- [ ] **Step 2: Run parser tests to verify RED**

Run: `npm test -- tests/curriculum-extract.test.mjs`
Expected: FAIL because extractor is missing.

- [ ] **Step 3: Implement deterministic extraction and classification**

```js
const STANDARD_START = /^\[([0-9]{1,2}[가-힣A-Za-z]+\d{2}-\d{2})\]\s*(.+)$/;

export function extractStandards(markdown, metadata) {
    const records = [];
    let current = null;
    for (const raw of markdown.split(/\r?\n/)) {
        const line = raw.trim();
        const match = line.match(STANDARD_START);
        if (match) {
            if (current) records.push(current);
            current = makeRecord(match[1], match[2], metadata);
        } else if (current && line && !line.startsWith('•') && !line.startsWith('#')) {
            current.text = `${current.text} ${line}`.replace(/\s+/g, ' ').trim();
        }
    }
    if (current) records.push(current);
    return records;
}
```

`makeRecord` must derive elementary `2/4/6`, middle `9`, and high-school subject codes from the code and nearest parsed section context; retain `sourceFile` and `sourcePage`. Reject professional-subject manifest categories and `duplicate_of` entries.

- [ ] **Step 4: Build and validate the real catalog**

Run: `npm run curriculum:build && npm test -- tests/curriculum-extract.test.mjs tests/curriculum-catalog.test.mjs`
Expected: PASS; every record has unique `code + subject`, non-empty text/source, and schoolLevel in `elementary|middle|high`.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum scripts/build-curriculum.mjs data/curriculum.json tests/curriculum-*.test.mjs
git commit -m "feat: build curriculum standards catalog"
```

## Task 4: Add strict curriculum search and instructional-model catalogs

**Files:**
- Create: `lib/curriculum/search.js`
- Create: `data/instruction-models.js`
- Test: `tests/curriculum-search.test.mjs`
- Test: `tests/instruction-models.test.mjs`

- [ ] **Step 1: Write failing scope and ranking tests**

```js
test('never returns another school level or subject', () => {
    const results = searchStandards(catalog, { schoolLevel:'elementary', gradeBand:'5-6', subject:'과학', query:'식물 성장 조건' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(item => item.schoolLevel === 'elementary' && item.subject === '과학')).toBe(true);
});

test('recommends inquiry and experiment models for an observation lesson', () => {
    expect(recommendModels('식물 성장 조건을 실험하고 관찰한다', 3).map(item => item.id)).toEqual(expect.arrayContaining(['inquiry','experiment']));
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/curriculum-search.test.mjs tests/instruction-models.test.mjs`
Expected: FAIL because catalogs and search functions are missing.

- [ ] **Step 3: Implement strict filtering before lexical scoring**

```js
export function searchStandards(catalog, scope, limit = 30) {
    const tokens = tokenize(scope.query);
    return catalog
        .filter(item => item.schoolLevel === scope.schoolLevel && item.gradeBand === scope.gradeBand && item.subject === scope.subject)
        .map(item => ({ ...item, lexicalScore: tokens.reduce((sum, token) => sum + (item.text.includes(token) ? 1 : 0), 0) }))
        .sort((a, b) => b.lexicalScore - a.lexicalScore || a.code.localeCompare(b.code, 'ko'))
        .slice(0, limit);
}
```

Instruction models must include the 11 common models and subject-specific variants from the design, each with `id`, `name`, `summary`, `bestFor`, `schoolLevels`, `subjects`, `stages`, `cautions`, and `keywords`.

- [ ] **Step 4: Verify strict scope and model coverage**

Run: `npm test -- tests/curriculum-search.test.mjs tests/instruction-models.test.mjs`
Expected: PASS, including empty results for invalid school/subject combinations.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum/search.js data/instruction-models.js tests/curriculum-search.test.mjs tests/instruction-models.test.mjs
git commit -m "feat: add scoped curriculum and model search"
```

## Task 5: Define the shared lesson-plan schema and draft persistence

**Files:**
- Create: `lib/lesson-plan-schema.js`
- Create: `lib/draft-store.js`
- Test: `tests/lesson-plan-schema.test.mjs`
- Test: `tests/draft-store.test.mjs`

- [ ] **Step 1: Write failing schema and migration tests**

```js
test('rejects sessions whose stage minutes do not match session minutes', () => {
    const result = lessonPlanSchema.safeParse(makePlan({ sessionMinutes:40, stages:[{ minutes:10 }, { minutes:20 }] }));
    expect(result.success).toBe(false);
});

test('drops an incompatible persisted draft version', () => {
    localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version:0, data:{ unsafe:true } }));
    expect(loadDraft()).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/lesson-plan-schema.test.mjs tests/draft-store.test.mjs`
Expected: FAIL because schema and storage adapter are missing.

- [ ] **Step 3: Implement canonical Zod contracts and versioned storage**

```js
export const lessonStageSchema = z.object({
    phase:z.enum(['도입','전개','정리']), teacherActivities:z.array(z.string()).min(1),
    studentActivities:z.array(z.string()).min(1), minutes:z.number().int().positive(),
    materialsAndNotes:z.array(z.string()).default([])
});

export const DRAFT_VERSION = 1;
export function saveDraft(data) { localStorage.setItem(DRAFT_KEY, JSON.stringify({ version:DRAFT_VERSION, savedAt:new Date().toISOString(), data })); }
export function loadDraft() { const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return value?.version === DRAFT_VERSION ? value.data : null; }
```

Add a `superRefine` rule that requires each session's stage-minute sum to equal `sessionMinutes`.

- [ ] **Step 4: Verify schemas and persistence**

Run: `npm test -- tests/lesson-plan-schema.test.mjs tests/draft-store.test.mjs`
Expected: PASS for single/multi-session fixtures, invalid standards, time mismatch, save/load/clear.

- [ ] **Step 5: Commit**

```bash
git add lib/lesson-plan-schema.js lib/draft-store.js tests/lesson-plan-schema.test.mjs tests/draft-store.test.mjs
git commit -m "feat: define lesson plan draft contract"
```

## Task 6: Build the responsive four-step workspace and basics step

**Files:**
- Create: `components/lesson-plan/LessonPlanWorkspace.js`
- Create: `components/lesson-plan/StepNavigation.js`
- Create: `components/lesson-plan/LessonBasicsStep.js`
- Modify: `app/page.js`
- Modify: `app/globals.css`
- Test: `tests/lesson-basics-step.test.jsx`
- Test: `tests/workspace-navigation.test.jsx`

- [ ] **Step 1: Write failing interaction tests**

```jsx
test('switches to multi-session and validates 2 through 10 sessions', async () => {
    render(<LessonPlanWorkspace />);
    await user.click(screen.getByRole('radio', { name:'연속 차시 수업' }));
    const sessions = screen.getByLabelText('차시 수');
    await user.clear(sessions); await user.type(sessions, '3');
    expect(sessions).toHaveValue(3);
});

test('does not advance without school, grade, subject, and lesson intent', async () => {
    render(<LessonPlanWorkspace />);
    await user.click(screen.getByRole('button', { name:'성취기준 찾기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('필수 정보를 확인해주세요');
});
```

- [ ] **Step 2: Run UI tests to verify RED**

Run: `npm test -- tests/lesson-basics-step.test.jsx tests/workspace-navigation.test.jsx`
Expected: FAIL because workspace components are missing.

- [ ] **Step 3: Implement controlled form, dependent selects, navigation, and autosave**

```jsx
export function LessonPlanWorkspace() {
    const [step, setStep] = useState(1);
    const [draft, setDraft] = useState(() => loadDraft() ?? createEmptyDraft());
    useEffect(() => { const id = setTimeout(() => saveDraft(draft), 300); return () => clearTimeout(id); }, [draft]);
    return <div className="workspace"><StepNavigation current={step} /><section className="workspace__main">{step === 1 && <LessonBasicsStep value={draft.basics} onChange={basics => setDraft({ ...draft, basics })} onNext={() => setStep(2)} />}</section></div>;
}
```

Use real labels, inline errors with `aria-describedby`, 44px controls, and desktop sidebar/mobile top progress from the approved mockup.

- [ ] **Step 4: Verify interactions and responsive CSS contract**

Run: `npm test -- tests/lesson-basics-step.test.jsx tests/workspace-navigation.test.jsx`
Expected: PASS; direct input restores after remount and school changes clear incompatible grade/subject.

- [ ] **Step 5: Commit**

```bash
git add components/lesson-plan app/page.js app/globals.css tests/lesson-basics-step.test.jsx tests/workspace-navigation.test.jsx
git commit -m "feat: build lesson setup workspace"
```

## Task 7: Add Upstage client and verified standard recommendations

**Files:**
- Create: `lib/upstage/client.js`
- Create: `lib/upstage/prompts.js`
- Create: `app/api/recommend-standards/route.js`
- Create: `components/lesson-plan/StandardsStep.js`
- Test: `tests/upstage-client.test.mjs`
- Test: `tests/recommend-standards-route.test.mjs`
- Test: `tests/standards-step.test.jsx`

- [ ] **Step 1: Write failing timeout, allow-list, and UI tests**

```js
test('removes model-returned codes outside the server allow-list', async () => {
    mockSolar([{ code:'6과12-01', score:92, reason:'적합' }, { code:'9수01-01', score:99, reason:'범위 밖' }]);
    const response = await POST(makeRequest({ schoolLevel:'elementary', gradeBand:'5-6', subject:'과학', query:'식물 성장' }));
    expect((await response.json()).recommendations.map(item => item.code)).toEqual(['6과12-01']);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/upstage-client.test.mjs tests/recommend-standards-route.test.mjs tests/standards-step.test.jsx`
Expected: FAIL because API and UI are missing.

- [ ] **Step 3: Implement server-only Upstage fetch and strict verification**

```js
export async function chatJson({ messages, schema, timeoutMs = 30000 }) {
    if (!process.env.UPSTAGE_API_KEY) throw new UpstageError('missing_key', 503);
    const response = await fetch('https://api.upstage.ai/v1/chat/completions', {
        method:'POST', signal:AbortSignal.timeout(timeoutMs),
        headers:{ Authorization:`Bearer ${process.env.UPSTAGE_API_KEY}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ model:process.env.UPSTAGE_MODEL || 'solar-pro3', messages, response_format:{ type:'json_object' } })
    });
    if (!response.ok) throw new UpstageError('upstream_error', response.status);
    return schema.parse(JSON.parse((await response.json()).choices[0].message.content));
}
```

The route must obtain the allow-list from `searchStandards`, send only those candidates, merge AI reasons into canonical local records, and return 503 with `code:'missing_key'` while preserving direct search.

- [ ] **Step 4: Verify direct search, recommendation, missing-key, timeout, and retry states**

Run: `npm test -- tests/upstage-client.test.mjs tests/recommend-standards-route.test.mjs tests/standards-step.test.jsx`
Expected: PASS and no API key text appears in client bundles or snapshots.

- [ ] **Step 5: Commit**

```bash
git add lib/upstage app/api/recommend-standards components/lesson-plan/StandardsStep.js tests/upstage-client.test.mjs tests/recommend-standards-route.test.mjs tests/standards-step.test.jsx
git commit -m "feat: recommend verified curriculum standards"
```

## Task 8: Add instructional-model selection

**Files:**
- Create: `components/lesson-plan/InstructionModelStep.js`
- Modify: `components/lesson-plan/LessonPlanWorkspace.js`
- Test: `tests/instruction-model-step.test.jsx`

- [ ] **Step 1: Write failing recommendation and final-choice tests**

```jsx
test('shows three suggestions but allows any one catalog model', async () => {
    render(<InstructionModelStep lessonIntent="식물 성장 조건 실험 관찰" />);
    expect(screen.getAllByText('추천').length).toBe(3);
    await user.click(screen.getByRole('radio', { name:/협동 학습/ }));
    expect(screen.getByRole('radio', { name:/협동 학습/ })).toBeChecked();
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- tests/instruction-model-step.test.jsx`
Expected: FAIL because component is missing.

- [ ] **Step 3: Implement explainable local recommendations and accessible selection**

Render the top three with `추천` and match reasons; render all remaining models under `전체 수업 모형`. Expanding a model reveals stages, best-use cases, and cautions. Require exactly one selected model before generation.

- [ ] **Step 4: Verify keyboard selection, expansion, and persistence**

Run: `npm test -- tests/instruction-model-step.test.jsx tests/workspace-navigation.test.jsx`
Expected: PASS; selected model survives backward navigation.

- [ ] **Step 5: Commit**

```bash
git add components/lesson-plan/InstructionModelStep.js components/lesson-plan/LessonPlanWorkspace.js tests/instruction-model-step.test.jsx
git commit -m "feat: add instructional model selection"
```

## Task 9: Generate and validate single- and multi-session plans

**Files:**
- Create: `app/api/generate-plan/route.js`
- Modify: `lib/upstage/prompts.js`
- Create: `components/lesson-plan/GenerationStatus.js`
- Modify: `components/lesson-plan/LessonPlanWorkspace.js`
- Test: `tests/generate-plan-route.test.mjs`
- Test: `tests/generation-status.test.jsx`

- [ ] **Step 1: Write failing generation-contract tests**

```js
test('rejects hallucinated standards and mismatched session minutes', async () => {
    mockSolar(makeGeneratedPlan({ standards:['NOT-REAL'], sessionMinutes:40, stageMinutes:[10,20] }));
    const response = await POST(makeGenerationRequest(validDraft));
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('invalid_generation');
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/generate-plan-route.test.mjs tests/generation-status.test.jsx`
Expected: FAIL because generation route is missing.

- [ ] **Step 3: Implement prompt, schema parse, one repair attempt, and status UI**

The system prompt must state: use only supplied canonical standards; follow the selected model stages; write observable learning goals; include process assessment and differentiated support; create exactly requested sessions; make stage minutes equal each session's duration; return JSON only. Parse through `lessonPlanSchema`; on failure send only schema issues and invalid JSON for one repair request, then return 422.

- [ ] **Step 4: Verify single/multi-session success and all failure states**

Run: `npm test -- tests/generate-plan-route.test.mjs tests/generation-status.test.jsx`
Expected: PASS for 1 and 3 sessions, retry repair, missing key, timeout, cancel, and preserved draft.

- [ ] **Step 5: Commit**

```bash
git add app/api/generate-plan lib/upstage/prompts.js components/lesson-plan/GenerationStatus.js components/lesson-plan/LessonPlanWorkspace.js tests/generate-plan-route.test.mjs tests/generation-status.test.jsx
git commit -m "feat: generate validated lesson plans"
```

## Task 10: Build the editable lesson-plan result

**Files:**
- Create: `components/lesson-plan/LessonPlanEditor.js`
- Create: `components/lesson-plan/SessionEditor.js`
- Modify: `components/lesson-plan/LessonPlanWorkspace.js`
- Test: `tests/lesson-plan-editor.test.jsx`

- [ ] **Step 1: Write failing edit, restore, copy, and time-warning tests**

```jsx
test('edits a cell and restores the generated original', async () => {
    render(<LessonPlanEditor plan={validPlan} />);
    const goal = screen.getByLabelText('학습 목표 1');
    await user.clear(goal); await user.type(goal, '수정한 목표');
    await user.click(screen.getByRole('button', { name:'생성 원본으로 되돌리기' }));
    expect(goal).toHaveValue(validPlan.learningGoals[0]);
});
```

- [ ] **Step 2: Run editor tests to verify RED**

Run: `npm test -- tests/lesson-plan-editor.test.jsx`
Expected: FAIL because editor is missing.

- [ ] **Step 3: Implement normalized controlled editing without `contentEditable`**

Use labeled inputs/textareas per field and table cell, session tabs/accordions, overall sequence first for multi-session plans, copy-as-plain-text, dirty-state warning, original snapshot restore confirmation, and inline minute-total warnings with “균등 조정” and manual edit actions.

- [ ] **Step 4: Verify editing and Korean document structure**

Run: `npm test -- tests/lesson-plan-editor.test.jsx`
Expected: PASS for single/multi-session edit, restore confirmation, copy output, minute adjustment, and draft persistence.

- [ ] **Step 5: Commit**

```bash
git add components/lesson-plan/LessonPlanEditor.js components/lesson-plan/SessionEditor.js components/lesson-plan/LessonPlanWorkspace.js tests/lesson-plan-editor.test.jsx
git commit -m "feat: add editable lesson plan results"
```

## Task 11: Export DOCX, PDF, and valid HWPX

**Files:**
- Create: `lib/export/docx.js`
- Create: `lib/export/pdf.js`
- Create: `lib/export/hwpx.js`
- Create: `lib/export/render-model.js`
- Create: `lib/export/hwpx-template/Contents/header.xml`
- Create: `lib/export/hwpx-template/Contents/content.hpf`
- Create: `lib/export/hwpx-template/META-INF/manifest.xml`
- Create: `app/api/export/[format]/route.js`
- Modify: `components/lesson-plan/LessonPlanEditor.js`
- Test: `tests/export-docx.test.mjs`
- Test: `tests/export-pdf.test.mjs`
- Test: `tests/export-hwpx.test.mjs`
- Test: `tests/export-route.test.mjs`

- [ ] **Step 1: Write failing file-signature and content tests**

```js
test('builds HWPX with uncompressed mimetype first and well-formed required XML', async () => {
    const bytes = await buildHwpx(validPlan);
    const zip = await JSZip.loadAsync(bytes);
    expect(await zip.file('mimetype').async('string')).toBe('application/hwp+zip');
    expect(zip.file('Contents/header.xml')).toBeTruthy();
    expect(zip.file('Contents/section0.xml')).toBeTruthy();
    expect(await zip.file('Contents/section0.xml').async('string')).toContain(validPlan.title);
});
```

- [ ] **Step 2: Run exporter tests to verify RED**

Run: `npm test -- tests/export-*.test.mjs`
Expected: FAIL because exporters are missing.

- [ ] **Step 3: Implement one render model and three format adapters**

`toRenderModel(plan, selectedSessionIds)` must produce ordered blocks (`heading`, `metadataTable`, `standards`, `sessionOverview`, `lessonTable`, `assessment`, `support`, `reflection`). DOCX uses `docx`; PDF embeds Paperlogy Regular/Bold through fontkit; HWPX writes OWPML XML directly with unique IDs, A4 width 42520 HWPUNIT, consistent char/paragraph references, escaped text, and `mimetype` stored first without compression.

- [ ] **Step 4: Verify route headers, parseable files, text, and selected sessions**

Run: `npm test -- tests/export-docx.test.mjs tests/export-pdf.test.mjs tests/export-hwpx.test.mjs tests/export-route.test.mjs`
Expected: PASS; response MIME types and filenames are correct; each format contains title, standards, selected sessions, lesson stages, assessment, and support.

Also run HWPX validation using the installed skill helper:

```bash
python3 /Users/hoonikim/.agents/skills/hwpxskill/scripts/validate.py test-results/fixture.hwpx
```

Expected: ZIP structure, mimetype, required files, and XML well-formedness PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/export app/api/export components/lesson-plan/LessonPlanEditor.js tests/export-*.test.mjs
git commit -m "feat: export lesson plans in three formats"
```

## Task 12: Complete end-to-end, accessibility, and visual QA

**Files:**
- Create: `playwright.config.mjs`
- Create: `e2e/lesson-plan.spec.js`
- Create: `tests/page-parity.test.mjs`
- Modify: UI/CSS files only for defects found
- Create: `.omo/evidence/lesson-plan-mvp/` artifacts during verification, not committed unless repository policy requires it

- [ ] **Step 1: Write the failing E2E happy and failure paths**

```js
test('teacher completes a three-session lesson plan', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('학교급').selectOption('elementary');
    await page.getByLabel('학년').selectOption('5');
    await page.getByLabel('과목').selectOption('과학');
    await page.getByRole('radio', { name:'연속 차시 수업' }).check();
    await page.getByLabel('차시 수').fill('3');
    await page.getByLabel('수업할 개념 및 내용').fill('식물이 자라는 데 필요한 조건을 실험하고 관찰한다');
    await page.getByRole('button', { name:'성취기준 찾기' }).click();
    await expect(page.getByRole('heading', { name:'성취기준 선택' })).toBeVisible();
});
```

Mock Upstage at the network boundary for deterministic E2E tests. Add a missing-key path proving direct standard search remains usable and a generation-error path proving all inputs persist.

- [ ] **Step 2: Run the complete suite to identify remaining failures**

Run: `npm test && npm run build && npm run test:e2e`
Expected: any remaining failures are concrete integration defects, not missing tests.

- [ ] **Step 3: Fix integration and accessibility defects only**

Run Playwright at 1440×1000, 1024×768, and 390×844. Verify keyboard-only completion, focus order, alert announcements, no horizontal overflow, natural Korean line breaks, and all four workflow states. Do not add decorative motion, gradients, extra cards, or colors outside the reference lock.

- [ ] **Step 4: Run mandatory Refero and LazyCodex visual QA**

Capture every enumerated page/state at desktop and mobile: basics, standards direct search, standards AI results, model selection, generation loading/error, single-session result, multi-session result, export dialog. Use fresh captures from the current build. Run the installed `omo:visual-qa` process with independent Pass A (design-system/functional integrity) and Pass B (visual/CJK precision); fix and repeat until both return PASS with no blockers.

- [ ] **Step 5: Run final verification wave**

Run: `npm test && npm run build && npm run test:e2e`
Expected: all unit/route/export/E2E tests PASS; build exits 0; HWPX validator exits 0; fresh visual QA passes.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.mjs e2e tests/page-parity.test.mjs app components
git commit -m "test: verify lesson plan workflow end to end"
```

## Final acceptance checklist

- [ ] `UPSTAGE_API_KEY` is absent from client output, Git history, and committed files.
- [ ] Curriculum catalog is reproducible from canonical non-duplicate source documents.
- [ ] Every recommendation and generated standard is within the selected scope and local allow-list.
- [ ] Single- and 2~10-session plans validate and preserve exact minute totals.
- [ ] AI failure never destroys teacher input or disables direct curriculum search.
- [ ] Paperlogy is local, licensed, loaded, and used at the approved weights.
- [ ] DOCX, PDF, and HWPX contain equivalent selected content and open as valid files.
- [ ] Desktop/mobile workflows, keyboard access, and Korean wrapping pass fresh visual QA.
- [ ] No account, database, collaboration, custom template upload, or professional-subject scope was added.
