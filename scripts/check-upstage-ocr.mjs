import { buildWorkflowPdf } from '../lib/export/workflow-pdf.js';
import { parseDocument } from '../lib/upstage/document-parse.js';

if (!process.env.UPSTAGE_API_KEY?.trim()) {
    console.error('UPSTAGE API 키가 없어 OCR 스모크 테스트를 실행할 수 없습니다.');
    process.exit(1);
}

const sentinel = '식물 기관 관찰';
const worksheet = {
    formatId: 'inquiry-experiment',
    formatName: '탐구·실험 기록지',
    selectionReason: 'OCR 연결 점검용 fixture',
    document: {
        title: `${sentinel} 학습지`,
        instructions: '관찰한 사실을 기록하세요.',
        studentFields: ['이름', '학년·반'],
        sections: [{ id: 'section-1', title: '관찰 결과', purpose: '한국어 문서 인식 확인', questions: [{ id: 'q-1', prompt: '뿌리에서 관찰한 특징은 무엇인가요?', responseLines: 3 }] }],
    },
    teacherKey: { answers: [{ questionId: 'q-1', answer: '뿌리에 가는 털이 있음을 관찰할 수 있다.' }] },
};

const pdfBytes = await buildWorkflowPdf('worksheet', worksheet);
const file = new File([pdfBytes], 'allpass-ocr-smoke.pdf', { type: 'application/pdf' });
const startedAt = performance.now();
const result = await parseDocument(file);
const summary = {
    status: result.extractedText.includes(sentinel) ? 'passed' : 'sentinel_missing',
    ocrModel: 'document-parse',
    elapsedMs: Math.round(performance.now() - startedAt),
    pageCount: result.pageCount,
    textLength: result.extractedText.length,
    sentinelMatched: result.extractedText.includes(sentinel),
};

console.log(JSON.stringify(summary));
if (!summary.sentinelMatched) process.exitCode = 2;
