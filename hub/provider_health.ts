import { pool } from './db';
import { sendEmail } from './utils';

type ProviderAccountRow = {
  id: string;
  provider_type: string;
  base_url: string;
  label: string;
};

type ProviderKeyRow = {
  id: string;
  provider_account_id: string;
  label: string;
  api_key: string;
  account_label: string;
  health_status: string | null;
  health_checked_at: number | null;
  health_last_ok_at: number | null;
  health_error: string | null;
  health_fail_count: number | null;
  health_alert_sent_at: number | null;
};

type ProbeTargetRow = {
  model_id: string;
  provider_model_id: string | null;
};

type CatalogTargetRow = {
  supported_models: unknown;
};

export type ProviderHealthCheckResult = {
  provider_account_id: string;
  provider_key_id: string;
  label: string;
  probe_model: string | null;
  ok: boolean;
  status: number;
  health_status: string;
  checked_at: number;
  error: string | null;
};

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const HEALTH_CHECK_TIMEOUT_MS = 25_000;
const HEALTH_ALERT_FAILURE_THRESHOLD = 1;

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === '' || parsed.pathname === '/') {
      parsed.pathname = '/v1';
      return parsed.toString().replace(/\/+$/, '');
    }
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return trimmed;
  }
}

function buildOpenAiEndpoint(baseUrl: string, path: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return '';
  return `${normalized}${path.startsWith('/') ? path : `/${path}`}`;
}

async function loadProbeTargets(providerAccountId: string, providerKeyId: string) {
  const stateResult = await pool.query(
    'SELECT current_version FROM pricing_state WHERE id = 1',
  );
  const currentVersion = String(stateResult.rows[0]?.current_version || 'bootstrap');
  const { rows } = await pool.query<ProbeTargetRow>(
    `SELECT model_id, provider_model_id
     FROM model_provider_pricings
     WHERE provider_account_id = $1
       AND provider_key_id = $2
       AND version = $3
       AND status = 'online'
     ORDER BY is_top_provider DESC, input_price ASC NULLS LAST, model_id ASC`,
    [providerAccountId, providerKeyId, currentVersion],
  );
  if (rows.length > 0) {
    return rows;
  }

  const catalogRows = await pool.query<CatalogTargetRow>(
    `SELECT COALESCE(supported_models, '[]'::jsonb) AS supported_models
     FROM provider_api_keys
     WHERE id = $1 AND provider_account_id = $2 AND status = 'active'
     LIMIT 1`,
    [providerKeyId, providerAccountId],
  );
  const supportedModels = Array.isArray(catalogRows.rows[0]?.supported_models)
    ? catalogRows.rows[0].supported_models.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return supportedModels.map((model_id) => ({ model_id, provider_model_id: null }));
}

