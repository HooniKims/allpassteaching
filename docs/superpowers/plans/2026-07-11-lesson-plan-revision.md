# 수업 지도안 수정 1차 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생성 뒤에도 입력을 확인·수정·재생성할 수 있고, 직접 입력 과목과 수업 모형을 정확히 반영하며, 긴 내용도 깨지지 않는 표준 HWPX 지도안을 제공한다.

**Architecture:** 마지막 성공 생성의 정규화 입력을 `generatedFrom` 스냅샷으로 저장하고 현재 입력과 비교한다. 직접 입력 과목은 서버에서 학교급별 공식 과목 허용 목록으로 매핑하며, 수업 모형은 로컬 가이드와 결정적 정렬 검증기를 프롬프트·보정 과정에 함께 사용한다. 화면·HWPX·DOCX·PDF는 확장된 공통 문서 모델을 소비한다.

**Tech Stack:** Next.js 16 App Router, React 19, Zod 4, Upstage Chat API, Vitest, Testing Library, Playwright, JSZip/OWPML HWPX, docx, pdf-lib

---

## 파일 구조

- `lib/lesson-input.js`: 생성에 영향을 주는 입력의 정규화·스냅샷·변경 비교
- `lib/subject-mapping.js`: 학교급별 공식 과목 허용 목록과 AI 결과 필터
- `lib/instruction-model-guides.js`: 모형 가이드 로딩과 프롬프트용 요약
- `lib/instruction-model-alignment.js`: 생성 결과의 모형 단계 대응 검증
- `docs/instruction-models/*.md`: 각 수업 모형의 근거·절차·행동·금지 패턴
- `components/lesson-plan/GenerationSummary.jsx`: 완성 화면 입력 요약과 변경 경고
- 기존 `LessonPlanWorkspace.jsx`: 단계 이동, 생성 스냅샷, 안전한 재생성 오케스트레이션
- 기존 `hwpx-style.js`: 내용 기반 HWPX 셀·표 높이 계산
- `docs/change-log/2026/07/2026-07-11.md`: 이번 요청과 실제 수정·검증 기록

### Task 1: 교육과정 원본 폴더 이름 변경 보존

**Files:**
- Modify: `scripts/build-curriculum.mjs`
- Rename as already performed by user: `2022_Revised_National_Curriculum 복사본/**` → `2022_Revised_National_Curriculum/**`
- Test: `tests/curriculum-catalog.test.mjs`

- [ ] **Step 1: 새 폴더명을 요구하는 실패 테스트 작성**

```js
test('build script reads the renamed curriculum source folder', async () => {
    const source = await readFile('scripts/build-curriculum.mjs', 'utf8');
    expect(source).toContain("const SOURCE_ROOT = '2022_Revised_National_Curriculum';");
    expect(source).not.toContain('복사본');
});
```

- [ ] **Step 2: RED 확인**

Run: `npm test -- tests/curriculum-catalog.test.mjs`
Expected: `SOURCE_ROOT`가 이전 폴더명을 사용해 FAIL.

- [ ] **Step 3: 빌드 입력 경로만 최소 수정**

```js
const SOURCE_ROOT = '2022_Revised_National_Curriculum';
```

- [ ] **Step 4: 카탈로그 재생성과 계약 검증**

Run: `npm run curriculum:build && npm test -- tests/curriculum-catalog.test.mjs tests/curriculum-search.test.mjs`
Expected: 2,733개 기준 생성 및 관련 테스트 PASS.

- [ ] **Step 5: 이름 변경 상태 점검**

Run: `git status --short && git diff --summary`
Expected: 동일 내용 파일은 rename으로 감지 가능하며 `.DS_Store`는 추적되지 않음.

### Task 2: 날짜·교시 데이터 계약과 표시 형식

**Files:**
- Create: `lib/lesson-input.js`
- Modify: `components/lesson-plan/LessonBasicsStep.jsx`
- Modify: `components/lesson-plan/LessonPlanWorkspace.jsx`
- Modify: `lib/lesson-plan-schema.js`
- Modify: `lib/lesson-plan-normalize.js`
- Modify: `lib/export/document-model.js`
- Modify: `components/lesson-plan/OverviewTable.jsx`
- Modify: `app/globals.css`
- Test: `tests/lesson-input.test.mjs`
- Test: `tests/lesson-basics-step.test.jsx`
- Test: `tests/lesson-plan-schema.test.mjs`
- Test: `tests/document-model.test.mjs`

