import { useSyncExternalStore } from 'react';
import type { ProviderKeyRow, PricingTableRow } from './types';

/**
 * 定价弹窗的 UI 状态与模块级 store（HMR 重载 Pricing.tsx 时仍保留，避免 dev 时弹窗与表单被清空）。
 */
export type PricingEditFormState = {
  drawerOpen: boolean;
  providerDrawerOpen: boolean;
  formPriceMode: 'fixed' | 'markup';
  model: string;
  providerAccountId: string;
  inputCost: string;
  outputCost: string;
  cacheReadCost: string;
  cacheWriteCost: string;
  reasoningCost: string;
  inputPrice: string;
  outputPrice: string;
  cacheReadPrice: string;
  cacheWritePrice: string;
  reasoningPrice: string;
  contextLength: string;
  latencyMs: string;
  markupRate: string;
  providerKeyId: string;
  discountRate: string;
};

function emptyState(): PricingEditFormState {
  return {
    drawerOpen: false,
    providerDrawerOpen: false,
    formPriceMode: 'fixed',
    model: '',
    providerAccountId: '',
    inputCost: '',
    outputCost: '',
    cacheReadCost: '',
    cacheWriteCost: '',
    reasoningCost: '',
    inputPrice: '',
    outputPrice: '',
    cacheReadPrice: '',
    cacheWritePrice: '',
    reasoningPrice: '',
    contextLength: '',
    latencyMs: '',
    markupRate: '',
    providerKeyId: '',
    discountRate: '1.0',
  };
}

let state: PricingEditFormState = emptyState();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribePricingEditUi(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getPricingEditSnapshot(): PricingEditFormState {
  return state;
}

export const getPricingEditServerSnapshot = () => emptyState();

function patch(p: Partial<PricingEditFormState>) {
  state = { ...state, ...p };
  emit();
}

export function usePricingEditUi(): PricingEditFormState {
  return useSyncExternalStore(subscribePricingEditUi, getPricingEditSnapshot, getPricingEditServerSnapshot);
}

export const pricingEdit = {
  patch,
  get(): PricingEditFormState {
    return state;
  },
  setDrawerOpen(open: boolean) {
    patch({ drawerOpen: open });
  },
  setProviderDrawerOpen(open: boolean) {
    patch({ providerDrawerOpen: open });
  },
  setFormPriceMode(v: 'fixed' | 'markup') {
    patch({ formPriceMode: v });
  },
  setModel(v: string) {
    patch({ model: v });
  },
  setProviderAccountId(v: string) {
    patch({ providerAccountId: v });
  },
  setInputCost(v: string) {
    patch({ inputCost: v });
  },
  setOutputCost(v: string) {
    patch({ outputCost: v });
  },
  setCacheReadCost(v: string) {
    patch({ cacheReadCost: v });
  },
  setCacheWriteCost(v: string) {
    patch({ cacheWriteCost: v });
  },
  setReasoningCost(v: string) {
    patch({ reasoningCost: v });
  },
  setInputPrice(v: string) {
    patch({ inputPrice: v });
  },
  setOutputPrice(v: string) {
    patch({ outputPrice: v });
  },
  setCacheReadPrice(v: string) {
    patch({ cacheReadPrice: v });
  },
  setCacheWritePrice(v: string) {
    patch({ cacheWritePrice: v });
  },
  setReasoningPrice(v: string) {
    patch({ reasoningPrice: v });
  },
  setContextLength(v: string) {
    patch({ contextLength: v });
  },
  setLatencyMs(v: string) {
    patch({ latencyMs: v });
  },
  setMarkupRate(v: string) {
    patch({ markupRate: v });
  },
  setProviderKeyId(v: string) {
    patch({ providerKeyId: v });
  },
  setDiscountRate(v: string) {
    patch({ discountRate: v });
  },
  openCreateFromKeys(providerKeyRows: ProviderKeyRow[]) {
    const next: Partial<PricingEditFormState> = {
      drawerOpen: true,
      formPriceMode: 'fixed',
      model: '',
      inputCost: '',
      outputCost: '',
      cacheReadCost: '',
      cacheWriteCost: '',
      reasoningCost: '',
      inputPrice: '',
      outputPrice: '',
      cacheReadPrice: '',
      cacheWritePrice: '',
      reasoningPrice: '',
      contextLength: '',
      latencyMs: '',
      markupRate: '',
    };
    const allKeys = providerKeyRows.flatMap((p) =>
      (p.keys || []).filter((k) => !!k.id).map((k) => ({ id: k.id as string, provider: p.provider })),
    );
    if (allKeys.length > 0) {
      const firstKey = allKeys[0]!;
      next.providerKeyId = firstKey.id;
      next.providerAccountId = firstKey.provider;
    } else {
      next.providerKeyId = '';
      next.providerAccountId = '';
    }
    patch(next);
  },
  openEditFromRow(row: PricingTableRow) {
    const n = (value?: number | null) => (typeof value === 'number' ? String(value) : '');
    patch({
      drawerOpen: true,
      formPriceMode: 'fixed',
      model: row.model,
      providerAccountId: row.provider_account_id || '',
      inputCost: n(row.input_cost),
      outputCost: n(row.output_cost),
      cacheReadCost: n(row.cache_read_cost),
      cacheWriteCost: n(row.cache_write_cost),
      reasoningCost: n(row.reasoning_cost),
      inputPrice: n(row.input_price),
      outputPrice: n(row.output_price),
      cacheReadPrice: n(row.cache_read_price),
      cacheWritePrice: n(row.cache_write_price),
      reasoningPrice: n(row.reasoning_price),
      contextLength: n(row.context_length),
      latencyMs: n(row.latency_ms),
      markupRate: n(row.markup_rate),
      providerKeyId: row.provider_key_id || '',
    });
  },
  closeEditDrawer() {
    patch({ drawerOpen: false });
  },
  closeProviderDrawer() {
    patch({ providerDrawerOpen: false });
  },
};
