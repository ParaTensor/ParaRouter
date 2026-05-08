import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import {
  fetchProviderSupportedModelsWithLog,
  normalizeProviderBaseUrl,
  normalizeProviderId,
  providerBaseUrls,
  validateProviderBaseUrl,
  type ProviderCatalogFetchLogEntry,
} from '../utils';
import { requireRole } from '../middleware/auth';
import { runProviderHealthChecks, probeAnthropic, probeOpenAiCompatible } from '../provider_health';

const router = Router();

type CatalogRefreshResult =
  | { ok: true; count: number; fetch_log: ProviderCatalogFetchLogEntry[] }
  | { ok: false; count: 0; error: string; fetch_log: ProviderCatalogFetchLogEntry[] };

function normalizeCatalogModels(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[];
  return raw
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0);
}

function normalizeDriverType(raw: unknown) {
  const value = String(raw || '').trim().toLowerCase();
  return value === 'anthropic' ? 'anthropic' : 'openai_compatible';
}

/** Fetches upstream /models (etc.) and persists only on success; does not clear existing catalog on failure. */
async function refreshProviderModelCatalog(
  provider: string,
  overrides?: { apiKey?: string; baseUrl?: string; keyId?: string },
): Promise<CatalogRefreshResult> {
  const emptyLog: ProviderCatalogFetchLogEntry[] = [];

  const { rows: accounts } = await pool.query(
    `SELECT id, base_url, COALESCE(supported_models, '[]'::jsonb) AS supported_models
     FROM provider_accounts
     WHERE id = $1
     LIMIT 1`,
    [provider],
  );
  const account = accounts[0];
  if (!account) {
    return { ok: false, count: 0, error: 'Provider not found', fetch_log: emptyLog };
  }
  const baseUrl = String(overrides?.baseUrl || account.base_url || '').trim();
  if (!baseUrl) {
    return { ok: false, count: 0, error: 'Missing base URL', fetch_log: emptyLog };
  }

  let apiKey = String(overrides?.apiKey || '').trim();
  let providerKeyId = String(overrides?.keyId || '').trim();
  if (!apiKey || !providerKeyId) {
    const { rows: keys } = await pool.query(
      `SELECT id, api_key
       FROM provider_api_keys
       WHERE provider_account_id = $1 AND status = 'active'
       ORDER BY updated_at DESC, id ASC
       LIMIT 1`,
      [provider],
    );
    apiKey = apiKey || String(keys[0]?.api_key || '').trim();
    providerKeyId = providerKeyId || String(keys[0]?.id || '').trim();
  }
  if (!apiKey) {
    return { ok: false, count: 0, error: 'No active API key', fetch_log: emptyLog };
  }
  if (!providerKeyId) {
    providerKeyId = `${provider}:default`;
  }

  const { models, fetch_log, error } = await fetchProviderSupportedModelsWithLog(baseUrl, apiKey);
  if (error) {
    console.warn(`Failed to refresh supported models for provider ${provider}:`, error);
    return { ok: false, count: 0, error: error || 'Failed to fetch model catalog', fetch_log };
  }

  const normalizedModels = normalizeCatalogModels(models);

  const now = Date.now();
  if (providerKeyId) {
    await pool.query(
      `INSERT INTO provider_api_keys (id, provider_account_id, label, api_key, status, supported_models, supported_models_updated_at, updated_at)
       VALUES ($1, $2, 'Default', $3, 'active', $4::jsonb, $5, $5)
       ON CONFLICT (id)
       DO UPDATE SET
         api_key = CASE WHEN EXCLUDED.api_key IS NOT NULL AND EXCLUDED.api_key != '' THEN EXCLUDED.api_key ELSE provider_api_keys.api_key END,
         status = 'active',
         supported_models = EXCLUDED.supported_models,
         supported_models_updated_at = EXCLUDED.supported_models_updated_at,
         updated_at = EXCLUDED.updated_at`,
      [providerKeyId, provider, apiKey, JSON.stringify(normalizedModels), now],
    );
  }
  await pool.query(
    `UPDATE provider_accounts
     SET supported_models = $2::jsonb,
         supported_models_updated_at = $3,
         updated_at = $3
     WHERE id = $1`,
    [provider, JSON.stringify(normalizedModels), now],
  );
  return { ok: true, count: normalizedModels.length, fetch_log };
}

