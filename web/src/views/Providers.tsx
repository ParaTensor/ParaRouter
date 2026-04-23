import React from 'react';
import {ExternalLink, ShieldAlert, Plus, Trash2, Edit2, Globe, FileText, X, Cpu, Key, Copy, CheckCircle2} from 'lucide-react';
import {apiDelete, apiGet, apiPut} from '../lib/api';
import {localUser} from '../lib/session';
import {clsx} from 'clsx';
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react';
import { useTranslation } from "react-i18next";

type ProviderKey = {
  id?: string;
  label: string;
  key: string;
  status: string;
};

type ProviderRow = {
  provider: string;
  status: string;
  label?: string;
  base_url?: string;
  docs_url?: string;
  supported_models?: string[];
  supported_models_updated_at?: number | null;
  keys: ProviderKey[];
};

const DEFAULT_PROVIDER: ProviderRow = {
  provider: '',
  label: '',
  base_url: '',
  docs_url: '',
  status: 'active',
  keys: [{ label: 'Default', key: '', status: 'active' }],
};

export default function ProvidersView() {
    const { t } = useTranslation();
  const isAdmin = localUser.role === 'admin';
  const [providers, setProviders] = React.useState<ProviderRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [formData, setFormData] = React.useState<ProviderRow>(DEFAULT_PROVIDER);
  const [error, setError] = React.useState<string | null>(null);

  const loadProviders = React.useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    try {
      const rows = await apiGet<ProviderRow[]>('/api/provider-keys');
      setProviders(rows);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleOpenModal = (provider?: ProviderRow) => {
    if (provider) {
      setFormData({
        ...provider,
        label: provider.label || '',
        base_url: provider.base_url || '',
        docs_url: provider.docs_url || '',
        keys: provider.keys ? provider.keys.map(k => ({ ...k })) : [{ label: 'Default', key: '', status: 'active' }], // Show keys for copy
      });
      setIsEditing(true);
    } else {
      setFormData({
        ...DEFAULT_PROVIDER,
        provider: 'openai',
        label: 'OpenAI',
        base_url: 'https://api.openai.com/v1',
        docs_url: 'https://platform.openai.com/docs',
      });
      setIsEditing(false);
    }
    setError(null);
    setShowModal(true);
  };

  const handleSaveProvider = async () => {
    const providerId = formData.provider.trim().toLowerCase();
    if (!providerId) return;
    if (!isEditing && formData.keys.every((k) => !k.key.trim())) {
        setError(t('providers.error_key_required'));
        return;
    }
    
    setSaving(true);
    setError(null);
    try {
      await apiPut(`/api/provider-keys/${encodeURIComponent(providerId)}`, {
        ...formData,
        provider: providerId,
      });
      setShowModal(false);
      await loadProviders();
    } catch (err: any) {
      console.error('Failed to save provider:', err);
      setError(err.message || t('providers.unknown_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProvider = async (provider: string) => {
    if (!confirm(t('providers.confirm_delete', { provider }))) return;
    await apiDelete(`/api/provider-keys/${encodeURIComponent(provider)}`);
    await loadProviders();
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {providers.map((p) => (
            <div 
              key={p.provider} 
              className="group flex flex-col bg-white border border-zinc-100 rounded-[24px] p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] hover:-translate-y-1.5 transition-all duration-500 ease-out relative"
            >
              {/* Top Row: Icon + Actions */}
              <div className="flex items-start justify-between mb-8">
                <div className="relative">
                  <div className="w-14 h-14 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-center justify-center text-zinc-400 group-hover:scale-110 group-hover:border-zinc-200 transition-all duration-500">
                    <Cpu size={28} strokeWidth={1.5} />
                  </div>
                  {/* Status Indicator */}
                  <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm border border-zinc-50">
                    <div className={clsx(
                      "w-2.5 h-2.5 rounded-full",
                      p.status === 'active' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-300"
                    )} />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 translate-x-2 -translate-y-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-500">

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
              <div className="mb-8">
                <div className="flex items-center flex-wrap gap-2 mb-1.5">
                  <h3 className="text-xl font-bold text-zinc-900 tracking-tight leading-none group-hover:text-black transition-colors">
                    {p.label || p.provider}
                  </h3>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-[10px] font-bold uppercase tracking-wider text-zinc-500 border border-zinc-200/50">
                  {p.provider}
                </span>
              </div>

              {/* Info & Links */}
              <div className="mt-auto space-y-4 pt-6 border-t border-zinc-50">
                {p.base_url && (
                  <div className="flex items-center gap-3 text-zinc-500 group-hover:text-zinc-600 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-zinc-50 border border-zinc-100/50 flex items-center justify-center shrink-0">
                      <Globe size={15} />
                    </div>
                    <span className="text-[13px] font-medium truncate tracking-tight">{p.base_url}</span>
                  </div>
                )}
                <div className="flex items-start gap-3 text-zinc-500 group-hover:text-zinc-600 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-zinc-50 border border-zinc-100/50 flex items-center justify-center shrink-0">
                    <FileText size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium tracking-tight text-zinc-700">
                      {Array.isArray(p.supported_models) && p.supported_models.length > 0
                        ? `${p.supported_models.length} upstream models synced`
                        : 'No upstream model catalog yet'}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {p.supported_models_updated_at
                        ? `Updated ${new Date(p.supported_models_updated_at).toLocaleString()}`
                        : 'Pricing falls back to the global model list until the provider catalog is fetched.'}
                    </div>
                  </div>
                </div>
                {p.keys && p.keys.length > 0 && (
                  <div className="flex flex-col gap-2 max-h-[120px] overflow-y-auto pr-1 [scrollbar-width:thin] hover:[scrollbar-color:theme(colors.zinc.300)_transparent] [scrollbar-color:transparent_transparent] transition-all">
                    {p.keys.map((k, i) => {
                      const maskedKey = k.key && k.key.length > 8 
                        ? `${k.key.substring(0, 4)}...${k.key.substring(k.key.length - 4)}` 
                        : (k.key ? '***' : '');
                      
                      if (!maskedKey) return null;

                      return (
                        <div key={i} className="flex items-center gap-3 text-zinc-500 group-hover:text-zinc-600 transition-colors">
                          <div className="w-8 h-8 rounded-lg bg-zinc-50 border border-zinc-100/50 flex items-center justify-center shrink-0">
                            <Key size={15} />
                          </div>
                          <span className="text-[13px] font-medium font-mono truncate tracking-tight">{maskedKey}</span>
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



      <Dialog open={showModal} onClose={() => setShowModal(false)} className="relative z-50">
        <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <DialogPanel className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-left">
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


              {!isEditing ? null : (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('providers.provider_id')}</label>
                  <input
                    value={formData.provider}
                    onChange={(e) => setFormData({...formData, provider: e.target.value})}
                    placeholder={t('providers.placeholder_id')}
                    disabled={isEditing}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-zinc-50 focus:outline-none disabled:opacity-50"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('providers.display_name')}</label>
                <input
                  value={formData.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    if (!isEditing) {
                      const id = label.toLowerCase().replace(/[^a-z0-9]/g, '');
                      setFormData({
                        ...formData,
                        label,
                        provider: id,
                        base_url: id ? `https://api.${id}.com/v1` : '',
                        docs_url: id ? `https://platform.${id}.com/docs` : ''
                      });
                    } else {
                      setFormData({...formData, label});
                    }
                  }}
                  placeholder={t('providers.placeholder_display_name')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('providers.base_url')}</label>
                <input
                  value={formData.base_url}
                  onChange={(e) => setFormData({...formData, base_url: e.target.value})}
                  placeholder={t('providers.placeholder_base_url')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono"
                />
              </div>



              
              <div className="space-y-3 pt-4 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                    {t('providers.api_keys_cost_channels')}</label>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, keys: [...formData.keys, { label: 'New Channel', key: '', status: 'active' }]})}
                    className="text-xs font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded hover:bg-zinc-200 transition-colors"
                  >
                    {t('providers.add_key')}</button>
                </div>
                
                <div className="space-y-3">
                  {formData.keys.map((k, index) => (
                    <div key={k.id || index} className="flex gap-2 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={k.label}
                            onChange={(e) => {
                              const newKeys = [...formData.keys];
                              newKeys[index].label = e.target.value;
                              setFormData({...formData, keys: newKeys});
                            }}
                            placeholder={t('providers.placeholder_channel_name')}
                            className="flex-1 px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all"
                          />
                          <select
                            value={k.status}
                            onChange={(e) => {
                              const newKeys = [...formData.keys];
                              newKeys[index].status = e.target.value;
                              setFormData({...formData, keys: newKeys});
                            }}
                            className="bg-white border border-zinc-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                          >
                            <option value="active">{t('providers.active')}</option>
                            <option value="inactive">{t('providers.inactive')}</option>
                          </select>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            value={k.key}
                            onChange={(e) => {
                              const newKeys = [...formData.keys];
                              newKeys[index].key = e.target.value;
                              setFormData({...formData, keys: newKeys});
                            }}
                            placeholder={isEditing && k.id ? t('providers.placeholder_key_editing') : t('providers.placeholder_key_new')}
                            className={clsx(
                              "w-full px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all font-mono pr-24",
                              k.key && k.key.length > 0 ? "border-emerald-200 bg-emerald-50/30" : "border-zinc-200"
                            )}
                          />
                          {k.key && k.key.length > 0 && (
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 shadow-sm pointer-events-none">
                                <CheckCircle2 size={10} />
                                已配置
                              </span>
                              <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(k.key)}
                                className="text-zinc-400 hover:text-zinc-800 p-1.5 rounded-md hover:bg-zinc-100 transition-colors"
                                title="复制 API Key"
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {(isEditing || formData.keys.length > 1) && (
                        <button
                          type="button"
                          onClick={() => {
                            const newKeys = [...formData.keys];
                            newKeys.splice(index, 1);
                            setFormData({...formData, keys: newKeys});
                          }}
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors h-fit self-center mt-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
</div>
            <div className="border-t px-6 py-4 bg-zinc-50/80 flex flex-col sm:flex-row sm:items-center justify-end shrink-0 gap-3">
              <button
                onClick={() => setShowModal(false)}
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
    </div>
  );
}

