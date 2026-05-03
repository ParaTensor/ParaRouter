import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'crypto';
import { AuthSessionResponse, AuthUser } from './types';

export const providerBaseUrls: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  mistral: 'https://api.mistral.ai/v1',
  meta: 'https://api.meta.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
};

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expected] = parts;
  const derived = scryptSync(password, salt, 64).toString('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(derived, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeUsername(username: string) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

export function generateVerificationCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function toAuthSessionResponse(token: string, user: AuthUser): AuthSessionResponse {
  return {
    token,
    user: {
      uid: user.id,
      username: user.username,
      email: user.email,
      displayName: user.display_name || user.username,
      role: user.role,
      balance: user.balance,
    },
  };
}

export async function sendRegisterVerificationEmail(email: string, code: string) {
  await sendEmail({
    to: [email],
    subject: 'ParaRouter registration verification code',
    html: `<p>Your ParaRouter verification code is:</p><h2>${code}</h2><p>This code will expire in 10 minutes.</p>`,
  });
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  const from = process.env.RESEND_FROM_EMAIL || 'ParaRouter <onboarding@pararouter.com>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend request failed: ${response.status} ${detail}`);
  }
}

export function normalizeProviderId(provider: string) {
  return provider
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeProviderBaseUrl(baseUrl: string, _driverType?: string | null) {
  const trimmed = String(baseUrl || '').trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    // Strip trailing slashes only; leave path decisions to the Gateway runtime.
    return url.toString().replace(/\/+$/, '');
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function canonicalizeGlobalModelName(
  modelId: string,
  provider?: string | null,
  fallbackName?: string | null,
) {
  const id = String(modelId || '').trim();
  const fallback = String(fallbackName || '').trim();
  if (!id) return fallback;

  const normalizedProvider = provider ? normalizeProviderId(provider) : '';
  const shouldUseRawId =
    normalizedProvider === 'openai' ||
    normalizedProvider === 'anthropic' ||
    normalizedProvider === 'google' ||
    id.startsWith('gpt-') ||
    /^o\d(?:$|[-.])/.test(id) ||
    id.startsWith('claude-') ||
    id.startsWith('gemini-');

  return shouldUseRawId ? id : fallback || id;
}

function modelIdFromCatalogItem(item: unknown): string {
  if (typeof item === 'string') {
    return item.trim();
  }
  if (!item || typeof item !== 'object') {
    return '';
  }
  const o = item as Record<string, unknown>;
  for (const key of ['id', 'model', 'name', 'model_id']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return '';
}

export function normalizeSupportedModels(raw: unknown) {
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown[] } | null)?.data)
      ? (raw as { data?: unknown[] }).data || []
      : Array.isArray((raw as { models?: unknown[] } | null)?.models)
        ? (raw as { models?: unknown[] }).models || []
        : Array.isArray((raw as { list?: unknown[] } | null)?.list)
          ? (raw as { list?: unknown[] }).list || []
          : [];

  const ids = new Set<string>();
  for (const item of items) {
    const normalized = modelIdFromCatalogItem(item);
    if (normalized) {
      ids.add(normalized);
    }
  }

  return Array.from(ids).sort((left, right) => left.localeCompare(right));
}

function hasSupportedModelShape(raw: unknown) {
  return (
    Array.isArray(raw) ||
    Array.isArray((raw as { data?: unknown[] } | null)?.data) ||
    Array.isArray((raw as { models?: unknown[] } | null)?.models) ||
    Array.isArray((raw as { list?: unknown[] } | null)?.list)
  );
}

function looksLikeHtmlPayload(contentType: string | null, rawBody: string) {
  const normalizedContentType = String(contentType || '').toLowerCase();
  const trimmed = rawBody.trim().toLowerCase();
  return (
    normalizedContentType.includes('text/html') ||
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html')
  );
}

