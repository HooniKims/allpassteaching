import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

test('Given a 375px grading workspace When responsive CSS applies Then the higher-specificity grading criterion becomes one readable column', async () => {
    const css = await readFile('app/globals.css', 'utf8');
    const mobile = css.slice(css.indexOf('@media (max-width: 760px)'));

    expect(mobile).toMatch(/\.grading-criteria\s+\.grading-criterion\s*\{[^}]*grid-template-columns:\s*1fr/);
});

test('Given the mobile reattach notice When Korean copy wraps Then the OCR grading compound stays together', async () => {
    const source = await readFile('components/workflow/SubmissionReviewWorkspace.jsx', 'utf8');

    expect(source).toContain('<span className="nowrap">OCR·채점 초안은</span>');
});

test('Given the mobile grading summary When Korean copy wraps Then the confirmation phrase stays together', async () => {
    const source = await readFile('components/workflow/GradingEditor.jsx', 'utf8');

    expect(source).toContain('<span className="nowrap">확인 뒤</span>');
});
