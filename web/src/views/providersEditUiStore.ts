import { useSyncExternalStore } from 'react';

/**
 * 服务商编辑弹窗的模块级 store（HMR 或路由重挂时仍保留，避免未保存内容丢失）。
 */
export type ProviderKey = {
  id?: string;
  label: string;
  key: string;
  status: string;
  health_status?: string | null;
  health_checked_at?: number | string | null;
  health_last_ok_at?: number | string | null;
  health_error?: string | null;
  health_fail_count?: number | null;
  health_alert_sent_at?: number | string | null;
  supported_models?: string[];
  supported_models_updated_at?: number | string | null;
};

export type ProviderRow = {
  provider: string;
  status: string;
  label?: string;
  provider_type?: string;
  driver_type?: string;
  reasoning_text_encoding?: string;
  reasoning_text_model_scope?: string;
  base_url?: string;
  docs_url?: string;
  supported_models?: string[];
  supported_models_updated_at?: number | string | null;
  keys: ProviderKey[];
};

export const DEFAULT_PROVIDER: ProviderRow = {
  provider: '',
  label: '',
  driver_type: 'openai_compatible',
  reasoning_text_encoding: '',
  reasoning_text_model_scope: 'none',
  base_url: '',
  docs_url: '',
  status: 'active',
  keys: [{ label: 'Default', key: '', status: 'active', supported_models: [] }],
};

type ProvidersEditState = {
  showModal: boolean;
  isEditing: boolean;
  formData: ProviderRow;
  error: string | null;
};

function initialModalState(): ProvidersEditState {
  return {
    showModal: false,
    isEditing: false,
    formData: DEFAULT_PROVIDER,
    error: null,
  };
}

let state: ProvidersEditState = initialModalState();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function patch(p: Partial<ProvidersEditState>) {
  state = { ...state, ...p };
  emit();
}

export function subscribeProvidersEditUi(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getProvidersEditSnapshot(): ProvidersEditState {
  return state;
}

/** SSR / hydration 时与首帧一致 */
export const getProvidersEditServerSnapshot = () => initialModalState();

export function useProvidersEditUi(): ProvidersEditState {
  return useSyncExternalStore(
    subscribeProvidersEditUi,
    getProvidersEditSnapshot,
    getProvidersEditServerSnapshot,
  );
}

export const providersEdit = {
  get(): ProvidersEditState {
    return state;
  },
  openNew() {
    patch({
      showModal: true,
      isEditing: false,
      error: null,
      formData: {
        ...DEFAULT_PROVIDER,
        provider: 'openai',
        label: 'OpenAI',
        driver_type: 'openai_compatible',
        reasoning_text_encoding: '',
        reasoning_text_model_scope: 'none',
        base_url: 'https://api.openai.com/v1',
        docs_url: 'https://platform.openai.com/docs',
        keys: [{ label: 'Default', key: '', status: 'active', supported_models: [] }],
      },
    });
  },
  openEdit(provider: ProviderRow) {
    patch({
      showModal: true,
      isEditing: true,
      error: null,
      formData: {
        ...provider,
        label: provider.label || '',
        driver_type: provider.driver_type || (provider.provider_type === 'anthropic' ? 'anthropic' : 'openai_compatible'),
        reasoning_text_encoding: provider.reasoning_text_encoding || '',
        reasoning_text_model_scope: provider.reasoning_text_model_scope || 'none',
        base_url: provider.base_url || '',
        docs_url: provider.docs_url || '',
        keys: provider.keys
          ? provider.keys.map((k) => ({
              ...k,
              supported_models: Array.isArray(k.supported_models) ? [...k.supported_models] : [],
            }))
          : [{ label: 'Default', key: '', status: 'active', supported_models: [] }],
      },
    });
  },
  close() {
    patch({ showModal: false, error: null });
  },
  setError(e: string | null) {
    patch({ error: e });
  },
  setFormData(next: ProviderRow | ((prev: ProviderRow) => ProviderRow)) {
    const prev = state.formData;
    const formData = typeof next === 'function' ? next(prev) : next;
    patch({ formData });
  },
};
