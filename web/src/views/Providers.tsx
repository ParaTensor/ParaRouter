import React from 'react';
import {ShieldAlert, Plus, Trash2, Edit2, Globe, Cpu, Key, Copy, RefreshCw, CheckCircle2, Check, Pause} from 'lucide-react';
import {ApiError, apiDelete, apiGet, apiPost, apiPut} from '../lib/api';
import {localUser} from '../lib/session';
import {clsx} from 'clsx';
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react';
import { Select } from '../components/Select';
import ConfirmDialog from '../components/ConfirmDialog';
import { useTranslation } from "react-i18next";
import {
  useProvidersEditUi,
  providersEdit,
  getProvidersEditSnapshot,
  type ProviderRow,
} from './providersEditUiStore';

type ActionFeedbackState = {
  target: string;
  kind: 'catalog' | 'connection';
  ok: boolean;
  msg: string;
};

type ProviderHealthCheckResult = {
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

type ProviderHealthCheckResponse = {
  status: string;
  provider: string;
  results: ProviderHealthCheckResult[];
};

type BusyActionState = {
  target: string;
  kind: 'catalog' | 'connection';
};

type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error';

function normalizeProviderTimestamp(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function serializeSupportedModels(models?: string[]) {
  return Array.isArray(models) && models.length > 0 ? models.join('\n') : '';
}

function parseSupportedModels(value: string) {
  const seen = new Set<string>();
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function areSupportedModelsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function hasVersionedApiBasePath(baseUrl: string) {
  const trimmed = String(baseUrl || '').trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return /\/v\d+(?:beta\d+)?$/i.test(path);
  } catch {
    return /\/v\d+(?:beta\d+)?$/i.test(trimmed.replace(/\/+$/, ''));
  }
}

const providerProtocolOptions = [
  { value: 'openai_compatible', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
];

const providerSettingsGridClass = 'lg:grid-cols-[180px]';

function providerProtocolLabel(driverType?: string | null) {
  return driverType === 'anthropic' ? 'Anthropic' : 'OpenAI';
}

export default function ProvidersView() {
  const { t } = useTranslation();
  const isAdmin = localUser.role === 'admin';
  const [providers, setProviders] = React.useState<ProviderRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [autoSaveState, setAutoSaveState] = React.useState<AutoSaveState>('idle');
  const { showModal, isEditing, formData, error } = useProvidersEditUi();
  const [busyAction, setBusyAction] = React.useState<BusyActionState | null>(null);
  const [actionFeedback, setActionFeedback] = React.useState<ActionFeedbackState | null>(null);
  const [catalogEditorValue, setCatalogEditorValue] = React.useState('');
  const [catalogEditorDirty, setCatalogEditorDirty] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const autoSaveTimerRef = React.useRef<number | null>(null);
  const autoSavePromiseRef = React.useRef<Promise<void> | null>(null);
  const autoSaveTokenRef = React.useRef<symbol | null>(null);
  const catalogEditorDirtyRef = React.useRef(false);
  const lastAutoSavedPayloadRef = React.useRef<string | null>(null);
  const loadProviders = React.useCallback(async (): Promise<ProviderRow[] | null> => {
    if (!isAdmin) {
      setLoading(false);
      return null;
    }
    try {
      const rows = await apiGet<ProviderRow[]>('/api/provider-keys');
      const normalized = rows.map((row) => ({
        ...row,
        supported_models_updated_at: normalizeProviderTimestamp(row.supported_models_updated_at),
      }));
      setProviders(normalized);
      return normalized;
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  React.useEffect(() => {
    if (!showModal) {
      setCatalogEditorValue('');
      setCatalogEditorDirty(false);
      catalogEditorDirtyRef.current = false;
      return;
    }
    if (catalogEditorDirtyRef.current) return;
    setCatalogEditorValue(serializeSupportedModels(formData.supported_models));
    setCatalogEditorDirty(false);
    catalogEditorDirtyRef.current = false;
  }, [catalogEditorDirty, showModal, formData.supported_models]);

  React.useEffect(() => {
    if (showModal) return;
    setActionFeedback(null);
    setBusyAction(null);
    setAutoSaveState('idle');
    lastAutoSavedPayloadRef.current = null;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, [showModal]);

  const actionToastLoading =
    busyAction !== null &&
    actionFeedback !== null &&
    busyAction.target === actionFeedback.target &&
    busyAction.kind === actionFeedback.kind;

  const applyCatalogEditorToFormData = React.useCallback(
    (nextCatalogValue: string, baseFormData: ProviderRow = formData) => {
      const normalizedModels = parseSupportedModels(nextCatalogValue);
      const previousModels = Array.isArray(baseFormData.supported_models) ? baseFormData.supported_models : [];
      const nextUpdatedAt = areSupportedModelsEqual(previousModels, normalizedModels)
        ? baseFormData.supported_models_updated_at ?? null
        : Date.now();

      return {
        ...baseFormData,
        supported_models: normalizedModels,
        supported_models_updated_at: nextUpdatedAt,
      };
    },
    [formData],
  );

  const flushCatalogEditorToFormData = React.useCallback(() => {
    if (!catalogEditorDirty) return;
    const nextFormData = applyCatalogEditorToFormData(catalogEditorValue);
    providersEdit.setFormData(nextFormData);
    setCatalogEditorValue(serializeSupportedModels(nextFormData.supported_models));
    setCatalogEditorDirty(false);
    catalogEditorDirtyRef.current = false;
  }, [applyCatalogEditorToFormData, catalogEditorDirty, catalogEditorValue]);

  const buildProviderPayload = React.useCallback(
    (baseFormData: ProviderRow = formData) => {
      const providerId = baseFormData.provider.trim().toLowerCase();
      const normalizedFormData = catalogEditorDirty
        ? applyCatalogEditorToFormData(catalogEditorValue, baseFormData)
        : baseFormData;
      return {
        providerId,
        payload: {
          ...normalizedFormData,
          provider: providerId,
          key_id: normalizedFormData.key_id,
          key: normalizedFormData.key,
          key_status: normalizedFormData.key_status,
        },
      };
    },
    [applyCatalogEditorToFormData, catalogEditorDirty, catalogEditorValue, formData],
  );

  const saveProviderNow = React.useCallback(
    async (mode: 'manual' | 'auto' = 'manual') => {
      const {providerId, payload} = buildProviderPayload();
      if (!providerId) return;
      if (!hasVersionedApiBasePath(payload.base_url || '')) {
        if (mode === 'manual') {
          providersEdit.setError(t('providers.error_base_url_requires_version'));
        }
        return;
      }

      if (mode === 'manual') {
        setSaving(true);
        providersEdit.setError(null);
      } else {
        setAutoSaveState('saving');
      }

      const saveToken = Symbol('provider-save');
      autoSaveTokenRef.current = saveToken;
      const savePromise = (async () => {
        try {
          providersEdit.setFormData(payload);
          const saveResult = await apiPut<{keys?: {id: string; label: string}[]}>(`/api/provider-keys/${encodeURIComponent(providerId)}`, payload);
          const savedKeyId = saveResult.keys?.[0]?.id;
          if (savedKeyId && !payload.key_id) {
            payload.key_id = savedKeyId;
            providersEdit.setFormData(payload);
          }
          setCatalogEditorDirty(false);
          catalogEditorDirtyRef.current = false;
          lastAutoSavedPayloadRef.current = JSON.stringify(payload);

          if (mode === 'manual') {
            // Artificial delay to make the "Saving..." state perceivable and satisfying
            await new Promise((resolve) => setTimeout(resolve, 800));
            setActionFeedback({
              target: 'save',
              kind: 'connection',
              ok: true,
              msg: t('providers.save_success'),
            });
            const rows = await loadProviders();
            const fresh = rows?.find((p) => p.provider === providerId);
            if (fresh) {
              providersEdit.openEdit(fresh);
            }
            window.setTimeout(() => {
              setActionFeedback((cur) => (cur?.target === 'save' ? null : cur));
            }, 3000);
          } else {
            setAutoSaveState('saved');
          }
        } catch (err: any) {
          console.error('Failed to save provider:', err);
          if (mode === 'manual') {
            providersEdit.setError(err.message || t('providers.unknown_error'));
          } else {
            setAutoSaveState('error');
          }
        } finally {
          if (mode === 'manual') {
            setSaving(false);
          }
          if (autoSaveTokenRef.current === saveToken) {
            autoSaveTokenRef.current = null;
            autoSavePromiseRef.current = null;
          }
        }
      })();

      autoSavePromiseRef.current = savePromise;
      await savePromise;
    },
    [buildProviderPayload, loadProviders, t],
  );

  const flushPendingAutoSave = React.useCallback(async () => {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
      await saveProviderNow('auto');
      return;
    }
    if (autoSavePromiseRef.current) {
      await autoSavePromiseRef.current;
    }
  }, [saveProviderNow]);

  React.useEffect(() => {
    if (!showModal) return;
    const {providerId, payload} = buildProviderPayload();
    if (!providerId) return;
    if (!hasVersionedApiBasePath(payload.base_url || '')) {
      setAutoSaveState('idle');
      return;
    }

    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastAutoSavedPayloadRef.current) {
      return;
    }

    setAutoSaveState('saving');
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void saveProviderNow('auto');
    }, 700);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [buildProviderPayload, saveProviderNow, showModal]);

  const handleDuplicateProvider = async (provider: ProviderRow) => {
    setConfirmDialog({
      isOpen: true,
      title: '复制 Provider',
      message: `确定要复制 Provider "${provider.label || provider.provider}" 吗？`,
      onConfirm: async () => {
    const newProviderId = `${provider.provider}-copy-${Date.now()}`;
    const newLabel = `${provider.label || provider.provider} (Copy)`;
    
    const payload = {
      providerId: newProviderId,
      payload: {
        label: newLabel,
        base_url: provider.base_url,
        driver_type: provider.driver_type,
        docs_url: provider.docs_url,
        status: provider.status,
        key: provider.key,
        key_status: provider.key_status,
        supported_models: provider.supported_models || [],
      },
    };
    
    try {
      setSaving(true);
      providersEdit.setError(null);
      
      await apiPut(`/api/provider-keys/${encodeURIComponent(newProviderId)}`, payload.payload);
      
      // 刷新列表
      const rows = await loadProviders();
      
      // 自动打开新创建的 Provider 的编辑模态框
      if (rows) {
        const newProvider = rows.find(p => p.provider === newProviderId);
        if (newProvider) {
          providersEdit.openEdit(newProvider);
        }
      }
      
      setActionFeedback({
        target: 'duplicate',
        kind: 'connection',
        ok: true,
        msg: `成功复制 Provider "${newLabel}"`,
      });
      
      window.setTimeout(() => {
        setActionFeedback((cur) => (cur?.target === 'duplicate' ? null : cur));
      }, 3000);
    } catch (err: any) {
      console.error('Failed to duplicate provider:', err);
      providersEdit.setError(err.message || '复制失败');
    } finally {
      setSaving(false);
    }
      },
    });
  };

  const handleOpenModal = (provider?: ProviderRow) => {
    if (provider) {
      providersEdit.openEdit(provider);
    } else {
      providersEdit.openNew();
    }
  };

  const restoreFreshProviderIntoModal = React.useCallback(
    (rows: ProviderRow[] | null, providerId: string) => {
      if (!rows) return;
      const snap = getProvidersEditSnapshot();
      if (!snap.showModal || !snap.isEditing || snap.formData.provider !== providerId) return;
      const fresh = rows.find((p) => p.provider === providerId);
      if (!fresh) return;
      providersEdit.openEdit(fresh);
    },
    [],
  );

  const handleSaveProvider = async () => {
    if (!isEditing && !formData.key.trim()) {
        providersEdit.setError(t('providers.error_key_required'));
        return;
    }
    await saveProviderNow('manual');
  };

  const handleDeleteProvider = async (provider: string) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除服务商',
      message: t('providers.confirm_delete', { provider }),
      onConfirm: async () => {
        await apiDelete(`/api/provider-keys/${encodeURIComponent(provider)}`);
        await loadProviders();
      },
    });
  };

  const handleRefreshModelCatalog = async (providerId: string) => {
    await flushPendingAutoSave();
    if (!providersEdit.get().formData.key_id && providersEdit.get().formData.key?.trim()) {
      await saveProviderNow('auto');
    }
    setBusyAction({target: providerId, kind: 'catalog'});
    setActionFeedback({
      target: providerId,
      kind: 'catalog',
      ok: true,
      msg: t('providers.refresh_catalog_loading'),
    });
    const abortCtl = new AbortController();
    const abortTimer = window.setTimeout(() => abortCtl.abort(), 90_000);
    let syncOk = false;
    try {
      const currentFormData = providersEdit.get().formData;
      const res = await apiPost<{
        status: string;
        supported_models_count: number;
      }>(
        `/api/provider-keys/${encodeURIComponent(providerId)}/refresh-model-catalog`,
        {
          key_id: currentFormData.key_id,
          api_key: currentFormData.key,
          base_url: currentFormData.base_url,
        },
        {signal: abortCtl.signal},
      );
      syncOk = true;
      setActionFeedback({
        target: providerId,
        kind: 'catalog',
        ok: true,
        msg: t('providers.refresh_catalog_success', {count: res.supported_models_count}),
      });
      window.setTimeout(() => {
        setActionFeedback((cur) => (cur?.target === providerId && cur.kind === 'catalog' && cur.ok ? null : cur));
      }, 10000);
    } catch (err: unknown) {
      let message = t('providers.unknown_error');
      const isAbort =
        (typeof err === 'object' &&
          err !== null &&
          'name' in err &&
          (err as {name?: string}).name === 'AbortError') ||
        (err instanceof DOMException && err.name === 'AbortError');
      if (isAbort) {
        message = t('providers.refresh_catalog_timeout');
      } else if (err instanceof ApiError) {
        message = err.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setActionFeedback({target: providerId, kind: 'catalog', ok: false, msg: message});
    } finally {
      window.clearTimeout(abortTimer);
      setBusyAction(null);
    }
    let rows: ProviderRow[] | null = null;
    try {
      rows = await loadProviders();
    } catch (e) {
      console.error('loadProviders after catalog refresh:', e);
    }
    if (syncOk) restoreFreshProviderIntoModal(rows, providerId);
  };

  const handleTestAndSync = async (providerId: string) => {
    const currentFormData = providersEdit.get().formData;
    if (!currentFormData.key || currentFormData.key.trim() === '') {
      setActionFeedback({
        target: providerId,
        kind: 'connection',
        ok: false,
        msg: '请先填写 API 密钥',
      });
      window.setTimeout(() => {
        setActionFeedback((cur) => (cur?.target === providerId && cur.kind === 'connection' && !cur.ok ? null : cur));
      }, 3000);
      return;
    }

    if (!currentFormData.base_url || currentFormData.base_url.trim() === '') {
      setActionFeedback({
        target: providerId,
        kind: 'connection',
        ok: false,
        msg: '请先填写 Base URL',
      });
      window.setTimeout(() => {
        setActionFeedback((cur) => (cur?.target === providerId && cur.kind === 'connection' && !cur.ok ? null : cur));
      }, 3000);
      return;
    }

    setBusyAction({target: providerId, kind: 'connection'});
    setActionFeedback({
      target: providerId,
      kind: 'connection',
      ok: true,
      msg: '正在测试连接...',
    });

    const abortCtl = new AbortController();
    const abortTimer = window.setTimeout(() => abortCtl.abort(), 45_000);
    try {
      const res = await apiPost<ProviderHealthCheckResponse>(
        `/api/provider-keys/${encodeURIComponent(providerId)}/health-check`,
        {
          api_key: currentFormData.key,
          base_url: currentFormData.base_url,
          driver_type: currentFormData.driver_type,
        },
        {signal: abortCtl.signal},
      );
      const result = Array.isArray(res.results) && res.results.length > 0 ? res.results[0] : undefined;
      if (result?.ok) {
        setActionFeedback({
          target: providerId,
          kind: 'connection',
          ok: true,
          msg: `连接成功，正在同步模型目录...`,
        });
        
        // 测试成功，继续同步模型目录
        await handleRefreshModelCatalog(providerId);
      } else {
        setActionFeedback({
          target: providerId,
          kind: 'connection',
          ok: false,
          msg: t('providers.test_connection_failed', {reason: result?.error || '未知错误'}),
        });
        window.setTimeout(() => {
          setActionFeedback((cur) => (cur?.target === providerId && cur.kind === 'connection' && !cur.ok ? null : cur));
        }, 5000);
      }
    } catch (err: unknown) {
      let message = t('providers.unknown_error');
      if (err instanceof ApiError) {
        message = err.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setActionFeedback({target: providerId, kind: 'connection', ok: false, msg: message});
      window.setTimeout(() => {
        setActionFeedback((cur) => (cur?.target === providerId && cur.kind === 'connection' && !cur.ok ? null : cur));
      }, 5000);
    } finally {
      window.clearTimeout(abortTimer);
      setBusyAction(null);
    }
  };

  const handleTestProviderConnection = async (providerId: string) => {
    if (!formData.key || formData.key.trim() === '') {
      setActionFeedback({
        target: providerId,
        kind: 'connection',
        ok: false,
        msg: '请先填写 API 密钥',
      });
      window.setTimeout(() => {
        setActionFeedback((cur) => (cur?.target === providerId && cur.kind === 'connection' && !cur.ok ? null : cur));
      }, 3000);
      return;
    }

    if (!formData.base_url || formData.base_url.trim() === '') {
      setActionFeedback({
        target: providerId,
        kind: 'connection',
        ok: false,
        msg: '请先填写 Base URL',
      });
      window.setTimeout(() => {
        setActionFeedback((cur) => (cur?.target === providerId && cur.kind === 'connection' && !cur.ok ? null : cur));
      }, 3000);
      return;
    }

    setBusyAction({target: providerId, kind: 'connection'});
    setActionFeedback({
      target: providerId,
      kind: 'connection',
      ok: true,
      msg: t('providers.test_connection_loading'),
    });

    const abortCtl = new AbortController();
    const abortTimer = window.setTimeout(() => abortCtl.abort(), 45_000);
    let checked = false;
    try {
      const res = await apiPost<ProviderHealthCheckResponse>(
        `/api/provider-keys/${encodeURIComponent(providerId)}/health-check`,
        {
          api_key: formData.key,
          base_url: formData.base_url,
          driver_type: formData.driver_type,
        },
        {signal: abortCtl.signal},
      );
      checked = true;
      const result = Array.isArray(res.results) && res.results.length > 0 ? res.results[0] : undefined;
      if (result?.ok) {
        setActionFeedback({
          target: providerId,
          kind: 'connection',
          ok: true,
          msg: t('providers.test_connection_success', {model: result.probe_model || 'n/a'}),
        });
        window.setTimeout(() => {
          setActionFeedback((cur) => (cur?.target === providerId && cur.kind === 'connection' && cur.ok ? null : cur));
        }, 10000);
      } else if (result) {
        setActionFeedback({
          target: providerId,
          kind: 'connection',
          ok: false,
          msg: t('providers.test_connection_failed', {reason: result.error || `HTTP ${result.status}`}),
        });
      } else {
        setActionFeedback({
          target: providerId,
          kind: 'connection',
          ok: false,
          msg: t('providers.test_connection_unavailable'),
        });
      }
    } catch (err: unknown) {
      let message = t('providers.unknown_error');
      const isAbort =
        (typeof err === 'object' &&
          err !== null &&
          'name' in err &&
          (err as {name?: string}).name === 'AbortError') ||
        (err instanceof DOMException && err.name === 'AbortError');
      if (isAbort) {
        message = t('providers.test_connection_timeout');
      } else if (err instanceof ApiError) {
        message = err.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setActionFeedback({target: providerId, kind: 'connection', ok: false, msg: message});
    } finally {
      window.clearTimeout(abortTimer);
      setBusyAction(null);
    }

    let rows: ProviderRow[] | null = null;
    try {
      rows = await loadProviders();
    } catch (e) {
      console.error('loadProviders after health check:', e);
    }
    if (checked) restoreFreshProviderIntoModal(rows, providerId);
  };

  if (!isAdmin) {
    return (
      <div className="max-w-3xl">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-3 text-amber-800">
          <ShieldAlert className="shrink-0 mt-0.5" size={20} />
          <p className="text-sm">{t('providers.provider_management_is_admin_o')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 pb-12">
      {/* Header section with Add Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">{t('providers.providers')}</h1>
          <p className="text-amber-600 mt-1 text-sm flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            多协议支持提示：如果一个服务商同时支持多种协议（如同时有 Claude 和 GPT 模型），可以为每种协议创建一个 Account
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl px-5 py-2.5 font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
        >
          <Plus size={18} />
          <span>{t('providers.add_provider')}</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-zinc-50/50 rounded-3xl border border-dashed border-zinc-200">
          <div className="loading loading-spinner loading-md text-zinc-400"></div>
          <p className="text-zinc-500 mt-4 font-medium">{t('providers.loading_providers')}</p>
        </div>
      ) : providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-zinc-50/50 rounded-3xl border border-dashed border-zinc-200 text-center px-6">
          <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center text-zinc-400 mb-4">
            <Cpu size={32} />
          </div>
          <h3 className="text-zinc-900 font-semibold text-lg">{t('providers.no_providers_yet')}</h3>
          <p className="text-zinc-500 mt-1 max-w-2xl text-balance">{t('providers.add_your_first_llm_provider_to')}</p>
          <button
            onClick={() => handleOpenModal()}
            className="mt-6 text-zinc-900 font-bold hover:underline"
          >
            {t('providers.create_provider')}</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 md:gap-5">
          {providers.map((p) => (
            <div 
              key={p.provider} 
              className="group relative flex w-full flex-none flex-col rounded-2xl border border-zinc-100 bg-white p-4 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.12)] sm:w-96"
            >
              {/* Top Row: Icon + Actions */}
              <div className="mb-3 flex items-start justify-between">
                <div className="relative">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-100 text-zinc-500 transition-all duration-300 group-hover:border-zinc-300 group-hover:bg-zinc-100/90">
                    <Cpu size={22} strokeWidth={1.5} />
                  </div>
                  {/* Status Indicator */}
                  <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-zinc-200/80 bg-zinc-100 shadow-sm">
                    <div className={clsx(
                      "h-2 w-2 rounded-full",
                      p.status === 'active' ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.45)]" : "bg-zinc-300"
                    )} />
                  </div>
                </div>

                <div className="flex translate-x-1 -translate-y-1 items-center gap-0.5 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100">
                
                  <button 
                    onClick={() => handleOpenModal(p)}
                    className="p-2.5 hover:bg-zinc-50 rounded-xl text-zinc-400 hover:text-zinc-900 transition-all duration-200 active:scale-90"
                    title={t('providers.edit_provider')}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDuplicateProvider(p)}
                    className="p-2.5 hover:bg-zinc-50 rounded-xl text-zinc-400 hover:text-zinc-900 transition-all duration-200 active:scale-90"
                    title="复制 Provider"
                  >
                    <Copy size={18} />
                  </button>
                  <button 
                    onClick={() => handleDeleteProvider(p.provider)}
                    className="p-2.5 hover:bg-red-50 rounded-xl text-zinc-300 hover:text-red-500 transition-all duration-200 active:scale-90"
                    title={t('providers.delete')}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {/* Title Section */}
              <div className="mb-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <h3 className="text-lg font-bold leading-tight tracking-tight text-zinc-900 transition-colors group-hover:text-black">
                    {p.label || p.provider}
                  </h3>
                </div>
                <span className="inline-flex items-center rounded border border-zinc-200/70 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {p.provider}
                </span>
                <span className="ml-1 inline-flex items-center rounded border border-zinc-200/70 bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {providerProtocolLabel(p.driver_type)}
                </span>
              </div>

              {/* Info & Links */}
              <div className="mt-auto space-y-2 border-t border-zinc-100/90 pt-3">
                {p.base_url && (
                  <div className="flex items-center gap-2.5 text-zinc-500 transition-colors group-hover:text-zinc-600">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-zinc-500 shadow-sm ring-1 ring-inset ring-zinc-200/70">
                      <Globe size={14} strokeWidth={2} />
                    </div>
                    <span className="min-w-0 truncate text-[12px] font-medium tracking-tight">{p.base_url}</span>
                  </div>
                )}
                {p.key && (
                  <div className="flex items-center gap-2.5 text-zinc-500 transition-colors group-hover:text-zinc-600">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-zinc-500 shadow-sm ring-1 ring-inset ring-zinc-200/70">
                      <Key size={14} strokeWidth={2} />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium tracking-tight">
                        {p.key.length > 8 ? `${p.key.substring(0, 4)}...${p.key.substring(p.key.length - 4)}` : '***'}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-[11px] font-medium tabular-nums text-zinc-400">
                        {t('providers.key_models_count', {count: Array.isArray(p.supported_models) ? p.supported_models.length : 0})}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant="danger"
      />

      <Dialog open={showModal} onClose={async () => {
  flushCatalogEditorToFormData();
  await flushPendingAutoSave();
  await loadProviders();
  providersEdit.close();
}} className="relative z-50">
        <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
        <div className="scrollbar-hover fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6">
            <DialogPanel className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-left">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
                <div>
                  <h3 className="font-bold text-lg">
                    {isEditing ? t('providers.edit_provider') : t('providers.add_provider_modal')}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{t('providers.manage_provider_account_metada')}</p>
                </div>
              </div>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 m-5 mb-1 flex gap-3 text-red-600 animate-in fade-in slide-in-from-top-2 duration-300">
                <ShieldAlert className="shrink-0 mt-0.5" size={18} />
                <div className="flex-1">
                  <p className="text-sm font-bold uppercase tracking-tight mb-0.5">{t('providers.error')}</p>
                  <p className="text-[13px] leading-relaxed opacity-90">{error}</p>
                </div>
              </div>
            )}

            <div className="scrollbar-hover flex-1 space-y-4 overflow-auto px-5 py-5">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('providers.display_name')}</label>
                    <input
                      value={formData.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        if (!isEditing) {
                          const id = label.toLowerCase().replace(/[^a-z0-9]/g, '');
                          providersEdit.setFormData({
                            ...formData,
                            label,
                            provider: id,
                            base_url: id ? `https://api.${id}.com/v1` : '',
                            docs_url: id ? `https://platform.${id}.com/docs` : ''
                          });
                        } else {
                          providersEdit.setFormData({...formData, label});
                        }
                      }}
                      placeholder={t('providers.placeholder_display_name')}
                      className="w-full min-w-0 px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('provideraccountmodal.protocol')}</label>
                    <Select
                      value={formData.driver_type || 'openai_compatible'}
                      onChange={(value) => {
                        providersEdit.setFormData((prev) => {
                          const next = {...prev, driver_type: value};
                          if (value === 'anthropic' && prev.base_url === 'https://api.openai.com/v1') {
                            next.base_url = 'https://api.anthropic.com/v1';
                            next.docs_url = 'https://docs.anthropic.com/en/api/getting-started';
                          } else if (value === 'openai_compatible' && prev.base_url === 'https://api.anthropic.com/v1') {
                            next.base_url = 'https://api.openai.com/v1';
                            next.docs_url = 'https://platform.openai.com/docs';
                          }
                          return next;
                        });
                      }}
                      options={providerProtocolOptions}
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('providers.base_url')}</label>
                  <input
                    value={formData.base_url}
                    onChange={(e) => providersEdit.setFormData({...formData, base_url: e.target.value})}
                    placeholder={t('providers.placeholder_base_url')}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono"
                  />
                  <p className="text-[11px] text-zinc-500">{t('providers.base_url_suffix_hint')}</p>
                </div>

                <div className="mt-3 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('api_key')}</label>
                  <div className="relative">
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={formData.key}
                      onChange={(e) => {
                        providersEdit.setFormData({...formData, key: e.target.value});
                      }}
                      placeholder={isEditing ? t('providers.placeholder_key_editing') : t('providers.placeholder_key_new')}
                      className={clsx(
                        'w-full px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all font-mono pr-10',
                        formData.key && formData.key.length > 0 ? 'border-emerald-200 bg-emerald-50/30' : 'border-zinc-200',
                      )}
                    />
                    {formData.key && formData.key.length > 0 && (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(formData.key)}
                          className="text-zinc-400 hover:text-zinc-800 p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
                          title="复制 API Key"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTestAndSync(formData.provider)}
                    disabled={busyAction?.target === formData.provider}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={busyAction?.target === formData.provider ? 'animate-spin' : ''} />
                    测试连接并同步
                  </button>
                  <button
                    type="button"
                    onClick={() => providersEdit.setFormData({...formData, key_status: formData.key_status === 'active' ? 'inactive' : 'active'})}
                    className={clsx(
                      'inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors',
                      formData.key_status === 'active' 
                        ? 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50' 
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100'
                    )}
                    title={formData.key_status === 'active' ? '点击暂停' : '点击激活'}
                  >
                    {formData.key_status === 'active' ? (
                      <><Pause size={12} /> 暂停</>
                    ) : (
                      <><Check size={12} /> 激活</>
                    )}
                  </button>
                </div>
                <span className="text-[11px] text-zinc-500 self-end">
                  当前状态：{formData.key_status === 'active' ? '激活' : '暂停'}
                </span>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <label className="shrink-0 text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2 block">
                  {t('providers.catalog_models_editor')}
                </label>
                <textarea
                  value={catalogEditorValue}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    const nextFormData = applyCatalogEditorToFormData(nextValue);
                    catalogEditorDirtyRef.current = true;
                    setCatalogEditorDirty(true);
                    setCatalogEditorValue(nextValue);
                    providersEdit.setFormData(nextFormData);
                  }}
                  onBlur={(e) => {
                    const nextValue = e.target.value;
                    const nextFormData = applyCatalogEditorToFormData(nextValue);
                    providersEdit.setFormData(nextFormData);
                    setCatalogEditorValue(serializeSupportedModels(nextFormData.supported_models));
                    setCatalogEditorDirty(false);
                    catalogEditorDirtyRef.current = false;
                  }}
                  placeholder={t('providers.supported_models_placeholder')}
                  spellCheck={false}
                  className="scrollbar-hover min-h-[12rem] w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[12px] leading-6 text-zinc-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-500">
                  <span>{t('providers.catalog_models_list')}</span>
                  <span className="tabular-nums">
                    {t('providers.key_models_count', {count: parseSupportedModels(catalogEditorValue).length})}
                  </span>
                </div>
                {(() => {
                  const models = parseSupportedModels(catalogEditorValue);
                  const hasClaudeModels = models.some(model => 
                    model.toLowerCase().includes('claude')
                  );
                  const isOpenAIProtocol = formData.driver_type === 'openai_compatible';
                  if (hasClaudeModels && isOpenAIProtocol) {
                    return (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                        <span className="font-semibold">提示：</span>
                        检测到 Claude 类型模型，建议使用 Anthropic 协议以获得更好的兼容性。
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              </div>

              <div className="border-t px-6 py-4 bg-zinc-50/80 flex flex-col sm:flex-row sm:items-center justify-end shrink-0 gap-3">
              <div className="sm:mr-auto text-[11px] text-zinc-500">
                {autoSaveState === 'saving' && t('providers.saving')}
                {autoSaveState === 'saved' && t('providers.save_success')}
                {autoSaveState === 'error' && t('providers.unknown_error')}
              </div>
              <button
                onClick={async () => {
                  flushCatalogEditorToFormData();
                  await flushPendingAutoSave();
                  await loadProviders();
                  providersEdit.close();
                }}
                className="text-[13px] font-bold text-zinc-500 hover:text-zinc-900 px-3"
                disabled={saving}
              >
                {t('common.close')}
              </button>
            </div>
            </DialogPanel>
        </div>
      </Dialog>

      {actionFeedback ? (
        <div
          role="status"
          aria-live="polite"
          className={clsx(
            'pointer-events-none fixed bottom-6 left-1/2 z-[70] flex w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] shadow-lg',
            actionToastLoading && 'border-blue-200 bg-blue-50/95 text-blue-900',
            !actionToastLoading && actionFeedback.ok && 'border-emerald-200 bg-emerald-50/95 text-emerald-900',
            !actionToastLoading && !actionFeedback.ok && 'border-red-200 bg-red-50/95 text-red-900',
          )}
        >
          {actionToastLoading ? (
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : actionFeedback.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <p className="min-w-0 flex-1 break-all leading-snug font-medium">{actionFeedback.msg}</p>
        </div>
      ) : null}
    </div>
  );
}

