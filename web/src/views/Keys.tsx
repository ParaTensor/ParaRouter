import React, {useEffect, useState} from 'react';
import {Plus, Copy, Trash2, Eye, EyeOff, ShieldCheck, Check, X, Loader2, Search} from 'lucide-react';
import {Dialog, DialogBackdrop, DialogPanel} from '@headlessui/react';
import {apiDelete, apiGet, apiPost} from '../lib/api';
import {localUser} from '../lib/session';
import { useTranslation } from "react-i18next";

interface APIKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string;
  usage: string;
  uid: string;
  budgetLimit?: number;
  allowedModels?: string[];
}

export default function KeysView() {
    const { t } = useTranslation();
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newBudgetLimit, setNewBudgetLimit] = useState('');
  const [selectedAllowedModelIds, setSelectedAllowedModelIds] = useState<string[]>([]);
  const [modelRegistry, setModelRegistry] = useState<{id: string; name: string}[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelFilter, setModelFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string; type: 'success' | 'error'} | null>(null);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadKeys = async () => {
    try {
      const data = await apiGet<APIKey[]>(`/api/user-api-keys?uid=${encodeURIComponent(localUser.uid)}`);
      setKeys(data);
    } catch (error) {
      console.error('Failed to load keys:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const resetCreateKeyModal = () => {
    setNewKeyName('');
    setNewBudgetLimit('');
    setSelectedAllowedModelIds([]);
    setModelFilter('');
  };

  useEffect(() => {
    if (!isModalOpen) return;
    let cancelled = false;
    setModelsLoading(true);
    apiGet<{id: string; name: string}[]>('/api/models')
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setModelRegistry(data.map((m) => ({id: m.id, name: m.name || m.id})));
      })
      .catch(() => {
        if (!cancelled) setModelRegistry([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isModalOpen]);

  const filteredRegistry = modelRegistry.filter((m) => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return true;
    return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  });

  const toggleAllowedModel = (id: string) => {
    setSelectedAllowedModelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const key = `sk-oh-v1-${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`;
      await apiPost('/api/user-api-keys', {
        name: newKeyName,
        key,
        uid: localUser.uid,
        lastUsed: 'Never',
        usage: '$0.00',
        budgetLimit: newBudgetLimit ? parseFloat(newBudgetLimit) : undefined,
        allowedModels: selectedAllowedModelIds.length > 0 ? selectedAllowedModelIds : undefined,
      });
      resetCreateKeyModal();
      setIsModalOpen(false);
      await loadKeys();
      showNotification(t('keys.create_success'), 'success');
    } catch (error: any) {
      console.error('Failed to create key:', error);
      showNotification(error?.message || t('keys.create_failed'), 'error');
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!window.confirm(t('keys.delete_confirm'))) return;
    try {
      await apiDelete(`/api/user-api-keys/${id}`);
      await loadKeys();
      showNotification(t('keys.delete_success', 'Key deleted successfully'), 'success');
    } catch (error: any) {
      console.error('Failed to delete key:', error);
      showNotification(error?.message || t('keys.delete_failed'), 'error');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 relative">
      {notification && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[999] px-6 py-3 rounded-xl shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
          notification.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
          <span className="text-sm font-bold">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-2 p-1 hover:bg-black/5 rounded-md transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('keys.api_keys')}</h1>
          <p className="text-gray-500 mt-1">{t('keys.manage_your_api_keys_to_authen')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetCreateKeyModal();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-all active:scale-95"
        >
          <Plus size={18} />
          {t('keys.create_key')}</button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-3 text-zinc-300">
        <ShieldCheck className="shrink-0 text-emerald-500" size={20} />
        <p className="text-sm">
          {t('keys.your_api_keys_are_sensitive_in')}</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-50">
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('keys.name')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('keys.key')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('keys.usage')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('keys.created')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">{t('keys.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="font-semibold text-gray-900">{key.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 font-mono text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100 w-fit">
                      {showKey === key.id ? key.key : 'sk-oh-v1-••••••••••••'}
                      <button
                        onClick={() => setShowKey(showKey === key.id ? null : key.id)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        {showKey === key.id ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-zinc-600">{key.usage}</span>
                    {key.budgetLimit !== undefined && <span className="text-xs text-zinc-400 ml-1">/ ${key.budgetLimit.toFixed(2)}</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(key.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => copyToClipboard(key.key, key.id)}
                        className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-all"
                      >
                        {copiedId === key.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                      </button>
                      <button
                        onClick={() => handleDeleteKey(key.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 text-sm">
                    {t('keys.no_api_keys_found_create_one_t')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetCreateKeyModal();
        }}
        className="relative z-[100]"
      >
        <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <DialogPanel className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[min(90vh,720px)] overflow-hidden text-left ring-1 ring-black/[0.04]">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="font-bold text-lg">{t('keys.create_api_key')}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{t('keys.modal_subtitle')}</p>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-5 py-5 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('keys.key_name')}</label>
                <input
                  autoFocus
                  type="text"
                  placeholder={t('keys.placeholder_key_name')}
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
                  className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed -mt-1">{t('keys.give_your_key_a_descriptive_na')}</p>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('keys.budget_limit_label')}</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={t('keys.placeholder_budget')}
                  value={newBudgetLimit}
                  onChange={(e) => setNewBudgetLimit(e.target.value)}
                  className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('keys.allowed_models_label')}</label>
                    <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed max-w-prose">{t('customers.allowed_models_hint')}</p>
                  </div>
                  {selectedAllowedModelIds.length > 0 && (
                    <span className="text-[10px] font-bold tracking-wide text-blue-800 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-md whitespace-nowrap">
                      {t('customers.models_selected_count', {count: selectedAllowedModelIds.length})}
                    </span>
                  )}
                </div>
                {modelsLoading ? (
                  <div className="flex min-h-[200px] items-center justify-center gap-2 rounded-xl border border-zinc-200/80 bg-white text-zinc-500 text-sm shadow-sm">
                    <Loader2 size={18} className="animate-spin text-zinc-400" />
                    {t('customers.models_loading')}
                  </div>
                ) : modelRegistry.length === 0 ? (
                  <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white text-sm text-zinc-500">
                    {t('customers.models_empty')}
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-blue-500/25 focus-within:border-blue-400 transition-all">
                    <div className="relative border-b border-zinc-100 bg-zinc-50/30">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                      <input
                        type="search"
                        value={modelFilter}
                        onChange={(e) => setModelFilter(e.target.value)}
                        placeholder={t('customers.models_search')}
                        className="w-full pl-10 pr-3 py-2.5 text-sm bg-transparent focus:outline-none placeholder:text-zinc-400"
                      />
                    </div>
                    <div className="max-h-[min(220px,36vh)] min-h-[160px] overflow-y-auto overscroll-contain p-1.5">
                      {filteredRegistry.length === 0 ? (
                        <p className="text-xs text-zinc-400 text-center py-8">{t('models.no_matching_models_found')}</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {filteredRegistry.map((m) => {
                            const checked = selectedAllowedModelIds.includes(m.id);
                            return (
                              <li key={m.id}>
                                <label
                                  className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer text-left border border-transparent transition-colors ${
                                    checked ? 'bg-blue-50/60 border-blue-100/80' : 'hover:bg-zinc-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAllowedModel(m.id)}
                                    className="mt-1 size-4 shrink-0 rounded border-zinc-300 text-blue-600 focus:ring-blue-500/30"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-zinc-900 leading-snug">{m.name}</span>
                                    <span className="block text-[11px] font-mono text-zinc-400 truncate mt-0.5">{m.id}</span>
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-gray-100 px-6 py-4 bg-zinc-50/80 flex flex-col sm:flex-row sm:items-center justify-end shrink-0 gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetCreateKeyModal();
                }}
                className="text-[13px] font-bold text-zinc-500 hover:text-zinc-900 px-3"
              >
                {t('keys.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreateKey}
                disabled={!newKeyName.trim()}
                className="bg-black text-white rounded-lg px-6 py-2 text-sm font-semibold shadow-sm hover:bg-zinc-800 disabled:opacity-50 flex items-center gap-2 transition-all"
              >
                {t('keys.create_key')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