router.get('/provider-types', requireRole('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, label, base_url, driver_type, models, enabled, sort_order, docs_url
       FROM provider_types
       ORDER BY sort_order ASC, id ASC`,
    );
    res.json(rows);
  } catch (error) {
    console.error('API Error /provider-types:', error);
    res.status(500).json({ error: String(error) });
  }
});


router.get('/provider-keys', requireRole('admin'), async (_req, res) => {
  try {
    const { rows: stateRows } = await pool.query(
      'SELECT current_version FROM pricing_state WHERE id = 1 LIMIT 1',
    );
    const currentVersion = String(stateRows[0]?.current_version || 'bootstrap');
    const { rows: accounts } = await pool.query(
      `SELECT a.id AS provider, a.status, a.provider_type, a.label, a.base_url, COALESCE(a.docs_url, '') AS docs_url,
              COALESCE(NULLIF(pt.driver_type, ''), CASE WHEN a.provider_type = 'anthropic' THEN 'anthropic' ELSE 'openai_compatible' END) AS driver_type,
              COALESCE(supported_models, '[]'::jsonb) AS supported_models, supported_models_updated_at
       FROM provider_accounts a
       LEFT JOIN provider_types pt ON pt.id = a.provider_type
       ORDER BY a.id ASC`
    );
    const { rows: keys } = await pool.query(
          `SELECT id, provider_account_id, label, api_key, status, updated_at,
            COALESCE(supported_models, '[]'::jsonb) AS supported_models,
            supported_models_updated_at,
              COALESCE(health_status, 'unknown') AS health_status,
              health_checked_at,
              health_last_ok_at,
              health_error,
              health_fail_count,
              health_alert_sent_at
       FROM provider_api_keys ORDER BY id ASC`
    );
    const { rows: pricingRows } = await pool.query(
      `SELECT provider_account_id, provider_key_id, model_id
       FROM model_provider_pricings
       WHERE version = $1 AND status = 'online'
       ORDER BY provider_account_id ASC, provider_key_id ASC, is_top_provider DESC, input_price ASC NULLS LAST, model_id ASC`,
      [currentVersion],
    );

    const keySupportedModels = new Map<string, string[]>();
    for (const row of pricingRows) {
      const mapKey = `${row.provider_account_id}::${row.provider_key_id}`;
      const list = keySupportedModels.get(mapKey) || [];
      if (!list.includes(row.model_id)) {
        list.push(row.model_id);
        keySupportedModels.set(mapKey, list);
      }
    }

    const result = accounts.map(acc => {
      const accountKeys = keys
        .filter(k => k.provider_account_id === acc.provider)
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
      const firstKey = accountKeys[0];
      const keyModels = Array.isArray(firstKey?.supported_models) ? firstKey.supported_models : [];
      const supportedModels = firstKey && (firstKey.supported_models_updated_at || keyModels.length > 0)
        ? firstKey.supported_models
        : Array.isArray(acc.supported_models)
          ? acc.supported_models
          : [];
      return {
        ...acc,
        supported_models: supportedModels,
        key_id: firstKey?.id || '',
        key: firstKey?.api_key || '',
        key_status: firstKey?.status || 'active',
        health_status: firstKey?.health_status || null,
        health_checked_at: firstKey?.health_checked_at || null,
        health_last_ok_at: firstKey?.health_last_ok_at || null,
        health_error: firstKey?.health_error || null,
        health_fail_count: firstKey?.health_fail_count || null,
        health_alert_sent_at: firstKey?.health_alert_sent_at || null,
        supported_models_updated_at: firstKey?.supported_models_updated_at || null,
      };
    });
    res.json(result);
  } catch (error) {
    console.error('API Error /provider-keys:', error);
    res.status(500).json({ error: String(error) });
  }
});

router.post('/provider-keys/:provider/health-check', requireRole('admin'), async (req, res) => {
  try {
    const provider = normalizeProviderId(req.params.provider || '');
    const { api_key, base_url, driver_type } = req.body || {};

    // 如果请求体中提供了配置参数，使用请求体中的参数进行测试
    if (api_key && base_url) {
      const normalizedDriverType = normalizeDriverType(driver_type || 'openai_compatible');
      const baseUrlError = validateProviderBaseUrl(base_url, normalizedDriverType);
      if (baseUrlError) {
        return res.status(400).json({ error: baseUrlError });
      }
      const normalizedBaseUrl = normalizeProviderBaseUrl(base_url, normalizedDriverType);
      
      // 从数据库查询该 provider 支持的模型列表，使用第一个模型进行测试
      const { rows: accountRows } = await pool.query(
        'SELECT supported_models FROM provider_accounts WHERE id = $1',
        [provider]
      );
      const account = accountRows[0];
      const supportedModels = Array.isArray(account?.supported_models) ? account.supported_models : [];
      const testModel = supportedModels.length > 0 ? supportedModels[0] 
        : (normalizedDriverType === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o-mini');
      
      const probe = normalizedDriverType === 'anthropic'
        ? await probeAnthropic(normalizedBaseUrl, api_key, testModel)
        : await probeOpenAiCompatible(normalizedBaseUrl, api_key, testModel);
      
      const result = {
        provider_account_id: provider,
        provider_key_id: 'temp',
        label: 'test',
        probe_model: testModel,
        ok: probe.ok,
        status: probe.status,
        health_status: probe.ok ? 'healthy' : 'unhealthy',
        checked_at: Date.now(),
        error: probe.error,
      };
      
      res.json({ status: 'checked', provider, results: [result] });
      return;
    }

    // 否则使用数据库中的配置进行测试
    const results = await runProviderHealthChecks(provider);
    await pool.query("SELECT pg_notify('config_changed', 'provider_keys')");
    res.json({ status: 'checked', provider, results });
  } catch (error) {
    console.error('API Error POST /provider-keys/:provider/health-check:', error);
    res.status(500).json({ error: String(error) });
  }
});

router.post('/provider-keys/:provider/:keyId/refresh-model-catalog', requireRole('admin'), async (req, res) => {
  try {
    const provider = normalizeProviderId(req.params.provider || '');
    const keyId = String(req.params.keyId || '').trim();
    if (!provider || !keyId) {
      return res.status(400).json({ error: 'provider and keyId are required' });
    }

    const { rows: keyRows } = await pool.query(
      `SELECT k.api_key, a.base_url, COALESCE(k.supported_models, '[]'::jsonb) AS supported_models
       FROM provider_api_keys k
       JOIN provider_accounts a ON a.id = k.provider_account_id
       WHERE k.id = $1 AND k.provider_account_id = $2 AND k.status = 'active'
       LIMIT 1`,
      [keyId, provider],
    );
    const row = keyRows[0];
    if (!row) {
      return res.status(404).json({ error: 'provider key not found' });
    }

    const { models, fetch_log, error } = await fetchProviderSupportedModelsWithLog(String(row.base_url || ''), String(row.api_key || ''));
    if (error) {
      return res.status(400).json({ error, fetch_log });
    }

    const normalizedModels = normalizeCatalogModels(models);

    const now = Date.now();
    await pool.query(
      `UPDATE provider_api_keys
       SET supported_models = $2::jsonb,
           supported_models_updated_at = $3,
           updated_at = $3
       WHERE id = $1 AND provider_account_id = $4`,
      [keyId, JSON.stringify(normalizedModels), now, provider],
    );
    await pool.query("SELECT pg_notify('config_changed', 'provider_keys')");
    res.json({
      status: 'refreshed',
      provider,
      key_id: keyId,
      supported_models_count: normalizedModels.length,
      fetch_log,
    });
  } catch (error) {
    console.error('API Error POST /provider-keys/:provider/:keyId/refresh-model-catalog:', error);
    res.status(500).json({ error: String(error) });
  }
});

router.post(
  '/provider-keys/:provider/refresh-model-catalog',
  requireRole('admin'),
  async (req, res) => {
    try {
      const provider = normalizeProviderId(req.params.provider || '');
      const result = await refreshProviderModelCatalog(provider, {
        keyId: String((req.body || {}).key_id || '').trim(),
        apiKey: String((req.body || {}).api_key || '').trim(),
        baseUrl: String((req.body || {}).base_url || '').trim(),
      });
      if (!result.ok) {
        const status = result.error === 'Provider not found' ? 404 : 400;
        return res.status(status).json({ error: result.error, fetch_log: result.fetch_log });
      }
      await pool.query("SELECT pg_notify('config_changed', 'provider_keys')");
      res.json({
        status: 'refreshed',
        supported_models_count: result.count,
        fetch_log: result.fetch_log,
      });
    } catch (error) {
      console.error('API Error POST /provider-keys/:provider/refresh-model-catalog:', error);
      res.status(500).json({ error: String(error) });
    }
  },
);

router.put('/provider-keys/:provider', requireRole('admin'), async (req, res) => {
  try {
    const provider = normalizeProviderId(req.params.provider || '');
    const {
      status,
      label,
      base_url,
      docs_url,
      driver_type,
      keys,
      key,
      key_status,
      key_id,
      supported_models,
      supported_models_updated_at,
    } = req.body || {};
    
    // 支持单密钥结构（新）和多密钥结构（旧）
    const isSingleKeyMode = key !== undefined && key_status !== undefined;
    const defaultKeyId = `${provider}:default`;
    const keysArray = isSingleKeyMode
      ? [{id: key_id && key_id !== 'default' ? key_id : defaultKeyId, key, status: key_status || 'active', label: 'Default'}]
      : keys;
    
    if (!keysArray || !Array.isArray(keysArray)) {
      return res.status(400).json({ error: 'keys array is required' });
    }

    const providerType = normalizeProviderId(String((req.body || {}).provider_type || provider)) || provider;
    const normalizedDriverType = normalizeDriverType(driver_type || (req.body || {}).provider_type);
    const requestedBaseUrl = String(base_url || providerBaseUrls[provider] || '');
    const baseUrlError = validateProviderBaseUrl(requestedBaseUrl, normalizedDriverType);
    if (baseUrlError) {
      return res.status(400).json({ error: baseUrlError });
    }

    const normalizedBaseUrl = normalizeProviderBaseUrl(requestedBaseUrl, normalizedDriverType);
    const now = Date.now();
    const nowDate = new Date(now);

    const client = await pool.connect();
    const savedKeyMeta: { id: string; label: string }[] = [];
    try {
      await client.query('BEGIN');

      const normalizedSupportedModels = normalizeCatalogModels(supported_models);
      const normalizedSupportedModelsUpdatedAt = supported_models_updated_at || now;

      await client.query(
        `INSERT INTO provider_accounts (id, provider_type, label, base_url, docs_url, status, supported_models, supported_models_updated_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         ON CONFLICT (id)
         DO UPDATE SET
          provider_type = EXCLUDED.provider_type,
          label = EXCLUDED.label,
          base_url = EXCLUDED.base_url,
          docs_url = EXCLUDED.docs_url,
          status = EXCLUDED.status,
          supported_models = EXCLUDED.supported_models,
          supported_models_updated_at = EXCLUDED.supported_models_updated_at,
          updated_at = EXCLUDED.updated_at`,
        [
          provider,
          providerType,
          String(label || provider),
          normalizedBaseUrl,
          docs_url ? String(docs_url) : '',
          status || 'active',
          JSON.stringify(normalizedSupportedModels),
          normalizedSupportedModelsUpdatedAt,
          now,
        ],
      );

      // Keep track of provided key IDs to delete the ones removed
      const providedKeyIds = keysArray.map(k => k.id).filter(Boolean);
      if (providedKeyIds.length > 0) {
        await client.query(
          `DELETE FROM provider_api_keys WHERE provider_account_id = $1 AND id != ALL($2::text[])`,
          [provider, providedKeyIds]
        );
      } else {
        await client.query(`DELETE FROM provider_api_keys WHERE provider_account_id = $1`, [provider]);
      }

      for (const k of keysArray) {
        const kid = k.id || crypto.randomUUID();
        await client.query(
          `INSERT INTO provider_api_keys (id, provider_account_id, label, api_key, status, supported_models, supported_models_updated_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
           ON CONFLICT (id)
           DO UPDATE SET
            label = EXCLUDED.label,
            api_key = CASE WHEN EXCLUDED.api_key IS NOT NULL AND EXCLUDED.api_key != '' THEN EXCLUDED.api_key ELSE provider_api_keys.api_key END,
            status = EXCLUDED.status,
            supported_models = CASE
              WHEN EXCLUDED.supported_models IS NOT NULL THEN EXCLUDED.supported_models
              ELSE provider_api_keys.supported_models
            END,
            supported_models_updated_at = CASE
              WHEN EXCLUDED.supported_models IS NOT NULL THEN EXCLUDED.supported_models_updated_at
              ELSE provider_api_keys.supported_models_updated_at
            END,
            updated_at = EXCLUDED.updated_at`,
          [
            kid,
            provider,
            k.label || 'Default',
            k.key || '',
            k.status || 'active',
            JSON.stringify(normalizeCatalogModels(k.supported_models ?? supported_models)),
            k.supported_models_updated_at || supported_models_updated_at || now,
            now,
          ]
        );
        savedKeyMeta.push({ id: kid, label: String(k.label || 'Default') });
      }

      await client.query(
        `INSERT INTO provider_types (id, label, base_url, driver_type, models, enabled, sort_order, docs_url, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
         ON CONFLICT (id)
         DO UPDATE SET
           label = EXCLUDED.label,
           base_url = EXCLUDED.base_url,
           driver_type = EXCLUDED.driver_type,
           docs_url = EXCLUDED.docs_url,
           updated_at = EXCLUDED.updated_at`,
        [
          provider,
          String(label || provider),
          normalizedBaseUrl,
          normalizedDriverType,
          JSON.stringify([]),
          true,
          0,
          docs_url ? String(docs_url) : '',
          nowDate,
        ],
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Notify Gateway to refresh cache
    await pool.query("SELECT pg_notify('config_changed', 'provider_keys')");
    await pool.query("SELECT pg_notify('config_changed', 'provider_types')");
    res.json({ status: 'saved', keys: savedKeyMeta });
  } catch (error) {
    console.error('API Error /provider-keys/:provider:', error);
    res.status(500).json({ error: String(error) });
  }
});
router.delete('/provider-keys/:provider', requireRole('admin'), async (req, res) => {
  try {
    const provider = normalizeProviderId(req.params.provider || '');
    await pool.query('DELETE FROM provider_accounts WHERE id = $1', [provider]);
    await pool.query('DELETE FROM provider_api_keys WHERE provider_account_id = $1', [provider]);
    // Notify Gateway to refresh cache
    await pool.query("SELECT pg_notify('config_changed', 'provider_keys')");
    await pool.query("SELECT pg_notify('config_changed', 'provider_types')");
    res.json({ status: 'deleted' });
  } catch (error) {
    console.error('API Error DELETE /provider-keys/:provider:', error);
    res.status(500).json({ error: String(error) });
  }
});




export default router;
