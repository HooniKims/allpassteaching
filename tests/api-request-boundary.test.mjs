import { expect, test } from 'vitest';
import { POST as authorizeRecordGeneration } from '@/app/api/authorize-record-generation/route';
import { POST as generateRecord } from '@/app/api/generate-record/route';
import { POST as gradeSubmission } from '@/app/api/grade-submission/route';
import { POST as parseOcr } from '@/app/api/ocr/route';

const JSON_ROUTES = [
    ['grade submission', '/api/grade-submission', gradeSubmission],
    ['generate record', '/api/generate-record', generateRecord],
    ['authorize record generation', '/api/authorize-record-generation', authorizeRecordGeneration],
];
const JSON_REQUEST_LIMIT = 1_000_000;
const OCR_MULTIPART_LIMIT = 10 * 1024 * 1024 + 64 * 1024;

function chunkedRequest(path, bytes, contentType = 'application/json') {
    const chunkSize = 128 * 1024;
    let offset = 0;
    const body = new ReadableStream({
        pull(controller) {
            if (offset >= bytes.byteLength) {
                controller.close();
                return;
            }
            const end = Math.min(offset + chunkSize, bytes.byteLength);
            controller.enqueue(bytes.slice(offset, end));
            offset = end;
        },
    });
    return new Request(`http://localhost${path}`, {
        method: 'POST', headers: { 'Content-Type': contentType }, body, duplex: 'half',
    });
}

test.each(JSON_ROUTES)('Given a declared 2 MB body When %s receives it Then it rejects before parsing', async (_label, path, post) => {
    const request = new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(2_000_000) },
        body: '{}',
    });

    const response = await post(request);

    expect(response.status).toBe(413);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
        code: 'request_too_large',
        message: '요청 내용이 너무 큽니다. 내용을 줄인 뒤 다시 시도해주세요.',
    });
});

test.each(JSON_ROUTES)('Given a chunked body beyond the byte cap When %s receives it Then it stops with 413', async (_label, path, post) => {
    const bytes = new TextEncoder().encode(JSON.stringify({ padding: 'A'.repeat(JSON_REQUEST_LIMIT + 1) }));

    const response = await post(chunkedRequest(path, bytes));

    expect(response.status).toBe(413);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.stringify(await response.json()).length).toBeLessThan(200);
});

test.each(JSON_ROUTES)('Given malformed JSON When %s receives it Then it returns a safe bounded 400', async (_label, path, post) => {
    const marker = 'PRIVATE_STUDENT_NAME';
    const request = new Request(`http://localhost${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: `{"name":"${marker}"`,
    });

    const response = await post(request);
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(text).not.toContain(marker);
    expect(text.length).toBeLessThan(300);
});

test.each(JSON_ROUTES)('Given adversarial JSON structures When %s receives them Then it rejects before Zod amplification', async (_label, path, post) => {
    const cases = [
        `${'{"x":'.repeat(100)}null${'}'.repeat(100)}`,
        JSON.stringify({ entries: Array.from({ length: 100_000 }, () => 0) }),
        JSON.stringify(Object.fromEntries(Array.from({ length: 1_000 }, (_, index) => [`key-${index}`, 0]))),
    ];

    for (const body of cases) {
        const response = await post(new Request(`http://localhost${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
        }));
        const payload = await response.json();
        expect(response.status).toBe(400);
        expect(payload).toEqual({
            code: 'invalid_request',
            message: '요청 구조가 너무 복잡합니다. 항목 수를 줄여주세요.',
        });
        expect(JSON.stringify(payload).length).toBeLessThan(200);
    }
});

test.each(JSON_ROUTES)('Given many ordinary validation failures When %s validates them Then public issues stay bounded', async (_label, path, post) => {
    const body = { elements: Array.from({ length: 100 }, () => ({})), privateNote: 'PRIVATE_STUDENT_NAME' };

    const response = await post(new Request(`http://localhost${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    const text = await response.text();
    const payload = JSON.parse(text);

    expect(response.status).toBe(400);
    expect(payload.issues?.length ?? 0).toBeLessThanOrEqual(20);
    expect((payload.issues ?? []).every(item => item.message.length <= 300)).toBe(true);
    expect(text).not.toContain('PRIVATE_STUDENT_NAME');
    expect(text.length).toBeLessThan(10_000);
});

test('Given a declared oversized multipart body When OCR receives it Then it rejects before form parsing', async () => {
    const request = new Request('http://localhost/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=test', 'Content-Length': String(OCR_MULTIPART_LIMIT + 1) },
        body: '--test--\r\n',
    });

    const response = await parseOcr(request);

    expect(response.status).toBe(413);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.json()).code).toBe('request_too_large');
});

test('Given a chunked oversized multipart body When OCR receives it Then it stops with 413', async () => {
    const bytes = new Uint8Array(OCR_MULTIPART_LIMIT + 1);
    const request = chunkedRequest('/api/ocr', bytes, 'multipart/form-data; boundary=test');

    const response = await parseOcr(request);

    expect(response.status).toBe(413);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.stringify(await response.json()).length).toBeLessThan(200);
});
