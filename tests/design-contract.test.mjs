import { readFile } from 'node:fs/promises';
import { test, expect } from 'vitest';

test('uses local Paperlogy and approved green action token', async () => {
    const css = await readFile('app/globals.css', 'utf8');
    expect(css).toContain("font-family: 'Paperlogy'");
    expect(css).toContain('--color-action: #176f5b');
    expect(css).not.toMatch(/#6366f1|#8b5cf6|linear-gradient/i);
});

test('every CSS custom property reference resolves to a declared design token', async () => {
    const css = await readFile('app/globals.css', 'utf8');
    const declarations = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
    const references = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(match => match[1]));

    expect([...references].filter(token => !declarations.has(token))).toEqual([]);
});

test('tablet layouts preserve lesson dates and switch cover rubrics to complete cards', async () => {
    const css = await readFile('app/globals.css', 'utf8');

    expect(css).toMatch(/@media \(max-width: 800px\)[\s\S]*?\.workspace \{ display: block;/);
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.cover-rubric-table \{ display: none;/);
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*?\.cover-rubric-cards \{ display: grid;/);
});

test('mobile submission tabs do not reserve a desktop process-rail offset', async () => {
    const css = await readFile('app/globals.css', 'utf8');

    const desktopRailOffset = css.lastIndexOf('.submission-review-tabs { display: grid;');
    const mobileReset = css.lastIndexOf('.submission-review-tabs { top: 0; }');

    expect(desktopRailOffset).toBeGreaterThan(-1);
    expect(mobileReset).toBeGreaterThan(desktopRailOffset);
});

test('disabled PDF pickers use muted tokens instead of the active green affordance', async () => {
    const css = await readFile('app/globals.css', 'utf8');

    expect(css).toMatch(/\.file-picker--disabled \.file-picker__button \{[^}]*color: var\(--color-muted\);[^}]*background: var\(--color-subdued\);[^}]*border-color: var\(--color-border\);[^}]*cursor: not-allowed;/);
});

test('mobile PDF workflow keeps Korean semantic phrases together', async () => {
    const [roster, upload, grading, review, css] = await Promise.all([
        readFile('components/workflow/StudentRosterEditor.jsx', 'utf8'),
        readFile('components/workflow/StudentPdfUpload.jsx', 'utf8'),
        readFile('components/workflow/OcrGradingStage.jsx', 'utf8'),
        readFile('components/workflow/SubmissionReviewWorkspace.jsx', 'utf8'),
        readFile('app/globals.css', 'utf8'),
    ]);

    expect(roster).toContain('<span className="nowrap">학년 · 반 · 번호 · 이름</span>');
    expect(upload).toContain('<span className="nowrap">표지를 뺀 답안 PDF만</span>');
    expect(upload).toContain('<span className="nowrap">이 학생의 수행평가 안내 표지</span>');
    expect(upload).toContain('<span className="pdf-cover-check__copy">각 개별 PDF의 첫 페이지가 <span className="nowrap">이 학생의 수행평가 안내 표지</span></span>');
    expect(css).toMatch(/\.pdf-cover-check__copy \{[^}]*min-width: 0;[^}]*word-break: keep-all;/);
    expect(grading).toContain('<span className="nowrap">원본을 다시 연결하기 전에는</span>');
    expect(review).toContain('<span className="nowrap">모든 근거를 확인한 뒤</span>');
});

test('change log records KST time and categorized requests', async () => {
    const log = await readFile('docs/change-log/2026/07/2026-07-11.md', 'utf8');
    expect(log).toMatch(/## \d{2}:\d{2} KST · 화면·사용성/);
    expect(log).toContain('직접 입력 과목');
    expect(log).toContain('HWPX');
    expect(log).toContain('상태:');
    expect(log).toContain('검증:');
});
