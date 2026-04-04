import { Router } from 'express';
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
    const { rows } = await pool.query(
      `SELECT pa.id AS provider, pa.api_key AS key, pa.status,
              pa.provider_type,
              pa.label,
              pa.base_url,
              COALESCE(pa.docs_url, '') AS docs_url
       FROM provider_accounts pa
       ORDER BY pa.id ASC`,
    );
    res.json(rows);
  } catch (error) {
    console.error('API Error /provider-keys:', error);
    res.status(500).json({ error: String(error) });
  }
});

router.put('/provider-keys/:provider', async (req, res) => {
  try {
    const provider = normalizeProviderId(req.params.provider || '');
    const { key, status, label, base_url, docs_url, driver_type } = req.body || {};
    if (!provider) {
      return res.status(400).json({ error: 'provider required' });
    }
    if (!key) {
      return res.status(400).json({ error: 'key required' });
    }
    const providerType = normalizeProviderId(String((req.body || {}).provider_type || provider)) || provider;
    const now = Date.now();
    const nowDate = new Date(now);

    await pool.query(
      `INSERT INTO provider_accounts (id, provider_type, label, base_url, docs_url, api_key, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id)
       DO UPDATE SET
         provider_type = EXCLUDED.provider_type,
         label = EXCLUDED.label,
         base_url = EXCLUDED.base_url,
         docs_url = EXCLUDED.docs_url,
         api_key = EXCLUDED.api_key,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [
        provider,
        providerType,
        String(label || provider),
        String(base_url || providerBaseUrls[provider] || ''),
        docs_url ? String(docs_url) : '',
        key,
        status || 'active',
        now,
      ],
    );

    await pool.query(
      `INSERT INTO provider_keys (provider, key, status, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider)
       DO UPDATE SET key = EXCLUDED.key, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
      [provider, key, status || 'active', now],
    );

    await pool.query(
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
    await pool.query('DELETE FROM provider_keys WHERE provider = $1', [provider]);
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
