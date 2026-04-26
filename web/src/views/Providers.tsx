import React from 'react';
import {ShieldAlert, Plus, Trash2, Edit2, Globe, Cpu, Key, Copy, RefreshCw, CheckCircle2} from 'lucide-react';
import {ApiError, apiDelete, apiGet, apiPost, apiPut} from '../lib/api';
import {localUser} from '../lib/session';
import {clsx} from 'clsx';
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react';
import { Select } from '../components/Select';
import { useTranslation } from "react-i18next";
import {
  useProvidersEditUi,
  providersEdit,
  getProvidersEditSnapshot,
  type ProviderRow,
} from './providersEditUiStore';

type CatalogFeedbackState = {
  provider: string;
  ok: boolean;
  msg: string;
};

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

export default function ProvidersView() {
  const { t } = useTranslation();
  const isAdmin = localUser.role === 'admin';
  const [providers, setProviders] = React.useState<ProviderRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const { showModal, isEditing, formData, error } = useProvidersEditUi();
  const [selectedKeyIndex, setSelectedKeyIndex] = React.useState(0);
  const [catalogBusyTarget, setCatalogBusyTarget] = React.useState<string | null>(null);
  const [catalogFeedback, setCatalogFeedback] = React.useState<CatalogFeedbackState | null>(null);
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
    if (!showModal) return;
    setSelectedKeyIndex((current) => Math.min(current, Math.max(formData.keys.length - 1, 0)));
  }, [showModal, formData.keys.length]);

  React.useEffect(() => {
    if (showModal) return;
    setCatalogFeedback(null);
    setCatalogBusyTarget(null);
  }, [showModal]);

  const catalogToastLoading =
    catalogBusyTarget !== null &&
    catalogFeedback !== null &&
    catalogBusyTarget === catalogFeedback.provider;

  const handleOpenModal = (provider?: ProviderRow) => {
    if (provider) {
      providersEdit.openEdit(provider);
    } else {
      providersEdit.openNew();
    }
    setSelectedKeyIndex(0);
  };

  const handleSaveProvider = async () => {
    const providerId = formData.provider.trim().toLowerCase();
    if (!providerId) return;
    if (!isEditing && formData.keys.every((k) => !k.key.trim())) {
        providersEdit.setError(t('providers.error_key_required'));
        return;
    }
    
    setSaving(true);
    providersEdit.setError(null);
    const resumeLabel = formData.keys[selectedKeyIndex]?.label;
    const resumeIndex = selectedKeyIndex;
    try {
      await apiPut(`/api/provider-keys/${encodeURIComponent(providerId)}`, {
        ...formData,
        provider: providerId,
      });
      const rows = await loadProviders();
      const fresh = rows?.find((p) => p.provider === providerId);
      if (fresh) {
        providersEdit.openEdit(fresh);
        const idx = fresh.keys.findIndex((k) => (k.label || '') === (resumeLabel || ''));
        setSelectedKeyIndex(
          idx >= 0 ? idx : Math.min(resumeIndex, Math.max(fresh.keys.length - 1, 0)),
        );
      }
    } catch (err: any) {
      console.error('Failed to save provider:', err);
      providersEdit.setError(err.message || t('providers.unknown_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProvider = async (provider: string) => {
    if (!confirm(t('providers.confirm_delete', { provider }))) return;
    await apiDelete(`/api/provider-keys/${encodeURIComponent(provider)}`);
    await loadProviders();
  };

  const handleRefreshModelCatalog = async (providerId: string, keyId?: string) => {
    const targetId = keyId ? `${providerId}::${keyId}` : providerId;
    setCatalogBusyTarget(targetId);
    setCatalogFeedback({
      provider: targetId,
      ok: true,
      msg: t('providers.refresh_catalog_loading'),
    });
    const abortCtl = new AbortController();
    const abortTimer = window.setTimeout(() => abortCtl.abort(), 90_000);
    let syncOk = false;
    try {
      const path = keyId
        ? `/api/provider-keys/${encodeURIComponent(providerId)}/${encodeURIComponent(keyId)}/refresh-model-catalog`
        : `/api/provider-keys/${encodeURIComponent(providerId)}/refresh-model-catalog`;
      const res = await apiPost<{
        status: string;
        supported_models_count: number;
      }>(path, {}, {signal: abortCtl.signal});
      syncOk = true;
      setCatalogFeedback({
        provider: targetId,
        ok: true,
        msg: t('providers.refresh_catalog_success', {count: res.supported_models_count}),
      });
      window.setTimeout(() => {
        setCatalogFeedback((cur) => (cur?.provider === targetId && cur.ok ? null : cur));
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
      setCatalogFeedback({provider: targetId, ok: false, msg: message});
    } finally {
      window.clearTimeout(abortTimer);
      setCatalogBusyTarget(null);
    }
    let rows: ProviderRow[] | null = null;
    try {
      rows = await loadProviders();
    } catch (e) {
      console.error('loadProviders after catalog refresh:', e);
    }
    if (syncOk && rows) {
      const snap = getProvidersEditSnapshot();
      if (snap.showModal && snap.isEditing && snap.formData.provider === providerId) {
        const fresh = rows.find((p) => p.provider === providerId);
        if (fresh) {
          providersEdit.openEdit(fresh);
          if (keyId) {
            const idx = fresh.keys.findIndex((k) => String(k.id) === String(keyId));
            if (idx >= 0) setSelectedKeyIndex(idx);
          } else {
            setSelectedKeyIndex((i) => Math.min(i, Math.max(fresh.keys.length - 1, 0)));
          }
        }
      }
    }
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
          <p className="text-zinc-500 mt-1">{t('providers.manage_provider_account_metada')}</p>
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
                {p.keys && p.keys.length > 0 && (
                  <div className="flex max-h-24 flex-col gap-1.5 overflow-y-auto pr-0.5 [scrollbar-width:thin] [scrollbar-color:transparent_transparent] transition-all hover:[scrollbar-color:theme(colors.zinc.300)_transparent]">
                    {p.keys.map((k, i) => {
                      const maskedKey = k.key && k.key.length > 8 
                        ? `${k.key.substring(0, 4)}...${k.key.substring(k.key.length - 4)}` 
                        : (k.key ? '***' : '');
                      
                      if (!maskedKey) return null;

                      const modelCount = Array.isArray(k.supported_models) ? k.supported_models.length : 0;

                      return (
                        <div key={i} className="flex items-center gap-2.5 text-zinc-500 transition-colors group-hover:text-zinc-600">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-zinc-500 shadow-sm ring-1 ring-inset ring-zinc-200/70">
                            <Key size={14} strokeWidth={2} />
                          </div>
                          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium tracking-tight">{maskedKey}</span>
                            <span className="shrink-0 whitespace-nowrap text-[11px] font-medium tabular-nums text-zinc-400">
                              {t('providers.key_models_count', {count: modelCount})}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}



      <Dialog open={showModal} onClose={() => providersEdit.close()} className="relative z-50">
        <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <DialogPanel className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-left">
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

            <div className="flex-1 overflow-auto px-5 py-5 space-y-4">


              <div className="grid gap-4 sm:grid-cols-2">
                {isEditing && (
                  <div className="min-w-0 space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('providers.provider_id')}</label>
                    <input
                      value={formData.provider}
                      onChange={(e) => providersEdit.setFormData({...formData, provider: e.target.value})}
                      placeholder={t('providers.placeholder_id')}
                      disabled={isEditing}
                      className="w-full min-w-0 px-3 py-2 border rounded-lg text-sm bg-zinc-50 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                )}

                <div className={`min-w-0 space-y-2 ${!isEditing ? 'sm:col-span-2' : ''}`}>
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
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('providers.base_url')}</label>
                <input
                  value={formData.base_url}
                  onChange={(e) => providersEdit.setFormData({...formData, base_url: e.target.value})}
                  placeholder={t('providers.placeholder_base_url')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono"
                />
              </div>

              <p className="text-[11px] leading-relaxed text-zinc-500">{t('providers.catalog_sync_hint_modal')}</p>

              <div className="space-y-3 pt-4 border-t border-zinc-100">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                    {t('providers.api_keys_cost_channels')}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newKeys = [
                        ...formData.keys,
                        { label: t('providers.default_key_label', {n: formData.keys.length + 1}), key: '', status: 'active', supported_models: [] },
                      ];
                      providersEdit.setFormData({...formData, keys: newKeys});
                      setSelectedKeyIndex(newKeys.length - 1);
                    }}
                    className="text-xs font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded hover:bg-zinc-200 transition-colors"
                  >
                    {t('providers.add_key')}
                  </button>
                </div>

                <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-2">
                    <div className="mb-2 px-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      {t('providers.api_keys_cost_channels')}
                    </div>
                    <div className="space-y-1.5">
                      {formData.keys.map((k, index) => {
                        const isSelected = index === selectedKeyIndex;
                        return (
                          <button
                            key={k.id || index}
                            type="button"
                            onClick={() => setSelectedKeyIndex(index)}
                            className={clsx(
                              'w-full rounded-xl border px-3 py-2.5 text-left transition-all',
                              isSelected
                                ? 'border-purple-300 bg-white shadow-sm ring-1 ring-purple-100'
                                : 'border-zinc-200 bg-white/80 hover:border-zinc-300 hover:bg-white',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-900">
                                  {k.label || t('providers.placeholder_channel_name')}
                                </div>
                                <div className="mt-0.5 truncate text-[11px] font-mono text-zinc-500">
                                  {k.key ? `${k.key.slice(0, 4)}...${k.key.slice(-4)}` : t('providers.placeholder_key_new')}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className={clsx('text-[10px] font-bold uppercase tracking-widest', k.status === 'active' ? 'text-emerald-600' : 'text-zinc-400')}>
                                  {k.status === 'active' ? t('providers.active') : t('providers.inactive')}
                                </div>
                                <div className="mt-0.5 text-[10px] text-zinc-400">
                                  {t('providers.catalog_models_list')}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {formData.keys[selectedKeyIndex] ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div
                        className={clsx(
                          'mb-4 flex flex-wrap items-center gap-2',
                          formData.keys[selectedKeyIndex].id ? 'justify-end' : 'justify-between',
                        )}
                      >
                          {!formData.keys[selectedKeyIndex].id ? (
                            <p className="max-w-[min(100%,20rem)] text-[10px] leading-snug text-zinc-500">
                              {t('providers.sync_requires_save_hint')}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap items-center justify-end gap-2">
                          {formData.keys[selectedKeyIndex].id && (
                            <button
                              type="button"
                              onClick={() => handleRefreshModelCatalog(formData.provider, formData.keys[selectedKeyIndex].id as string)}
                              disabled={catalogBusyTarget === `${formData.provider}::${formData.keys[selectedKeyIndex].id}`}
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
                            >
                              <RefreshCw size={11} className={catalogBusyTarget === `${formData.provider}::${formData.keys[selectedKeyIndex].id}` ? 'animate-spin' : ''} />
                              {t('providers.refresh_catalog')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (formData.keys.length <= 1) return;
                              const newKeys = [...formData.keys];
                              newKeys.splice(selectedKeyIndex, 1);
                              const nextIndex = Math.min(selectedKeyIndex, Math.max(newKeys.length - 1, 0));
                              providersEdit.setFormData({...formData, keys: newKeys});
                              setSelectedKeyIndex(nextIndex);
                            }}
                            disabled={formData.keys.length <= 1}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-semibold text-red-600 hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={11} />
                            {t('providers.delete')}
                          </button>
                          </div>
                        </div>

                      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                        <div className="min-h-0 min-w-0 space-y-3 self-start">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                              {t('providers.display_name')}
                            </label>
                            <input
                              value={formData.keys[selectedKeyIndex].label}
                              onChange={(e) => {
                                const newKeys = [...formData.keys];
                                newKeys[selectedKeyIndex].label = e.target.value;
                                providersEdit.setFormData({...formData, keys: newKeys});
                              }}
                              placeholder={t('providers.placeholder_channel_name')}
                              className="w-full min-w-0 px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                              {t('status')}
                            </label>
                            <Select
                              value={formData.keys[selectedKeyIndex].status}
                              onChange={(v) => {
                                const newKeys = [...formData.keys];
                                newKeys[selectedKeyIndex].status = v;
                                providersEdit.setFormData({...formData, keys: newKeys});
                              }}
                              options={[
                                { value: 'active', label: t('providers.active') },
                                { value: 'inactive', label: t('providers.inactive') },
                              ]}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                              {t('api_key')}
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                autoComplete="off"
                                spellCheck={false}
                                value={formData.keys[selectedKeyIndex].key}
                                onChange={(e) => {
                                  const newKeys = [...formData.keys];
                                  newKeys[selectedKeyIndex].key = e.target.value;
                                  providersEdit.setFormData({...formData, keys: newKeys});
                                }}
                                placeholder={isEditing && formData.keys[selectedKeyIndex].id ? t('providers.placeholder_key_editing') : t('providers.placeholder_key_new')}
                                className={clsx(
                                  'w-full px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all font-mono pr-10',
                                  formData.keys[selectedKeyIndex].key && formData.keys[selectedKeyIndex].key.length > 0 ? 'border-emerald-200 bg-emerald-50/30' : 'border-zinc-200',
                                )}
                              />
                              {formData.keys[selectedKeyIndex].key && formData.keys[selectedKeyIndex].key.length > 0 && (
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(formData.keys[selectedKeyIndex].key)}
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

                        <div className="flex min-h-0 min-w-0 flex-col gap-1.5 xl:h-full">
                          <label className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                            {t('providers.catalog_models_list')}
                          </label>
                          <div
                            role="list"
                            className="min-h-[8rem] w-full flex-1 basis-0 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 [scrollbar-gutter:stable]"
                          >
                            {(() => {
                              const models = Array.isArray(formData.keys[selectedKeyIndex].supported_models)
                                ? formData.keys[selectedKeyIndex].supported_models!
                                : [];
                              if (models.length === 0) {
                                return (
                                  <p className="text-xs leading-relaxed text-zinc-400">{t('providers.catalog_empty')}</p>
                                );
                              }
                              return models.map((id, idx) => (
                                <div key={`${id}-${idx}`} role="listitem" className="font-mono text-[12px] leading-6 text-zinc-800">
                                  {id}
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
</div>
            <div className="border-t px-6 py-4 bg-zinc-50/80 flex flex-col sm:flex-row sm:items-center justify-end shrink-0 gap-3">
              <button
                onClick={() => providersEdit.close()}
                className="text-[13px] font-bold text-zinc-500 hover:text-zinc-900 px-3"
                disabled={saving}
              >
                {t('providers.cancel')}
              </button>
              <button
                onClick={handleSaveProvider}
                disabled={saving || !formData.provider.trim() || (!isEditing && formData.keys.every(k => !k.key.trim()))}
                className="bg-purple-600 text-white rounded-lg px-6 py-2 text-sm font-semibold shadow-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{t('providers.saving')}</span>
                  </>
                ) : (
                  <span>{isEditing ? t('providers.update_provider') : t('providers.create_provider_btn')}</span>
                )}
              </button>
            </div>
            </DialogPanel>
        </div>
      </Dialog>

      {catalogFeedback ? (
        <div
          role="status"
          aria-live="polite"
          className={clsx(
            'pointer-events-none fixed bottom-6 left-1/2 z-[70] flex w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] shadow-lg',
            catalogToastLoading && 'border-blue-200 bg-blue-50/95 text-blue-900',
            !catalogToastLoading && catalogFeedback.ok && 'border-emerald-200 bg-emerald-50/95 text-emerald-900',
            !catalogToastLoading && !catalogFeedback.ok && 'border-red-200 bg-red-50/95 text-red-900',
          )}
        >
          {catalogToastLoading ? (
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : catalogFeedback.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <p className="min-w-0 flex-1 leading-snug font-medium">{catalogFeedback.msg}</p>
        </div>
      ) : null}
    </div>
  );
}