function buildProviderModelCatalogUrls(normalizedBaseUrl: string) {
  const ordered: string[] = [];
  const add = (url: string) => {
    if (!ordered.includes(url)) {
      ordered.push(url);
    }
  };
  if (!/\/v\d+(?:beta\d+)?$/i.test(normalizedBaseUrl)) {
    add(`${normalizedBaseUrl}/v1/models`);
  }
  add(`${normalizedBaseUrl}/models`);
  if (!/\/api$/i.test(normalizedBaseUrl)) {
    add(`${normalizedBaseUrl}/api/models`);
  }
  return ordered;
}

const PROVIDER_MODEL_CATALOG_TIMEOUT_MS = 12_000;
const CATALOG_BODY_PREVIEW_MAX = 6000;

function truncateCatalogBodyPreview(raw: string): string {
  const s = raw.length > CATALOG_BODY_PREVIEW_MAX ? `${raw.slice(0, CATALOG_BODY_PREVIEW_MAX)}…(truncated)` : raw;
  return s;
}

export type ProviderCatalogFetchLogEntry = {
  url: string;
  http_status: number | null;
  outcome:
    | 'parsed'
    | 'html'
    | 'non_json'
    | 'http_error'
    | 'wrong_shape'
    | 'timeout'
    | 'network';
  message?: string;
  body_preview?: string;
};

