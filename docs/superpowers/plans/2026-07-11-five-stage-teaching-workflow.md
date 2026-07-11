# Five-stage Teaching Workflow Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the lesson-plan MVP into a browser-persisted, five-stage teacher workflow covering lesson plans, worksheets, performance assessment and rubric generation, batch PDF OCR and grading, and evidence-grounded subject records.

**Architecture:** Keep the existing lesson-plan draft as the stage-one source of truth and wrap it in a new `TeachingWorkflow` shell. Store downstream JSON-only artifacts under `allpass.teaching-workflow`, tag every artifact with a stable source hash, and show stale-state warnings instead of deleting work. Put all Upstage calls behind validated Next.js route handlers, keep PDF bytes out of local storage, and use editable structured documents for every AI result.

**Tech Stack:** Next.js 16 App Router, React 19, JavaScript, Zod 4, Upstage Solar API, Upstage Document Parse, pdf-lib, Vitest, Testing Library, Playwright.

---

## Task 1: Replace broad subject groups with grade-aware subject choices

**Files:**
- Create: `lib/subject-options.js`
- Modify: `components/lesson-plan/LessonBasicsStep.jsx`
- Modify: `components/lesson-plan/LessonPlanWorkspace.jsx`
- Modify: `app/globals.css`
- Test: `tests/subject-options.test.mjs`
- Test: `tests/lesson-basics-step.test.jsx`

1. Add failing tests for elementary grade filtering, the corrected middle-school list, grouped high-school courses, catalog aliases, and `직접 입력` as the last choice.
2. Implement `subjectOptionsFor(schoolLevel, grade)` and `catalogSubjectsFor(option)` using the approved curriculum mapping.
3. Replace the input-mode radios with one subject select. Use `__custom__` only as a UI sentinel and reveal the existing mapping panel when selected.
4. Reset subject and standards when school level or grade changes, while migrating legacy drafts that still contain `subjectMode`.
5. Run `npm test -- tests/subject-options.test.mjs tests/lesson-basics-step.test.jsx`.

## Task 2: Add the five-stage workflow shell and persistence contract

**Files:**
- Create: `lib/workflow-store.js`
- Create: `lib/source-hash.js`
- Create: `components/workflow/ProcessTabs.jsx`
- Create: `components/workflow/WorkflowPrerequisite.jsx`
- Create: `components/workflow/TeachingWorkflow.jsx`
- Modify: `components/lesson-plan/LessonPlanWorkspace.jsx`
- Modify: `app/page.js`
- Modify: `app/globals.css`
- Test: `tests/workflow-store.test.mjs`
- Test: `tests/process-tabs.test.jsx`
- Test: `tests/teaching-workflow.test.jsx`

1. Add failing tests for JSON-only persistence, version migration, stable source hashes, prerequisite states, stale downstream artifacts, keyboard tab navigation, and student-data clearing.
2. Implement the `allpass.teaching-workflow` store without `File`, Blob, or PDF bytes.
3. Expose `onDraftChange` from `LessonPlanWorkspace`; send the current lesson snapshot after hydration and edits.
4. Add five always-selectable top tabs with `완료`, `검토 필요`, and `선행 단계 필요` labels and accessible tab semantics.
5. Add shared prerequisite and stale-result notices. Preserve stale outputs until regeneration.
6. Run the focused tests and the existing lesson workspace navigation tests.

## Task 3: Build structured worksheet generation and editing

**Files:**
- Create: `lib/worksheet-formats.js`
- Create: `lib/worksheet-schema.js`
- Create: `lib/workflow-prompts.js`
- Create: `app/api/generate-worksheet/route.js`
- Create: `components/workflow/WorksheetStage.jsx`
- Create: `components/workflow/WorksheetEditor.jsx`
- Modify: `components/workflow/TeachingWorkflow.jsx`
- Modify: `app/globals.css`
- Test: `tests/worksheet-formats.test.mjs`
- Test: `tests/worksheet-schema.test.mjs`
- Test: `tests/generate-worksheet-route.test.mjs`
- Test: `tests/worksheet-stage.test.jsx`

1. Add failing tests for model-to-format mapping, structured worksheet validation, one repair attempt, selected-format preservation, editor changes, and source hashes.
2. Implement a researched format registry for direct instruction, concept learning, inquiry/experiment, problem solving, project, cooperative learning, debate, role play, design, blended, and subject-specific lessons.
3. Add Solar prompts that return a title, reason, student-information fields, sections, questions, response-space size, and a separate teacher answer key.
4. Implement `/api/generate-worksheet` with Zod request/response validation and one structured repair call.
5. Build the editable stage with recommended-format explanation, teacher override, regenerate, saving, and stale-result display.

## Task 4: Build performance assessment and analytic rubric generation

**Files:**
- Create: `lib/assessment-schema.js`
- Create: `app/api/generate-assessment/route.js`
- Create: `components/workflow/AssessmentStage.jsx`
- Create: `components/workflow/RubricEditor.jsx`
- Modify: `lib/workflow-prompts.js`
- Modify: `components/workflow/TeachingWorkflow.jsx`
- Modify: `app/globals.css`
- Test: `tests/assessment-schema.test.mjs`
- Test: `tests/generate-assessment-route.test.mjs`
- Test: `tests/assessment-stage.test.jsx`

1. Add failing tests for the task contract, four performance levels, criterion evidence, 100-point totals, one repair attempt, and teacher edits.
2. Generate a GRASPS-style task from the lesson standards, goals, and activities.
3. Generate a four-level analytic rubric that forbids attitude-only scoring and contains observable evidence for every criterion.
4. Let teachers edit every field and rebalance points; show a clear warning until the total is 100.

