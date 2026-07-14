import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import JSZip from 'jszip';

export async function exportAllFormats(page, metadata, editedValues) {
    const expected = { hwpx: ['application/hwp+zip', '504b0304'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '504b0304'], pdf: ['application/pdf', '25504446'] };
    for (const [format, [contentType, signature]] of Object.entries(expected)) {
        await page.getByLabel('내보내기 형식').selectOption(format);
        const responsePromise = page.waitForResponse(response => {
            const url = new URL(response.url());
            return url.pathname === `/api/export/${format}` && url.searchParams.get('plan') === 'detailed' && response.request().method() === 'POST';
        });
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: '파일로 저장' }).click();
        const [response, download] = await Promise.all([responsePromise, downloadPromise]);
        const requestBody = response.request().postDataJSON();
        const firstStage = requestBody.sessions[0].stages[0];
        const firstAssessment = requestBody.assessment[0];
        expect(requestBody.metadata).toEqual(metadata);
        expect(requestBody.title).toBe(editedValues.lessonTitle);
        expect(firstStage.teacherQuestions).toEqual(editedValues.teacherQuestion.split('\n'));
        expect(firstStage.expectedStudentResponses).toEqual([editedValues.expectedStudentResponse]);
        expect(firstAssessment.method).toBe(editedValues.assessmentMethod);
        expect(firstAssessment.levelFeedback).toEqual({
            needsSupport: editedValues.needsSupportFeedback,
            meets: editedValues.meetsFeedback,
            exceeds: editedValues.exceedsFeedback,
        });
        expect(requestBody.sessions[0].nextSessionConnection).toBe(editedValues.nextSessionConnection);
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain(contentType);
        expect(response.headers()['content-disposition']).toContain(`.${format}`);
        expect(download.suggestedFilename()).toBe(`${editedValues.lessonTitle}-세안.${format}`);
        const bytes = await readFile(await download.path());
        expect(bytes.subarray(0, 4).toString('hex')).toBe(signature);
        if (format !== 'pdf') {
            const zip = await JSZip.loadAsync(bytes);
            const entry = format === 'hwpx' ? 'Contents/section0.xml' : 'word/document.xml';
            const xml = await zip.file(entry).async('string');
            const documentText = xml.replace(/<[^>]*>/g, '');
            for (const questionLine of editedValues.teacherQuestion.split('\n')) expect(documentText).toContain(questionLine);
            expect(documentText).toContain(editedValues.assessmentMethod);
            expect(documentText).toContain('수업 제목');
            expect(documentText).toContain(editedValues.lessonTitle);
            expect(documentText).toContain('후속 학습 및 정리');
            expect(documentText).toContain(editedValues.nextSessionConnection);
            if (format === 'hwpx') {
                const rowHeights = [...xml.matchAll(/<hp:tr>([\s\S]*?)<\/hp:tr>/g)].map(([, row]) => Number(row.match(/<hp:cellSz\b[^>]*\bheight="(\d+)"/)?.[1] ?? 0));
                expect(new Set(rowHeights).size).toBeGreaterThan(1);
                expect(xml).not.toContain('2026-07-11T');
                expect(documentText).toContain('3교시');
            }
            expect(documentText).not.toContain('수업 후 연계');
            expect(documentText).not.toContain('다음 학습 연결');
        }
    }

    await page.getByLabel('내보내기 형식').selectOption('hwpx-simple');
    const simpleResponsePromise = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/export/hwpx' && url.searchParams.get('variant') === 'simple' && response.request().method() === 'POST';
    });
    const simpleDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '파일로 저장' }).click();
    const [simpleResponse, simpleDownload] = await Promise.all([simpleResponsePromise, simpleDownloadPromise]);
    expect(simpleResponse.status()).toBe(200);
    expect(simpleResponse.headers()['content-type']).toContain('application/hwp+zip');
    expect(simpleResponse.headers()['content-disposition']).toContain('.hwpx');
    expect(simpleDownload.suggestedFilename()).toBe(`${editedValues.lessonTitle}-세안.hwpx`);
    const simpleBytes = await readFile(await simpleDownload.path());
    const simpleZip = await JSZip.loadAsync(simpleBytes);
    const simpleSection = await simpleZip.file('Contents/section0.xml').async('string');
    expect(simpleSection.match(/<hp:tbl\b/g)).toHaveLength(5);
    expect(simpleSection).not.toContain('colSpan="2"');
    for (const questionLine of editedValues.teacherQuestion.split('\n')) expect(simpleSection).toContain(questionLine);
    expect(simpleSection).toContain(editedValues.assessmentMethod);
    expect(simpleSection).toContain('수업 후 성찰');
}
