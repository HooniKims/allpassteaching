import { expect, test } from 'vitest';
import { linkGradingSources } from '@/lib/grading-source-refs.js';
import { canonicalGradingSourceRef } from '@/lib/grading-evidence.js';

test('Given normalized OCR elements When grading evidence matches Then source references keep page and finite coordinates', () => {
    const grading = { criteria: [{ criterionId: 'criterion-1', evidence: '관찰한 뿌리에 가는 털이 있다.', score: 35, feedback: '좋습니다.' }] };
    const elements = [{ id: 'element-1', page: 2, category: 'paragraph', text: '뿌리에 가는 털이 있다', confidence: .96, coordinates: [{ x: .1, y: .2 }, { x: .8, y: .3 }] }];

    const linked = linkGradingSources(grading, elements);

    expect(linked.criteria[0].sourceRefs).toEqual([canonicalGradingSourceRef(elements[0])]);
});

test('Given unmatched evidence When sources are linked Then no invented location is created', () => {
    const grading = { criteria: [{ criterionId: 'criterion-1', evidence: '일치하지 않는 근거', score: 10, feedback: '확인' }] };

    const linked = linkGradingSources(grading, [{ id: 'element-1', page: 1, text: '다른 내용', coordinates: [{ x: .1, y: .2 }, { x: .3, y: .4 }] }]);

    expect(linked.criteria[0].sourceRefs).toEqual([]);
});

test('Given matched evidence with collapsed coordinates When sources are linked Then the location is explicitly missing', () => {
    const grading = { criteria: [{ criterionId: 'criterion-1', evidence: '관찰 근거', score: 10, feedback: '확인' }] };

    const element = { id: 'element-1', page: 1, category: 'text', text: '관찰 근거', coordinates: [{ x: .2, y: .2 }, { x: .2, y: .2 }] };
    const linked = linkGradingSources(grading, [element]);

    expect(linked.criteria[0].sourceRefs).toEqual([canonicalGradingSourceRef(element)]);
    expect(linked.criteria[0].sourceRefs[0].teacherReviewRequired).toBe(true);
});
