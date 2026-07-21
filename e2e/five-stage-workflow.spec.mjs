import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeGeneratedPlan } from '../tests/fixtures/lesson-plan.mjs';
import { makeAssessment, makeWorksheet } from '../tests/fixtures/workflow.mjs';
import { gradingSourceHash } from '../lib/workflow-lineage.js';
import { canonicalGradingOrigin, canonicalGradingSourceRef } from '../lib/grading-evidence.js';

function grading(input) {
    const { assessment, extractedText, elements } = input;
    const refs = new Map(elements.map(element => [element.id, canonicalGradingSourceRef(element)]));
    const criteria = [
        { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-1', selectedLevelId: 'proficient', score: 35, evidence: '뿌리에 가는 털이 있다', reason: '관찰 특징이 수준 설명에 부합합니다.', feedback: '관찰 근거를 구체적으로 기록했습니다.', confidence: .96, sourceRefs: [refs.get('root-evidence')], teacherConfirmed: false },
        { status: 'teacher_review', reviewRequired: true, criterionId: 'criterion-2', selectedLevelId: null, score: null, evidence: 'x² = 4', reviewReason: '수식의 핵심 기호를 원본에서 확인해야 합니다.', confidence: .66, sourceRefs: [refs.get('equation-evidence')], teacherConfirmed: false },
        { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-3', selectedLevelId: 'proficient', score: 15, evidence: '피드백을 반영해 설명을 고쳤다', reason: '피드백 반영 과정의 근거가 드러납니다.', feedback: '피드백 반영과 수정 이유를 확인했습니다.', confidence: .91, sourceRefs: [refs.get('revision-evidence')], teacherConfirmed: false, revisionEvidence: { checkpointId: 'checkpoint-2', beforeEvidence: '뿌리에 가는 털이 있다', beforeSourceRef: refs.get('root-evidence'), afterEvidence: '피드백을 반영해 설명을 고쳤다', afterSourceRef: refs.get('revision-evidence'), changeReason: '관찰 근거를 더 분명히 설명하기 위해 수정함.', teacherConfirmed: true } },
    ];
    const reviewOrigins = criteria.map(canonicalGradingOrigin);
    return {
    criteria: [
        ...criteria,
    ],
    provisionalTotal: 50,
    totalScore: null,
    sourceHash: gradingSourceHash(assessment, extractedText, elements, criteria, input),
    summary: '관찰한 사실을 기능 설명의 근거로 활용했습니다.',
    nextSteps: '줄기와 잎도 같은 방식으로 설명해보세요.',
    reviewOrigins,
    originToken: 'a'.repeat(64),
    };
}
const recordText = '관찰한 식물 기관의 특징을 구체적으로 기록하고 뿌리의 가는 털과 물 흡수 기능을 근거로 연결하여 설명함. 관찰 사실에서 결론을 이끌어내는 교과 탐구 과정이 드러났으며 다른 기관에도 같은 설명 방식을 적용하려는 학습 방향을 보임.';
const candidateSuffix = { '김학생': ' 문장을 보완함.', '이학생': ' 근거를 보완함.' };
const studentRoster = [
    { id: 'student-a', grade: '2', className: '3', number: 1, name: '김학생' },
    { id: 'student-b', grade: '2', className: '3', number: 2, name: '이학생' },
];

function makeVisualAssessment() {
    return { ...makeAssessment(), visualAnalysisRequired: true };
}

async function combinedSubmissionPdf() {
    const document = await PDFDocument.create();
    for (let index = 0; index < 4; index += 1) document.addPage([300, 400]);
    return Buffer.from(await document.save());
}

async function rosterWorkbook() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('학생 명단');
    sheet.addRow(['학년', '반', '번호', '이름']);
    sheet.addRow(['2', '3', 1, '김학생']);
    sheet.addRow(['2', '3', 2, '이학생']);
    return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function downloadBytes(page, action) {
    const downloadPromise = page.waitForEvent('download');
    await action();
    const download = await downloadPromise;
    return { bytes: await readFile(await download.path()), filename: download.suggestedFilename() };
}

async function expectPdfDownload(page, action, expectedText) {
    const { bytes } = await downloadBytes(page, action);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(0);
    expect(bytes.length).toBeGreaterThan(1_000);
    const parsed = await getDocument({ data: Uint8Array.from(bytes), disableWorker: true }).promise;
    const pageTexts = [];
    for (let pageNumber = 1; pageNumber <= parsed.numPages; pageNumber += 1) {
        const content = await (await parsed.getPage(pageNumber)).getTextContent();
        pageTexts.push(content.items.map(item => item.str).join(' '));
    }
    await parsed.destroy();
    expect(pageTexts.join('\n')).toContain(expectedText);
    return document.getPageCount();
}

async function expectLessonExports(page) {
    for (const format of ['hwpx', 'docx', 'pdf']) {
        await page.getByLabel('내보내기 형식').selectOption(format);
        const { bytes, filename } = await downloadBytes(page, () => page.getByRole('button', { name: '파일로 저장' }).click());
        expect(filename.endsWith(`.${format}`)).toBe(true);
        if (format === 'pdf') {
            expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
            const parsed = await getDocument({ data: Uint8Array.from(bytes), disableWorker: true }).promise;
            const content = await (await parsed.getPage(1)).getTextContent();
            expect(content.items.map(item => item.str).join(' ')).toContain('교수·학습 과정안');
            await parsed.destroy();
            continue;
        }
        const zip = await JSZip.loadAsync(bytes);
        const entry = format === 'hwpx' ? 'Contents/section0.xml' : 'word/document.xml';
        const xml = await zip.file(entry).async('string');
        expect(xml).toContain(format === 'hwpx' ? '<hs:sec' : '<w:document');
        expect(xml).toContain(format === 'hwpx' ? '<hp:tbl' : '<w:tbl');
        expect(xml.replace(/<[^>]*>/g, '')).toContain('식물');
    }
}

function uploadedPdf(request) {
    const body = request.postDataBuffer();
    const start = body.indexOf(Buffer.from('%PDF-'));
    const eof = body.indexOf(Buffer.from('%%EOF'), start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(eof).toBeGreaterThan(start);
    return body.subarray(start, eof + 5);
}

function uploadedFormValue(request, name) {
    const body = request.postDataBuffer().toString('latin1');
    const marker = `name="${name}"\r\n\r\n`;
    const start = body.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);
    const valueStart = start + marker.length;
    const end = body.indexOf('\r\n', valueStart);
    expect(end).toBeGreaterThan(valueStart);
    return body.slice(valueStart, end);
}

test.beforeEach(async ({ page }) => {
    const plan = makeGeneratedPlan();
    const assessment = makeVisualAssessment();
    const assessmentRequest = {
        assessmentName: assessment.assessmentName, teacherIntent: assessment.backwardDesign.teacherIntent,
        totalPoints: assessment.totalPoints, levelCount: assessment.rubric.levels.length,
        includeProcessInScore: assessment.scoring.includeProcessInScore, processWeightPercent: assessment.scoring.processWeightPercent,
        outputTypes: assessment.generationSettings.outputTypes, answerTypes: assessment.generationSettings.answerTypes,
        stages: assessment.generationSettings.stages, visualAnalysisRequired: assessment.visualAnalysisRequired,
        includeStudentCover: assessment.includeStudentCover, additionalRequirements: assessment.generationSettings.additionalRequirements,
    };
    await page.addInitScript(({ lessonPlan, storedAssessmentRequest, storedStudents }) => {
        sessionStorage.clear();
        sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 2, data: { step: 4, maxReached: 4, basics: { schoolLevel: lessonPlan.schoolLevel, grade: lessonPlan.grade, subject: lessonPlan.subject, subjectMode: 'official', displaySubject: lessonPlan.subject, mappedSubjects: [lessonPlan.subject], mode: 'single', sessions: 1, intent: lessonPlan.title, studentNeeds: '', metadata: lessonPlan.metadata }, standards: lessonPlan.standards, instructionModel: { ...lessonPlan.instructionModel, stages: [] }, plan: lessonPlan, originalPlan: lessonPlan } }));
        sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({ version: 2, data: { activeProcess: 'lesson', lessonSnapshot: { plan: lessonPlan }, worksheet: null, assessmentRequest: storedAssessmentRequest, assessment: null, students: storedStudents, submissions: [], records: [] } }));
    }, { lessonPlan: plan, storedAssessmentRequest: assessmentRequest, storedStudents: studentRoster });
});

