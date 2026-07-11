import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { lessonPlanLines } from './render-model.js';

export async function buildDocx(plan) {
    const children = lessonPlanLines(plan).map((line, index) => new Paragraph({
        heading: index === 0 ? HeadingLevel.TITLE : undefined,
        spacing: { after: line === '' ? 80 : 120 },
        children: [new TextRun({ text: line || ' ', bold: index === 0 || ['성취기준', '학습 목표', '과정중심평가', '개별화·지원 전략', '수업 후 성찰'].includes(line), font: 'Paperlogy', size: index === 0 ? 34 : 20 })],
    }));
    return Packer.toBuffer(new Document({ sections: [{ properties: {}, children }] }));
}
