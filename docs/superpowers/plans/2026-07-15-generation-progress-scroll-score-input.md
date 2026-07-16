# AI 진행률·맨 위로·점수 입력 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 생성 진행률, 프로세스별 상단 복귀, 루브릭 점수 덮어쓰기 UX를 제공한다.

**Architecture:** `lib/operation-state.js`가 예상 진행률 계산을 소유하고 오버레이는 표시만 담당한다. `TeachingWorkflow`가 공통 상단 앵커와 버튼을 소유하며, `RubricEditor`는 수준 점수의 문자열 편집 초안을 관리한다.

**Tech Stack:** Next.js 16, React 19, JavaScript, Vitest, Testing Library, Playwright

---

### Task 1: AI 예상 진행률

**Files:**
- Modify: `lib/operation-state.js`
- Modify: `components/workflow/OperationOverlay.jsx`
- Test: `tests/operation-state.test.mjs`
- Test: `tests/operation-overlay.test.jsx`

- [ ] **Step 1: 실패 테스트 작성** — `upstageWaiting` 작업이 경과 시간에 따라 1~95%의 `예상 진행률`을 반환하고 오버레이에 퍼센트가 보이는 테스트를 추가한다.
- [ ] **Step 2: Red 확인** — `npx vitest run tests/operation-state.test.mjs tests/operation-overlay.test.jsx`가 기존 indeterminate 동작 때문에 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — 예상 범위와 경과 시간으로 단조 증가하는 표시 진행률을 계산하되 95%에서 멈추고, 일괄 처리의 실제 진행률은 변경하지 않는다.
- [ ] **Step 4: Green 확인** — 위 두 테스트 파일을 다시 실행해 통과시킨다.

### Task 2: 프로세스별 맨 위로

**Files:**
- Modify: `components/workflow/ProcessTabs.jsx`
- Modify: `components/workflow/TeachingWorkflow.jsx`
- Modify: `app/globals.css`
- Test: `tests/teaching-workflow.test.jsx`

- [ ] **Step 1: 실패 테스트 작성** — 각 활성 프로세스에 `맨 위로` 버튼이 하나 있고 클릭하면 프로세스 내비게이션이 스크롤·포커스 대상이 되는 테스트를 추가한다.
- [ ] **Step 2: Red 확인** — `npx vitest run tests/teaching-workflow.test.jsx`가 버튼 부재로 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — 공통 프로세스 상단 ref와 하단 버튼을 추가하고 디자인 시스템의 기존 버튼·간격 토큰으로 배치한다.
- [ ] **Step 4: Green 확인** — 해당 테스트를 통과시킨다.

### Task 3: 점수 입력 초안

**Files:**
- Modify: `components/workflow/RubricEditor.jsx`
- Test: `tests/assessment-stage.test.jsx`

- [ ] **Step 1: 실패 테스트 작성** — 0점 입력을 지운 상태가 유지되고 새 점수를 입력한 뒤 blur하면 숫자가 반영되는 테스트를 추가한다.
- [ ] **Step 2: Red 확인** — `npx vitest run tests/assessment-stage.test.jsx`가 빈 값이 즉시 0으로 변해 실패하는지 확인한다.
- [ ] **Step 3: 최소 구현** — 수준별 점수 문자열 초안을 두고 focus/select, change, blur/Enter commit, Escape restore를 구현한다.
- [ ] **Step 4: Green 확인** — 해당 테스트를 통과시킨다.

### Task 4: 통합 검증

**Files:**
- Verify only

- [ ] **Step 1: 전체 테스트** — `npm test`에서 모든 테스트가 통과해야 한다.
- [ ] **Step 2: 빌드** — `npm run build`가 성공해야 한다.
- [ ] **Step 3: 브라우저 QA** — 375px와 1280px에서 AI 퍼센트, 맨 위로 버튼, 점수 덮어쓰기를 직접 확인하고 콘솔 오류와 가로 넘침이 없어야 한다.
