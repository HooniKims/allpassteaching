export function deriveLevelScores(maxPoints, intervalPoints, levelCount) {
    if (![maxPoints, intervalPoints, levelCount].every(Number.isInteger)) throw new Error('배점과 급간은 정수여야 합니다.');
    if (maxPoints < 1 || maxPoints > 1000 || intervalPoints < 1 || intervalPoints > 1000 || levelCount < 2 || levelCount > 6) throw new Error('배점, 급간, 수준 수를 확인해주세요.');
    const scores = Array.from({ length: levelCount }, (_, index) => maxPoints - intervalPoints * index);
    if (scores.some(score => score < 0)) throw new Error('급간 계산 결과는 0점 미만이 될 수 없습니다.');
    return scores;
}

export function scoreLadderIsValid(levels, maxPoints) {
    if (!Array.isArray(levels) || levels.length < 2 || levels.length > 6) return false;
    return levels.every((level, index) => Number.isInteger(level.score)
        && level.score >= 0
        && level.score <= maxPoints
        && (index === 0 || levels[index - 1].score > level.score));
}

export function mergeRegeneratedCriterion(current, wording) {
    const descriptions = new Map(wording.levels.map(item => [item.levelId, item.description]));
    return {
        ...current,
        name: wording.name,
        description: wording.description,
        standardCodes: wording.standardCodes,
        kind: wording.kind,
        evidence: wording.evidence,
        levels: current.levels.map(level => ({ ...level, description: descriptions.get(level.levelId) ?? level.description })),
    };
}