- [ ] **Step 1: 날짜 이관·교시 표시 실패 테스트 작성**

```js
test('normalizes legacy datetime without inventing a period', () => {
    expect(normalizeLessonMetadata({ date: '2026-07-11T09:00' })).toEqual({
        date: '2026-07-11', period: '', place: '', className: '', teacherName: '',
    });
});

test('formats lesson timing without an ISO T or current time', () => {
    expect(formatLessonTiming({ date: '2026-07-11', period: '3' })).toBe('2026. 7. 11. / 3교시');
});
```

```jsx
expect(screen.getByLabelText('수업 날짜')).toHaveAttribute('type', 'date');
expect(screen.getByLabelText('교시')).toHaveAttribute('type', 'number');
expect(screen.queryByLabelText('수업 일시')).not.toBeInTheDocument();
```

- [ ] **Step 2: RED 확인**

Run: `npm test -- tests/lesson-input.test.mjs tests/lesson-basics-step.test.jsx tests/lesson-plan-schema.test.mjs tests/document-model.test.mjs`
Expected: `period`, 정규화 도우미, 새 입력이 없어 FAIL.

- [ ] **Step 3: 순수 정규화·표시 함수 구현**

```js
const emptyMetadata = Object.freeze({ date: '', period: '', place: '', className: '', teacherName: '' });

export function normalizeLessonMetadata(value = {}) {
    const date = String(value.date ?? '').split('T')[0];
    return { ...emptyMetadata, ...value, date, period: String(value.period ?? '') };
}

export function formatLessonTiming(metadata) {
    const normalized = normalizeLessonMetadata(metadata);
    const [year, month, day] = normalized.date.split('-').map(Number);
    const date = year && month && day ? `${year}. ${month}. ${day}.` : '';
    return [date, normalized.period ? `${normalized.period}교시` : ''].filter(Boolean).join(' / ');
}
```

- [ ] **Step 4: 입력·스키마·문서 모델 연결**

`LessonBasicsStep`은 `수업 날짜`와 `교시`를 별도 컨트롤로 렌더링한다. `metadataSchema`와 생성 요청 스키마에는 `period: metadataString`을 추가한다. `buildOverview`의 일시 값은 `formatLessonTiming(plan.metadata)`를 사용한다.

```jsx
<label>수업 날짜 <span className="optional">선택</span>
    <input aria-label="수업 날짜" type="date" value={metadata.date} onChange={event => updateMetadata('date', event.target.value)} />
</label>
<label>교시 <span className="optional">선택</span>
    <input aria-label="교시" type="number" min="1" max="12" value={metadata.period} onChange={event => updateMetadata('period', event.target.value)} />
</label>
```

- [ ] **Step 5: 개요 표의 일시~수업 모형 가운데 정렬**

`OverviewTable`의 앞 6개 행에 `overview-table__centered` 클래스를 부여한다.

```css
.overview-table__centered th,
.overview-table__centered td,
.overview-table__centered input { text-align: center; }
```

- [ ] **Step 6: GREEN 확인**

Run: `npm test -- tests/lesson-input.test.mjs tests/lesson-basics-step.test.jsx tests/lesson-plan-schema.test.mjs tests/document-model.test.mjs`
Expected: PASS.

### Task 3: 직접 입력 과목과 안전한 공식 과목 매핑

**Files:**
- Create: `lib/subject-mapping.js`
- Create: `app/api/map-subject/route.js`
- Modify: `lib/upstage/prompts.js`
- Modify: `components/lesson-plan/LessonBasicsStep.jsx`
- Modify: `components/lesson-plan/StandardsStep.jsx`
- Modify: `lib/curriculum/search.js`
- Modify: `app/api/recommend-standards/route.js`
- Modify: `components/lesson-plan/LessonPlanWorkspace.jsx`
- Test: `tests/subject-mapping.test.mjs`
- Test: `tests/map-subject-route.test.mjs`
- Test: `tests/curriculum-search.test.mjs`
- Test: `tests/lesson-basics-step.test.jsx`
- Test: `tests/recommend-standards-route.test.mjs`

