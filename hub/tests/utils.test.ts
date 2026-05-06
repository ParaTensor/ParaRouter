import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  fetchProviderSupportedModelsWithLog,
  normalizeProviderBaseUrl,
  validateProviderBaseUrl,
} from '../utils';

describe('normalizeProviderBaseUrl', () => {
  test('keeps openai-compatible root bases unchanged', () => {
    assert.equal(
      normalizeProviderBaseUrl('https://api.openai.com/', 'openai_compatible'),
      'https://api.openai.com',
    );
  });

  test('does not auto-add /v1 for anthropic root bases', () => {
    assert.equal(
      normalizeProviderBaseUrl('https://api.b.ai', 'anthropic'),
      'https://api.b.ai',
    );
  });

  test('trims trailing slashes from versioned paths', () => {
    assert.equal(
      normalizeProviderBaseUrl('https://taotoken.net/api/v1/', 'anthropic'),
      'https://taotoken.net/api/v1',
    );
  });

  test('rejects openai-compatible bases without an explicit version suffix', () => {
    assert.equal(
      validateProviderBaseUrl('https://api.b.ai', 'openai_compatible'),
      'Base URL must include an explicit version suffix such as /v1',
    );
  });

  test('rejects anthropic bases without an explicit version suffix', () => {
    assert.equal(
      validateProviderBaseUrl('https://api.anthropic.com', 'anthropic'),
      'Base URL must include an explicit version suffix such as /v1',
    );
  });

  test('fetchProviderSupportedModelsWithLog only uses the configured /models endpoint', async () => {
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
      const result = await fetchProviderSupportedModelsWithLog('https://api.b.ai/v1', 'test-key');
      assert.equal(result.error, null);
      assert.deepEqual(result.models, ['bai/gpt-5.5']);
      assert.deepEqual(urls, ['https://api.b.ai/v1/models']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});