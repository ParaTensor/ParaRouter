export type PricingRow = {
  model: string;
  global_model_id?: string | null;
  public_model_id?: string | null;
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
  currency: string;
  context_length?: number | null;
  latency_ms?: number | null;
  is_top_provider?: boolean | null;
  status?: string;
  provider_key_id: string;
  updated_at?: number;
};

export type PublishedPricingRow = PricingRow & {
  version: string;
  updated_at: number;
};

export type ProviderKeyRow = {
  provider: string;
  status: string;
  label?: string;
  base_url?: string;
  docs_url?: string;
  provider_type?: string;
  supported_models?: string[];
  supported_models_updated_at?: number | null;
  keys?: { id?: string; label: string; supported_models?: string[] }[];
};

export type PricingTableRow = PricingRow & {
  status: 'Draft' | 'Published';
  operational_status?: string | null;
};

export type PricingPreview = {
  affected_models?: number;
  changes_count?: number;
  estimated_profit_margin?: number | null;
};

export type SortKey = 'model' | 'provider' | 'input' | 'output' | 'final' | 'status';

export type PriceRange = 'all' | 'lt1' | '1to10' | 'gte10';

export type DrawerTab = 'quick' | 'batch' | 'advanced';
