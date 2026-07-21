# AI 우선 수행평가와 성취기준 직접 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사회·역사 성취기준을 정확히 분리해 AI 추천과 공식 목록 직접 선택을 함께 제공하고, AI 수행평가 설계 초안을 교사가 수정한 뒤 학생용 수행평가지를 생성하는 2단계 흐름을 만든다.

**Architecture:** 교육과정 추출 단계에서 `subjectArea`를 정규화하고 검색·추천이 하나의 엄격한 범위 계약을 공유한다. 수행평가는 `assessmentDesign`과 완성된 `assessment`를 별도로 검증·저장하며, 기존 완성본은 설계 부분을 추출해 호환한다. 기존 `/api/generate-assessment`의 완성본 계약은 유지하고 `phase: "design"` 및 학생 문서 생성 API를 추가한다.

**Tech Stack:** Next.js 16 App Router, React 19, JavaScript/JSX, Zod 4, Vitest/Testing Library, Playwright

---

### Task 1: 교육과정 코드 추출과 사회·역사 범위

**Files:**
- Modify: `lib/curriculum/extract.js`
- Modify: `lib/curriculum/search.js`
- Create: `lib/curriculum/scope.js`
- Modify: `scripts/build-curriculum.mjs`
- Modify: `data/curriculum.json`
- Test: `tests/curriculum-extract.test.mjs`
- Test: `tests/curriculum-search.test.mjs`
- Test: `tests/curriculum-catalog.test.mjs`

- [ ] **Step 1: 괄호 코드와 엄격 범위를 고정하는 실패 테스트 작성**

```js
test('괄호가 있는 중학교 사회 코드를 영역과 함께 추출한다', () => {
    const records = extractStandards('### Page 1\n[9사(지리)01-01] 위치를 표현한다.\n[9사(일사)08-01] 인권을 탐구한다.', metadata);
    expect(records.map(({ code, subjectArea }) => ({ code, subjectArea }))).toEqual([
        { code: '9사(지리)01-01', subjectArea: '지리' },
        { code: '9사(일사)08-01', subjectArea: '일반사회' },
    ]);
});

test('중학교 사회와 역사를 교과 내 영역으로 분리한다', () => {
    expect(searchStandards(catalog, { schoolLevel: 'middle', gradeBand: '7-9', subjects: ['사회'], subjectAreas: ['지리', '일반사회'], query: '' }, 100).every(item => item.code.startsWith('9사('))).toBe(true);
    expect(searchStandards(catalog, { schoolLevel: 'middle', gradeBand: '7-9', subjects: ['사회'], subjectAreas: ['역사'], query: '' }, 100).every(item => item.code.startsWith('9역'))).toBe(true);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/curriculum-extract.test.mjs tests/curriculum-search.test.mjs tests/curriculum-catalog.test.mjs`

Expected: 괄호 코드가 추출되지 않거나 사회/역사 결과가 섞여 FAIL.

- [ ] **Step 3: 코드 영역 정규화와 범위 필터 구현**

```js
export function subjectAreaFromCode(code) {
    if (/^9사\(지리\)/.test(code)) return '지리';
    if (/^9사\(일사\)/.test(code)) return '일반사회';
    if (/^9역/.test(code)) return '역사';
    return null;
}

export function subjectAreasForSelection({ schoolLevel, subject }) {
    if (schoolLevel !== 'middle') return [];
    if (subject === '사회') return ['지리', '일반사회'];
    if (subject === '역사') return ['역사'];
    return [];
}
```

`STANDARD_START`가 괄호가 있는 코드도 인식하게 바꾸고 추출 항목에 `subjectArea`를 넣는다. `searchStandards`는 `subjectAreas`가 있을 때 같은 영역만 남긴다.

- [ ] **Step 4: 카탈로그 재생성 및 통과 확인**

Run: `npm run curriculum:build && npm test -- tests/curriculum-extract.test.mjs tests/curriculum-search.test.mjs tests/curriculum-catalog.test.mjs`

