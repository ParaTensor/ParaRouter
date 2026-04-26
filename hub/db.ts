import { Pool } from 'pg';
import { canonicalizeGlobalModelName, hashPassword } from './utils';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pararouter';
export const pool = new Pool({ connectionString: databaseUrl });

export async function initSchema() {
  const schemaPath = path.resolve(__dirname, '../packages/shared/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schemaSql);

  await pool.query(
    `INSERT INTO pricing_state (id, current_version, config_version, updated_at)
     VALUES (1, 'bootstrap', 1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [Date.now()],
  );

  await pool.query(
    `INSERT INTO users (id, username, email, display_name, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'admin', 'active', $6, $7)
     ON CONFLICT (username) DO NOTHING`,
    [
      'local-admin',
      'admin',
      'admin@pararouter.com',
      'ParaRouter Admin',
      hashPassword('admin123'),
      Date.now(),
      Date.now(),
    ],
  );
  
  // Group Support Migrations
  // Since we are moving to Key-centric pricing, we will bypass the old price_group columns
  // Note: Local postgres wiping script will run to wipe the tables so no alter table needed

  try {
    // model_provider_pricings
    await pool.query(`ALTER TABLE model_provider_pricings DROP CONSTRAINT IF EXISTS model_provider_pricings_pkey`);
    await pool.query(`ALTER TABLE model_provider_pricings ADD PRIMARY KEY (model_id, provider_account_id, provider_key_id, version)`);
  } catch (err: any) { console.error('Migration failed (pricings pkey):', err.message); }

  try {
    // model_provider_pricings_draft
    await pool.query(`ALTER TABLE model_provider_pricings_draft DROP CONSTRAINT IF EXISTS model_provider_pricings_draft_pkey`);
    await pool.query(`ALTER TABLE model_provider_pricings_draft ADD PRIMARY KEY (model_id, provider_account_id, provider_key_id)`);
  } catch (err: any) { console.error('Migration failed (pricings_draft pkey):', err.message); }

  const defaultLlmModels = [
    // OpenAI Models
    { id: 'gpt-5.4', name: 'gpt-5.4', provider: 'OpenAI', description: "OpenAI Flagship", category: 'Creative', context_length: 200000, global_pricing: { prompt: 2.50, completion: 15.00, cache_read: 0.25 }, score: 98.2, trend: 'up' },
    { id: 'gpt-5.5', name: 'gpt-5.5', provider: 'OpenAI', description: "OpenAI Flagship", category: 'Creative', context_length: 200000, global_pricing: { prompt: 5.00, completion: 30.00, cache_read: 0.50 }, score: 99.2, trend: 'up' },
    { id: 'gpt-5.4-mini', name: 'gpt-5.4-mini', provider: 'OpenAI', description: "OpenAI Fast & Affordable", category: 'Coding', context_length: 200000, global_pricing: { prompt: 0.75, completion: 4.50, cache_read: 0.075 }, score: 92.1, trend: 'stable' },
    { id: 'gpt-5.4-nano', name: 'gpt-5.4-nano', provider: 'OpenAI', description: "OpenAI Lowest latency and cost", category: 'Coding', context_length: 200000, global_pricing: { prompt: 0.20, completion: 1.25, cache_read: 0.02 }, score: 85.5, trend: 'stable' },
    { id: 'gpt-5.4-pro', name: 'gpt-5.4-pro', provider: 'OpenAI', description: "OpenAI Professional", category: 'Creative', context_length: 200000, global_pricing: { prompt: 30.00, completion: 180.00 }, score: 98.5, trend: 'up' },
    
    { id: 'gpt-5.2', name: 'gpt-5.2', description: "Previous generation", category: 'Creative', context_length: 128000, global_pricing: { prompt: 1.75, completion: 14.00, cache_read: 0.175 } },
    { id: 'gpt-5.2-pro', name: 'gpt-5.2-pro', description: "Previous generation Professional", category: 'Creative', context_length: 128000, global_pricing: { prompt: 21.00, completion: 168.00 } },
    
    { id: 'o4-mini', name: 'o4-mini', description: "Reasoning Mini", category: 'Reasoning', context_length: 200000, global_pricing: { prompt: 1.10, completion: 4.40, cache_read: 0.275, reasoning: 4.40 } },
    { id: 'o3', name: 'o3', description: "Reasoning Legacy", category: 'Reasoning', context_length: 200000, global_pricing: { prompt: 2.00, completion: 8.00, cache_read: 0.50, reasoning: 8.00 } },
    { id: 'o3-mini', name: 'o3-mini', description: "Reasoning Legacy Mini", category: 'Reasoning', context_length: 200000, global_pricing: { prompt: 1.10, completion: 4.40, cache_read: 0.55, reasoning: 4.40 } },
    
    // Anthropic Models
    { id: 'claude-opus-4-7', name: 'claude-opus-4-7', provider: 'Anthropic', description: "Advanced software engineering and agents; stronger instruction following, self-verification, and vision (images up to 2,576px on the long edge)", category: 'Reasoning', context_length: 200000, global_pricing: { prompt: 5.00, completion: 25.00, cache_read: 0.50, cache_write: 6.25 }, score: 99.0, trend: 'up' },
    { id: 'claude-opus-4-6', name: 'claude-opus-4-6', provider: 'Anthropic', description: "Most capable model for complex reasoning and agents", category: 'Reasoning', context_length: 200000, global_pricing: { prompt: 5.00, completion: 25.00, cache_read: 0.50, cache_write: 6.25 }, score: 98.7, trend: 'up' },
    { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', provider: 'Anthropic', description: "Advanced intelligence at higher speed", category: 'Coding', context_length: 200000, global_pricing: { prompt: 3.00, completion: 15.00, cache_read: 0.30, cache_write: 3.75, reasoning: 15.00 }, score: 94.8, trend: 'up' },
    { id: 'claude-haiku-4-5', name: 'claude-haiku-4-5', provider: 'Anthropic', description: "Fastest Claude model for swift responses", category: 'Coding', context_length: 200000, global_pricing: { prompt: 1.00, completion: 5.00, cache_read: 0.10, cache_write: 1.25 }, score: 88.0, trend: 'up' },

    // Google Gemini Models
    { id: 'gemini-3.1-pro-preview', name: 'gemini-3.1-pro-preview', provider: 'Google', description: "Latest intelligence improvements for multimodal and vibe-coding", category: 'Reasoning', context_length: 2000000, global_pricing: { prompt: 2.00, completion: 12.00, cache_read: 0.20 }, score: 95.5, trend: 'up' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'gemini-3.1-flash-lite-preview', provider: 'Google', description: "Most cost-efficient model for high-volume tasks", category: 'Coding', context_length: 1048576, global_pricing: { prompt: 0.25, completion: 1.50, cache_read: 0.025 }, score: 87.0, trend: 'stable' },
    { id: 'gemini-3-flash-preview', name: 'gemini-3-flash-preview', provider: 'Google', description: "Built for speed and frontier intelligence", category: 'Coding', context_length: 1000000, global_pricing: { prompt: 0.50, completion: 3.00, cache_read: 0.05 }, score: 89.0, trend: 'stable' }
  ];

  for (const m of defaultLlmModels) {
    const displayName = canonicalizeGlobalModelName(m.id, (m as any).provider, m.name);
    await pool.query(
      `INSERT INTO llm_models (id, name, provider, description, context_length, global_pricing, score, trend, category, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         provider = EXCLUDED.provider,
         description = EXCLUDED.description,
         context_length = EXCLUDED.context_length,
         global_pricing = EXCLUDED.global_pricing,
         score = EXCLUDED.score,
         trend = EXCLUDED.trend,
         category = EXCLUDED.category,
         updated_at = EXCLUDED.updated_at`,
      [m.id, displayName, (m as any).provider || null, m.description, m.context_length, JSON.stringify(m.global_pricing), (m as any).score || null, (m as any).trend || null, (m as any).category || null, Date.now()]
    );
  }
}
