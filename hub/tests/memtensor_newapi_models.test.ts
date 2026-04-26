/**
 * Memtensor 基于 NewAPI（OpenAI 兼容端点）部署时的模型列表验证。
 *
 * 文档（模型列表，Bearer sk-…）：
 * https://www.newapi.ai/en/docs/api/ai-model/models/list/listmodels
 * （中文站点入口：https://www.newapi.ai/zh/docs → 接口文档 → Model List）
 *
 * 环境变量：
 * - MEMTENSOR_BASE_URL：默认 https://api.memtensor.cn（勿带末尾 /）
 * - MEMTENSOR_API_KEY：若设置则跑完整同步路径（与 Hub「同步模型目录」一致）
 * - SKIP_MEMTENSOR_NETWORK=1：跳过所有对外网请求
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fetchProviderSupportedModelsWithLog } from '../utils';

const DEFAULT_BASE = 'https://api.memtensor.cn';

function memtensorBaseUrl(): string {
  return (process.env.MEMTENSOR_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

describe('memtensor / NewAPI model list', () => {
  test('GET /v1/models without token returns 401 (NewAPI-style JSON)', async (t) => {
    if (process.env.SKIP_MEMTENSOR_NETWORK === '1') {
      t.skip('SKIP_MEMTENSOR_NETWORK=1');
      return;
    }
    const base = memtensorBaseUrl();
    const url = `${base}/v1/models`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    assert.equal(res.status, 401, `expected 401 from ${url}`);
    const ct = res.headers.get('content-type') || '';
    assert.ok(ct.includes('json'), `expected JSON content-type, got ${ct}`);
    const body = (await res.json()) as Record<string, unknown>;
    assert.ok(body && typeof body === 'object');
    assert.ok('error' in body || 'message' in body, `unexpected body keys: ${Object.keys(body).join(',')}`);
  });

  test('fetchProviderSupportedModelsWithLog matches Hub catalog sync (needs MEMTENSOR_API_KEY)', async (t) => {
    if (process.env.SKIP_MEMTENSOR_NETWORK === '1') {
      t.skip('SKIP_MEMTENSOR_NETWORK=1');
      return;
    }
    const apiKey = (process.env.MEMTENSOR_API_KEY || '').trim();
    if (!apiKey) {
      t.skip('set MEMTENSOR_API_KEY to verify authenticated model list');
      return;
    }
    const baseUrl = memtensorBaseUrl();
    const { models, error, fetch_log } = await fetchProviderSupportedModelsWithLog(baseUrl, apiKey);
    assert.equal(error, null, `catalog fetch failed: ${fetch_log.map((e) => e.message).join(' | ')}`);
    assert.ok(models.length > 0, 'expected at least one model id from NewAPI OpenAI-format response');
    const parsed = fetch_log.find((e) => e.outcome === 'parsed');
    assert.ok(parsed, `expected one successful URL in fetch_log, got: ${JSON.stringify(fetch_log)}`);
    assert.ok(parsed!.url.includes('/v1/models') || parsed!.url.endsWith('/models'), parsed!.url);
  });
});
