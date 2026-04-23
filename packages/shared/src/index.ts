export type ModelPayload = {
  id: string;
  name: string;
  provider: string;
  description?: string;
  context?: string;
  pricing?: {prompt?: string; completion?: string; cache_read?: string; cache_write?: string; reasoning?: string;};
  tags?: string[];
  isPopular?: boolean;
  latency?: string;
  status?: string;
};

export type PricingDraftUpsertRequest = {
  model: string;
  provider_model_id?: string | null;
  provider_account_id?: string | null;
  price_mode: 'fixed' | 'markup';
  input_cost?: number | null;
  output_cost?: number | null;
  cache_read_cost?: number | null;
  cache_write_cost?: number | null;
  reasoning_cost?: number | null;
  input_price?: number | null;
  output_price?: number | null;
  cache_read_price?: number | null;
  cache_write_price?: number | null;
  reasoning_price?: number | null;
  markup_rate?: number | null;
  currency?: string;
  context_length?: number | null;
  latency_ms?: number | null;
  is_top_provider?: boolean | null;
  status?: string;
  provider_key_id?: string | null;
};

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: 'admin' | 'user';
  status: string;
  balance?: number;
};

export type AuthSessionResponse = {
  token: string;
  user: {
    uid: string;
    username: string;
    email: string;
    displayName: string;
    role: 'admin' | 'user';
    balance?: number;
  };
};
