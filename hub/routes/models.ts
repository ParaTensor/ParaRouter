import {Router} from 'express';
import type {Request, Response} from 'express';
import { pool } from '../db';
import { requireRole } from '../middleware/auth';
import { ModelPayload } from '@pararouter/shared';
import {
  canonicalizeGlobalModelName,
  parsePrice,
  parseContextLength,
  normalizeProviderId,
  providerBaseUrls,
  mapPricingRow,
} from '../utils';

const router = Router();

function mapModel(row: any) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    description: row.description || '',
    context: row.context || '',
    pricing: {
      prompt: row.pricing_prompt || '$0.00',
      completion: row.pricing_completion || '$0.00',
    },
    tags: Array.isArray(row.tags) ? row.tags : [],
    isPopular: row.is_popular,
    latency: row.latency || '0.0s',
    status: row.status || 'online',
  };
}

async function upsertModel(model: ModelPayload) {
  await pool.query(
    `INSERT INTO models (id, name, provider, description, context, pricing_prompt, pricing_completion, tags, is_popular, latency, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
     ON CONFLICT (id)
     DO UPDATE SET
       name = EXCLUDED.name,
       provider = EXCLUDED.provider,
       description = EXCLUDED.description,
       context = EXCLUDED.context,
       pricing_prompt = EXCLUDED.pricing_prompt,
       pricing_completion = EXCLUDED.pricing_completion,
       tags = EXCLUDED.tags,
       is_popular = EXCLUDED.is_popular,
       latency = EXCLUDED.latency,
       status = EXCLUDED.status`,
    [
      model.id,
      model.name,
      model.provider,
      model.description || '',
      model.context || '',
      model.pricing?.prompt || '$0.00',
      model.pricing?.completion || '$0.00',
      JSON.stringify(model.tags || []),
      Boolean(model.isPopular),
      model.latency || '0.0s',
      model.status || 'online',
    ],
  );
}

async function upsertModelMetadataFromModel(model: ModelPayload) {
  const displayName = canonicalizeGlobalModelName(model.id, model.provider, model.name);
  await pool.query(
    `INSERT INTO llm_models (id, name, description, context_length, global_pricing, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (id)
     DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       context_length = EXCLUDED.context_length,
       global_pricing = EXCLUDED.global_pricing,
       updated_at = EXCLUDED.updated_at`,
    [
      model.id,
      displayName,
      model.description || '',
      parseContextLength(model.context),
      JSON.stringify({
        prompt: parsePrice(model.pricing?.prompt),
        completion: parsePrice(model.pricing?.completion),
        cache_read: parsePrice(model.pricing?.cache_read),
        cache_write: parsePrice(model.pricing?.cache_write),
        reasoning: parsePrice(model.pricing?.reasoning),
      }),
      Date.now(),
    ],
  );
}

