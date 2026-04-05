import { Router } from 'express';
import { pool } from '../db';
import { mapPricingRow } from '../utils';
import { PricingDraftUpsertRequest } from '@openhub/shared';
import { requireRole } from '../middleware/auth';

const router = Router();
router.use(requireRole('admin'));

router.get('/state', async (_req, res) => {
  const { rows } = await pool.query('SELECT current_version, config_version FROM pricing_state WHERE id = 1');
  const state = rows[0] || { current_version: 'bootstrap', config_version: 1 };
  res.json(state);
});

router.get('/', async (_req, res) => {
  const stateResult = await pool.query('SELECT current_version FROM pricing_state WHERE id = 1');
  const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';
  const { rows } = await pool.query(
    `SELECT model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost, reasoning_cost, input_price, output_price, cache_read_price, cache_write_price,
            reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, version, updated_at
     FROM model_provider_pricings
     WHERE version = $1
     ORDER BY model_id ASC, provider_account_id ASC, provider_key_id ASC`,
    [currentVersion],
  );
  res.json(rows.map(mapPricingRow));
});

router.get('/draft', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost, reasoning_cost, input_price, output_price, cache_read_price, cache_write_price,
            reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, updated_at
     FROM model_provider_pricings_draft
     ORDER BY model_id ASC, provider_account_id ASC, provider_key_id ASC`,
  );
  res.json(rows.map(mapPricingRow));
});

router.put('/draft', async (req, res) => {
  const payload = (req.body || {}) as PricingDraftUpsertRequest;
  const modelId = String(payload.model || '').trim();
  const providerAccountId = String(payload.provider_account_id || '').trim();
  const mode = String(payload.price_mode || '').trim().toLowerCase();
  const providerKeyId = String(payload.provider_key_id || '').trim();
  if (!modelId || !providerAccountId || !providerKeyId) {
    return res.status(400).json({ error: 'model, provider_account_id, and provider_key_id required' });
  }
  if (mode !== 'fixed' && mode !== 'markup') {
    return res.status(400).json({ error: 'price_mode must be fixed or markup' });
  }
  if (mode === 'fixed' && (payload.input_price == null || payload.output_price == null)) {
    return res.status(400).json({ error: 'fixed mode requires input_price and output_price' });
  }
  if (mode === 'markup' && payload.markup_rate == null) {
    return res.status(400).json({ error: 'markup mode requires markup_rate' });
  }
  const providerExists = await pool.query('SELECT 1 FROM provider_accounts WHERE id = $1 LIMIT 1', [providerAccountId]);
  if (providerExists.rowCount === 0) {
    return res.status(400).json({ error: 'provider_account_id not found' });
  }

  await pool.query(
    `INSERT INTO model_provider_pricings_draft (
       model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost, reasoning_cost, input_price, output_price, cache_read_price, cache_write_price,
       reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
     ON CONFLICT (model_id, provider_account_id, provider_key_id)
     DO UPDATE SET
       price_mode = EXCLUDED.price_mode,
       input_cost = EXCLUDED.input_cost,
       output_cost = EXCLUDED.output_cost,
       cache_read_cost = EXCLUDED.cache_read_cost,
       cache_write_cost = EXCLUDED.cache_write_cost,
       reasoning_cost = EXCLUDED.reasoning_cost,
       input_price = EXCLUDED.input_price,
       output_price = EXCLUDED.output_price,
       cache_read_price = EXCLUDED.cache_read_price,
       cache_write_price = EXCLUDED.cache_write_price,
       reasoning_price = EXCLUDED.reasoning_price,
       markup_rate = EXCLUDED.markup_rate,
       currency = EXCLUDED.currency,
       context_length = EXCLUDED.context_length,
       latency_ms = EXCLUDED.latency_ms,
       is_top_provider = EXCLUDED.is_top_provider,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at`,
    [
      modelId,
      providerAccountId,
      providerKeyId,
      mode,
      payload.input_cost ?? null,
      payload.output_cost ?? null,
      payload.cache_read_cost ?? null,
      payload.cache_write_cost ?? null,
      payload.reasoning_cost ?? null,
      mode === 'fixed' ? payload.input_price ?? null : null,
      mode === 'fixed' ? payload.output_price ?? null : null,
      mode === 'fixed' ? payload.cache_read_price ?? null : null,
      mode === 'fixed' ? payload.cache_write_price ?? null : null,
      payload.reasoning_price ?? null,
      mode === 'markup' ? payload.markup_rate ?? null : null,
      payload.currency || 'USD',
      payload.context_length ?? null,
      payload.latency_ms ?? null,
      Boolean(payload.is_top_provider),
      payload.status || 'online',
      Date.now(),
    ],
  );
  res.json({ status: 'saved' });
});

router.post('/draft/batch', async (req, res) => {
  const { provider_account_id, models, provider_key_id } = req.body || {};
  const providerKeyId = String(req.body.provider_key_id || '').trim();
  const providerAccountId = String(provider_account_id || '').trim();
  if (!providerKeyId) return res.status(400).json({ error: 'provider_key_id required' });
  if (!providerAccountId) {
    return res.status(400).json({ error: 'provider_account_id required' });
  }
  if (!Array.isArray(models)) {
    return res.status(400).json({ error: 'models array required' });
  }

  const providerExists = await pool.query('SELECT 1 FROM provider_accounts WHERE id = $1 LIMIT 1', [providerAccountId]);
  if (providerExists.rowCount === 0) {
    return res.status(400).json({ error: 'provider_account_id not found' });
  }

  const now = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const payload of models) {
      const modelId = String(payload.model || '').trim();
      const mode = String(payload.price_mode || '').trim().toLowerCase();
      if (!modelId || (mode !== 'fixed' && mode !== 'markup')) continue;

      await client.query(
        `INSERT INTO model_provider_pricings_draft (
           model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost, reasoning_cost, input_price, output_price, cache_read_price, cache_write_price,
           reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         ON CONFLICT (model_id, provider_account_id, provider_key_id)
         DO UPDATE SET
           price_mode = EXCLUDED.price_mode,
           input_cost = EXCLUDED.input_cost,
           output_cost = EXCLUDED.output_cost,
           cache_read_cost = EXCLUDED.cache_read_cost,
           cache_write_cost = EXCLUDED.cache_write_cost,
           reasoning_cost = EXCLUDED.reasoning_cost,
           input_price = EXCLUDED.input_price,
           output_price = EXCLUDED.output_price,
           cache_read_price = EXCLUDED.cache_read_price,
           cache_write_price = EXCLUDED.cache_write_price,
           reasoning_price = EXCLUDED.reasoning_price,
           markup_rate = EXCLUDED.markup_rate,
           currency = EXCLUDED.currency,
           context_length = EXCLUDED.context_length,
           latency_ms = EXCLUDED.latency_ms,
           is_top_provider = EXCLUDED.is_top_provider,
           status = EXCLUDED.status,
           updated_at = EXCLUDED.updated_at`,
        [
          modelId,
          providerAccountId,
          providerKeyId,
          mode,
          payload.input_cost ?? null,
          payload.output_cost ?? null,
          payload.cache_read_cost ?? null,
          payload.cache_write_cost ?? null,
          payload.reasoning_cost ?? null,
          mode === 'fixed' ? payload.input_price ?? null : null,
          mode === 'fixed' ? payload.output_price ?? null : null,
          mode === 'fixed' ? payload.cache_read_price ?? null : null,
          mode === 'fixed' ? payload.cache_write_price ?? null : null,
          payload.reasoning_price ?? null,
          mode === 'markup' ? payload.markup_rate ?? null : null,
          payload.currency || 'USD',
          payload.context_length ?? null,
          payload.latency_ms ?? null,
          Boolean(payload.is_top_provider),
          payload.status || 'online',
          now,
        ]
      );
    }
    await client.query('COMMIT');
    res.json({ status: 'saved_batch', count: models.length });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('API Error /pricing/draft/batch:', error);
    res.status(500).json({ error: error.message || 'unknown_error' });
  } finally {
    client.release();
  }
});

router.delete('/draft', async (req, res) => {
  const model = String(req.query.model || '').trim();
  const providerAccountId = String(req.query.provider_account_id || '').trim();
  const providerKeyId = String(req.query.provider_key_id || '').trim();
  
  if (!model) return res.status(400).json({ error: 'model required' });
  
  let query = 'DELETE FROM model_provider_pricings_draft WHERE model_id = $1';
  let params = [model];
  
  if (providerAccountId) {
    query += ' AND provider_account_id = $2';
    params.push(providerAccountId);
    if (providerKeyId) {
        query += ' AND provider_key_id = $3';
        params.push(providerKeyId);
    }
  } else if (providerKeyId) {
      query += ' AND provider_key_id = $2';
      params.push(providerKeyId);
  }
  
  await pool.query(query, params);
  res.json({ status: 'deleted' });
});

router.post('/preview', async (_req, res) => {
  const draftResult = await pool.query(
    `SELECT model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost, reasoning_cost, input_price, output_price, cache_read_price, cache_write_price,
            reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, updated_at
     FROM model_provider_pricings_draft`,
  );
  const stateResult = await pool.query('SELECT current_version FROM pricing_state WHERE id = 1');
  const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';
  const currentResult = await pool.query(
    `SELECT model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost, reasoning_cost, input_price, output_price, cache_read_price, cache_write_price,
            reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, version, updated_at
     FROM model_provider_pricings
     WHERE version = $1`,
    [currentVersion],
  );

  const currentMap = new Map<string, any>();
  for (const row of currentResult.rows) {
    currentMap.set(`${row.model_id}::${row.provider_account_id}::${row.provider_key_id}`, row);
  }
  const changes = draftResult.rows.map((row) => {
    const key = `${row.model_id}::${row.provider_account_id}::${row.provider_key_id}`;
    return {
      model: row.model_id,
      provider_account_id: row.provider_account_id,
      before: currentMap.get(key) ? mapPricingRow(currentMap.get(key)) : null,
      after: mapPricingRow(row),
    };
  });
  const affectedModels = new Set(draftResult.rows.map((r) => r.model_id)).size;
  res.json({
    affected_models: affectedModels,
    changes_count: draftResult.rows.length,
    estimated_monthly_revenue: null,
    estimated_profit_margin: null,
    cost_basis_source: 'provider_cost_markup',
    changes,
  });
});

router.post('/publish', async (req, res) => {
  const operator = String(req.body?.operator || 'system');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const now = Date.now();
    const stateResult = await client.query(
      'SELECT current_version, config_version FROM pricing_state WHERE id = 1 FOR UPDATE',
    );
    const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';
    const configVersion = Number(stateResult.rows[0]?.config_version || 1) + 1;
    const version = `v-${now}`;
    const draftCountResult = await client.query('SELECT COUNT(*)::BIGINT AS count FROM model_provider_pricings_draft');
    const draftCount = Number(draftCountResult.rows[0]?.count || 0);
    const affectedResult = await client.query(
      'SELECT COUNT(DISTINCT model_id)::BIGINT AS count FROM model_provider_pricings_draft',
    );
    const affectedModels = Number(affectedResult.rows[0]?.count || 0);

    // 1. Copy all rows from current version that are NOT being overwritten by draft
    await client.query(
      `INSERT INTO model_provider_pricings (
         model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost, reasoning_cost, input_price, output_price, cache_read_price, cache_write_price,
         reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, version, updated_at
       )
       SELECT model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost, reasoning_cost, input_price, output_price, cache_read_price, cache_write_price,
              reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, $1, updated_at
       FROM model_provider_pricings
       WHERE version = $2
         AND NOT EXISTS (
           SELECT 1 FROM model_provider_pricings_draft d
           WHERE d.model_id = model_provider_pricings.model_id
             AND d.provider_account_id = model_provider_pricings.provider_account_id
             AND d.provider_key_id = model_provider_pricings.provider_key_id
         )`,
      [version, currentVersion],
    );

    // 2. Insert all rows from draft into the new version
    if (draftCount > 0) {
      await client.query(
        `INSERT INTO model_provider_pricings (
           model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost, reasoning_cost, input_price, output_price, cache_read_price, cache_write_price,
           reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, version, updated_at
         )
         SELECT model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost, reasoning_cost, input_price, output_price, cache_read_price, cache_write_price,
                reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, $1, updated_at
         FROM model_provider_pricings_draft`,
        [version],
      );
      await client.query('DELETE FROM model_provider_pricings_draft');
    }

    await client.query(
      `UPDATE pricing_state
       SET current_version = $1, config_version = $2, updated_at = $3
       WHERE id = 1`,
      [version, configVersion, now],
    );
    await client.query(
      `INSERT INTO pricing_releases (version, status, summary, operator, created_at, config_version)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
      [version, 'published', JSON.stringify({ source: 'pricing_center', previous_version: currentVersion }), operator, now, configVersion],
    );
    await client.query('COMMIT');
    // Notify Gateway to refresh pricing cache
    await pool.query("SELECT pg_notify('config_changed', 'pricing')");
    res.json({ status: 'published', version, config_version: configVersion, affected_models: affectedModels });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: `publish failed: ${error?.message || 'unknown_error'}` });
  } finally {
    client.release();
  }
});

router.get('/releases', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const { rows } = await pool.query(
    `SELECT version, status, summary, operator, created_at, config_version
     FROM pricing_releases
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  res.json(rows);
});

export default router;