export async function fetchProviderSupportedModelsWithLog(
  baseUrl: string,
  apiKey: string,
): Promise<{models: string[]; fetch_log: ProviderCatalogFetchLogEntry[]; error: string | null}> {
  const fetch_log: ProviderCatalogFetchLogEntry[] = [];
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
  const normalizedApiKey = String(apiKey || '').trim();
  if (!normalizedBaseUrl || !normalizedApiKey) {
    return {models: [], fetch_log, error: 'Missing base URL or API key'};
  }

  let lastError: Error | null = null;
  const urls = buildProviderModelCatalogUrls(normalizedBaseUrl);

  for (const modelsUrl of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_MODEL_CATALOG_TIMEOUT_MS);
    try {
      const response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${normalizedApiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      const rawBody = await response.text();
      const contentType = response.headers.get('content-type');
      let payload: unknown = null;

      if (looksLikeHtmlPayload(contentType, rawBody)) {
        const msg = `GET ${modelsUrl} returned HTML instead of a model catalog`;
        lastError = new Error(msg);
        fetch_log.push({
          url: modelsUrl,
          http_status: response.status,
          outcome: 'html',
          message: msg,
          body_preview: truncateCatalogBodyPreview(rawBody),
        });
        continue;
      }

      if (rawBody) {
        try {
          payload = JSON.parse(rawBody);
        } catch {
          const msg = `GET ${modelsUrl} returned non-JSON content`;
          lastError = new Error(msg);
          fetch_log.push({
            url: modelsUrl,
            http_status: response.status,
            outcome: 'non_json',
            message: msg,
            body_preview: truncateCatalogBodyPreview(rawBody),
          });
          continue;
        }
      }

      if (!response.ok) {
        const detail = payload == null ? '' : JSON.stringify(payload);
        const msg = `GET ${modelsUrl} failed: ${response.status}${detail ? ` ${detail}` : ''}`;
        lastError = new Error(msg);
        fetch_log.push({
          url: modelsUrl,
          http_status: response.status,
          outcome: 'http_error',
          message: msg,
          body_preview: truncateCatalogBodyPreview(rawBody || detail || ''),
        });
        continue;
      }

      if (!hasSupportedModelShape(payload)) {
        const msg = `GET ${modelsUrl} returned JSON without a supported model list`;
        lastError = new Error(msg);
        const preview =
          typeof payload === 'object' && payload !== null
            ? truncateCatalogBodyPreview(JSON.stringify(payload))
            : truncateCatalogBodyPreview(rawBody);
        fetch_log.push({
          url: modelsUrl,
          http_status: response.status,
          outcome: 'wrong_shape',
          message: msg,
          body_preview: preview,
        });
        continue;
      }

      const models = normalizeSupportedModels(payload);
      fetch_log.push({
        url: modelsUrl,
        http_status: response.status,
        outcome: 'parsed',
        message: `Parsed ${models.length} model id(s)`,
        body_preview: truncateCatalogBodyPreview(rawBody),
      });
      return {models, fetch_log, error: null};
    } catch (error) {
      const isAbort =
        (error instanceof Error && error.name === 'AbortError') ||
        (typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          (error as {name?: string}).name === 'AbortError');
      if (isAbort) {
        lastError = new Error(
          `GET ${modelsUrl} timed out after ${PROVIDER_MODEL_CATALOG_TIMEOUT_MS / 1000}s`,
        );
        fetch_log.push({
          url: modelsUrl,
          http_status: null,
          outcome: 'timeout',
          message: lastError.message,
        });
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
        fetch_log.push({
          url: modelsUrl,
          http_status: null,
          outcome: 'network',
          message: lastError.message,
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const errMsg = (lastError || new Error(`Failed to fetch supported models from ${normalizedBaseUrl}`)).message;
  return {models: [], fetch_log, error: errMsg};
}

export async function fetchProviderSupportedModels(baseUrl: string, apiKey: string) {
  const {models, error} = await fetchProviderSupportedModelsWithLog(baseUrl, apiKey);
  if (error) {
    throw new Error(error);
  }
  return models;
}

export function parsePrice(raw: string | undefined) {
  if (!raw) return null;
  const value = Number(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : null;
}

export function parseContextLength(raw: string | undefined) {
  if (!raw) return null;
  const value = Number(String(raw).replace(/[^0-9]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * 将上游 /models 返回的名称映射为 `llm_models.id`：优先精确匹配 id，否则若仅有一个全局 id 的尾段与上游名一致则收束到该 id。
 */
export function mapVendorModelNamesToGlobalIds(
  vendorNames: string[],
  globalRows: { id: string }[],
): string[] {
  const out = new Set<string>();
  for (const raw of vendorNames) {
    const v = String(raw || '').trim();
    if (!v) continue;
    const exact = globalRows.find((g) => g.id === v);
    if (exact) {
      out.add(exact.id);
      continue;
    }
    const suffixMatches = globalRows.filter((g) => {
      const suf = g.id.includes('/') ? g.id.split('/').pop()! : g.id;
      return suf === v;
    });
    if (suffixMatches.length === 1) {
      out.add(suffixMatches[0].id);
    }
  }
  return [...out];
}

/** 定价下拉里：当密钥/账号已列出 supported_models 时，判断某个全局 id 是否在目录中（精确或尾段匹配，大小写不敏感）。 */
export function globalModelIdMatchesKeyCatalog(globalId: string, catalog: string[]): boolean {
  if (catalog.length === 0) return true;
  const g = globalId.trim();
  if (!g) return false;
  const gSuf = g.includes('/') ? g.split('/').pop()! : g;
  return catalog.some((c) => {
    const cv = String(c || '').trim();
    if (!cv) return false;
    if (cv.toLowerCase() === g.toLowerCase()) return true;
    return cv.toLowerCase() === gSuf.toLowerCase();
  });
}

export function mapPricingRow(row: any) {
  return {
    model: row.public_model_id || row.model_id,
    global_model_id: row.model_id,
    public_model_id: row.public_model_id || null,
    provider_account_id: row.provider_account_id,
    provider_key_id: row.provider_key_id,
    provider_model_id: row.provider_model_id,
    price_mode: row.price_mode,
    input_cost: row.input_cost,
    output_cost: row.output_cost,
    input_price: row.input_price,
    output_price: row.output_price,
    cache_read_price: row.cache_read_price,
    cache_write_price: row.cache_write_price,
    reasoning_price: row.reasoning_price,
    markup_rate: row.markup_rate,
    currency: row.currency || 'USD',
    context_length: row.context_length,
    latency_ms: row.latency_ms,
    is_top_provider: Boolean(row.is_top_provider),
    status: row.status || 'online',
    version: row.version,
    updated_at: Number(row.updated_at || Date.now()),
  };
}
