import { z } from 'zod';

export const recordOutputSchema = z.object({
    text: z.string().trim().min(80).max(1000),
}).superRefine((record, context) => {
    if (/\d+\s*(?:점|\/\s*\d+|%)/.test(record.text)) context.addIssue({ code: 'custom', path: ['text'], message: '점수나 총점을 나열하지 마세요.' });
    if (/(?:[A-F][+-]?|\d+)\s*등급/i.test(record.text)) context.addIssue({ code: 'custom', path: ['text'], message: '등급을 나열하지 마세요.' });
    if (/(또래보다|다른\s*학생보다|상위권|하위권|평균보다|학급\s*(?:상위|하위|평균))/.test(record.text)) context.addIssue({ code: 'custom', path: ['text'], message: '다른 학생이나 학급과 비교하지 마세요.' });
    if (/(성실|근면|책임감|적극적|인성|품성|바른\s*태도|친절|배려|리더십|주도성|끈기|협동심|협력적\s*태도|자발적|소극적|차분한\s*태도|성격)/.test(record.text)) context.addIssue({ code: 'custom', path: ['text'], message: '승인된 수행 증거로 확인할 수 없는 인성이나 태도를 추정하지 마세요.' });
});

const unsupportedGrowthPattern = /(?:이전(?:보다|에 비해)|전보다|처음보다|초기보다|점차|갈수록|능력(?:이|을)?\s*(?:높아|향상|개선)|표현(?:이|을)?\s*(?:향상|개선)|설명(?:이|을)?\s*(?:정교|향상|개선)|근거(?:를|가)?\s*보완(?:하여|함|됨|했)|(?:성장|향상|발전|개선)(?:하였|했|함|됨|되었|되어))/;

export function hasUnsupportedGrowthInference(text, hasGrowthEvidence) {
    return !hasGrowthEvidence && unsupportedGrowthPattern.test(text);
}