- [ ] **Step 1: 허용 목록 필터 실패 테스트 작성**

```js
test('keeps mapped subjects inside the requested school level allow-list', () => {
    const result = filterSubjectMappings(catalog, 'elementary', [
        { subject: '과학', score: 94, reason: '환경 탐구' },
        { subject: '고등학교 전문 과목', score: 99, reason: '범위 밖' },
    ]);
    expect(result.map(item => item.subject)).toEqual(['과학']);
});
```

```js
test('searches the union of confirmed official subjects only', () => {
    const result = searchStandards(catalog, { schoolLevel: 'elementary', gradeBand: '5-6', subjects: ['과학', '사회'], query: '환경' });
    expect(result.every(item => ['과학', '사회'].includes(item.subject))).toBe(true);
});
```

- [ ] **Step 2: RED 확인**

Run: `npm test -- tests/subject-mapping.test.mjs tests/curriculum-search.test.mjs tests/map-subject-route.test.mjs`
Expected: 새 모듈·라우트·복수 과목 검색이 없어 FAIL.

- [ ] **Step 3: 학교급별 공식 과목 파생과 AI 결과 필터 구현**

```js
export function officialSubjects(catalog, schoolLevel) {
    return [...new Set(catalog.filter(item => item.schoolLevel === schoolLevel).map(item => item.subject))].sort((a, b) => a.localeCompare(b, 'ko'));
}

export function filterSubjectMappings(catalog, schoolLevel, mappings) {
    const allowed = new Set(officialSubjects(catalog, schoolLevel));
    return mappings.filter(item => allowed.has(item.subject)).slice(0, 3);
}
```

- [ ] **Step 4: 과목 매핑 API 구현**

요청은 `schoolLevel`, `gradeBand`, `displaySubject`, `lessonIntent`를 받고, 프롬프트 후보는 `officialSubjects`로 제한한다. 응답은 필터된 `mappings`만 반환한다. Upstage 실패는 `directCandidates`로 공식 과목 목록을 함께 반환한다.

```js
const requestSchema = z.object({
    schoolLevel: z.enum(['elementary', 'middle', 'high']),
    gradeBand: z.string().min(1),
    displaySubject: z.string().trim().min(1).max(100),
    lessonIntent: z.string().trim().min(2),
});
```

- [ ] **Step 5: 수업 정보 UI에 과목 방식과 매핑 확인 추가**

`basics`에 `subjectMode`, `displaySubject`, `mappedSubjects`를 저장한다. 공식 목록 선택은 `subject`와 `mappedSubjects: [subject]`를 함께 갱신한다. 직접 입력은 과목 매핑 성공 뒤 확인된 `mappedSubjects`가 있어야 다음 단계로 이동한다.

```jsx
<label><input type="radio" name="subjectMode" checked={value.subjectMode === 'official'} onChange={() => updateSubjectMode('official')} /> 목록에서 선택</label>
<label><input type="radio" name="subjectMode" checked={value.subjectMode === 'custom'} onChange={() => updateSubjectMode('custom')} /> 직접 입력</label>
```

- [ ] **Step 6: 성취기준 검색·추천을 복수 확인 과목에 연결**

`StandardsStep`과 추천 API는 단일 `subject` 대신 정규화된 `subjects` 배열을 사용한다. 응답 코드 허용 목록은 해당 복수 과목의 직접 후보로 제한한다.

- [ ] **Step 7: GREEN 확인**

Run: `npm test -- tests/subject-mapping.test.mjs tests/map-subject-route.test.mjs tests/curriculum-search.test.mjs tests/lesson-basics-step.test.jsx tests/recommend-standards-route.test.mjs`
Expected: PASS.

### Task 4: 생성 입력 스냅샷과 자유로운 단계 이동·재생성

