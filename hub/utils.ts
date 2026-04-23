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
      to: [email],
      subject: 'ParaRouter registration verification code',
      html: `<p>Your ParaRouter verification code is:</p><h2>${code}</h2><p>This code will expire in 10 minutes.</p>`,
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

export function normalizeProviderBaseUrl(baseUrl: string, driverType?: string | null) {
  const trimmed = String(baseUrl || '').trim();
  if (!trimmed) return '';

  const normalizedDriverType = String(driverType || '').trim().toLowerCase();

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, '') || '';

    if (normalizedDriverType === 'openai_compatible' || normalizedDriverType === 'anthropic') {
      if (!/\/v\d+(?:beta\d+)?$/i.test(url.pathname)) {
        url.pathname = `${url.pathname || ''}/v1`.replace(/\/+/g, '/');
      }
    }

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

export function normalizeSupportedModels(raw: unknown) {
  const items = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown[] } | null)?.data)
      ? (raw as { data?: unknown[] }).data || []
      : Array.isArray((raw as { models?: unknown[] } | null)?.models)
        ? (raw as { models?: unknown[] }).models || []
        : [];

  const ids = new Set<string>();
  for (const item of items) {
    const value =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object'
          ? typeof (item as { id?: unknown }).id === 'string'
            ? String((item as { id?: string }).id)
            : typeof (item as { name?: unknown }).name === 'string'
              ? String((item as { name?: string }).name)
              : ''
          : '';
    const normalized = value.trim();
    if (normalized) ids.add(normalized);
  }

  return Array.from(ids).sort((left, right) => left.localeCompare(right));
}

function hasSupportedModelShape(raw: unknown) {
  return (
    Array.isArray(raw) ||
    Array.isArray((raw as { data?: unknown[] } | null)?.data) ||
    Array.isArray((raw as { models?: unknown[] } | null)?.models)
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
  const candidates = new Set<string>([`${normalizedBaseUrl}/models`]);

  if (!/\/v\d+(?:beta\d+)?$/i.test(normalizedBaseUrl)) {
    candidates.add(`${normalizedBaseUrl}/v1/models`);
  }
  if (!/\/api$/i.test(normalizedBaseUrl)) {
    candidates.add(`${normalizedBaseUrl}/api/models`);
  }

  return Array.from(candidates);
}

export async function fetchProviderSupportedModels(baseUrl: string, apiKey: string) {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
  const normalizedApiKey = String(apiKey || '').trim();
  if (!normalizedBaseUrl || !normalizedApiKey) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    let lastError: Error | null = null;

    for (const modelsUrl of buildProviderModelCatalogUrls(normalizedBaseUrl)) {
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
        lastError = new Error(`GET ${modelsUrl} returned HTML instead of a model catalog`);
        continue;
      }

      if (rawBody) {
        try {
          payload = JSON.parse(rawBody);
        } catch {
          lastError = new Error(`GET ${modelsUrl} returned non-JSON content`);
          continue;
        }
      }

      if (!response.ok) {
        const detail = payload == null ? '' : JSON.stringify(payload);
        lastError = new Error(`GET ${modelsUrl} failed: ${response.status}${detail ? ` ${detail}` : ''}`);
        continue;
      }

      if (!hasSupportedModelShape(payload)) {
        lastError = new Error(`GET ${modelsUrl} returned JSON without a supported model list`);
        continue;
      }

      return normalizeSupportedModels(payload);
    }

    throw lastError || new Error(`Failed to fetch supported models from ${normalizedBaseUrl}`);
  } finally {
    clearTimeout(timeout);
  }
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

export function mapPricingRow(row: any) {
  return {
    model: row.model_id,
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