## Task 5: Export worksheets and assessments as readable PDFs

**Files:**
- Create: `lib/export/workflow-pdf.js`
- Create: `app/api/export-workflow/[kind]/route.js`
- Modify: `components/workflow/WorksheetStage.jsx`
- Modify: `components/workflow/AssessmentStage.jsx`
- Test: `tests/workflow-pdf.test.mjs`
- Test: `tests/workflow-export-route.test.mjs`

1. Add failing tests for PDF signatures, page creation, Korean font embedding, long-section pagination, and route validation.
2. Reuse Paperlogy font assets and `pdf-lib` to render A4 worksheet and assessment documents with non-splitting headings and repeatable rubric headers.
3. Add download actions and descriptive Korean filenames.
4. Render test fixtures and inspect every generated page for clipping or blank content.

## Task 6: Add Upstage batch PDF OCR

**Files:**
- Create: `lib/upstage/document-parse.js`
- Create: `app/api/ocr/route.js`
- Create: `lib/batch-queue.js`
- Create: `components/workflow/OcrGradingStage.jsx`
- Modify: `components/workflow/TeachingWorkflow.jsx`
- Modify: `app/globals.css`
- Test: `tests/document-parse.test.mjs`
- Test: `tests/ocr-route.test.mjs`
- Test: `tests/batch-queue.test.mjs`
- Test: `tests/ocr-grading-stage.test.jsx`

1. Add failing tests for `content.html` and element-text normalization, API errors, PDF MIME/extension/10 MB checks, ten-file limits, and concurrency two with partial failures.
2. Implement a multipart client for `POST https://api.upstage.ai/v1/document-digitization` using `model=document-parse` and `ocr=force` without logging the key, PDF, or raw response.
3. Implement `/api/ocr`, returning normalized plain text, model, and page count only.
4. Build multi-file selection, filename-derived editable student names, per-file progress/retry, and editable OCR text.
5. Never persist the selected `File` or original bytes; persist only extracted text and metadata.

## Task 7: Add rubric-based grading and teacher approval

**Files:**
- Create: `lib/grading-schema.js`
- Create: `app/api/grade-submission/route.js`
- Create: `components/workflow/GradingEditor.jsx`
- Modify: `lib/workflow-prompts.js`
- Modify: `components/workflow/OcrGradingStage.jsx`
- Test: `tests/grading-schema.test.mjs`
- Test: `tests/grade-submission-route.test.mjs`
- Test: `tests/grading-editor.test.jsx`

1. Add failing tests for criterion IDs, score bounds, direct OCR evidence, one repair attempt, server-side total calculation, and approval reset after edits.
2. Generate criterion-level score, exact evidence, and feedback from only the approved rubric, standards, and edited OCR text.
3. Calculate the total on the server and reject scores above criterion maxima.
4. Add per-student editing and explicit teacher approval. Only approved submissions become eligible for stage five.

## Task 8: Generate evidence-grounded subject record comments

**Files:**
- Create: `lib/record-schema.js`
- Create: `app/api/generate-record/route.js`
- Create: `components/workflow/RecordsStage.jsx`
- Modify: `lib/workflow-prompts.js`
- Modify: `components/workflow/TeachingWorkflow.jsx`
- Modify: `app/globals.css`
- Test: `tests/record-schema.test.mjs`
- Test: `tests/generate-record-route.test.mjs`
- Test: `tests/records-stage.test.jsx`

1. Add failing tests for 300–1000 character limits, default 500, approved-only inputs, evidence preservation, per-student generation, batch generation, editing, copying, and character counts.
2. Generate Korean subject-specific school-record drafts without score lists, comparison, invented facts, or personality claims.
3. Build single and batch generation with per-student failures isolated, editable text, copy feedback, and stale-source warnings.

## Task 9: Harden privacy, accessibility, and recovery

**Files:**
- Modify: `components/workflow/TeachingWorkflow.jsx`
- Modify: `components/workflow/ProcessTabs.jsx`
- Modify: `components/workflow/OcrGradingStage.jsx`
- Modify: `app/globals.css`
- Modify: `DESIGN.md`
- Test: `tests/teaching-workflow.test.jsx`
- Test: `tests/design-contract.test.mjs`

1. Add a visible privacy notice and `학생 자료 모두 지우기` confirmation.
2. Add live regions, focus-visible states, disabled/loading copy, mobile tab scrolling, and desktop/mobile responsive layouts.
3. Verify stage recovery after refresh while confirming PDF bytes are absent from storage.
4. Update `DESIGN.md` with the workflow status, editor, rubric, and batch-item primitives.

## Task 10: Verify the complete workflow and document the result

**Files:**
- Create: `e2e/five-stage-workflow.spec.js`
- Create: `scripts/check-upstage-ocr.mjs`
- Modify: `package.json`
- Modify: `docs/change-log/2026/07/2026-07-11.md`
- Modify: `.env.example`

1. Add an E2E fixture flow covering stage navigation, worksheet generation, rubric generation, two PDF OCR items with one recoverable failure, approval, and record generation.
2. Add an actual OCR smoke script that sends a Korean fixture and prints only model, elapsed time, page count, text length, and a sentinel match.
3. Run `npm test`.
4. Run `CI=1 npm run test:e2e`.
5. Run `npm run build`.
6. Run the actual OCR smoke test with the configured key; record the result without the key or extracted student text.
7. Inspect desktop and mobile pages, keyboard navigation, console errors, worksheet PDF, and assessment PDF.
8. Record every change and verification result with the local month/day/time in the dated change log.