Expected: 중학교 사회의 지리·일반사회와 역사가 모두 카탈로그에 존재하고 모든 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/curriculum/extract.js lib/curriculum/search.js lib/curriculum/scope.js scripts/build-curriculum.mjs data/curriculum.json tests/curriculum-extract.test.mjs tests/curriculum-search.test.mjs tests/curriculum-catalog.test.mjs
git commit -m "fix: separate middle school social standards"
```

### Task 2: AI 추천과 공식 목록 직접 선택

**Files:**
- Modify: `app/api/recommend-standards/route.js`
- Modify: `components/lesson-plan/StandardsStep.jsx`
- Modify: `app/globals.css`
- Modify: `DESIGN.md`
- Test: `tests/recommend-standards-route.test.mjs`
- Test: `tests/standards-step.test.jsx`

- [ ] **Step 1: 추천 범위와 독립 직접 선택 UI 실패 테스트 작성**

```jsx
test('사회 교사는 AI 추천과 별개로 지리·일반사회 공식 목록을 직접 선택한다', async () => {
    render(<StandardsStep basics={socialBasics} selected={[]} onChange={onChange} onBack={() => {}} onNext={() => {}}/>);
    expect(screen.getByText(/사회 · 지리\/일반사회/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 추천' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '교육과정에서 직접 선택' })).toBeInTheDocument();
    expect(screen.getByText('9사(지리)01-01')).toBeInTheDocument();
    expect(screen.queryByText(/^9역/)).not.toBeInTheDocument();
});
```

API 테스트는 `subjectAreas: ['지리', '일반사회']` 요청에서 AI 후보와 응답에 `9역`이 없음을 확인한다.

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/recommend-standards-route.test.mjs tests/standards-step.test.jsx`

Expected: 추천이 직접 목록을 대체하거나 영역 필터가 없어 FAIL.

- [ ] **Step 3: 동일 범위 계약과 두 영역 UI 구현**

`StandardsStep`은 추천 목록과 직접 목록을 동시에 렌더링한다. 직접 목록은 코드·내용 검색과 `전체/지리/일반사회` 필터를 제공하고 범위 전체를 자르지 않는다. 두 목록은 같은 선택 배열을 사용하며 10개를 넘겨 추가하려 하면 `role="alert"`로 안내한다. 추천 실패 시 직접 목록과 선택 상태를 유지한다.

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/recommend-standards-route.test.mjs tests/standards-step.test.jsx`

Expected: 모든 테스트 PASS.

- [ ] **Step 5: 디자인 계약 기록 및 커밋**

`DESIGN.md`의 ChoiceTile/성취기준 프리미티브에 범위 표시, 독립 추천·직접 선택, 공통 선택 목록과 모바일 적층 규칙을 추가한다.

```bash
git add app/api/recommend-standards/route.js components/lesson-plan/StandardsStep.jsx app/globals.css DESIGN.md tests/recommend-standards-route.test.mjs tests/standards-step.test.jsx
git commit -m "feat: add direct achievement standard selection"
```

### Task 3: 수행평가 설계와 학생 문서 계약 분리

**Files:**
- Modify: `lib/assessment-schema.js`
- Modify: `lib/assessment-fallback.js`
- Modify: `lib/workflow-prompts.js`
- Modify: `app/api/generate-assessment/route.js`
- Create: `app/api/generate-assessment-sheet/route.js`
- Modify: `app/api/regenerate-assessment-criterion/route.js`
- Test: `tests/assessment-schema.test.mjs`
- Test: `tests/generate-assessment-route.test.mjs`
- Create: `tests/generate-assessment-sheet-route.test.mjs`
- Modify: `tests/regenerate-assessment-criterion-route.test.mjs`

- [ ] **Step 1: 분리 스키마와 API 실패 테스트 작성**

```js
test('학생 문서 없이 수행과제와 루브릭 설계를 검증한다', () => {
    const { studentSheet, cover, ...design } = makeAssessment();
    expect(assessmentDesignSchema.safeParse(design).success).toBe(true);
});

test('교사 설계를 그대로 보존해 학생 문서를 생성한다', async () => {
    const response = await POST(request({ lessonPlan, assessmentDesign: design }));
    expect((await response.json()).assessment).toMatchObject({ task: design.task, rubric: design.rubric });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/assessment-schema.test.mjs tests/generate-assessment-route.test.mjs tests/generate-assessment-sheet-route.test.mjs tests/regenerate-assessment-criterion-route.test.mjs`

Expected: `assessmentDesignSchema`와 학생 문서 API가 없어 FAIL.

- [ ] **Step 3: 공통 설계 스키마와 2단계 생성 구현**

`assessmentDesignSchema`는 수행과제·루브릭·배점·성취기준 연결을 검증하고, `assessmentOutputSchema`는 여기에 `studentSheet`와 `cover`를 더해 문항·표지 관계까지 검증한다. `/api/generate-assessment`의 `phase: "design"`은 설계만 생성·복구해 `assessmentDesign`으로 반환한다. `/api/generate-assessment-sheet`는 검증된 설계를 입력받아 학생 문서와 표지를 생성한 뒤 완성본 전체를 다시 검증한다. AI 실패 시에도 현재 설계를 바꾸지 않고 구체적인 안전 문서로 완성한다.

- [ ] **Step 4: 통과 확인**

Run: `npm test -- tests/assessment-schema.test.mjs tests/generate-assessment-route.test.mjs tests/generate-assessment-sheet-route.test.mjs tests/regenerate-assessment-criterion-route.test.mjs`

Expected: 기존 완성본 API와 새 2단계 API 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/assessment-schema.js lib/assessment-fallback.js lib/workflow-prompts.js app/api/generate-assessment/route.js app/api/generate-assessment-sheet/route.js app/api/regenerate-assessment-criterion/route.js tests/assessment-schema.test.mjs tests/generate-assessment-route.test.mjs tests/generate-assessment-sheet-route.test.mjs tests/regenerate-assessment-criterion-route.test.mjs
git commit -m "feat: split assessment design and student sheet generation"
```

### Task 4: 설계 초안 저장과 기존 완성본 마이그레이션

**Files:**
- Modify: `lib/workflow-storage-allowlist.js`
- Modify: `lib/workflow-store.js`
- Modify: `lib/workflow-lineage.js`
- Test: `tests/workflow-store.test.mjs`
- Test: `tests/workflow-store-allowlist.test.mjs`
- Test: `tests/workflow-lineage.test.mjs`

- [ ] **Step 1: 별도 저장과 마이그레이션 실패 테스트 작성**

```js
test('기존 완성본에서 편집 가능한 assessmentDesign을 복원한다', () => {
    const loaded = sanitizeWorkflow({ assessment: makeAssessment() });
    expect(loaded.assessmentDesign.task).toEqual(makeAssessment().task);
    expect(loaded.assessmentDesign).not.toHaveProperty('studentSheet');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/workflow-store.test.mjs tests/workflow-store-allowlist.test.mjs tests/workflow-lineage.test.mjs`

Expected: `assessmentDesign`이 저장·복원되지 않아 FAIL.

- [ ] **Step 3: 버전 5 저장과 설계 해시 구현**

빈 프로젝트에 `assessmentDesign: null`을 추가하고 저장 버전을 5로 올린다. 기존 `assessment`가 있고 설계가 없으면 `studentSheet`, `cover`, 승인 메타데이터를 제외한 설계를 추출한다. 완성본은 `designHash`를 저장하며 현재 설계 해시와 다르면 수행평가 단계를 `검토 필요`로 유지한다.

- [ ] **Step 4: 통과 확인 및 커밋**

Run: `npm test -- tests/workflow-store.test.mjs tests/workflow-store-allowlist.test.mjs tests/workflow-lineage.test.mjs`

```bash
git add lib/workflow-storage-allowlist.js lib/workflow-store.js lib/workflow-lineage.js tests/workflow-store.test.mjs tests/workflow-store-allowlist.test.mjs tests/workflow-lineage.test.mjs
git commit -m "feat: persist editable assessment designs"
```

### Task 5: AI 초안 → 교사 수정 → 수행평가지 UI

**Files:**
- Modify: `lib/assessment-request.js`
- Modify: `components/workflow/BackwardDesignForm.jsx`
- Modify: `components/workflow/AssessmentStage.jsx`
- Modify: `components/workflow/TeachingWorkflow.jsx`
- Modify: `app/globals.css`
- Modify: `DESIGN.md`
- Test: `tests/assessment-request.test.mjs`
- Modify: `tests/assessment-stage.test.jsx`
- Modify: `tests/teaching-workflow.test.jsx`
- Create: `e2e/ai-first-assessment.spec.mjs`

- [ ] **Step 1: 자동 기본값과 2단계 화면 실패 테스트 작성**

```jsx
test('입력 없이 AI 설계 초안을 만든 뒤 교사 수정본으로 수행평가지를 생성한다', async () => {
    render(<AssessmentStage lessonPlan={lessonPlan} design={null} value={null} request={emptyRequest} onDesignChange={setDesign} onChange={setAssessment} />);
    await user.click(screen.getByRole('button', { name: 'AI로 수행평가 초안 만들기' }));
    expect(await screen.findByRole('heading', { name: '점수형 분석적 루브릭' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('과제명'), ' 교사 수정');
    await user.click(screen.getByRole('button', { name: '이 설계로 수행평가지 만들기' }));
    expect(await screen.findByRole('heading', { name: '실제 수행평가지 편집' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- tests/assessment-request.test.mjs tests/assessment-stage.test.jsx tests/teaching-workflow.test.jsx`

Expected: 자동 기본값과 분리된 생성 행동이 없어 FAIL.

- [ ] **Step 3: 자동 기본값과 단계 UI 구현**

초기 화면은 지도안 제목·확정 성취기준·`AI로 수행평가 초안 만들기`를 먼저 보여준다. 기존 상세 입력은 `세부 설정` disclosure 안에 두고, 빈 값은 지도안의 학습목표·성취기준·수업 제목과 100점/4수준/과정 20% 기본값으로 자동 완성한다. 설계가 생기면 수행과제·루브릭 편집기와 `이 설계로 수행평가지 만들기`를 표시한다. 완성본 생성 뒤 설계를 수정하면 완성본을 보존하면서 `설계 변경됨`으로 표시하고 내보내기·승인을 막는다.

- [ ] **Step 4: 컴포넌트 테스트 통과**

Run: `npm test -- tests/assessment-request.test.mjs tests/assessment-stage.test.jsx tests/teaching-workflow.test.jsx`

Expected: 모든 테스트 PASS.

- [ ] **Step 5: Playwright 시나리오 작성·실패 확인 후 구현 보정**

데스크톱과 모바일에서 사회 성취기준 직접 선택부터 AI 설계, 과제명 수정, 수행평가지 생성까지 실제 UI로 진행한다. 네트워크는 API 경계에서 유효한 fixture로 대체하고 화면의 최종 편집 결과를 확인한다.

Run: `npx playwright test e2e/ai-first-assessment.spec.mjs --project=chromium`

Expected after implementation: PASS.

- [ ] **Step 6: 커밋**

```bash
git add lib/assessment-request.js components/workflow/BackwardDesignForm.jsx components/workflow/AssessmentStage.jsx components/workflow/TeachingWorkflow.jsx app/globals.css DESIGN.md tests/assessment-request.test.mjs tests/assessment-stage.test.jsx tests/teaching-workflow.test.jsx e2e/ai-first-assessment.spec.mjs
git commit -m "feat: add teacher-reviewed assessment generation flow"
```

### Task 6: 전체 검증과 실제 화면 QA

**Files:**
- Verify only unless a defect is found

- [ ] **Step 1: 전체 자동 검증**

Run: `npm test`

Expected: 전체 Vitest PASS.

Run: `npm run build`

Expected: 교육과정 재생성 및 Next.js production build PASS.

- [ ] **Step 2: 정적·구조 점검**

Run: `npx react-doctor@latest --json`

Expected: 새 변경으로 인한 오류 또는 성능 범주 실패 없음.

Run: `git diff --check`

Expected: 출력 없이 exit 0.

- [ ] **Step 3: 실브라우저 시각·상호작용 QA**

프로덕션 서버에서 375px, 768px, 1280px로 성취기준 범위, 추천 실패, 직접 선택, 10개 제한, 설계 생성, 편집, stale 상태와 학생 문서 생성을 확인한다. 콘솔 오류, 가로 넘침, 잘린 컨트롤과 접근성 위반이 없어야 한다.

- [ ] **Step 4: 최종 검증 커밋**

수정이 발생한 경우에만 관련 파일을 추가해 커밋한다. 기존 사용자 변경은 건드리지 않는다.
