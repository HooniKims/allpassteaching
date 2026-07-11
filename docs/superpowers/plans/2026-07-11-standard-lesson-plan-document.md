# Standard Lesson Plan Document Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 텍스트 나열형 지도안을 학교 현장에서 바로 사용하는 2쪽 표준 교수·학습 과정안으로 바꾸고 HWPX·DOCX·PDF에 같은 구조로 출력한다.

**Architecture:** `lessonPlanSchema`를 표준 과정안 필드로 확장하고, 이전 초안은 정규화 함수로 호환한다. 화면과 세 내보내기 생성기는 동일한 `buildDocumentModel(plan)` 결과를 사용하며, 형식별 렌더러는 레이아웃만 담당한다.

**Tech Stack:** Next.js 16, React 19, Zod 4, Upstage Chat API, docx, JSZip/OWPML HWPX, pdf-lib/fontkit, Vitest, Playwright, axe-core

---

## 파일 구조

- `lib/lesson-plan-schema.js`: 확장된 AI 결과 계약과 시간·필수 필드 검증
- `lib/lesson-plan-normalize.js`: 이전 localStorage 초안과 이전 API 결과를 새 계약으로 변환
- `lib/export/document-model.js`: 화면과 세 파일이 공유하는 표준 과정안 문서 모델
- `lib/export/docx.js`: 공통 모델을 Word 표와 페이지 나눔으로 렌더링
- `lib/export/pdf.js`: 공통 모델을 A4 표 레이아웃으로 렌더링
- `lib/export/hwpx.js`: 공통 모델을 OWPML 표와 페이지 나눔으로 렌더링
- `lib/export/hwpx-style.js`: HWPX 문자·문단·테두리 스타일과 표 XML 헬퍼
- `components/lesson-plan/LessonBasicsStep.jsx`: 선택형 행정 정보 입력
- `components/lesson-plan/LessonPlanEditor.jsx`: 표준 과정안 미리보기 조립
- `components/lesson-plan/SessionEditor.jsx`: 6열 과정 표 편집
- `components/lesson-plan/AssessmentEditor.jsx`: 4열 평가 표 편집
- `app/globals.css`: 화면용 문서 표와 모바일 재배치
- `lib/upstage/prompts.js`: 확장 계약과 학교 수업 용어를 강제하는 생성 프롬프트
- `app/api/generate-plan/route.js`: 정규화, 검증, 한 번 교정

### Task 1: 확장 지도안 데이터 계약과 이전 초안 호환

**Files:**
- Modify: `lib/lesson-plan-schema.js`
- Create: `lib/lesson-plan-normalize.js`
- Modify: `lib/draft-store.js`
- Modify: `tests/fixtures/lesson-plan.mjs`
- Test: `tests/lesson-plan-schema.test.mjs`
- Create: `tests/lesson-plan-normalize.test.mjs`

- [ ] **Step 1: 새 필드와 이전 초안 변환의 실패 테스트 작성**

```js
import { expect, test } from 'vitest';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { normalizeLessonPlan } from '@/lib/lesson-plan-normalize';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

test('표준 과정안 필드를 검증한다', () => {
    const plan = normalizeLessonPlan(makeGeneratedPlan());
    expect(lessonPlanSchema.parse(plan).essentialQuestion).toBeTruthy();
    expect(plan.sessions[0].stages[0]).toMatchObject({ learningElement: expect.any(String), teacherQuestions: expect.any(Array), expectedStudentResponses: expect.any(Array), supportNotes: expect.any(Array) });
    expect(plan.assessment[0]).toMatchObject({ method: expect.any(String), levelFeedback: expect.any(Object) });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run tests/lesson-plan-schema.test.mjs tests/lesson-plan-normalize.test.mjs`
Expected: FAIL with `normalizeLessonPlan` module missing or new fields undefined.

- [ ] **Step 3: 스키마와 정규화 구현**

