export function standardsRecommendationMessages({ query, candidates }) {
    return [
        { role: 'system', content: '당신은 2022 개정 교육과정 분석가입니다. 제공된 후보 코드만 사용하고, 적합한 3~5개를 JSON으로 반환하세요. recommendations 배열의 각 항목은 code, score(0~100), reason, keyPhrase를 포함합니다.' },
        { role: 'user', content: JSON.stringify({ lessonIntent: query, candidates: candidates.map(({ code, text }) => ({ code, text })) }) },
    ];
}
