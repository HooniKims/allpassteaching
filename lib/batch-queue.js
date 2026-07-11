export async function runWithConcurrency(items, limit, worker, onProgress = () => {}) {
    const results = new Array(items.length);
    let cursor = 0;
    async function run() {
        while (cursor < items.length) {
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
    return results;
}
