# Allpass Teaching Design System

## 0. Research Log

- Refero styles reviewed: Notion warm-paper workspace, Super single-action-color document UI, Tally form workflow, ClickUp dense productivity UI.
- Primary reference: Notion warm-paper workspace for document focus, warm neutrals, thin borders, and restrained density.
- Secondary reference: Super only for a single saturated action color; the action role remains CTA/selection only.
- Product-flow reference: Tally only for progressive form disclosure and clear helper copy.
- Selected visual target: the user-approved “A · 차분한 교사 워크벤치” browser mockup in the design session.
- Lazyweb and Imagen were skipped because the user selected a concrete Refero-grounded mockup before implementation; generating another target would conflict with that approval.

## 1. Product Brief

Designing an all-in-one teaching workbench for Korean elementary, middle, and general high-school teachers on the web. The primary journey moves from lesson intent to a curriculum-aligned plan, worksheet, performance assessment, evidence-checked grading, and subject record without hiding teacher judgment. The experience must feel calm, exact, trustworthy, and comfortable during long document work.

## 2. Personas and Constraints

- Time-pressed homeroom teacher: needs obvious next actions and draft recovery.
- Curriculum-expert subject teacher: needs source codes, direct search, and control over AI suggestions.
- Low-confidence digital user: needs plain Korean labels, forgiving errors, and no hidden gestures.
- Keyboard or low-vision user: needs visible focus, robust contrast, semantic landmarks, and non-color status cues.
- Teacher processing a class set: needs student-by-student progress, isolated failures, a clear recovery action, and protection from accidentally retaining original submissions.

## 3. Visual Thesis

A quiet teacher workbench: warm paper canvas, white working sheet, charcoal text, hairline dividers, and one deep green action color. It is a productivity tool, not an AI spectacle. No gradients, violet, decorative serif swaps, emoji icons, glass effects, or cards without interaction meaning.

## 4. Tokens

- Canvas `#f6f5f2`; surface `#ffffff`; subdued surface `#f1f0ec`.
- Ink `#2f302d`; secondary `#65655f`; border `#d9d8d2`.
- Action `#176f5b`; hover `#105947`; action tint `#e8f3ef`.
- Error `#b42318`; warning `#8a5a00`; success uses action green with explicit text.
- Dialog scrim uses charcoal ink at 48% opacity so destructive confirmation is visually modal without introducing a new hue.
- Controls radius 7px; panels 10px; status pills only may use full radius.
- Spacing uses 4, 8, 12, 16, 24, 32, 48px.
- Shadows are restricted to focus rings and floating dialogs; normal grouping uses borders/dividers.

## 5. Typography

Paperlogy v1.001 is locally hosted. Body uses 400, interactive labels 500, buttons/section headings 600, and page titles 700. Base text is 16px/1.55; helper text never falls below 13px. Korean display copy uses balanced wrapping and prose uses pretty wrapping where supported.

## 6. Layout and Primitives

