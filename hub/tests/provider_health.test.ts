import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildAnthropicProbeUrls, buildOpenAiProbeUrls, normalizeProbeModelIds } from '../provider_health';

describe('provider health helpers', () => {
  test('adds /v1/messages for unversioned anthropic-compatible bases', () => {
    assert.deepEqual(buildAnthropicProbeUrls('https://taotoken.net/api'), [
      'https://taotoken.net/api/v1/messages',
      'https://taotoken.net/api/messages',
    ]);
  });

  test('keeps /messages for already versioned bases', () => {
    assert.deepEqual(buildAnthropicProbeUrls('https://api.anthropic.com/v1'), [
      'https://api.anthropic.com/v1/messages',
    ]);
  });

  test('adds a root /v1 fallback for openai-compatible bases ending with /api', () => {
    assert.deepEqual(buildOpenAiProbeUrls('https://api.b.ai/api', '/chat/completions'), [
      'https://api.b.ai/api/chat/completions',
      'https://api.b.ai/v1/chat/completions',
    ]);
  });

  test('normalizes, filters, and deduplicates probe model ids', () => {
    assert.deepEqual(
      normalizeProbeModelIds(['', ' claude-sonnet-4-5 ', 'claude-sonnet-4-5', null, 'gpt-5.4']),
      ['claude-sonnet-4-5', 'gpt-5.4'],
    );
  });
});