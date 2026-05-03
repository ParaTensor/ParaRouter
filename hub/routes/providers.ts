import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import {
  fetchProviderSupportedModelsWithLog,
  normalizeProviderBaseUrl,
  normalizeProviderId,
  providerBaseUrls,
  type ProviderCatalogFetchLogEntry,
} from '../utils';
import { requireRole } from '../middleware/auth';
import { runProviderHealthChecks } from '../provider_health';

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

function mergeCatalogModels(preferred: string[], existing: string[]) {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const item of [...preferred, ...existing]) {
    const normalized = String(item || '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }
  return merged;
}

/** Fetches upstream /models (etc.) and persists only on success; does not clear existing catalog on failure. */
async function refreshProviderModelCatalog(provider: string): Promise<CatalogRefreshResult> {
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
  const baseUrl = String(account.base_url || '').trim();
  if (!baseUrl) {
    return { ok: false, count: 0, error: 'Missing base URL', fetch_log: emptyLog };
  }

  const { rows: keys } = await pool.query(
    `SELECT api_key
     FROM provider_api_keys
     WHERE provider_account_id = $1 AND status = 'active'
     ORDER BY updated_at DESC, id ASC
     LIMIT 1`,
    [provider],
  );
  const apiKey = String(keys[0]?.api_key || '').trim();
  if (!apiKey) {
    return { ok: false, count: 0, error: 'No active API key', fetch_log: emptyLog };
  }

  const { models, fetch_log, error } = await fetchProviderSupportedModelsWithLog(baseUrl, apiKey);
  if (error) {
    console.warn(`Failed to refresh supported models for provider ${provider}:`, error);
    return { ok: false, count: 0, error: error || 'Failed to fetch model catalog', fetch_log };
  }

  const normalizedModels = normalizeCatalogModels(models);
  const existingModels = normalizeCatalogModels(account.supported_models);
  const mergedModels = mergeCatalogModels(normalizedModels, existingModels);

  const now = Date.now();
  await pool.query(
    `UPDATE provider_accounts
     SET supported_models = $2::jsonb,
         supported_models_updated_at = $3,
         updated_at = $3
     WHERE id = $1`,
    [provider, JSON.stringify(mergedModels), now],
  );
  return { ok: true, count: mergedModels.length, fetch_log };
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
      `SELECT id AS provider, status, provider_type, label, base_url, COALESCE(docs_url, '') AS docs_url,
              COALESCE(supported_models, '[]'::jsonb) AS supported_models, supported_models_updated_at
       FROM provider_accounts ORDER BY id ASC`
    );
    const { rows: keys } = await pool.query(
          `SELECT id, provider_account_id, label, api_key, status,
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

    const result = accounts.map(acc => ({
      ...acc,
      supported_models: Array.isArray(acc.supported_models) ? acc.supported_models : [],
      keys: keys.filter(k => k.provider_account_id === acc.provider).map(k => ({
        id: k.id,
        label: k.label,
        key: k.api_key,
        status: k.status,
        health_status: k.health_status,
        health_checked_at: k.health_checked_at,
        health_last_ok_at: k.health_last_ok_at,
        health_error: k.health_error,
        health_fail_count: k.health_fail_count,
        health_alert_sent_at: k.health_alert_sent_at,
        supported_models: normalizeCatalogModels(k.supported_models).length > 0
          ? normalizeCatalogModels(k.supported_models)
          : (keySupportedModels.get(`${acc.provider}::${k.id}`) || []),
        supported_models_updated_at: k.supported_models_updated_at,
      }))
    }));
    res.json(result);
  } catch (error) {
    console.error('API Error /provider-keys:', error);
    res.status(500).json({ error: String(error) });
  }
});

router.post('/provider-keys/:provider/health-check', requireRole('admin'), async (req, res) => {
  try {
    const provider = normalizeProviderId(req.params.provider || '');
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
    const existingModels = normalizeCatalogModels(row.supported_models);
    const mergedModels = mergeCatalogModels(normalizedModels, existingModels);

    const now = Date.now();
    await pool.query(
      `UPDATE provider_api_keys
       SET supported_models = $2::jsonb,
           supported_models_updated_at = $3,
           updated_at = $3
       WHERE id = $1 AND provider_account_id = $4`,
      [keyId, JSON.stringify(mergedModels), now, provider],
    );
    await pool.query("SELECT pg_notify('config_changed', 'provider_keys')");
    res.json({
      status: 'refreshed',
      provider,
      key_id: keyId,
      supported_models_count: mergedModels.length,
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
      const result = await refreshProviderModelCatalog(provider);
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
    const { status, label, base_url, docs_url, driver_type, keys } = req.body || {};
    
    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ error: 'keys array is required' });
    }

    const providerType = normalizeProviderId(String((req.body || {}).provider_type || provider)) || provider;
    const normalizedDriverType = String(driver_type || 'openai_compatible');
    const normalizedBaseUrl = normalizeProviderBaseUrl(
      String(base_url || providerBaseUrls[provider] || ''),
      normalizedDriverType,
    );
    const now = Date.now();
    const nowDate = new Date(now);

    const client = await pool.connect();
    const savedKeyMeta: { id: string; label: string }[] = [];
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO provider_accounts (id, provider_type, label, base_url, docs_url, status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id)
         DO UPDATE SET
          provider_type = EXCLUDED.provider_type,
          label = EXCLUDED.label,
          base_url = EXCLUDED.base_url,
          docs_url = EXCLUDED.docs_url,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at`,
        [
          provider,
          providerType,
          String(label || provider),
          normalizedBaseUrl,
          docs_url ? String(docs_url) : '',
          status || 'active',
          now,
        ],
      );

      // Keep track of provided key IDs to delete the ones removed
      const providedKeyIds = keys.map(k => k.id).filter(Boolean);
      if (providedKeyIds.length > 0) {
        await client.query(
          `DELETE FROM provider_api_keys WHERE provider_account_id = $1 AND id != ALL($2::text[])`,
          [provider, providedKeyIds]
        );
      } else {
        await client.query(`DELETE FROM provider_api_keys WHERE provider_account_id = $1`, [provider]);
      }

      for (const k of keys) {
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
            JSON.stringify(normalizeCatalogModels(k.supported_models)),
            k.supported_models_updated_at || null,
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