**Files:**
- Modify: `lib/lesson-input.js`
- Modify: `lib/draft-store.js`
- Modify: `components/lesson-plan/StepNavigation.jsx`
- Modify: `components/lesson-plan/LessonPlanWorkspace.jsx`
- Create: `components/lesson-plan/GenerationSummary.jsx`
- Modify: `app/globals.css`
- Test: `tests/lesson-input.test.mjs`
- Test: `tests/draft-store.test.mjs`
- Test: `tests/workspace-navigation.test.jsx`
- Test: `tests/smoke.test.jsx`

- [ ] **Step 1: 스냅샷 비교와 재생성 보존 실패 테스트 작성**

```js
test('ignores transient UI errors but detects generation input changes', () => {
    const snapshot = createGenerationSnapshot(generationDraft);
    expect(hasGenerationInputChanged({ ...generationDraft, basics: { ...generationDraft.basics, error: '필수 정보' } }, snapshot)).toBe(false);
    expect(hasGenerationInputChanged({ ...generationDraft, basics: { ...generationDraft.basics, intent: '수정한 수업 의도' } }, snapshot)).toBe(true);
});
```

```jsx
expect(screen.getByRole('button', { name: '수업 정보 단계로 이동' })).toBeEnabled();
expect(screen.getByText('현재 지도안은 변경 전 입력으로 생성되었습니다.')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '수정 내용으로 다시 생성' })).toBeEnabled();
```

- [ ] **Step 2: RED 확인**

Run: `npm test -- tests/lesson-input.test.mjs tests/draft-store.test.mjs tests/workspace-navigation.test.jsx tests/smoke.test.jsx`
Expected: 스냅샷 함수·단계 버튼·요약 UI가 없어 FAIL.

- [ ] **Step 3: 생성 스냅샷 함수 구현**

```js
export function createGenerationSnapshot(draft) {
    const { error: _error, ...basics } = draft.basics;
    return structuredClone({ basics: { ...basics, metadata: normalizeLessonMetadata(basics.metadata) }, standards: draft.standards, instructionModel: draft.instructionModel });
}

export function hasGenerationInputChanged(draft, generatedFrom) {
    if (!generatedFrom) return false;
    return JSON.stringify(createGenerationSnapshot(draft)) !== JSON.stringify(generatedFrom);
}
```

- [ ] **Step 4: 단계 탐색을 버튼으로 전환**

`StepNavigation`은 `current`, `maxReached`, `onStepChange`를 받고 도달한 단계만 버튼으로 렌더링한다. 생성 중 단계 이동은 현재 요청을 abort한다.

```jsx
<button type="button" aria-label={`${name} 단계로 이동`} disabled={index + 1 > maxReached} onClick={() => onStepChange(index + 1)}>{/* 기존 표시 */}</button>
```

- [ ] **Step 5: 요약 카드와 안전한 재생성 구현**

`GenerationSummary`는 현재 입력, 변경 여부, 수정 버튼을 표시한다. 생성 성공 콜백은 한 번의 상태 갱신으로 `plan`, `originalPlan`, `generatedFrom`, `step: 4`, `maxReached: 4`를 교체한다. 실패·abort는 기존 네 값을 바꾸지 않는다.

```js
setDraft(current => ({
    ...current,
    step: 4,
    maxReached: 4,
    plan: body.plan,
    originalPlan: structuredClone(body.plan),
    generatedFrom: createGenerationSnapshot(current),
}));
```

- [ ] **Step 6: 레거시 임시 저장 이관**

`DRAFT_VERSION`을 2로 올리되 version 1을 폐기하지 않고 정규화한다. 저장된 plan이 있고 `generatedFrom`이 없으면 현재 입력 스냅샷을 채운다.

- [ ] **Step 7: GREEN 확인**

Run: `npm test -- tests/lesson-input.test.mjs tests/draft-store.test.mjs tests/workspace-navigation.test.jsx tests/smoke.test.jsx`
Expected: PASS.

### Task 5: 모형별 Markdown 가이드 구축

