import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildAnthropicProbeUrls, buildOpenAiProbeUrls, normalizeProbeModelIds } from '../provider_health';

describe('provider health helpers', () => {
  test('uses the configured anthropic base URL without /v1 fallback', () => {
    assert.deepEqual(buildAnthropicProbeUrls('https://taotoken.net/api/v1'), [
      'https://taotoken.net/api/v1/messages',
    ]);
  });

  test('uses the configured openai-compatible base URL without /api fallback', () => {
    assert.deepEqual(buildOpenAiProbeUrls('https://api.b.ai/v1', '/chat/completions'), [
      'https://api.b.ai/v1/chat/completions',
    ]);
  });

  test('keeps /messages for already versioned bases', () => {
    assert.deepEqual(buildAnthropicProbeUrls('https://api.anthropic.com/v1'), [
      'https://api.anthropic.com/v1/messages',
    ]);
  });

  test('normalizes, filters, and deduplicates probe model ids', () => {
    assert.deepEqual(
      normalizeProbeModelIds(['', ' claude-sonnet-4-5 ', 'claude-sonnet-4-5', null, 'gpt-5.4']),
      ['claude-sonnet-4-5', 'gpt-5.4'],
    );
  });
});