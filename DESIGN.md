# Allpass Teaching Design System

## 0. Research Log

- Refero styles reviewed: Notion warm-paper workspace, Super single-action-color document UI, Tally form workflow, ClickUp dense productivity UI.
- Primary reference: Notion warm-paper workspace for document focus, warm neutrals, thin borders, and restrained density.
- Secondary reference: Super only for a single saturated action color; the action role remains CTA/selection only.
- Product-flow reference: Tally only for progressive form disclosure and clear helper copy.
- Selected visual target: the user-approved “A · 차분한 교사 워크벤치” browser mockup in the design session.
- Lazyweb and Imagen were skipped because the user selected a concrete Refero-grounded mockup before implementation; generating another target would conflict with that approval.

## 1. Product Brief

Designing a lesson-planning workbench for Korean elementary, middle, and general high-school teachers on the web. The primary goal is to move from lesson intent to a curriculum-aligned, editable plan without hiding teacher judgment. The experience must feel calm, exact, trustworthy, and comfortable during long document work.

## 2. Personas and Constraints

- Time-pressed homeroom teacher: needs obvious next actions and draft recovery.
- Curriculum-expert subject teacher: needs source codes, direct search, and control over AI suggestions.
- Low-confidence digital user: needs plain Korean labels, forgiving errors, and no hidden gestures.
- Keyboard or low-vision user: needs visible focus, robust contrast, semantic landmarks, and non-color status cues.

## 3. Visual Thesis

A quiet teacher workbench: warm paper canvas, white working sheet, charcoal text, hairline dividers, and one deep green action color. It is a productivity tool, not an AI spectacle. No gradients, violet, decorative serif swaps, emoji icons, glass effects, or cards without interaction meaning.

## 4. Tokens

- Canvas `#f6f5f2`; surface `#ffffff`; subdued surface `#f1f0ec`.
- Ink `#2f302d`; secondary `#65655f`; border `#d9d8d2`.
- Action `#176f5b`; hover `#105947`; action tint `#e8f3ef`.
- Error `#b42318`; warning `#8a5a00`; success uses action green with explicit text.
- Controls radius 7px; panels 10px; status pills only may use full radius.
- Spacing uses 4, 8, 12, 16, 24, 32, 48px.
- Shadows are restricted to focus rings and floating dialogs; normal grouping uses borders/dividers.

## 5. Typography

Paperlogy v1.001 is locally hosted. Body uses 400, interactive labels 500, buttons/section headings 600, and page titles 700. Base text is 16px/1.55; helper text never falls below 13px. Korean display copy uses balanced wrapping and prose uses pretty wrapping where supported.

## 6. Layout and Primitives

- Desktop: 220px persistent step sidebar and a flexible reading column capped near 920px.
- Mobile: sidebar becomes a top progress summary with previous/next actions.
- Primitives: Button, Field, ChoiceTile, StatusMessage, StepNavigation, Dialog, LessonTable.
- ChoiceTile is a card only because the full container is selectable; informational sections have no card chrome.
- Minimum touch target is 44px. All fields have visible labels and linked error/helper text.

## 7. Interaction and Motion

Motion communicates state only: 160–200ms opacity/transform for step changes and dialog entry. Loading uses textual status and a restrained progress indicator. `prefers-reduced-motion` removes nonessential transitions. Hover never exists without a click/focus affordance.

## 8. Accessibility and Accepted Debt

Target WCAG 2.2 AA, complete keyboard flow, `:focus-visible`, live announcements for generation and errors, and explicit labels for every input. There is no accepted accessibility debt for the MVP. Visual QA must inspect Korean orphaned particles, clipped glyphs, and mobile overflow.

## Reference Lock

- Preserve: warm canvas, white work surface, Paperlogy, deep-green action-only color, persistent steps, thin borders, restrained density.
- Borrow only: Tally’s progressive disclosure and Super’s single-action-color discipline.
- Reject: gradients, violet/indigo, generic dashboard card grids, decorative motion, dark-by-default, and AI-themed sparkles.
