import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { fetchProviderSupportedModelsWithLog, normalizeProviderBaseUrl } from '../utils';

describe('normalizeProviderBaseUrl', () => {
  test('keeps openai-compatible root bases unchanged', () => {
    assert.equal(
      normalizeProviderBaseUrl('https://api.openai.com/', 'openai_compatible'),
      'https://api.openai.com',
    );
  });

  test('adds /v1 for anthropic root bases', () => {
    assert.equal(
      normalizeProviderBaseUrl('https://api.b.ai', 'anthropic'),
      'https://api.b.ai/v1',
    );
  });

  test('adds /v1 after custom anthropic base paths', () => {
    assert.equal(
      normalizeProviderBaseUrl('https://taotoken.net/api/', 'anthropic'),
      'https://taotoken.net/api/v1',
    );
  });

  test('does not duplicate anthropic /v1 suffixes', () => {
    assert.equal(
      normalizeProviderBaseUrl('https://api.anthropic.com/v1/', 'anthropic'),
      'https://api.anthropic.com/v1',
    );
  });

  test('tries a root /v1/models fallback for openai-compatible bases ending with /api', async () => {
    const urls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url === 'https://api.b.ai/v1/models') {
        return new Response(JSON.stringify({ data: [{ id: 'bai/gpt-5.5' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ message: 'wrong path' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await fetchProviderSupportedModelsWithLog('https://api.b.ai/api', 'test-key');
      assert.equal(result.error, null);
      assert.deepEqual(result.models, ['bai/gpt-5.5']);
      assert.deepEqual(urls, [
        'https://api.b.ai/api/v1/models',
        'https://api.b.ai/v1/models',
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});