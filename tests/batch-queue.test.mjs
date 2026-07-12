import { expect, test } from 'vitest';
import { runWithConcurrency } from '@/lib/batch-queue';

test('processes at most two items at once and preserves partial failures', async () => {
    let active = 0; let peak = 0;
    const results = await runWithConcurrency([1, 2, 3, 4], 2, async item => {
        active += 1; peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active -= 1;
        if (item === 2) throw new Error('실패');
        return item * 10;
    });

    expect(peak).toBe(2);
    expect(results.map(item => item.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'fulfilled']);
    expect(results[0].value).toBe(10);
    expect(results[1].reason.message).toBe('실패');
});

test('Given a queued batch When it is aborted after one completion Then no new item starts and the completed result remains', async () => {
    // Given
    const controller = new AbortController();
    const started = [];

    // When
    const results = await runWithConcurrency([1, 2, 3], 1, async item => {
        started.push(item);
        if (item === 1) controller.abort();
        return item * 10;
    }, () => {}, { signal: controller.signal });

    // Then
    expect(started).toEqual([1]);
    expect(results[0]).toEqual({ status: 'fulfilled', value: 10 });
    expect(results.slice(1)).toEqual([
        { status: 'cancelled' },
        { status: 'cancelled' },
    ]);
});
