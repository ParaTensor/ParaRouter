import {getAuthToken} from './session';

const envApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
const API_BASE_URL = envApiBaseUrl || '';

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

function withAuthHeaders(initHeaders?: HeadersInit): HeadersInit {
  const headers = new Headers(initHeaders || {});
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

export class ApiError extends Error {
  status: number;
  body: any;

  constructor(message: string, status: number, body: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function extractErrorMessage(responseBody: any): string {
  if (!responseBody) return '';
  if (typeof responseBody === 'string') return responseBody;
  if (typeof responseBody?.error === 'string') return responseBody.error;
  if (typeof responseBody?.message === 'string') return responseBody.message;
  return '';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = resolveApiUrl(path);
  const response = await fetch(url, {
    method,
    headers: withAuthHeaders(body == null ? undefined : {'Content-Type': 'application/json'}),
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const rawBody = await response.text();
    let responseBody: any = rawBody;
    if (rawBody) {
      try {
        responseBody = JSON.parse(rawBody);
      } catch {
        responseBody = rawBody;
      }
    } else {
      responseBody = null;
    }
    const message = extractErrorMessage(responseBody) || `${method} ${url} failed: ${response.status}`;
    throw new ApiError(message, response.status, responseBody);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

export async function apiDelete(path: string): Promise<void> {
  await request<void>('DELETE', path);
}