- Desktop: a full-width process rail sits above the existing 220px lesson-step sidebar and a flexible reading column capped near 920px. Later processes use a centered work surface capped near 1120px.
- Mobile: the process rail scrolls horizontally without truncating labels; the lesson sidebar becomes a top progress summary with previous/next actions.
- Primitives: Button, Field, ChoiceTile, StatusMessage, StepNavigation, ProcessTabs, GenerationSummary, PrerequisiteNotice, StaleNotice, StructuredEditor, BatchItem, ApprovalState, Dialog, LessonTable.
- StudentRoster is a bordered project-level editor with an explicit `현재 / 최대` count, direct row controls, private Excel actions, atomic import issues, and a Dialog before deleting linked evidence.
- GenerationSummary uses a border-only surface, definition-list facts, an explicit warning sentence, and separate edit/regenerate actions. It never hides or replaces the generated document.
- ChoiceTile is a card only because the full container is selectable; informational sections have no card chrome.
- ProcessTabs always expose all five processes and pair color with `완료`, `검토 필요`, or `선행 단계 필요` text. Arrow keys move focus; selecting a blocked process shows a prerequisite explanation instead of silently redirecting.
- StructuredEditor uses white document sections separated by rules. Repeated sections have explicit add/remove controls and preserve visible labels; it does not become a dashboard card grid.
- BackwardDesignForm leads with three full-width plain-language questions, a slim green rule, contextual examples, and a separate compact configuration grid. The first question is visibly required; AI suggestions fill editable fields rather than replacing teacher intent.
- EvidenceMap is a quiet four-column trace from canonical standard to task evidence, rubric criteria, and score basis. At mobile widths it becomes a single-column reading sequence without hiding any link.
- RubricCriterion is a bordered fieldset with explicit reorder/duplicate/delete controls, outcome/process identity, total/interval inputs, and responsive level panels. It never encodes quality by color alone.
- CoverPreview is a live paper-like student page that reads the current subject, transfer goal, canonical standards, GRASPS situation/role/audience, submission conditions, materials/cautions, checkpoints, and rubric. The rubric is a live reference, never duplicated cover state. Mobile uses criterion cards rather than hiding level columns behind horizontal scrolling.
- Student-cover export is exactly one page across the supported 2–6 levels and 2–15 criteria. Content that cannot fit is rejected with a repair message; disabling the per-student cover hides its editor/export and the full assessment begins with the task page.
- CandidatePanel preserves the current assessment during AI regeneration and offers two explicit actions: apply the new candidate or keep the current document. A candidate generated from stale inputs cannot be applied.
- BatchItem is a bordered student row with name, file metadata, current status, progress or error copy, and its next valid action. One failed row never changes successful siblings.
- SubmissionReview is a desktop split workspace with the original PDF on the left and OCR/grading on the right. At tablet and mobile widths it becomes keyboard-accessible `원본 답안` / `OCR 결과` / `채점 결과` tabs without removing any content.
- PdfEvidenceViewer uses the existing surface, subdued, border, action, and warning tokens. Its compact toolbar always exposes page movement, page input, zoom, rotation, width/screen fit, and fullscreen; linked source coordinates render as a finite outline overlay, never as a substitute image.
- EvidenceCheck pairs every visual, equation, chart, low-confidence, truncated, or unlinked OCR source with explicit text badges and a teacher confirmation checkbox. Approval stays unavailable until all required source checks and the current original are confirmed.
- ApprovalState distinguishes AI draft, teacher edited, and teacher approved. Editing an approved score removes approval and explains why.
- StaleNotice preserves an existing downstream document and names which upstream source changed, with a single regenerate action.
- Minimum touch target is 44px. All fields have visible labels and linked error/helper text.

## 7. Interaction and Motion

Motion communicates state only: 160–200ms opacity/transform for step changes and dialog entry. Loading uses textual status and a restrained progress indicator. `prefers-reduced-motion` removes nonessential transitions. Hover never exists without a click/focus affordance.

## 8. Workflow Content and Privacy

- AI output is consistently labeled `AI 초안` until teacher approval. No stage implies that scores or school-record text are final.
- Teacher-owned assessment settings and canonical standards are authoritative over AI output. Visual/math/diagram responses cannot enter automatic text-only grading; they remain scoreless until the original submission is reviewed.
- OCR upload copy states that PDFs are sent to Upstage for extraction and originals are not retained. Student names, extracted text, grading, and records use current-tab storage for refresh recovery and are removed when the tab closes; legacy permanent storage is migrated and deleted.
- `학생 자료 모두 지우기` is visible from the OCR and record stages and requires confirmation naming the irreversible scope.
- Empty states explain the exact prerequisite and provide one action to open it. Error states preserve teacher edits and provide a retry that affects only the failed item.
- Dense rubric tables may scroll horizontally on narrow screens, with the criterion column remaining readable and no clipped inputs.

## 9. Accessibility and Accepted Debt

Target WCAG 2.2 AA, complete keyboard flow, `:focus-visible`, live announcements for generation and errors, and explicit labels for every input. There is no accepted accessibility debt for the MVP. Visual QA must inspect Korean orphaned particles, clipped glyphs, and mobile overflow.

## Reference Lock

- Preserve: warm canvas, white work surface, Paperlogy, deep-green action-only color, persistent steps, thin borders, restrained density.
- Borrow only: Tally’s progressive disclosure and Super’s single-action-color discipline.
- Reject: gradients, violet/indigo, generic dashboard card grids, decorative motion, dark-by-default, and AI-themed sparkles.