```js
const metadataSchema = z.object({ date: z.string().default(''), place: z.string().default(''), className: z.string().default(''), teacherName: z.string().default('') });
const levelFeedbackSchema = z.object({ needsSupport: z.string().min(1), meets: z.string().min(1), exceeds: z.string().min(1) });

export function normalizeLessonPlan(plan) {
    return {
        ...plan,
        metadata: { date: '', place: '', className: '', teacherName: '', ...plan.metadata },
        unitTitle: plan.unitTitle || plan.title,
        essentialQuestion: plan.essentialQuestion || plan.learningGoals?.[0] || '학생의 배움을 확인할 핵심 질문을 입력하세요.',
        sessions: plan.sessions.map(session => ({ ...session, nextSessionConnection: session.nextSessionConnection || '다음 학습과 연결할 내용을 입력하세요.', stages: session.stages.map(stage => ({ ...stage, learningElement: stage.learningElement || stage.phase, teacherQuestions: stage.teacherQuestions || stage.teacherActivities.slice(0, 1), expectedStudentResponses: stage.expectedStudentResponses || stage.studentActivities.slice(0, 1), supportNotes: stage.supportNotes || [] })) })),
        assessment: plan.assessment.map(item => ({ ...item, method: item.method || '관찰 및 산출물 확인', levelFeedback: item.levelFeedback || { needsSupport: item.feedback, meets: item.feedback, exceeds: item.feedback } })),
    };
}
```

같은 단계에서 `tests/fixtures/lesson-plan.mjs`의 기본 fixture에 새 필드를 추가하고, 첫 차시를 복제해 `id`, `order`, `title`을 바꾼 `makeTwoSessionPlan()`을 export한다. 이후 모든 문서 테스트는 이 helper를 사용한다.

- [ ] **Step 4: localStorage 불러오기에서 정규화 적용 후 테스트**

Run: `npm test -- --run tests/lesson-plan-schema.test.mjs tests/lesson-plan-normalize.test.mjs tests/draft-store.test.mjs`
Expected: all tests PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/lesson-plan-schema.js lib/lesson-plan-normalize.js lib/draft-store.js tests/fixtures/lesson-plan.mjs tests/lesson-plan-schema.test.mjs tests/lesson-plan-normalize.test.mjs
git commit -m "feat: define standard lesson plan contract"
```

### Task 2: 행정 정보 입력과 Upstage 표준 과정안 생성

**Files:**
- Modify: `components/lesson-plan/LessonBasicsStep.jsx`
- Modify: `components/lesson-plan/LessonPlanWorkspace.jsx`
- Modify: `lib/upstage/prompts.js`
- Modify: `app/api/generate-plan/route.js`
- Modify: `tests/fixtures/lesson-plan.mjs`
- Test: `tests/lesson-basics-step.test.jsx`
- Test: `tests/upstage-prompts.test.mjs`
- Test: `tests/generate-plan-route.test.mjs`

- [ ] **Step 1: 행정 정보와 생성 계약 테스트 작성**

```js
test('선택 행정 정보를 입력할 수 있다', async () => {
    render(<LessonBasicsStep value={makeBasics()} onChange={onChange} onNext={() => {}}/>);
    await userEvent.type(screen.getByLabelText('수업 장소'), '과학실');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ place: '과학실' }) }));
});

