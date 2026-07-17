import { afterEach, test, expect, vi } from 'vitest';
import { z } from 'zod';
import { chatJson, UpstageError } from '@/lib/upstage/client';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; delete process.env.UPSTAGE_MAX_TOKENS; delete process.env.UPSTAGE_TEMPERATURE; delete process.env.UPSTAGE_TIMEOUT_MS; });

test('reports a typed missing-key error', async () => {
    await expect(chatJson({ messages: [], schema: z.object({ ok: z.boolean() }) })).rejects.toEqual(expect.objectContaining({ code: 'missing_key', status: 503 }));
});

test('parses a successful JSON completion through the supplied schema', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }))));
    await expect(chatJson({ messages: [], schema: z.object({ ok: z.boolean() }) })).resolves.toEqual({ ok: true });
    expect(UpstageError).toBeTypeOf('function');
});

test('uses bounded Upstage temperature and token settings from the server environment', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    process.env.UPSTAGE_TEMPERATURE = '0.15';
    process.env.UPSTAGE_MAX_TOKENS = '900';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }))));

    await chatJson({ messages: [], schema: z.object({ ok: z.boolean() }) });

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.upstage.ai/v1/chat/completions');
    expect(JSON.parse(options.body)).toMatchObject({ model: 'solar-pro3', temperature: 0.15, max_tokens: 900 });
});

test('uses a configured timeout globally without shortening an explicit 90-second caller timeout', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }))));

    process.env.UPSTAGE_TIMEOUT_MS = '15000';
    await chatJson({ messages: [], schema: z.object({ ok: z.boolean() }), timeoutMs: 60000 });
    expect(timeout).toHaveBeenLastCalledWith(15000);

    delete process.env.UPSTAGE_TIMEOUT_MS;
    await chatJson({ messages: [], schema: z.object({ ok: z.boolean() }), timeoutMs: 90000 });
    expect(timeout).toHaveBeenLastCalledWith(90000);
});

test('retries one transient timeout before returning a completion', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn()
        .mockRejectedValueOnce(new DOMException('The operation timed out', 'TimeoutError'))
        .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 })));

    await expect(chatJson({ messages: [], schema: z.object({ ok: z.boolean() }) })).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
});
