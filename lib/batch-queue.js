export async function runWithConcurrency(items, limit, worker, onProgress = () => {}, options = {}) {
    const results = new Array(items.length);
    let cursor = 0;
    async function run() {
        while (cursor < items.length) {
            if (options.signal?.aborted) break;
            const index = cursor; cursor += 1;
            onProgress({ index, status: 'running' });
            try {
                const value = await worker(items[index], index);
                results[index] = { status: 'fulfilled', value };
                onProgress({ index, status: 'fulfilled', value });
            } catch (reason) {
                results[index] = { status: 'rejected', reason };
                onProgress({ index, status: 'rejected', reason });
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, run));
    for (let index = 0; index < results.length; index += 1) {
        if (!results[index]) results[index] = { status: 'cancelled' };
    }
    return results;
}