async function rebuildProviderTypesFromModels() {
  const { rows } = await pool.query(
    `SELECT id, name, provider, description, context, pricing_prompt, pricing_completion
     FROM models
     ORDER BY provider ASC, name ASC`,
  );

  const grouped = new Map<
    string,
    {
      label: string;
      models: Array<{
        id: string;
        name: string;
        description: string;
        context_length: number | null;
        input_price: number | null;
        output_price: number | null;
      }>;
    }
  >();

  for (const row of rows) {
    const id = normalizeProviderId(row.provider || 'unknown');
    if (!grouped.has(id)) {
      grouped.set(id, { label: row.provider || id, models: [] });
    }
    const contextLength = Number(String(row.context || '').replace(/[^0-9]/g, ''));
    grouped.get(id)!.models.push({
      id: row.id,
      name: row.name,
      description: row.description || '',
      context_length: Number.isFinite(contextLength) && contextLength > 0 ? contextLength : null,
      input_price: parsePrice(row.pricing_prompt),
      output_price: parsePrice(row.pricing_completion),
    });
  }

  for (const [id, entry] of grouped) {
    await pool.query(
      `INSERT INTO provider_types (id, label, base_url, driver_type, models, enabled, sort_order, docs_url, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       ON CONFLICT (id)
       DO UPDATE SET
         label = EXCLUDED.label,
         base_url = EXCLUDED.base_url,
         driver_type = EXCLUDED.driver_type,
         models = EXCLUDED.models,
         enabled = EXCLUDED.enabled,
         sort_order = EXCLUDED.sort_order,
         docs_url = EXCLUDED.docs_url,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        entry.label,
        providerBaseUrls[id] || '',
        'openai_compatible',
        JSON.stringify(entry.models),
        true,
        0,
        null,
        Date.now(),
      ],
    );
  }
}

/** 已发布路由的模型列表；供登录页与首页与 /models 一致的数据源（匿名可读）。 */
export async function listPublishedRoutedModels(_req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const stateResult = await client.query('SELECT current_version FROM pricing_state WHERE id = 1');
    const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';

    const { rows } = await client.query(
      `WITH ranked_routes AS (
         SELECT
           mpp.model_id,
           COALESCE(mpp.public_model_id, mpp.model_id) AS public_model_id,
           mpp.provider_account_id,
           mpp.provider_key_id,
           mpp.provider_model_id,
           mpp.price_mode,
           mpp.input_price,
           mpp.output_price,
           mpp.cache_read_price,
           mpp.cache_write_price,
           mpp.reasoning_price,
           mpp.markup_rate,
           mpp.is_top_provider,
           mpp.context_length,
           mpp.latency_ms,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(mpp.public_model_id, mpp.model_id)
             ORDER BY
               CASE
                 WHEN COALESCE(pak.health_status, 'unknown') <> 'unhealthy' THEN 0
                 ELSE 1
               END ASC,
               mpp.is_top_provider DESC,
               mpp.input_price ASC NULLS LAST,
               mpp.provider_account_id ASC,
               mpp.provider_key_id ASC
           ) AS route_rank
         FROM model_provider_pricings mpp
         JOIN provider_api_keys pak ON pak.id = mpp.provider_key_id
         WHERE mpp.version = $1
           AND mpp.status = 'online'
           AND pak.status = 'active'
       )
       SELECT
         rr.public_model_id as id,
         rr.model_id,
         lm.name,
         pa.label as provider_label,
         rr.provider_account_id,
         rr.provider_key_id,
         rr.provider_model_id,
         lm.description,
         COALESCE(rr.context_length, lm.context_length) as context_length,
         rr.price_mode,
         rr.markup_rate,
         rr.input_price,
         rr.output_price,
         rr.cache_read_price,
         rr.cache_write_price,
         rr.reasoning_price,
         rr.latency_ms,
         lm.global_pricing
       FROM ranked_routes rr
       JOIN llm_models lm ON rr.model_id = lm.id
       JOIN provider_accounts pa ON rr.provider_account_id = pa.id
       WHERE rr.route_rank = 1
       ORDER BY lm.name ASC, rr.public_model_id ASC`,
      [currentVersion]
    );

    const models = rows.map((row) => {
      const getVal = (field: string, globalField: string) => {
        if (row.price_mode === 'fixed') {
          return row[field];
        }
        const base = row.global_pricing?.[globalField];
        if (typeof base === 'number' && typeof row.markup_rate === 'number') {
          return base * (1 + row.markup_rate);
        }
        return null;
      };

      const format = (v: number | null) => (typeof v === 'number' ? `$${v.toFixed(2)}` : null);

      return {
        id: row.id,
        global_model_id: row.model_id,
        provider_account_id: row.provider_account_id,
        provider_key_id: row.provider_key_id,
        name: row.name,
        provider: row.provider_label,
        description: row.description || '',
        context: row.context_length ? (row.context_length >= 1000 ? `${Math.round(row.context_length / 1000)}k` : row.context_length) : '',
        pricing: {
          prompt: format(getVal('input_price', 'prompt')) || '$0.00',
          completion: format(getVal('output_price', 'completion')) || '$0.00',
          cache_read: format(getVal('cache_read_price', 'cache_read')),
          cache_write: format(getVal('cache_write_price', 'cache_write')),
          reasoning: format(getVal('reasoning_price', 'reasoning')),
        },
        tags: [], // Could be derived from lm.tags if we add them to llm_models
        isPopular: false,
        latency: row.latency_ms ? `${(row.latency_ms / 1000).toFixed(1)}s` : '0.0s',
        status: 'online',
      };
    });

    res.json(models);
  } catch (error) {
    console.error('Failed to fetch models for home page:', error);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
}

router.get('/', listPublishedRoutedModels);

router.post('/sync', requireRole('admin'), async (req, res) => {
  const models = Array.isArray(req.body?.models) ? (req.body.models as ModelPayload[]) : [];
  for (const model of models) {
    await upsertModel(model);
    await upsertModelMetadataFromModel(model);
  }
  await rebuildProviderTypesFromModels();
  res.json({ status: 'synced', count: models.length });
});

router.get('/:modelId/providers', requireRole('admin'), async (req, res) => {
  const modelId = decodeURIComponent(String(req.params.modelId || '')).trim();
  if (!modelId) return res.status(400).json({ error: 'modelId required' });
  const stateResult = await pool.query('SELECT current_version FROM pricing_state WHERE id = 1');
  const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';
  const [draftResult, publishedResult] = await Promise.all([
    pool.query(
      `SELECT model_id, public_model_id, provider_account_id, provider_key_id, provider_model_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
              reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, updated_at
       FROM model_provider_pricings_draft
       WHERE COALESCE(public_model_id, model_id) = $1
       ORDER BY provider_account_id ASC, provider_key_id ASC`,
      [modelId],
    ),
    pool.query(
      `SELECT model_id, public_model_id, provider_account_id, provider_key_id, provider_model_id, price_mode, input_price, output_price, cache_read_price, cache_write_price,
              reasoning_price, markup_rate, currency, context_length, latency_ms, is_top_provider, status, version, updated_at
       FROM model_provider_pricings
       WHERE COALESCE(public_model_id, model_id) = $1 AND version = $2
       ORDER BY provider_account_id ASC, provider_key_id ASC`,
      [modelId, currentVersion],
    ),
  ]);
  const draftKeys = new Set(
    draftResult.rows.map((r) => `${r.model_id}::${r.provider_account_id}::${r.provider_key_id}`),
  );
  const merged = [
    ...draftResult.rows.map((r) => ({ ...mapPricingRow(r), row_status: 'Draft' })),
    ...publishedResult.rows
      .filter((r) => !draftKeys.has(`${r.model_id}::${r.provider_account_id}::${r.provider_key_id}`))
      .map((r) => ({ ...mapPricingRow(r), row_status: 'Published' })),
  ];
  res.json({ model_id: modelId, version: currentVersion, rows: merged });
});

router.get('/:modelId/routing', requireRole('admin'), async (req, res) => {
  const modelId = decodeURIComponent(String(req.params.modelId || '')).trim();
  if (!modelId) return res.status(400).json({ error: 'modelId required' });
  const stateResult = await pool.query('SELECT current_version FROM pricing_state WHERE id = 1');
  const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';
  const { rows } = await pool.query(
    `SELECT provider_account_id, provider_key_id, provider_model_id, COALESCE(public_model_id, model_id) AS public_model_id, is_top_provider, latency_ms, status
     FROM model_provider_pricings
     WHERE COALESCE(public_model_id, model_id) = $1 AND version = $2
     ORDER BY is_top_provider DESC, provider_account_id ASC, provider_key_id ASC`,
    [modelId, currentVersion],
  );
  res.json({ model_id: modelId, version: currentVersion, providers: rows });
});

router.put('/:modelId/routing', requireRole('admin'), async (req, res) => {
  const modelId = decodeURIComponent(String(req.params.modelId || '')).trim();
  const providerAccountId = String(req.body?.provider_account_id || '').trim();
  const providerKeyId = String(req.body?.provider_key_id || '').trim();
  const isTopProvider = Boolean(req.body?.is_top_provider);
  const status = req.body?.status != null ? String(req.body.status) : null;
  const latencyMs = req.body?.latency_ms != null ? Number(req.body.latency_ms) : null;
  if (!modelId || !providerAccountId || !providerKeyId) {
    return res.status(400).json({ error: 'modelId, provider_account_id, and provider_key_id required' });
  }

  const stateResult = await pool.query('SELECT current_version FROM pricing_state WHERE id = 1');
  const currentVersion = stateResult.rows[0]?.current_version || 'bootstrap';

  await pool.query(
    `DELETE FROM model_provider_pricings_draft
     WHERE COALESCE(public_model_id, model_id) = $1
       AND (provider_account_id <> $2 OR provider_key_id <> $3)`,
    [modelId, providerAccountId, providerKeyId],
  );

  await pool.query(
    `INSERT INTO model_provider_pricings_draft (
       model_id, public_model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost,
       reasoning_cost, input_price, output_price, cache_read_price, cache_write_price, reasoning_price, markup_rate,
       currency, context_length, latency_ms, is_top_provider, status, provider_model_id, updated_at
     )
     SELECT model_id, public_model_id, provider_account_id, provider_key_id, price_mode, input_cost, output_cost, cache_read_cost, cache_write_cost,
            reasoning_cost, input_price, output_price, cache_read_price, cache_write_price, reasoning_price, markup_rate,
            currency, context_length, latency_ms, is_top_provider, status, provider_model_id, updated_at
     FROM model_provider_pricings
     WHERE COALESCE(public_model_id, model_id) = $1 AND version = $2 AND provider_account_id = $3 AND provider_key_id = $4
     ON CONFLICT (model_id, provider_account_id, provider_key_id) DO NOTHING`,
    [modelId, currentVersion, providerAccountId, providerKeyId],
  );

  if (isTopProvider) {
    await pool.query(
      `UPDATE model_provider_pricings_draft
       SET is_top_provider = false, updated_at = $3
       WHERE COALESCE(public_model_id, model_id) = $1 AND (provider_account_id <> $2 OR provider_key_id <> $4)`,
      [modelId, providerAccountId, Date.now(), providerKeyId],
    );
  }
  await pool.query(
    `UPDATE model_provider_pricings_draft
     SET is_top_provider = $3,
         status = COALESCE($4, status),
         latency_ms = COALESCE($5, latency_ms),
         updated_at = $6
     WHERE COALESCE(public_model_id, model_id) = $1 AND provider_account_id = $2 AND provider_key_id = $7`,
    [modelId, providerAccountId, isTopProvider, status, latencyMs, Date.now(), providerKeyId],
  );
  res.json({ status: 'saved' });
});

export default router;
