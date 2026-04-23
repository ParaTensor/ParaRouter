import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import {
  fetchProviderSupportedModels,
  normalizeProviderBaseUrl,
  normalizeProviderId,
  providerBaseUrls,
} from '../utils';
import { requireRole } from '../middleware/auth';

const router = Router();

async function refreshProviderSupportedModels(provider: string) {
  const { rows: accounts } = await pool.query(
    `SELECT id, base_url
     FROM provider_accounts
     WHERE id = $1
     LIMIT 1`,
    [provider],
  );
  const account = accounts[0];
  if (!account?.base_url) {
    return { fetched: false, count: 0 };
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
    await pool.query(
      `UPDATE provider_accounts
       SET supported_models = $2::jsonb,
           supported_models_updated_at = NULL
       WHERE id = $1`,
      [provider, JSON.stringify([])],
    );
    return { fetched: false, count: 0 };
  }

  try {
    const supportedModels = await fetchProviderSupportedModels(account.base_url, apiKey);
    await pool.query(
      `UPDATE provider_accounts
       SET supported_models = $2::jsonb,
           supported_models_updated_at = $3,
           updated_at = $3
       WHERE id = $1`,
      [provider, JSON.stringify(supportedModels), Date.now()],
    );
    return { fetched: true, count: supportedModels.length };
  } catch (error) {
    console.warn(`Failed to refresh supported models for provider ${provider}:`, error);
    await pool.query(
      `UPDATE provider_accounts
       SET supported_models = $2::jsonb,
           supported_models_updated_at = NULL
       WHERE id = $1`,
      [provider, JSON.stringify([])],
    );
    return { fetched: false, count: 0 };
  }
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
    const { rows: accounts } = await pool.query(
      `SELECT id AS provider, status, provider_type, label, base_url, COALESCE(docs_url, '') AS docs_url,
              COALESCE(supported_models, '[]'::jsonb) AS supported_models, supported_models_updated_at
       FROM provider_accounts ORDER BY id ASC`
    );
    const { rows: keys } = await pool.query(
      `SELECT id, provider_account_id, label, api_key, status
       FROM provider_api_keys ORDER BY id ASC`
    );

    const result = accounts.map(acc => ({
      ...acc,
      supported_models: Array.isArray(acc.supported_models) ? acc.supported_models : [],
      keys: keys.filter(k => k.provider_account_id === acc.provider).map(k => ({
        id: k.id,
        label: k.label,
        key: k.api_key,
        status: k.status
      }))
    }));
    res.json(result);
  } catch (error) {
    console.error('API Error /provider-keys:', error);
    res.status(500).json({ error: String(error) });
  }
});

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
          `INSERT INTO provider_api_keys (id, provider_account_id, label, api_key, status, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id)
           DO UPDATE SET
            label = EXCLUDED.label,
            api_key = CASE WHEN EXCLUDED.api_key IS NOT NULL AND EXCLUDED.api_key != '' THEN EXCLUDED.api_key ELSE provider_api_keys.api_key END,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at`,
          [kid, provider, k.label || 'Default', k.key || '', k.status || 'active', now]
        );
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

    const refreshResult = await refreshProviderSupportedModels(provider);

    // Notify Gateway to refresh cache
    await pool.query("SELECT pg_notify('config_changed', 'provider_keys')");
    await pool.query("SELECT pg_notify('config_changed', 'provider_types')");
    res.json({ status: 'saved', supported_models_fetched: refreshResult.fetched, supported_models_count: refreshResult.count });
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