**Files:**
- Create: `docs/instruction-models/direct.md`
- Create: `docs/instruction-models/concept.md`
- Create: `docs/instruction-models/inquiry.md`
- Create: `docs/instruction-models/problem-solving.md`
- Create: `docs/instruction-models/project.md`
- Create: `docs/instruction-models/cooperative.md`
- Create: `docs/instruction-models/discussion.md`
- Create: `docs/instruction-models/simulation.md`
- Create: `docs/instruction-models/experiment.md`
- Create: `docs/instruction-models/design-thinking.md`
- Create: `docs/instruction-models/blended.md`
- Create: `docs/instruction-models/subject-specific.md`
- Create: `lib/instruction-model-guides.js`
- Modify: `data/instruction-models.js`
- Test: `tests/instruction-model-guides.test.mjs`
- Test: `tests/instruction-models.test.mjs`

- [ ] **Step 1: 전체 가이드 계약 실패 테스트 작성**

```js
test.each(instructionModels)('$name has a complete local guide', model => {
    const guide = instructionModelGuide(model.id);
    expect(guide.stages).toEqual(model.stages);
    expect(guide.teacherMoves.length).toBe(model.stages.length);
    expect(guide.studentEvidence.length).toBe(model.stages.length);
    expect(guide.antiPatterns.length).toBeGreaterThan(0);
    expect(guide.sources.every(source => /^https:\/\//.test(source.url))).toBe(true);
});
```

- [ ] **Step 2: RED 확인**

Run: `npm test -- tests/instruction-model-guides.test.mjs tests/instruction-models.test.mjs`
Expected: 가이드 로더와 Markdown이 없어 FAIL.

- [ ] **Step 3: 조사 자료를 12개 Markdown으로 기록**

각 파일은 다음 실제 front matter 계약을 사용한다.

```md
---
id: inquiry
name: 탐구·발견 학습
stages: 문제 인식|가설 설정|탐구 수행|결론
verifiedAt: 2026-07-11
---
## 적용 목적
## 단계별 교사 행동
## 단계별 학생 행동과 증거
## 피해야 할 적용
## 참고 자료
```

학술 저장소와 교육기관 자료 URL, 확인 날짜를 각 문서에 기록한다. 원문을 길게 복제하지 않고 단계와 행동을 요약한다.

- [ ] **Step 4: 빌드 시 사용할 정적 가이드 데이터 구현**

Next 서버 번들에서 런타임 파일 경로에 의존하지 않도록 `lib/instruction-model-guides.js`는 검토된 구조화 데이터를 export하고, Markdown은 사람이 확인할 근거 문서로 유지한다.

```js
export const instructionModelGuides = Object.freeze({
    inquiry: Object.freeze({
        stages: ['문제 인식', '가설 설정', '탐구 수행', '결론'],
        teacherMoves: ['탐구 가능한 문제를 제시한다', '검증 가능한 가설을 돕는다', '증거 수집을 지원한다', '증거로 결론을 정교화한다'],
        studentEvidence: ['탐구 질문', '가설과 근거', '관찰·측정 기록', '증거 기반 결론'],
        antiPatterns: ['교사가 결론을 먼저 설명하고 확인 문제만 푸는 흐름'],
    }),
});
```

실제 객체는 `direct`, `concept`, `inquiry`, `problem-solving`, `project`, `cooperative`, `discussion`, `simulation`, `experiment`, `design-thinking`, `blended`, `subject-specific` 12개 키를 모두 선언한다. 각 키는 해당 Markdown과 같은 단계 수의 `teacherMoves`, `studentEvidence` 및 하나 이상의 `antiPatterns`를 빠짐없이 가진다. Step 1의 전체 목록 테스트가 하나라도 누락되면 실패한다.

- [ ] **Step 5: GREEN 확인**

Run: `npm test -- tests/instruction-model-guides.test.mjs tests/instruction-models.test.mjs`
Expected: 12개 모형 전부 PASS.

### Task 6: 모형 가이드 프롬프트 주입과 정렬 검증·보정

**Files:**
- Create: `lib/instruction-model-alignment.js`
- Modify: `lib/upstage/prompts.js`
- Modify: `app/api/generate-plan/route.js`
- Test: `tests/instruction-model-alignment.test.mjs`
- Test: `tests/upstage-prompts.test.mjs`
- Test: `tests/generate-plan-route.test.mjs`

