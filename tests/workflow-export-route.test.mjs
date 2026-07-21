import { expect, test } from 'vitest';
import { POST } from '@/app/api/export-workflow/[kind]/route';
import { makeAssessment, makeWorksheet } from './fixtures/workflow.mjs';

const MAX_WORKFLOW_EXPORT_REQUEST_BYTES = 500_000;
const request = body => new Request('http://localhost/api/export-workflow/worksheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('exports a validated workflow document as PDF', async () => {
    const response = await POST(request(makeWorksheet()), { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('exports a validated student worksheet as HWPX when the format is requested', async () => {
    // Given a teacher-ready worksheet and an HWPX export request
    const worksheet = makeWorksheet();
    const hwpxRequest = new Request('http://localhost/api/export-workflow/worksheet-student?format=hwpx', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(worksheet),
    });

    // When the route exports the document
    const response = await POST(hwpxRequest, { params: Promise.resolve({ kind: 'worksheet-student' }) });

    // Then it returns a real HWPX package instead of falling back to PDF
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/hwp+zip');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe('PK\x03\x04');
});

test('exports a student assessment cover as HWPX when the format is requested', async () => {
    // Given an assessment with a student cover enabled
    const assessment = makeAssessment();
    const hwpxRequest = new Request('http://localhost/api/export-workflow/assessment-cover?format=hwpx', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assessment),
    });

    // When the student cover is exported
    const response = await POST(hwpxRequest, { params: Promise.resolve({ kind: 'assessment-cover' }) });

    // Then the editable HWPX document is returned
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/hwp+zip');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe('PK\x03\x04');
});

