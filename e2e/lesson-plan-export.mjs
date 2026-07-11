import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import JSZip from 'jszip';

export async function exportAllFormats(page, metadata, editedValues) {
    const expected = { hwpx: ['application/hwp+zip', '504b0304'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '504b0304'], pdf: ['application/pdf', '25504446'] };
    for (const [format, [contentType, signature]] of Object.entries(expected)) {
        await page.getByLabel('내보내기 형식').selectOption(format);
        const responsePromise = page.waitForResponse(response => response.url().endsWith(`/api/export/${format}`) && response.request().method() === 'POST');
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: '파일로 저장' }).click();
        const [response, download] = await Promise.all([responsePromise, downloadPromise]);
        const requestBody = response.request().postDataJSON();
        const firstStage = requestBody.sessions[0].stages[0];
        const firstAssessment = requestBody.assessment[0];
        expect(requestBody.metadata).toEqual(metadata);
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
        expect(download.suggestedFilename()).toBe(`식물의 구조와 기능.${format}`);
        const bytes = await readFile(await download.path());
        expect(bytes.subarray(0, 4).toString('hex')).toBe(signature);
        if (format !== 'pdf') {
            const zip = await JSZip.loadAsync(bytes);
            const entry = format === 'hwpx' ? 'Contents/section0.xml' : 'word/document.xml';
            const xml = await zip.file(entry).async('string');
            const documentText = xml.replace(/<[^>]*>/g, '');
            for (const questionLine of editedValues.teacherQuestion.split('\n')) expect(documentText).toContain(questionLine);
            expect(documentText).toContain(editedValues.assessmentMethod);
        }
    }
}
