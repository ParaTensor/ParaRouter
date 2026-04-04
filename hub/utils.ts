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
    },
  };
}

export async function sendRegisterVerificationEmail(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  const from = process.env.RESEND_FROM_EMAIL || 'OpenHub <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'OpenHub registration verification code',
      html: `<p>Your OpenHub verification code is:</p><h2>${code}</h2><p>This code will expire in 10 minutes.</p>`,
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
