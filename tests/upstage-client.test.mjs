import { afterEach, test, expect, vi } from 'vitest';
import { z } from 'zod';
import { chatJson, UpstageError } from '@/lib/upstage/client';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });

test('reports a typed missing-key error', async () => {
    await expect(chatJson({ messages: [], schema: z.object({ ok: z.boolean() }) })).rejects.toEqual(expect.objectContaining({ code: 'missing_key', status: 503 }));
});

test('parses a successful JSON completion through the supplied schema', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 })));
    await expect(chatJson({ messages: [], schema: z.object({ ok: z.boolean() }) })).resolves.toEqual({ ok: true });
    expect(UpstageError).toBeTypeOf('function');
});
