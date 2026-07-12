import { z } from 'zod';

export const recordOutputSchema = z.object({
    text: z.string().trim().min(80).max(1000),
}).superRefine((record, context) => {
    if (/\d+\s*(?:점|\/\s*\d+|%)/.test(record.text)) context.addIssue({ code: 'custom', path: ['text'], message: '점수나 총점을 나열하지 마세요.' });
    if (/(?:[A-F][+-]?|\d+)\s*등급/i.test(record.text)) context.addIssue({ code: 'custom', path: ['text'], message: '등급을 나열하지 마세요.' });
    if (/(또래보다|다른\s*학생보다|상위권|하위권|평균보다|학급\s*(?:상위|하위|평균))/.test(record.text)) context.addIssue({ code: 'custom', path: ['text'], message: '다른 학생이나 학급과 비교하지 마세요.' });
    if (/(성실|근면|책임감|적극적|인성|품성|바른\s*태도|친절|배려|리더십|주도성|끈기|협동심|협력적\s*태도|자발적|소극적|차분한\s*태도|성격)/.test(record.text)) context.addIssue({ code: 'custom', path: ['text'], message: '승인된 수행 증거로 확인할 수 없는 인성이나 태도를 추정하지 마세요.' });
    for (const message of unsupportedRecordClaimMessages(record.text)) context.addIssue({ code: 'custom', path: ['text'], message });
});

function compactKorean(value) {
    return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, '');
}

export function unsupportedRecordClaimMessages(value) {
    const compact = compactKorean(value);
    const messages = [];
    const koreanNumber = '[영공일이삼사오육칠팔구십백천]+';
    if (new RegExp(`(?:반|학급)에서(?:\\d+|${koreanNumber})등|(?:반|학급)에서가장높은점수|(?:전체)?학생(?:들)?(?:가운데|중)(?:가장)?(?:최고|최상|우수)|친구들중가장우수|다른친구들에비해|다른학생들에비해|(?:교우|친구|또래)(?:보다|에비해)(?:우월|뛰어|우수)|(?:학급|반)(?:상위|하위)|상위권|하위권`).test(compact)) messages.push('학급 내 순위·최상급 또는 다른 학생과의 비교를 기록하지 마세요.');
    if (new RegExp(`\\d+(?:퍼센트|프로|%|점)|(?:백|일백)점만점에${koreanNumber}점|(?:평가|수행결과|평가결과|점수)(?:에서|는|가)?${koreanNumber}(?:퍼센트|프로|점)`).test(compact)) messages.push('점수·백분율·만점 환산 결과를 기록하지 마세요.');
    if (/(?:매우)?부지런|모범적(?:인)?태도|(?:관찰)?태도(?:가|는|도)?모범적|품행(?:이|은|도)?단정|성실(?:한|함|하게)?|근면(?:한|함)?|책임감|친절(?:한|함)?|배려심?|리더십|주도성|끈기|협동심|협력적태도|자발적|소극적|차분한태도|바른태도|성격/.test(compact)) messages.push('승인된 수행 증거로 확인할 수 없는 성격·인성·태도를 추정하지 마세요.');
    return [...new Set(messages)];
}

const unsupportedGrowthPattern = /(?:이전(?:보다|에 비해)|전보다|처음보다|초기보다|점차|갈수록|능력(?:이|을)?\s*(?:높아|향상|개선)|표현(?:이|을)?\s*(?:향상|개선)|설명(?:이|을)?\s*(?:정교|향상|개선)|근거(?:를|가)?\s*보완(?:하여|함|됨|했)|(?:성장|향상|발전|개선)(?:하였|했|함|됨|되었|되어))/;

export function hasUnsupportedGrowthInference(text, hasGrowthEvidence) {
    return !hasGrowthEvidence && unsupportedGrowthPattern.test(text);
}