- [ ] **Step 1: 탐구 모형의 이름 복사만으로는 통과하지 않는 실패 테스트 작성**

```js
test('rejects an inquiry plan that omits inquiry-stage evidence', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages.forEach(stage => { stage.learningElement = stage.phase; });
    expect(validateInstructionModelAlignment(plan, instructionModels.find(item => item.id === 'inquiry'))).toEqual(expect.objectContaining({ success: false }));
});

test('accepts ordered inquiry evidence across introduction development and closure', () => {
    const plan = inquiryAlignedPlan();
    expect(validateInstructionModelAlignment(plan, instructionModels.find(item => item.id === 'inquiry'))).toEqual({ success: true, missingStages: [] });
});
```

- [ ] **Step 2: RED 확인**

Run: `npm test -- tests/instruction-model-alignment.test.mjs tests/upstage-prompts.test.mjs tests/generate-plan-route.test.mjs`
Expected: 정렬 검증과 가이드 프롬프트가 없어 FAIL.

- [ ] **Step 3: 모형 단계 증거 검증기 구현**

모형 단계별 토큰은 `learningElement`, 교사·학생 활동, 발문, 예상 반응을 합친 텍스트에서 순서대로 찾는다. 단순 모형 이름만 있는 것은 증거로 세지 않는다. 누락 단계는 보정 프롬프트에 전달한다.

```js
export function validateInstructionModelAlignment(plan, model) {
    const evidence = plan.sessions.flatMap(session => session.stages).map(stage => [
        stage.learningElement, ...stage.teacherActivities, ...stage.studentActivities,
        ...stage.teacherQuestions, ...stage.expectedStudentResponses,
    ].join(' ')).join('\n');
    const missingStages = model.stages.filter(stage => !evidence.includes(stage));
    return missingStages.length ? { success: false, missingStages } : { success: true, missingStages: [] };
}
```

- [ ] **Step 4: 프롬프트에 가이드와 관찰 증거 계약 추가**

사용자 메시지에는 `instructionModelGuide`를 포함하고, 시스템 메시지는 각 단계명이 `learningElement`와 활동에 명시되어야 함을 요구한다. repair 메시지는 `missingStages`를 구체적으로 나열한다.

- [ ] **Step 5: 생성 라우트가 정렬 실패를 한 번 보정하도록 연결**

`parsePlan`은 스키마·초안 불변 조건 뒤에 `validateInstructionModelAlignment`를 실행한다. 두 번째 실패는 기존 422 계약을 유지한다.

- [ ] **Step 6: GREEN 확인**

Run: `npm test -- tests/instruction-model-alignment.test.mjs tests/upstage-prompts.test.mjs tests/generate-plan-route.test.mjs`
Expected: PASS, 첫 실패에는 fetch 2회, 두 번째 실패에는 422.

### Task 7: HWPX 내용 기반 표 높이와 가운데 정렬

**Files:**
- Modify: `lib/export/hwpx-style.js`
- Modify: `lib/export/hwpx.js`
- Modify: `lib/export/document-model.js`
- Test: `tests/export-hwpx.test.mjs`
- Test: `tests/export-hwpx-quality.test.mjs`
- Test: `tests/export-fixtures.test.mjs`

- [ ] **Step 1: 긴 셀 높이와 전체 표 높이 실패 테스트 작성**

```js
test('expands HWPX rows from paragraph count instead of forcing every cell to 2000 HWPUNIT', async () => {
    const xml = await sectionXmlFor(longContentPlan());
    const heights = [...xml.matchAll(/<hp:cellSz width="\d+" height="(\d+)"\/>/g)].map(match => Number(match[1]));
    expect(new Set(heights).size).toBeGreaterThan(1);
    expect(Math.max(...heights)).toBeGreaterThan(2000);
});

test('sizes the table to the sum of calculated row heights', async () => {
    const xml = await sectionXmlFor(longContentPlan());
    expect(readTableHeight(xml)).toBe(sumRowHeights(xml));
});
```

