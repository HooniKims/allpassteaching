import { expect, test } from 'vitest';
import { recommendWorksheetFormat, worksheetFormats } from '@/lib/worksheet-formats';

test('recommends a dedicated inquiry worksheet for inquiry instruction models', () => {
    expect(recommendWorksheetFormat({ id: 'inquiry', name: '탐구 학습 모형' }).id).toBe('inquiry-experiment');
});

test('defines complete, unique worksheet formats including teacher overrides', () => {
    expect(worksheetFormats.length).toBeGreaterThanOrEqual(10);
    expect(new Set(worksheetFormats.map(item => item.id)).size).toBe(worksheetFormats.length);
    expect(worksheetFormats.every(item => item.name && item.sections.length >= 3 && item.guide)).toBe(true);
});
