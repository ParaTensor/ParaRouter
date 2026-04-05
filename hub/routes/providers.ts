import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db';
import { normalizeProviderId, providerBaseUrls } from '../utils';
import { requireRole } from '../middleware/auth';

const router = Router();
router.use(requireRole('admin'));

router.get('/provider-types', async (_req, res) => {
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


router.get('/provider-keys', async (_req, res) => {
  try {
    const { rows: accounts } = await pool.query(
      `SELECT id AS provider, status, provider_type, label, base_url, COALESCE(docs_url, '') AS docs_url
       FROM provider_accounts ORDER BY id ASC`
    );
    const { rows: keys } = await pool.query(
      `SELECT id, provider_account_id, label, api_key, status
       FROM provider_api_keys ORDER BY id ASC`
    );

    const result = accounts.map(acc => ({
      ...acc,
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

router.put('/provider-keys/:provider', async (req, res) => {
  try {
    const provider = normalizeProviderId(req.params.provider || '');
    const { status, label, base_url, docs_url, driver_type, keys } = req.body || {};
    
    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ error: 'keys array is required' });
    }

    const providerType = normalizeProviderId(String((req.body || {}).provider_type || provider)) || provider;
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
          String(base_url || providerBaseUrls[provider] || ''),
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
          String(base_url || providerBaseUrls[provider] || ''),
          String(driver_type || 'openai_compatible'),
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
    res.json({ status: 'saved' });
  } catch (error) {
    console.error('API Error /provider-keys/:provider:', error);
    res.status(500).json({ error: String(error) });
  }
});
router.delete('/provider-keys/:provider', async (req, res) => {
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