```js
test('centers overview values through the instruction model row', async () => {
    const xml = await sectionXmlFor(makeGeneratedPlan());
    expect(paragraphAlignmentFor(xml, '탐구·발견 학습')).toBe('CENTER');
    expect(paragraphAlignmentFor(xml, '성취기준 원문')).toBe('LEFT');
});
```

- [ ] **Step 2: RED 확인**

Run: `npm test -- tests/export-hwpx.test.mjs tests/export-hwpx-quality.test.mjs`
Expected: 현재 모든 `cellSz height="2000"`, 표 높이 `rows × 2000`으로 FAIL.

- [ ] **Step 3: 행 높이 계산 도우미 구현**

```js
const BASE_CELL_HEIGHT = 900;
const LINE_HEIGHT = 1150;
const CELL_VERTICAL_MARGIN = 160;

export function estimateCellHeight(cell) {
    const lines = cell.paragraphs.reduce((total, paragraph) => total + Math.max(1, Math.ceil(String(paragraph.text ?? '').length / Math.max(8, Math.floor(cell.width / 850)))), 0);
    return Math.max(2000, BASE_CELL_HEIGHT + lines * LINE_HEIGHT + CELL_VERTICAL_MARGIN);
}

export function estimateRowHeight(row) {
    return Math.max(...row.map(estimateCellHeight));
}
```

- [ ] **Step 4: `tableXml`이 계산된 높이를 일관되게 사용**

행별 높이를 한 번 계산해 모든 셀 `cellSz.height`와 표 `hp:sz.height`에 동일하게 사용한다. `vertAlign="TOP"`, `pageBreak="CELL"`, 셀 여백을 유지하고 병합 주소와 열 너비는 바꾸지 않는다.

```js
const rowHeights = definition.rows.map(estimateRowHeight);
const tableHeight = rowHeights.reduce((sum, height) => sum + height, 0);
```

- [ ] **Step 5: 개요 표의 짧은 행만 가운데 문단 사용**

`date`, `place`, `className`, `teacherName`, `schoolGrade`, `subject`, `session`, `unitTitle`, `lessonTitle`, `instructionModel` 값은 centered paragraph를 사용한다. `standards`, `essentialQuestion`, `learningGoals`, `materials`는 왼쪽 정렬을 유지한다.

- [ ] **Step 6: 긴 내용·병합·전체 텍스트 품질 검사**

Run: `npm test -- tests/export-hwpx.test.mjs tests/export-hwpx-quality.test.mjs tests/export-fixtures.test.mjs`
Expected: 긴 fixture의 모든 교수·학생 활동 텍스트, 단계 셀, 표 너비·병합·ID 계약 PASS.

- [ ] **Step 7: 실제 HWPX fixture 재생성 및 검사**

Run: `node scripts/create-export-fixtures.mjs`
Expected: `.hwpx`, `.docx`, `.pdf` 생성 성공. HWPX ZIP/XML 검사 PASS.

### Task 8: 변경 기록과 사용자 흐름 E2E

**Files:**
- Create: `docs/change-log/README.md`
- Create: `docs/change-log/2026/07/2026-07-11.md`
- Modify: `e2e/lesson-plan.spec.mjs`
- Modify: `e2e/lesson-plan-export.mjs`
- Modify: `tests/design-contract.test.mjs`

- [ ] **Step 1: 변경 기록 형식과 E2E 실패 테스트 작성**

```js
test('change log records KST time and categorized requests', async () => {
    const log = await readFile('docs/change-log/2026/07/2026-07-11.md', 'utf8');
    expect(log).toMatch(/## \d{2}:\d{2} KST · 화면·사용성/);
    expect(log).toContain('직접 입력 과목');
    expect(log).toContain('HWPX');
});
```

E2E 시나리오 이름:

```js
test('직접 입력 과목을 공식 과목에 연결해 생성한다', async ({ page }) => {});
test('완성 후 이전 입력을 수정하고 기존 결과를 보존한 채 다시 생성한다', async ({ page }) => {});
test('재생성 실패 후 기존 편집 지도안을 보존한다', async ({ page }) => {});
```

