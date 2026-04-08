import { Pool } from 'pg';
import { hashPassword } from './utils';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/openhub';
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
    // OpenAI Models from developers.openai.com 2026 (Verified via User Screenshot)
    { id: 'gpt-5.4', name: 'GPT-5.4', description: "OpenAI Flagship", context_length: 200000, global_pricing: { prompt: 2.50, completion: 15.00, cache_read: 0.25 } },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', description: "OpenAI Fast & Affordable", context_length: 200000, global_pricing: { prompt: 0.75, completion: 4.50, cache_read: 0.075 } },
    { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', description: "OpenAI Lowest latency and cost", context_length: 200000, global_pricing: { prompt: 0.20, completion: 1.25, cache_read: 0.02 } },
    { id: 'gpt-5.4-pro', name: 'GPT-5.4 Pro', description: "OpenAI Professional", context_length: 200000, global_pricing: { prompt: 30.00, completion: 180.00 } },
    
    { id: 'gpt-5.2', name: 'GPT-5.2', description: "Previous generation", context_length: 128000, global_pricing: { prompt: 1.75, completion: 14.00, cache_read: 0.175 } },
    { id: 'gpt-5.2-pro', name: 'GPT-5.2 Pro', description: "Previous generation Professional", context_length: 128000, global_pricing: { prompt: 21.00, completion: 168.00 } },
    
    { id: 'gpt-5.1', name: 'GPT-5.1', description: "Legacy", context_length: 128000, global_pricing: { prompt: 1.25, completion: 10.00, cache_read: 0.125 } },
    { id: 'gpt-5', name: 'GPT-5', description: "Legacy GPT-5", context_length: 128000, global_pricing: { prompt: 1.25, completion: 10.00, cache_read: 0.125 } },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: "Legacy Mini", context_length: 128000, global_pricing: { prompt: 0.25, completion: 2.00, cache_read: 0.025 } },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano', description: "Legacy Nano", context_length: 128000, global_pricing: { prompt: 0.05, completion: 0.40, cache_read: 0.005 } },
    { id: 'gpt-5-pro', name: 'GPT-5 Pro', description: "Legacy Professional", context_length: 128000, global_pricing: { prompt: 15.00, completion: 120.00 } },
    
    { id: 'gpt-4.1', name: 'GPT-4.1', description: "Legacy GPT-4.1", context_length: 128000, global_pricing: { prompt: 2.00, completion: 8.00, cache_read: 0.50 } },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', description: "Legacy GPT-4.1 Mini", context_length: 128000, global_pricing: { prompt: 0.40, completion: 1.60, cache_read: 0.10 } },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', description: "Legacy GPT-4.1 Nano", context_length: 128000, global_pricing: { prompt: 0.10, completion: 0.40, cache_read: 0.025 } },
    
    { id: 'gpt-4o', name: 'GPT-4o', description: "Legacy Flagship", context_length: 128000, global_pricing: { prompt: 2.50, completion: 10.00, cache_read: 1.25 } },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: "Legacy Small", context_length: 128000, global_pricing: { prompt: 0.15, completion: 0.60, cache_read: 0.075 } },
    
    { id: 'o4-mini', name: 'o4-mini', description: "Reasoning Mini", context_length: 200000, global_pricing: { prompt: 1.10, completion: 4.40, cache_read: 0.275, reasoning: 4.40 } },
    { id: 'o3', name: 'o3', description: "Reasoning Legacy", context_length: 200000, global_pricing: { prompt: 2.00, completion: 8.00, cache_read: 0.50, reasoning: 8.00 } },
    { id: 'o3-mini', name: 'o3-mini', description: "Reasoning Legacy Mini", context_length: 200000, global_pricing: { prompt: 1.10, completion: 4.40, cache_read: 0.55, reasoning: 4.40 } },
    
    // Anthropic Models from docs.anthropic.com 2026 (Verified via User Screenshot)
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', description: "Most capable model for complex reasoning and agents", context_length: 200000, global_pricing: { prompt: 5.00, completion: 25.00, cache_read: 0.50, cache_write: 6.25 } },
    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', description: "Previous generation Opus", context_length: 300000, global_pricing: { prompt: 5.00, completion: 25.00, cache_read: 0.50, cache_write: 6.25 } },
    { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', description: "Legacy Opus", context_length: 300000, global_pricing: { prompt: 15.00, completion: 75.00, cache_read: 1.50, cache_write: 18.75 } },
    { id: 'claude-opus-4', name: 'Claude Opus 4', description: "Legacy Opus", context_length: 300000, global_pricing: { prompt: 15.00, completion: 75.00, cache_read: 1.50, cache_write: 18.75 } },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: "Advanced intelligence at higher speed", context_length: 200000, global_pricing: { prompt: 3.00, completion: 15.00, cache_read: 0.30, cache_write: 3.75, reasoning: 15.00 } },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', description: "Previous generation Sonnet", context_length: 300000, global_pricing: { prompt: 3.00, completion: 15.00, cache_read: 0.30, cache_write: 3.75 } },
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', description: "Legacy Sonnet", context_length: 300000, global_pricing: { prompt: 3.00, completion: 15.00, cache_read: 0.30, cache_write: 3.75 } },
    { id: 'claude-sonnet-3-7', name: 'Claude Sonnet 3.7', description: "Deprecated Sonnet", context_length: 200000, global_pricing: { prompt: 3.00, completion: 15.00, cache_read: 0.30, cache_write: 3.75 } },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', description: "Fastest Claude model for swift responses", context_length: 200000, global_pricing: { prompt: 1.00, completion: 5.00, cache_read: 0.10, cache_write: 1.25 } },
    { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', description: "Legacy Haiku", context_length: 200000, global_pricing: { prompt: 0.80, completion: 4.00, cache_read: 0.08, cache_write: 1.00 } },
    { id: 'claude-opus-3', name: 'Claude Opus 3', description: "Deprecated Opus", context_length: 200000, global_pricing: { prompt: 15.00, completion: 75.00, cache_read: 1.50, cache_write: 18.75 } },
    { id: 'claude-haiku-3', name: 'Claude Haiku 3', description: "Deprecated Haiku", context_length: 200000, global_pricing: { prompt: 0.25, completion: 1.25, cache_read: 0.03, cache_write: 0.30 } },

    // Google Gemini Models from ai.google.dev 2026 (Verified via User Screenshot)
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', description: "Latest intelligence improvements for multimodal and vibe-coding", context_length: 2000000, global_pricing: { prompt: 2.00, completion: 12.00, cache_read: 0.20 } },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', description: "Most cost-efficient model for high-volume tasks", context_length: 1048576, global_pricing: { prompt: 0.25, completion: 1.50, cache_read: 0.025 } },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', description: "Built for speed and frontier intelligence", context_length: 1000000, global_pricing: { prompt: 0.50, completion: 3.00, cache_read: 0.05 } },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: "Multipurpose model for complex reasoning", context_length: 2000000, global_pricing: { prompt: 1.25, completion: 5.00, cache_read: 0.3125 } },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: "Hybrid reasoning model with thinking budgets", context_length: 1048576, global_pricing: { prompt: 0.10, completion: 0.40, cache_read: 0.025 } }
  ];

  for (const m of defaultLlmModels) {
    await pool.query(
      `INSERT INTO llm_models (id, name, description, context_length, global_pricing, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         context_length = EXCLUDED.context_length,
         global_pricing = EXCLUDED.global_pricing,
         updated_at = EXCLUDED.updated_at`,
      [m.id, m.name, m.description, m.context_length, JSON.stringify(m.global_pricing), Date.now()]
    );
  }
}