test('exports separate student and teacher worksheet documents', async () => {
    const worksheet = makeWorksheet();
    const student = await POST(request(worksheet), { params: Promise.resolve({ kind: 'worksheet-student' }) });
    const teacher = await POST(request(worksheet), { params: Promise.resolve({ kind: 'worksheet-teacher' }) });

    expect(student.status).toBe(200);
    expect(teacher.status).toBe(200);
    expect(Buffer.from(await student.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect(Buffer.from(await teacher.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('exports separate guidance, submission sheet, and full assessment documents', async () => {
    const assessment = makeAssessment();
    const coverRequest = new Request('http://localhost/api/export-workflow/assessment-cover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assessment) });
    const sheetRequest = new Request('http://localhost/api/export-workflow/assessment-sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assessment) });
    const fullRequest = new Request('http://localhost/api/export-workflow/assessment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assessment) });

    const cover = await POST(coverRequest, { params: Promise.resolve({ kind: 'assessment-cover' }) });
    const sheet = await POST(sheetRequest, { params: Promise.resolve({ kind: 'assessment-sheet' }) });
    const full = await POST(fullRequest, { params: Promise.resolve({ kind: 'assessment' }) });

    expect(cover.status).toBe(200);
    expect(sheet.status).toBe(200);
    expect(full.status).toBe(200);
    expect(Buffer.from(await cover.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect(Buffer.from(await sheet.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect(Buffer.from(await full.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('rejects invalid workflow documents and unsupported kinds', async () => {
    expect((await POST(request({}), { params: Promise.resolve({ kind: 'worksheet' }) })).status).toBe(400);
    expect((await POST(request(makeWorksheet()), { params: Promise.resolve({ kind: 'unknown' }) })).status).toBe(404);
});

test('rejects inherited document kinds and formats before reading the request body', async () => {
    for (const kind of ['constructor', 'toString', '__proto__']) {
        const response = await POST(request(makeWorksheet()), { params: Promise.resolve({ kind }) });
        expect(response.status, kind).toBe(404);
    }
    for (const format of ['constructor', 'toString', '__proto__']) {
        const response = await POST(new Request(`http://localhost/api/export-workflow/worksheet?format=${format}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(makeWorksheet()),
        }), { params: Promise.resolve({ kind: 'worksheet' }) });
        expect(response.status, format).toBe(404);
    }
});

test('rejects malformed UTF-8 without replacing its bytes in an export document', async () => {
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(Uint8Array.from([0x7B, 0x22, 0x74, 0x69, 0x74, 0x6C, 0x65, 0x22, 0x3A, 0x22, 0xC3, 0x28, 0x22, 0x7D]));
            controller.close();
        },
    });
    const response = await POST(new Request('http://localhost/api/export-workflow/worksheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, duplex: 'half',
    }), { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' });
});

test('학생 표지를 끈 평가의 표지 전용 내보내기를 거부한다', async () => {
    const assessment = makeAssessment(); assessment.includeStudentCover = false;
    const coverRequest = new Request('http://localhost/api/export-workflow/assessment-cover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assessment) });

    const response = await POST(coverRequest, { params: Promise.resolve({ kind: 'assessment-cover' }) });

    expect(response.status).toBe(409);
});

test('rejects a declared workflow export body above 500 KB with a safe 413 response', async () => {
    const declared = new Request('http://localhost/api/export-workflow/worksheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(MAX_WORKFLOW_EXPORT_REQUEST_BYTES + 1) },
        body: JSON.stringify(makeWorksheet()),
    });

    const response = await POST(declared, { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
        code: 'request_too_large',
        message: '저장할 문서 내용이 너무 깁니다. 내용을 줄인 뒤 다시 시도해주세요.',
    });
});

test('rejects an actual UTF-8 workflow export body above 500 KB without echoing input', async () => {
    const oversizedBody = JSON.stringify({ padding: '가'.repeat(Math.ceil(MAX_WORKFLOW_EXPORT_REQUEST_BYTES / 3)) });
    expect(oversizedBody.length).toBeLessThan(MAX_WORKFLOW_EXPORT_REQUEST_BYTES);
    expect(new TextEncoder().encode(oversizedBody).byteLength).toBeGreaterThan(MAX_WORKFLOW_EXPORT_REQUEST_BYTES);
    const actual = new Request('http://localhost/api/export-workflow/worksheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: oversizedBody,
    });

    const response = await POST(actual, { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
        code: 'request_too_large',
        message: '저장할 문서 내용이 너무 깁니다. 내용을 줄인 뒤 다시 시도해주세요.',
    });
});

test('counts a stripped UTF-8 BOM toward the actual 500 KB request limit', async () => {
    const emptyEnvelope = JSON.stringify({ padding: '' });
    const decodedBody = JSON.stringify({ padding: 'A'.repeat(MAX_WORKFLOW_EXPORT_REQUEST_BYTES - 2 - emptyEnvelope.length) });
    const encodedBody = new TextEncoder().encode(decodedBody);
    expect(encodedBody.byteLength).toBe(MAX_WORKFLOW_EXPORT_REQUEST_BYTES - 2);
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(Uint8Array.of(0xef, 0xbb, 0xbf));
            controller.enqueue(encodedBody);
            controller.close();
        },
    });
    const actual = new Request('http://localhost/api/export-workflow/worksheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, duplex: 'half',
    });

    const response = await POST(actual, { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe('request_too_large');
});

test('allows exactly 500 KB through the byte gate and returns a safe validation error', async () => {
    const emptyEnvelope = JSON.stringify({ padding: '' });
    const exactBody = JSON.stringify({ padding: 'A'.repeat(MAX_WORKFLOW_EXPORT_REQUEST_BYTES - emptyEnvelope.length) });
    expect(new TextEncoder().encode(exactBody).byteLength).toBe(MAX_WORKFLOW_EXPORT_REQUEST_BYTES);
    const exact = new Request('http://localhost/api/export-workflow/worksheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: exactBody,
    });

    const response = await POST(exact, { params: Promise.resolve({ kind: 'worksheet' }) });

    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.code).toBe('invalid_document');
    expect(JSON.stringify(payload)).not.toContain('AAAAAA');
});

test('rejects a schema-valid assessment whose aggregate render content exceeds the safe PDF budget', async () => {
    const assessment = makeAssessment();
    assessment.includeStudentCover = false;
    assessment.rubric.criteria = Array.from({ length: 15 }, (_, criterionIndex) => ({
        ...assessment.rubric.criteria[criterionIndex % assessment.rubric.criteria.length],
        id: `criterion-${criterionIndex + 1}`,
        name: `평가영역 ${criterionIndex + 1}`,
        maxPoints: criterionIndex < 10 ? 7 : 6,
        kind: 'outcome',
        description: '장시간 렌더링을 유발하는 반복 설명입니다. '.repeat(65),
        evidence: '관찰 가능한 근거',
        levels: assessment.rubric.criteria[0].levels.map((level, levelIndex) => ({
            ...level,
            score: (criterionIndex < 10 ? 7 : 6) - levelIndex,
            description: `${'수준별 관찰 설명입니다. '.repeat(65)}${levelIndex + 1}수준`,
        })),
    }));
    assessment.backwardDesign.evidenceMap[0].criterionIds = assessment.rubric.criteria.map(criterion => criterion.id);
    assessment.backwardDesign.evidenceMap[0].taskEvidenceTypes = ['관찰 가능한 근거'];
    assessment.backwardDesign.evidenceMap[0].evidenceTypes = ['결과 증거'];
    assessment.backwardDesign.evidenceMap[0].scoreBasis = assessment.rubric.criteria.map(criterion => `${criterion.name} ${criterion.maxPoints}점`).join(', ');
    assessment.scoring = { includeProcessInScore: false, processWeightPercent: 0, processTargetPoints: 0 };
    const body = JSON.stringify(assessment);
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(MAX_WORKFLOW_EXPORT_REQUEST_BYTES);

    const response = await POST(new Request('http://localhost/api/export-workflow/assessment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    }), { params: Promise.resolve({ kind: 'assessment' }) });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
        code: 'document_too_long',
        message: '수행평가 문서 내용이 너무 깁니다. 평가영역 또는 설명을 줄인 뒤 다시 시도해주세요.',
    });
});

test('returns a safe 400 for deeply nested or structurally invalid assessment JSON before render budgeting', async () => {
    const nested = `${'{"x":'.repeat(3_000)}null${'}'.repeat(3_000)}`;
    const nestedResponse = await POST(new Request('http://localhost/api/export-workflow/assessment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: nested,
    }), { params: Promise.resolve({ kind: 'assessment' }) });
    const broadArrayResponse = await POST(request({ task: Array.from({ length: 150_000 }, () => 0) }), { params: Promise.resolve({ kind: 'assessment' }) });
    const invalidResponse = await POST(request({ padding: 'A'.repeat(60_001) }), { params: Promise.resolve({ kind: 'assessment' }) });

    expect(nestedResponse.status).toBe(400);
    expect((await nestedResponse.json()).code).toBe('invalid_document');
    expect(broadArrayResponse.status).toBe(400);
    expect((await broadArrayResponse.json()).code).toBe('invalid_document');
    expect(invalidResponse.status).toBe(400);
    expect((await invalidResponse.json()).code).toBe('invalid_document');
});

test('rejects adversarial array cardinality before Zod issue amplification and caps ordinary issue details', async () => {
    const amplified = await POST(request({ rubric: { criteria: Array.from({ length: 100_000 }, () => 0) } }), { params: Promise.resolve({ kind: 'assessment' }) });
    const amplifiedBody = await amplified.json();
    const ordinary = await POST(request({}), { params: Promise.resolve({ kind: 'assessment' }) });
    const ordinaryBody = await ordinary.json();

    expect(amplified.status).toBe(400);
    expect(amplifiedBody).toEqual({ code: 'invalid_document', message: '저장할 문서 구조가 너무 큽니다. 항목 수를 줄여주세요.' });
    expect(JSON.stringify(amplifiedBody).length).toBeLessThan(500);
    expect(ordinary.status).toBe(400);
    expect(ordinaryBody.issues.length).toBeLessThanOrEqual(20);
});

test('exports the maximum supported assessment structure when its content stays within the aggregate budget', async () => {
    const assessment = makeAssessment();
    assessment.includeStudentCover = false;
    assessment.rubric.levels = Array.from({ length: 6 }, (_, index) => ({ id: `level-${index + 1}`, label: `${index + 1}수준` }));
    assessment.rubric.criteria = Array.from({ length: 15 }, (_, index) => ({
        ...assessment.rubric.criteria[0], id: `criterion-${index + 1}`, name: `평가영역 ${index + 1}`,
        kind: 'outcome', maxPoints: index < 10 ? 7 : 6, intervalPoints: 1,
        evidence: '학생 답안에서 확인할 수 있는 구체적 근거',
        levels: assessment.rubric.levels.map((level, levelIndex) => ({ levelId: level.id, score: Math.max(0, (index < 10 ? 7 : 6) - levelIndex), description: `${level.label} 관찰 설명` })),
    }));
    assessment.backwardDesign.evidenceMap[0] = {
        ...assessment.backwardDesign.evidenceMap[0], criterionIds: assessment.rubric.criteria.map(criterion => criterion.id),
        taskEvidenceTypes: ['학생 답안에서 확인할 수 있는 구체적 근거'], evidenceTypes: ['결과 증거'],
        scoreBasis: assessment.rubric.criteria.map(criterion => `${criterion.name} ${criterion.maxPoints}점`).join(', '),
    };
    assessment.scoring = { includeProcessInScore: false, processWeightPercent: 0, processTargetPoints: 0 };

    const response = await POST(new Request('http://localhost/api/export-workflow/assessment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assessment),
    }), { params: Promise.resolve({ kind: 'assessment' }) });

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('does not count non-rendered alignment notes against the assessment PDF budget', async () => {
    const assessment = makeAssessment();
    assessment.includeStudentCover = false;
    assessment.backwardDesign.alignmentIssues = Array.from({ length: 7 }, (_, index) => ({
        id: `alignment-${index + 1}`, severity: 'warning', code: 'lesson-activity-gap',
        message: 'PDF에 렌더하지 않는 내부 정합성 설명입니다. '.repeat(180),
        repairAction: 'PDF에 렌더하지 않는 내부 수정 제안입니다. '.repeat(180),
        resolved: true,
    }));

    const response = await POST(new Request('http://localhost/api/export-workflow/assessment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assessment),
    }), { params: Promise.resolve({ kind: 'assessment' }) });

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
});