- [ ] **Step 2: RED 확인**

Run: `npm test -- tests/design-contract.test.mjs && CI=1 npm run test:e2e -- --grep "직접 입력|다시 생성"`
Expected: 기록 파일과 새 흐름이 없어 FAIL.

- [ ] **Step 3: 변경 기록 규칙과 이번 요청 기록 작성**

`README.md`는 경로, KST 시각, 여섯 종류, 상태·파일·검증·제약 필드를 정의한다. 날짜 파일은 2026-07-11의 실제 작업 시각을 사용해 요청 1~8과 구현 결과를 종류별로 기록한다.

- [ ] **Step 4: 직접 과목·요약·단계 이동·재생성 E2E 구현**

`mockApis`에 `/api/map-subject` 응답을 추가한다. 생성 횟수별로 제목을 달리해 두 번째 결과로 교체됐음을 관찰 가능하게 한다. 실패 시에는 편집한 제목과 `originalPlan`이 유지되는지 확인한다.

- [ ] **Step 5: 반응형·접근성 회귀 확인**

Run: `CI=1 npm run test:e2e`
Expected: desktop/mobile 전체 PASS, axe 위반 0, 가로 overflow 1px 이하.

### Task 9: 실제 모형 표본과 전체 완료 검증

**Files:**
- Modify: `scripts/benchmark-upstage-models.mjs`
- Create: `scripts/check-instruction-model-samples.mjs`
- Update: `docs/change-log/2026/07/2026-07-11.md`

- [ ] **Step 1: 실제 표본 검사 스크립트 작성**

대표 구조로 `직접 교수`, `탐구·발견`, `협동`, `프로젝트`, `토의·토론`을 선택한다. 각 요청은 현재 `.env` 모델을 사용하고 응답을 `lessonPlanSchema`와 `validateInstructionModelAlignment`로 검사한다. API 키와 원문 응답 전체는 로그에 남기지 않는다.

```js
const sampleModelIds = ['direct', 'inquiry', 'cooperative', 'project', 'discussion'];
for (const modelId of sampleModelIds) {
    const result = await generateSample(modelId);
    const checked = validateInstructionModelAlignment(result.plan, instructionModels.find(model => model.id === modelId));
    console.log(`${modelId}: ${checked.success ? 'PASS' : `FAIL ${checked.missingStages.join(', ')}`}`);
}
```

- [ ] **Step 2: 전체 단위·통합 테스트 실행**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 3: 전체 E2E 실행**

Run: `CI=1 npm run test:e2e`
Expected: desktop/mobile 0 failures, 0 unexpected skips.

- [ ] **Step 4: 프로덕션 빌드 실행**

Run: `npm run build`
Expected: 교육과정 카탈로그 생성과 Next.js production build exit 0.

- [ ] **Step 5: 내보내기 fixture와 HWPX 구조 검사**

Run: `node scripts/create-export-fixtures.mjs && npm test -- tests/export-hwpx.test.mjs tests/export-hwpx-quality.test.mjs tests/export-fixtures.test.mjs`
Expected: 세 형식 생성, HWPX 구조·내용·동적 높이 PASS.

- [ ] **Step 6: 실제 Upstage 대표 표본 실행**

Run: `node scripts/check-instruction-model-samples.mjs`
Expected: 5개 대표 모형 PASS. 외부 API 오류는 구현 실패와 구분해 HTTP 상태·모델명·소요 시간만 기록.

- [ ] **Step 7: 브라우저 시각 QA**

개발 서버에서 375×812, 768×1024, 1280×900으로 수업 정보, 직접 과목 매핑, 완성 요약, 변경 경고, 지도안 표를 캡처한다. 일시~수업 모형 가운데 정렬, `T` 미노출, 표 가로 넘침 없음, 재생성 버튼 상태를 확인한다.

- [ ] **Step 8: 변경 기록 완료 상태 갱신**

실제 테스트 수, E2E 수, 빌드 결과, HWPX 검사 결과, Upstage 표본 결과, 한컴오피스 직접 확인 가능 여부를 `docs/change-log/2026/07/2026-07-11.md`에 기록한다.