test('지도안에서 세특까지 두 학생의 5단계 흐름을 완주한다', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    let ocrCalls = 0;
    const recordCalls = new Map();
    const recordTargetBytes = [];
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const uploadedPageCounts = [];
    const uploadedVisualModes = [];
    await page.route('**/api/generate-worksheet', route => route.fulfill({ json: { worksheet: makeWorksheet() } }));
    await page.route('**/api/generate-assessment', route => {
        const assessment = makeVisualAssessment();
        const { studentSheet, cover, ...assessmentDesign } = assessment;
        return route.request().postDataJSON().phase === 'design'
            ? route.fulfill({ json: { assessmentDesign } })
            : route.fulfill({ json: { assessment } });
    });
    await page.route('**/api/ocr', async route => {
        uploadedPageCounts.push((await PDFDocument.load(uploadedPdf(route.request()))).getPageCount());
        uploadedVisualModes.push(uploadedFormValue(route.request(), 'visualAnalysis'));
        ocrCalls += 1;
        if (ocrCalls === 2) return route.fulfill({ status: 422, json: { message: '첫 시도에서 문서를 읽지 못했습니다.' } });
        return route.fulfill({ json: { extractedText: '관찰 결과 뿌리에 가는 털이 있다. 식을 계산하면 x² = 4이다. 피드백을 반영해 설명을 고쳤다.', elements: [
            { id: 'root-evidence', category: 'text', page: 1, text: '뿌리에 가는 털이 있다', confidence: .98, coordinates: [{ x: .12, y: .2 }, { x: .72, y: .35 }] },
            { id: 'equation-evidence', category: 'equation', page: 1, text: 'x² = 4', confidence: .66, coordinates: [{ x: .12, y: .42 }, { x: .72, y: .52 }] },
            { id: 'revision-evidence', category: 'text', page: 1, text: '피드백을 반영해 설명을 고쳤다', confidence: .95, coordinates: [{ x: .12, y: .58 }, { x: .72, y: .68 }] },
        ], elementsTruncated: false, visualAnalysisStatus: 'enhanced_used', autoScoreAllowed: true, ocrModel: 'document-parse', pageCount: 1 } });
    });
    await page.route('**/api/grade-submission', route => {
        const body = route.request().postDataJSON();
        if (body.mode === 'finalize') return route.fulfill({ json: { grading: { ...body.grading, provisionalTotal: 85, totalScore: 85, approvalToken: 'b'.repeat(64) }, gradingRevision: body.gradingRevision } });
        return route.fulfill({ json: { grading: grading(body), gradingRevision: body.gradingRevision + 1 } });
    });
    await page.route('**/api/authorize-record-generation', route => route.fulfill({ json: { context: { payload: { version: 1 }, token: 'a'.repeat(64) } } }));
    await page.route('**/api/generate-record', route => {
        const body = route.request().postDataJSON();
        recordTargetBytes.push(body.targetBytes);
        const studentName = body.student.name;
        const call = (recordCalls.get(studentName) ?? 0) + 1;
        recordCalls.set(studentName, call);
        if (studentName === '이학생' && call === 2) return route.fulfill({ status: 503, json: { message: '이학생 새 초안 생성 실패' } });
        const suffix = call === 1 ? '' : candidateSuffix[studentName];
        return route.fulfill({ json: { record: { text: `${recordText}${suffix}`, evidenceCriterionIds: ['criterion-1'], claims: [{ text: `${recordText}${suffix}`, kind: 'performance', criterionIds: ['criterion-1'], evidenceQuotes: [{ criterionId: 'criterion-1', stage: 'performance', quote: '뿌리에 가는 털이 있다' }], sourceRefs: [{ criterionId: 'criterion-1', elementId: 'root-evidence', page: 1 }] }] } } });
    });

    await page.goto('/');
    await expectLessonExports(page);
    await page.getByRole('tab', { name: /학습지/ }).click();
    await page.getByRole('button', { name: '학습지 생성하기' }).click();
    await expect(page.getByLabel('학습지 제목')).toHaveValue('식물의 구조와 기능 탐구 학습지');
    await expect(page.getByRole('region', { name: '학생이 작성할 학습지 미리보기' })).toContainText('식물의 각 기관은 어떤 일을 할까요?');
    await expectPdfDownload(page, () => page.getByRole('button', { name: '학생용 PDF' }).click(), '식물의 구조와 기능 탐구 학습지');
    await expectPdfDownload(page, () => page.getByRole('button', { name: '교사용 PDF' }).click(), '교사용 예시 답안');
    await page.getByRole('region', { name: '학생이 작성할 학습지 미리보기' }).screenshot({ path: '.omo/evidence/task-12-worksheet-student-activity.png' });
    await page.screenshot({ path: '.omo/evidence/task-11-worksheet.png', fullPage: true });

    await page.getByRole('tab', { name: /수행평가/ }).click();
    await page.getByRole('button', { name: 'AI로 수행평가 초안 만들기' }).click();
    await expect(page.getByLabel('과제명')).toHaveValue('식물 기관 탐구 보고서 만들기');
    await page.getByRole('button', { name: '이 설계로 수행평가지 만들기' }).click();
    await expect(page.getByRole('region', { name: '학생이 작성할 수행평가지 미리보기' })).toContainText('뿌리, 줄기, 잎에서 관찰한 특징을 표에 기록하세요.');
    await page.getByRole('button', { name: '수행평가·루브릭 확인 완료' }).click();
    expect(await expectPdfDownload(page, () => page.getByRole('button', { name: '학생 안내문 PDF 저장' }).click(), makeVisualAssessment().cover.title)).toBe(1);
    expect(await expectPdfDownload(page, () => page.getByRole('button', { name: '제출용 수행평가지 PDF 저장' }).click(), '뿌리, 줄기, 잎에서 관찰한 특징을 표에 기록하세요.')).toBeGreaterThan(0);
    expect(await expectPdfDownload(page, () => page.getByRole('button', { name: '안내문과 수행평가지 전체 PDF 저장' }).click(), makeVisualAssessment().task.title)).toBeGreaterThan(1);
    await page.getByRole('region', { name: '학생이 작성할 수행평가지 미리보기' }).screenshot({ path: '.omo/evidence/task-12-assessment-student-activity.png' });
    await page.screenshot({ path: '.omo/evidence/task-11-assessment.png', fullPage: true });

    await page.getByRole('tab', { name: /OCR·채점/ }).click();
    const template = await downloadBytes(page, () => page.getByRole('button', { name: 'Excel 입력 양식 받기' }).click());
    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.load(template.bytes);
    expect(templateWorkbook.worksheets[0].getRow(1).values.slice(1)).toEqual(['학년', '반', '번호', '이름']);
    const rosterBytes = await rosterWorkbook();
    const rosterCheck = new ExcelJS.Workbook();
    await rosterCheck.xlsx.load(rosterBytes);
    expect(rosterCheck.worksheets[0].getSheetValues().slice(1)).toEqual([
        [undefined, '학년', '반', '번호', '이름'],
        [undefined, '2', '3', 1, '김학생'],
        [undefined, '2', '3', 2, '이학생'],
    ]);
    await page.getByLabel('학생 명단 Excel 업로드').setInputFiles({ name: '학생명단.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: rosterBytes });
    await expect(page.getByText('2명을 불러왔습니다. Excel 행 순서를 그대로 사용합니다.')).toBeVisible();
    await page.getByRole('radio', { name: '명단 순서 합본 PDF' }).click();
    await page.getByRole('checkbox', { name: '각 학생 묶음 첫 페이지가 수행평가 안내 표지' }).click();
    await page.getByLabel('명단 순서 합본 PDF 파일').setInputFiles({ name: '2반-수행평가.pdf', mimeType: 'application/pdf', buffer: await combinedSubmissionPdf() });
    await expect(page.getByText('예상 4쪽 · 실제 4쪽')).toBeVisible();
    await page.getByRole('button', { name: '학생별 PDF 묶음 만들기' }).click();
    await page.getByRole('button', { name: '연결한 답안 PDF OCR 시작' }).click();
    await expect(page.getByText('첫 시도에서 문서를 읽지 못했습니다.')).toBeVisible();
    await page.getByRole('button', { name: /OCR 다시 시도/ }).click();
    await expect(page.getByLabel('OCR 추출 원문')).toHaveCount(2);
    expect(uploadedPageCounts).toEqual([1, 1, 1]);
    expect(uploadedVisualModes).toEqual(['true', 'true', 'true']);

    for (const studentName of ['김학생', '이학생']) {
        await page.getByRole('button', { name: `${studentName} 채점하기` }).click();
        const submission = page.locator('.submission-item').filter({ has: page.getByRole('button', { name: `${studentName} 삭제` }) });
        await expect(submission.getByRole('spinbutton', { name: 'PDF 페이지' })).toHaveValue('2');
        if (testInfo.project.name === 'mobile') await submission.getByRole('tab', { name: '채점 결과' }).click();
        await submission.getByRole('button', { name: '뿌리에 가는 털이 있다 원본에서 보기' }).click();
        await expect(submission.getByTestId('evidence-highlight')).toBeVisible();
        await submission.getByRole('button', { name: '이전 페이지' }).click();
        await expect(submission.getByTestId('evidence-highlight')).toHaveCount(0);
        await submission.getByRole('spinbutton', { name: 'PDF 페이지' }).fill('2');
        await expect(submission.getByTestId('evidence-highlight')).toHaveCount(0);
        if (testInfo.project.name === 'mobile') await submission.getByRole('tab', { name: '채점 결과' }).click();
        await expect(submission.getByRole('button', { name: `${studentName} 채점 승인` })).toBeDisabled();
        await submission.getByRole('combobox', { name: '구조와 기능 설명 성취 수준' }).selectOption('proficient');
        await submission.getByLabel('구조와 기능 설명 평가 이유').fill('원본 수식과 풀이를 확인해 수준에 부합합니다.');
        await submission.getByLabel('구조와 기능 설명 다음 성장 피드백').fill('계산 과정을 문장으로도 설명해보세요.');
        if (testInfo.project.name === 'mobile') await submission.getByRole('tab', { name: 'OCR 결과' }).click();
        await submission.getByLabel(`${studentName} equation-evidence 근거 확인 완료`).check();
        if (testInfo.project.name === 'mobile') await submission.getByRole('tab', { name: '채점 결과' }).click();
        for (const criterionName of ['관찰 근거', '구조와 기능 설명', '피드백 반영과 수정']) await submission.getByLabel(`${criterionName} 근거와 수준 확인 완료`).check();
        await submission.getByLabel(`${studentName} 원본 답안 확인 완료`).check();
        await expect(submission.getByRole('button', { name: `${studentName} 채점 승인` })).toBeEnabled();
        await submission.getByRole('button', { name: `${studentName} 채점 승인` }).click();
        await expect(submission.getByText('교사 승인 완료')).toBeVisible();
    }

    await page.getByRole('tab', { name: /세특/ }).click();
    await expect(page.getByLabel('세특 분량 선택')).toHaveValue('700');
    await page.getByLabel('세특 분량 선택').selectOption('custom');
    await page.getByLabel('직접 입력 분량(byte)').fill('850');
    await page.getByLabel('직접 입력 분량(byte)').press('Tab');
    await page.getByRole('button', { name: '미생성 학생 전체 생성' }).click();
    await expect(page.getByRole('textbox', { name: /세특 초안/ })).toHaveCount(2);
    await expect(page.getByText(`${recordText.length}자 · ${new TextEncoder().encode(recordText).byteLength}byte / 850byte`)).toHaveCount(2);
    expect(recordTargetBytes).toEqual([850, 850]);
    await expect(page.getByRole('region', { name: '김학생 기록 근거' })).toContainText('6과11-02');
    await expect(page.getByRole('region', { name: '김학생 기록 근거' })).toContainText('피드백 반영 과정의 근거가 드러납니다.');

    await page.getByRole('button', { name: '전체 다시 생성' }).click();
    await expect(page.getByText('이학생 새 초안 생성 실패')).toBeVisible();
    await expect(page.getByRole('textbox', { name: '김학생 세특 초안' })).toHaveValue(recordText);
    await expect(page.getByRole('textbox', { name: '이학생 세특 초안' })).toHaveValue(recordText);
    await expect(page.getByText(`${recordText}${candidateSuffix['김학생']}`)).toBeVisible();
    await page.getByRole('button', { name: '실패 학생만 다시 시도' }).click();
    await expect(page.getByText(`${recordText}${candidateSuffix['이학생']}`)).toBeVisible();
    for (const width of [375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await page.evaluate(() => document.querySelectorAll('nextjs-portal, #react-scan-root, .ph-no-capture').forEach(element => element.remove()));
        const responsiveAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(responsiveAxe.violations.map(item => item.id)).toEqual([]);
        await page.screenshot({ path: width === 375 ? '.omo/evidence/task-11-records.png' : `.omo/evidence/task-11-records-${width}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: '김학생 새 초안 적용' }).click();
    await page.getByRole('button', { name: '이학생 기존 문장 유지' }).click();
    await expect(page.getByRole('textbox', { name: '김학생 세특 초안' })).toHaveValue(`${recordText}${candidateSuffix['김학생']}`);
    await expect(page.getByRole('textbox', { name: '이학생 세특 초안' })).toHaveValue(recordText);
    await page.getByRole('textbox', { name: '김학생 세특 초안' }).fill(`${recordText} 교사 보완`);
    await expect(page.getByRole('textbox', { name: '김학생 세특 초안' })).toHaveValue(`${recordText} 교사 보완`);

    await page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach(element => element.remove()));
    await page.screenshot({ path: '.omo/evidence/task-11-records-final.png', fullPage: true });

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.map(item => item.id)).toEqual([]);
    expect(consoleErrors.filter(message => !/status of (422|503)/.test(message))).toEqual([]);
});
