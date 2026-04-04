import { Router } from 'express';
import { pool } from '../db';
import { normalizeProviderId, providerBaseUrls } from '../utils';
import { requireRole } from '../middleware/auth';

const router = Router();
router.use(requireRole('admin'));

router.get('/provider-types', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, label, base_url, driver_type, models, enabled, sort_order, docs_url
     FROM provider_types
     ORDER BY sort_order ASC, id ASC`,
  );
  res.json(rows);
});

router.get('/provider-keys', async (_req, res) => {
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
});

router.put('/provider-keys/:provider', async (req, res) => {
  const provider = normalizeProviderId(req.params.provider || '');
  const { key, status, label, base_url, docs_url } = req.body || {};
  if (!provider) {
    return res.status(400).json({ error: 'provider required' });
  }
  if (!key) {
    return res.status(400).json({ error: 'key required' });
  }
  const providerType = normalizeProviderId(String((req.body || {}).provider_type || provider)) || provider;
  const now = Date.now();
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
      docs_url ? String(docs_url) : null,
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
       docs_url = EXCLUDED.docs_url,
       updated_at = EXCLUDED.updated_at`,
    [
      provider,
      String(label || provider),
      String(base_url || providerBaseUrls[provider] || ''),
      'openai_compatible',
      JSON.stringify([]),
      true,
      0,
      docs_url ? String(docs_url) : null,
      Date.now(),
    ],
  );
  res.json({ status: 'saved' });
});

router.delete('/provider-keys/:provider', async (req, res) => {
  const provider = normalizeProviderId(req.params.provider || '');
  await pool.query('DELETE FROM provider_accounts WHERE id = $1', [provider]);
  await pool.query('DELETE FROM provider_keys WHERE provider = $1', [provider]);
  res.json({ status: 'deleted' });
});

export default router;