test('생성 프롬프트가 표준 과정안 필드를 요구한다', () => {
    const text = lessonPlanMessages(makeDraft())[0].content;
    for (const key of ['essentialQuestion', 'learningElement', 'teacherQuestions', 'expectedStudentResponses', 'method', 'levelFeedback', 'nextSessionConnection']) expect(text).toContain(key);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run tests/lesson-basics-step.test.jsx tests/upstage-prompts.test.mjs tests/generate-plan-route.test.mjs`
Expected: FAIL because metadata inputs and prompt keys are absent.

- [ ] **Step 3: 선택 입력 UI와 생성 payload 구현**

```jsx
<fieldset className="optional-metadata">
    <legend>문서 정보 <span className="optional">선택</span></legend>
    <label>수업 일시<input aria-label="수업 일시" type="datetime-local" value={value.metadata.date} onChange={event => updateMetadata('date', event.target.value)}/></label>
    <label>수업 장소<input aria-label="수업 장소" value={value.metadata.place} onChange={event => updateMetadata('place', event.target.value)}/></label>
    <label>대상 학급<input aria-label="대상 학급" value={value.metadata.className} onChange={event => updateMetadata('className', event.target.value)}/></label>
    <label>수업자<input aria-label="수업자" value={value.metadata.teacherName} onChange={event => updateMetadata('teacherName', event.target.value)}/></label>
</fieldset>
```

- [ ] **Step 4: 프롬프트 shape 확장과 route 정규화 구현**

`lessonPlanMessages`의 JSON shape에 새 필드를 실제 문자열·배열·객체 예시와 함께 넣고, 첫 응답과 교정 응답 모두 `normalizeLessonPlan` 후 `lessonPlanSchema.safeParse`로 검증한다. 선택한 성취기준 코드·원문, 차시 수, 단계 시간 합 검사는 유지한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- --run tests/lesson-basics-step.test.jsx tests/upstage-prompts.test.mjs tests/generate-plan-route.test.mjs`
Expected: all tests PASS.

- [ ] **Step 6: 커밋**

```bash
git add components/lesson-plan/LessonBasicsStep.jsx components/lesson-plan/LessonPlanWorkspace.jsx lib/upstage/prompts.js app/api/generate-plan/route.js tests
git commit -m "feat: generate standard lesson plan details"
```

### Task 3: 공통 표준 문서 모델

**Files:**
- Delete: `lib/export/render-model.js`
- Create: `lib/export/document-model.js`
- Create: `tests/document-model.test.mjs`

- [ ] **Step 1: 공통 모델 계약 테스트 작성**

```js
test('차시마다 개요표, 과정표, 평가표와 페이지 정보를 만든다', () => {
    const document = buildDocumentModel(makeTwoSessionPlan());
    expect(document.sessions).toHaveLength(2);
    expect(document.sessions[0].overview.rows.map(row => row.label)).toContain('성취기준');
    expect(document.sessions[0].process.columns.map(column => column.key)).toEqual(['phase', 'learningElement', 'teacherActivity', 'studentActivity', 'minutes', 'notes']);
    expect(document.sessions[0].assessment.columns).toHaveLength(4);
    expect(document.sessions[1].pageBreakBefore).toBe(true);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run tests/document-model.test.mjs`
Expected: FAIL because `buildDocumentModel` is missing.

- [ ] **Step 3: 문서 모델 구현**

```js
export function buildDocumentModel(input) {
    const plan = normalizeLessonPlan(input);
    return {
        title: '교수·학습 과정안',
        sessions: plan.sessions.map((session, index) => ({
            pageBreakBefore: index > 0,
            overview: buildOverview(plan, session),
            process: { columns: PROCESS_COLUMNS, rows: session.stages.map(buildProcessRow) },
            assessment: { columns: ASSESSMENT_COLUMNS, rows: plan.assessment.map(buildAssessmentRow) },
            supportStrategies: plan.supportStrategies,
            reflectionPrompt: plan.reflectionPrompt,
            nextSessionConnection: session.nextSessionConnection,
        })),
    };
}
```

- [ ] **Step 4: 모델 테스트 통과 확인**

Run: `npm test -- --run tests/document-model.test.mjs`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/export/render-model.js lib/export/document-model.js tests/document-model.test.mjs
git commit -m "feat: build shared lesson document model"
```

### Task 4: 표준 과정안 편집 미리보기

**Files:**
- Modify: `components/lesson-plan/LessonPlanEditor.jsx`
- Modify: `components/lesson-plan/SessionEditor.jsx`
- Create: `components/lesson-plan/AssessmentEditor.jsx`
- Modify: `app/globals.css`
- Test: `tests/lesson-plan-editor.test.jsx`
- Test: `tests/session-editor.test.jsx`

- [ ] **Step 1: 표 편집 동작 테스트 작성**

```js
test('표준 과정안의 발문과 예상 반응을 편집한다', async () => {
    const onChange = vi.fn();
    render(<LessonPlanEditor plan={makeGeneratedPlan()} onChange={onChange}/>);
    await userEvent.clear(screen.getByLabelText('1차시 도입 주요 발문'));
    await userEvent.type(screen.getByLabelText('1차시 도입 주요 발문'), '뿌리는 어떤 일을 할까요?');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sessions: expect.any(Array) }));
    expect(screen.getByRole('table', { name: '1차시 교수·학습 과정' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run tests/lesson-plan-editor.test.jsx tests/session-editor.test.jsx`
Expected: FAIL because standard table editors and labels are absent.

- [ ] **Step 3: 6열 과정표와 4열 평가표 구현**

화면에서는 실제 `<table>`을 사용한다. 각 입력의 `aria-label`은 `1차시 전개 교사 활동`, `1차시 전개 주요 발문`, `평가 1 수준별 피드백 보충`처럼 차시·단계·의미가 유일하게 드러나도록 한다. 모바일에서는 각 `tr`을 카드형 grid로 바꾸되 DOM의 표 의미는 유지한다.

- [ ] **Step 4: 2쪽 문서 미리보기 스타일 구현**

```css
.lesson-document-page { width: min(100%, 210mm); min-height: 297mm; margin: 0 auto 24px; padding: 18mm 16mm; background: #fff; box-shadow: 0 8px 30px rgb(26 35 31 / 8%); }
.formal-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.formal-table th, .formal-table td { border: 1px solid #66716d; padding: 8px; vertical-align: top; }
.formal-table th { background: #e9efec; font-weight: 700; }
@media (max-width: 720px) { .lesson-document-page { min-height: 0; padding: 18px 14px; } .process-table tr { display: grid; grid-template-columns: 72px 1fr; } }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- --run tests/lesson-plan-editor.test.jsx tests/session-editor.test.jsx`
Expected: all tests PASS.

- [ ] **Step 6: 커밋**

```bash
git add components/lesson-plan app/globals.css tests/lesson-plan-editor.test.jsx tests/session-editor.test.jsx
git commit -m "feat: edit lesson plans as formal documents"
```

### Task 5: DOCX 표준 과정안 렌더러

**Files:**
- Modify: `lib/export/docx.js`
- Modify: `tests/export-docx.test.mjs`

- [ ] **Step 1: Word 표와 페이지 나눔 실패 테스트 작성**

```js
test('DOCX에 개요·과정·평가 표와 차시 페이지 나눔을 만든다', async () => {
    const zip = await JSZip.loadAsync(await buildDocx(makeTwoSessionPlan()));
    const xml = await zip.file('word/document.xml').async('string');
    expect((xml.match(/<w:tbl>/g) || [])).toHaveLength(6);
    expect(xml).toContain('학습 요소');
    expect(xml).toContain('수준별 피드백');
    expect(xml).toContain('w:type="page"');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run tests/export-docx.test.mjs`
Expected: FAIL because current DOCX contains paragraphs only.

- [ ] **Step 3: `docx` Table 기반 렌더러 구현**

`Table`, `TableRow`, `TableCell`, `WidthType`, `ShadingType`, `PageBreak`를 사용한다. 개요 표는 라벨 셀과 값 셀을 병합하고, 과정 표는 6열 고정 폭, 평가 표는 4열 고정 폭으로 만든다. 모든 `TextRun`에 Paperlogy를 지정한다.

- [ ] **Step 4: DOCX 테스트 통과 확인**

Run: `npm test -- --run tests/export-docx.test.mjs tests/export-route.test.mjs`
Expected: all tests PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/export/docx.js tests/export-docx.test.mjs
git commit -m "feat: render formal lesson plan docx"
```

### Task 6: PDF 표준 과정안 렌더러

**Files:**
- Create: `lib/export/pdf-table.js`
- Modify: `lib/export/pdf.js`
- Modify: `tests/export-pdf.test.mjs`

- [ ] **Step 1: PDF 페이지와 표 렌더링 테스트 작성**

```js
test('연속 차시 PDF를 차시별 두 쪽 이상으로 렌더링한다', async () => {
    const bytes = await buildPdf(makeTwoSessionPlan());
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run tests/export-pdf.test.mjs`
Expected: FAIL because the paragraph renderer does not enforce the two-page session layout.

- [ ] **Step 3: 표 측정·그리기 헬퍼 구현**

`measureCell(text, width, font, size)`, `drawTableHeader`, `drawTableRow`, `ensureSpace`를 구현한다. 셀 높이는 줄 수, 패딩, 글꼴 크기로 계산하고 행 전체가 남은 공간보다 크면 새 페이지에서 시작한다. 새 페이지에서는 머리글 행을 다시 그린다.

- [ ] **Step 4: 문서 모델 기반 PDF 구현**

각 차시의 1쪽에는 개요와 과정 표, 2쪽에는 평가·지원·성찰·다음 차시 연결 표를 그린다. Paperlogy Regular/Bold를 subset으로 포함하고 A4 여백은 42pt 이상 유지한다.

- [ ] **Step 5: PDF 테스트 통과 확인**

Run: `npm test -- --run tests/export-pdf.test.mjs tests/export-route.test.mjs`
Expected: all tests PASS.

- [ ] **Step 6: 커밋**

```bash
git add lib/export/pdf.js lib/export/pdf-table.js tests/export-pdf.test.mjs
git commit -m "feat: render formal lesson plan pdf"
```

### Task 7: HWPX OWPML 표준 과정안 렌더러

**Files:**
- Create: `lib/export/hwpx-style.js`
- Create: `scripts/create-export-fixtures.mjs`
- Modify: `lib/export/hwpx.js`
- Modify: `lib/export/hwpx-template/Contents/header.xml`
- Modify: `tests/export-hwpx.test.mjs`

- [ ] **Step 1: HWPX 표·스타일·페이지 나눔 실패 테스트 작성**

```js
test('HWPX에 정식 과정안 표와 차시 페이지 나눔을 만든다', async () => {
    const zip = await JSZip.loadAsync(await buildHwpx(makeTwoSessionPlan()));
    const section = await zip.file('Contents/section0.xml').async('string');
    const header = await zip.file('Contents/header.xml').async('string');
    expect((section.match(/<hp:tbl /g) || []).length).toBeGreaterThanOrEqual(6);
    expect(section).toContain('rowCnt="4" colCnt="6"');
    expect(section).toContain('pageBreak="1"');
    expect(header).toContain('Paperlogy');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- --run tests/export-hwpx.test.mjs`
Expected: FAIL because current HWPX contains plain paragraphs only.

- [ ] **Step 3: HWPX 스타일과 표 헬퍼 구현**

`header.xml`에 Paperlogy fontface, 18pt 제목, 10pt 본문, 9pt 표 본문, 볼드 머리글, 실선 테두리, 녹색계열 머리글 배경을 추가하고 모든 `itemCnt`를 실제 자식 수와 일치시킨다. `hwpx-style.js`는 `paragraph`, `cell`, `row`, `table`, `pageBreakParagraph`를 반환하며 모든 ID를 문서 내에서 순차 생성한다.

- [ ] **Step 4: 6열 너비와 셀 구조 구현**

과정 표 열 너비는 `[4252, 5669, 12047, 12047, 3543, 4962]`로 합계 42520 HWPUNIT를 맞춘다. 평가 표는 `[8504, 8504, 11339, 14173]`을 사용한다. 개요 표는 4열로 구성하고 라벨과 긴 값에 `colSpan`을 적용한다.

- [ ] **Step 5: HWPX 검사 통과 확인**

먼저 fixture 스크립트를 다음 계약으로 작성한다.

```js
import { mkdir, writeFile } from 'node:fs/promises';
import { buildDocx } from '../lib/export/docx.js';
import { buildHwpx } from '../lib/export/hwpx.js';
import { buildPdf } from '../lib/export/pdf.js';
import { makeTwoSessionPlan } from '../tests/fixtures/lesson-plan.mjs';

await mkdir('test-results/exports', { recursive: true });
const plan = makeTwoSessionPlan();
await Promise.all([
    writeFile('test-results/exports/standard-lesson-plan.docx', await buildDocx(plan)),
    writeFile('test-results/exports/standard-lesson-plan.hwpx', await buildHwpx(plan)),
    writeFile('test-results/exports/standard-lesson-plan.pdf', await buildPdf(plan)),
]);
```

Run:

```bash
npm test -- --run tests/export-hwpx.test.mjs tests/export-route.test.mjs
node scripts/create-export-fixtures.mjs
python3 /Users/hoonikim/.agents/skills/hwpxskill/scripts/validate.py test-results/exports/sample.hwpx
```

Expected: all tests PASS and validator prints `VALID`.

- [ ] **Step 6: 커밋**

```bash
git add lib/export/hwpx.js lib/export/hwpx-style.js lib/export/hwpx-template/Contents/header.xml scripts/create-export-fixtures.mjs tests/export-hwpx.test.mjs
git commit -m "feat: render formal lesson plan hwpx"
```

### Task 8: 전체 흐름, 시각, 접근성 검증

**Files:**
- Modify: `e2e/lesson-plan.spec.mjs`
- Modify: `scripts/create-export-fixtures.mjs`
- Modify: `기획-메모.md`

- [ ] **Step 1: 행정 정보와 표 편집 E2E 확장**

```js
await page.getByLabel('수업 장소').fill('과학실');
await page.getByLabel('대상 학급').fill('6학년 1반');
await completeGeneration(page);
await expect(page.getByRole('table', { name: '1차시 교수·학습 과정' })).toBeVisible();
await page.getByLabel('1차시 도입 주요 발문').fill('식물의 뿌리는 어떤 일을 할까요?');
await expect(page.getByLabel('1차시 도입 주요 발문')).toHaveValue('식물의 뿌리는 어떤 일을 할까요?');
```

- [ ] **Step 2: E2E와 WCAG A/AA 실행**

Run: `npm run test:e2e`
Expected: desktop and mobile projects PASS; axe violations are empty.

- [ ] **Step 3: 실제 샘플 세 형식 생성과 시각 검토**

Run: `node scripts/create-export-fixtures.mjs`
Expected: `test-results/exports/standard-lesson-plan.{hwpx,docx,pdf}` created.

PDF를 페이지별 PNG로 렌더링해 차시당 2쪽, 표 테두리, 한글 줄바꿈, 잘림을 눈으로 확인한다. DOCX는 내부 XML에서 표·페이지 나눔을 확인하고, HWPX는 `validate.py`와 텍스트 추출로 필수 항목을 확인한다.

- [ ] **Step 4: 전체 회귀와 프로덕션 빌드 실행**

Run: `npm test && npm run test:e2e && npm run build`
Expected: 0 failures and Next.js production build exits 0.

- [ ] **Step 5: 메모와 커밋**

`기획-메모.md`에 “표준 교수·학습 과정안은 학교 현장 표준형, 차시당 2쪽, 연속 차시 새 페이지, 선택 행정 정보 빈칸 허용” 결정을 추가한다.

```bash
git add e2e/lesson-plan.spec.mjs scripts/create-export-fixtures.mjs 기획-메모.md
git commit -m "test: verify formal lesson plan documents"
```

### Task 9: 최종 품질 게이트

**Files:**
- Review only: all files changed by Tasks 1–8

- [ ] **Step 1: 변경 범위와 비밀정보 확인**

Run: `git status --short && git diff --check && git diff --stat HEAD~8..HEAD && git grep -n "UPSTAGE_API_KEY=" -- ':!*.example'`
Expected: clean formatting; no API key value committed.

- [ ] **Step 2: 최종 파일 검증**

Run:

```bash
python3 /Users/hoonikim/.agents/skills/hwpxskill/scripts/validate.py test-results/exports/standard-lesson-plan.hwpx
file test-results/exports/standard-lesson-plan.docx test-results/exports/standard-lesson-plan.pdf
```

Expected: HWPX `VALID`, DOCX recognized as Microsoft Word 2007+, PDF recognized as PDF document.

- [ ] **Step 3: 최종 테스트 증거 수집**

Run: `npm test && npm run test:e2e && npm run build`
Expected: unit/integration tests, desktop/mobile E2E, production build all exit 0.

- [ ] **Step 4: 작업 트리 확인**

Run: `git status --short`
Expected: no output.