async function probeOpenAiCompatible(baseUrl: string, apiKey: string, model: string) {
  const url = buildOpenAiEndpoint(baseUrl, '/chat/completions');
  if (!url) {
    return { ok: false, status: 500, error: 'invalid base url' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        max_tokens: 16,
        stream: false,
      }),
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : body.slice(0, 500),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeAnthropic(baseUrl: string, apiKey: string, model: string) {
  const url = buildOpenAiEndpoint(baseUrl, '/messages');
  if (!url) {
    return { ok: false, status: 500, error: 'invalid base url' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Reply with exactly: ok' }],
          },
        ],
      }),
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : body.slice(0, 500),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function alertAdmins(params: {
  providerAccountId: string;
  providerLabel: string;
  providerKeyLabel: string;
  probeModel: string | null;
  error: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('Provider health alert skipped: RESEND_API_KEY is not configured');
    return;
  }

  const { rows } = await pool.query<{ email: string }>(
    `SELECT email
     FROM users
     WHERE role = 'admin' AND status = 'active'
       AND email IS NOT NULL AND email <> ''
     ORDER BY created_at ASC`,
  );
  const recipients = rows.map((row) => row.email).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('Provider health alert skipped: no active admin recipients');
    return;
  }

  const subject = `[ParaRouter] Provider unhealthy: ${params.providerAccountId}/${params.providerKeyLabel}`;
  const html = `
    <p>Provider health check failed.</p>
    <ul>
      <li><strong>Provider account</strong>: ${params.providerAccountId} (${params.providerLabel})</li>
      <li><strong>Provider key</strong>: ${params.providerKeyLabel}</li>
      <li><strong>Probe model</strong>: ${params.probeModel || 'n/a'}</li>
      <li><strong>Error</strong>: ${escapeHtml(params.error)}</li>
    </ul>
  `;

  await sendEmail({
    to: recipients,
    subject,
    html,
    text: [
      'Provider health check failed.',
      `Provider account: ${params.providerAccountId} (${params.providerLabel})`,
      `Provider key: ${params.providerKeyLabel}`,
      `Probe model: ${params.probeModel || 'n/a'}`,
      `Error: ${params.error}`,
    ].join('\n'),
  });
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function runProbeForKey(row: ProviderAccountRow & ProviderKeyRow, probeTarget: ProbeTargetRow | null): Promise<ProviderHealthCheckResult> {
  const checkedAt = Date.now();
  const providerType = String(row.provider_type || '').trim().toLowerCase();
  const probeModel = probeTarget ? (probeTarget.provider_model_id?.trim() || probeTarget.model_id) : null;
  const previousHealthStatus = String(row.health_status || 'unknown').toLowerCase();

  if (!probeModel) {
    const error = 'No active model mapping found for this provider key';
    await pool.query(
      `UPDATE provider_api_keys
       SET health_status = 'unhealthy',
           health_checked_at = $2,
           health_error = $3,
           health_fail_count = COALESCE(health_fail_count, 0) + 1,
           updated_at = $2
       WHERE id = $1`,
      [row.id, checkedAt, error],
    );
    if (previousHealthStatus !== 'unhealthy') {
      await pool.query(
        `UPDATE provider_api_keys
         SET health_alert_sent_at = $2
         WHERE id = $1`,
        [row.id, checkedAt],
      );
      await alertAdmins({
        providerAccountId: row.provider_account_id,
        providerLabel: row.account_label,
        providerKeyLabel: row.label,
        probeModel: null,
        error,
      });
    }
    return {
      provider_account_id: row.provider_account_id,
      provider_key_id: row.id,
      label: row.label,
      probe_model: null,
      ok: false,
      status: 500,
      health_status: 'unhealthy',
      checked_at: checkedAt,
      error,
    };
  }

  const probe = providerType === 'anthropic'
    ? await probeAnthropic(row.base_url, row.api_key, probeModel)
    : await probeOpenAiCompatible(row.base_url, row.api_key, probeModel);

  if (probe.ok) {
    await pool.query(
      `UPDATE provider_api_keys
       SET health_status = 'healthy',
           health_checked_at = $2,
           health_last_ok_at = $2,
           health_error = NULL,
           health_fail_count = 0,
           health_alert_sent_at = NULL,
           updated_at = $2
       WHERE id = $1`,
      [row.id, checkedAt],
    );
    return {
      provider_account_id: row.provider_account_id,
      provider_key_id: row.id,
      label: row.label,
      probe_model: probeModel,
      ok: true,
      status: probe.status,
      health_status: 'healthy',
      checked_at: checkedAt,
      error: null,
    };
  }

  const error = probe.error || `HTTP ${probe.status}`;
  await pool.query(
    `UPDATE provider_api_keys
     SET health_status = 'unhealthy',
         health_checked_at = $2,
         health_error = $3,
         health_fail_count = COALESCE(health_fail_count, 0) + 1,
         updated_at = $2
     WHERE id = $1`,
    [row.id, checkedAt, error],
  );

  if (previousHealthStatus !== 'unhealthy') {
    await pool.query(
      `UPDATE provider_api_keys
       SET health_alert_sent_at = $2
       WHERE id = $1`,
      [row.id, checkedAt],
    );
    await alertAdmins({
      providerAccountId: row.provider_account_id,
      providerLabel: row.account_label,
      providerKeyLabel: row.label,
      probeModel,
      error,
    });
  }

  return {
    provider_account_id: row.provider_account_id,
    provider_key_id: row.id,
    label: row.label,
    probe_model: probeModel,
    ok: false,
    status: probe.status,
    health_status: 'unhealthy',
    checked_at: checkedAt,
    error,
  };
}

export async function runProviderHealthChecks(providerAccountId?: string) {
  const params: unknown[] = [];
  const providerFilter = providerAccountId ? 'AND k.provider_account_id = $1' : '';
  if (providerAccountId) params.push(providerAccountId);

  const { rows } = await pool.query<ProviderAccountRow & ProviderKeyRow>(
    `SELECT
       k.id,
       k.provider_account_id,
       k.label,
       k.api_key,
       a.label AS account_label,
       COALESCE(k.health_status, 'unknown') AS health_status,
       k.health_checked_at,
       k.health_last_ok_at,
       k.health_error,
       k.health_fail_count,
       k.health_alert_sent_at,
       a.provider_type,
       a.base_url,
       a.label AS account_label
     FROM provider_api_keys k
     JOIN provider_accounts a ON a.id = k.provider_account_id
     WHERE k.status = 'active'
       ${providerFilter}
     ORDER BY k.provider_account_id ASC, k.label ASC, k.id ASC`,
    params,
  );

  const results: ProviderHealthCheckResult[] = [];
  for (const row of rows) {
    const targets = await loadProbeTargets(row.provider_account_id, row.id);
    const probeTarget = targets[0] || null;
    results.push(await runProbeForKey(row, probeTarget));
  }

  return results;
}

export function startProviderHealthMonitor() {
  const runOnce = () => {
    runProviderHealthChecks().catch((error) => {
      console.error('Provider health monitor failed:', error);
    });
  };

  void runOnce();
  const timer = setInterval(runOnce, HEALTH_CHECK_INTERVAL_MS);
  return () => clearInterval(timer);
}
