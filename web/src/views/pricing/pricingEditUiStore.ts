import { useSyncExternalStore } from 'react';
import type { ProviderKeyRow, PricingTableRow } from './types';

/**
 * 定价弹窗的 UI 状态与模块级 store（HMR 重载 Pricing.tsx 时仍保留，避免 dev 时弹窗与表单被清空）。
 */
export type PricingEditFormState = {
  drawerOpen: boolean;
  providerDrawerOpen: boolean;
  formPriceMode: 'fixed' | 'markup';
  status: 'online' | 'paused' | 'offline';
  model: string;
  publicModelId: string;
  providerModelId: string;
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
  discountRate: string;
};

function emptyState(): PricingEditFormState {
  return {
    drawerOpen: false,
    providerDrawerOpen: false,
    formPriceMode: 'fixed',
    status: 'online',
    model: '',
    publicModelId: '',
    providerModelId: '',
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
  setStatus(v: 'online' | 'paused' | 'offline') {
    patch({ status: v });
  },
  setModel(v: string) {
    patch({ model: v });
  },
  setPublicModelId(v: string) {
    patch({ publicModelId: v });
  },
  setProviderModelId(v: string) {
    patch({ providerModelId: v });
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
  setDiscountRate(v: string) {
    patch({ discountRate: v });
  },
  openCreateFromKeys(providerKeyRows: ProviderKeyRow[]) {
    const next: Partial<PricingEditFormState> = {
      drawerOpen: true,
      formPriceMode: 'fixed',
      status: 'online',
      model: '',
      publicModelId: '',
      providerModelId: '',
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
    if (providerKeyRows.length > 0) {
      next.providerAccountId = providerKeyRows[0].provider;
    } else {
      next.providerAccountId = '';
    }
    patch(next);
  },
  openEditFromRow(row: PricingTableRow) {
    const n = (value?: number | null) => (typeof value === 'number' ? String(value) : '');
    patch({
      drawerOpen: true,
      formPriceMode: 'fixed',
      status: (row.operational_status || row.status || 'online') as 'online' | 'paused' | 'offline',
      model: row.global_model_id || row.model,
      publicModelId: row.public_model_id || '',
      providerModelId: row.provider_model_id || '',
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
    });
  },
  closeEditDrawer() {
    patch({ drawerOpen: false });
  },
  closeProviderDrawer() {
    patch({ providerDrawerOpen: false });
  },
};
