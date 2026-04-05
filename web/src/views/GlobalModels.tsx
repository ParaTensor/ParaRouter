import React, { useEffect, useState } from 'react';
import { Database, Plus, RefreshCw, Save, Edit2, Check, X, Cloud } from 'lucide-react';
import { apiGet, apiPost, apiPut } from '../lib/api';
import { localUser } from '../lib/session';
import { useTranslation } from "react-i18next";

interface GlobalModel {
  id: string;
  name: string;
  description: string;
  context_length: number | null;
  global_pricing: {
    prompt?: number;
    completion?: number;
    cache_read?: number;
    cache_write?: number;
    reasoning?: number;
  };
  updated_at: number;
}

export default function GlobalModelsView() {
    const { t } = useTranslation();
  const [models, setModels] = useState<GlobalModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<GlobalModel>>({});
  const [providerFilter, setProviderFilter] = useState<string>('all');
  
  const [syncUrl, setSyncUrl] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  const loadModels = async () => {
    try {
      const data = await apiGet<GlobalModel[]>('/api/llm-models');
      setModels(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleEdit = (m: GlobalModel) => {
    setEditForm({ ...m });
    setIsEditModalOpen(true);
  };

  const handleSave = async () => {
    if (!editForm.id) return;
    try {
      await apiPut(`/api/llm-models/${encodeURIComponent(editForm.id)}`, {
        name: editForm.name,
        description: editForm.description,
        context_length: editForm.context_length,
        global_pricing: editForm.global_pricing,
      });
      setIsEditModalOpen(false);
      loadModels();
    } catch (err) {
      console.error(err);
      alert('Failed to update model.');
    }
  };

  const handleRemoteSync = async () => {
    if (!syncUrl) {
      alert('Please enter a sync URL.');
      return;
    }
    setSyncing(true);
    try {
      const res = await apiPost('/api/llm-models/remote-sync', { url: syncUrl });
      alert(`Successfully synced ${(res as any).count} models.`);
      setIsSyncModalOpen(false);
      loadModels();
    } catch (err) {
      console.error(err);
      alert('Remote sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  if (localUser.role !== 'admin') {
    return <div className="p-8 text-center text-red-500">{t('globalmodels.access_denied_admins_only')}</div>;
  }

  const ep = editForm.global_pricing || {};

  const filteredModels = models.filter((m) => {
    if (providerFilter === 'all') return true;
    const n = m.name.toLowerCase();
    if (providerFilter === 'openai') return n.includes('gpt') || n.includes('o1') || n.includes('o3') || n.includes('o4');
    if (providerFilter === 'anthropic') return n.includes('claude');
    if (providerFilter === 'google') return n.includes('gemini');
    return true;
  }).sort((a, b) => {
    const numA = parseFloat(a.name.match(/\d+(\.\d+)?/)?.[0] || '0');
    const numB = parseFloat(b.name.match(/\d+(\.\d+)?/)?.[0] || '0');
    if (numB !== numA) return numB - numA;
    return a.name.length - b.name.length;
  });

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 mb-2">{t('globalmodels.global_models_database')}</h1>
          <p className="text-zinc-500">
            {t('globalmodels.source_of_truth_for_all_llm_ba')}</p>
        </div>
        <button 
          onClick={() => setIsSyncModalOpen(true)}
          className="flex items-center gap-2 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={16} />
          {t('globalmodels.sync_data')}</button>
      </div>

      <div className="flex gap-2.5 flex-wrap">
        {['All', 'OpenAI', 'Anthropic', 'Google'].map((prov) => (
          <button
            key={prov}
            onClick={() => setProviderFilter(prov.toLowerCase())}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              providerFilter === prov.toLowerCase()
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-zinc-600 hover:bg-gray-50'
            }`}
          >
            {prov}
          </button>
        ))}
      </div>

      {/* Sync Modal */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-zinc-50/50">
              <h3 className="font-bold flex items-center gap-2 text-lg text-zinc-900">
                <Cloud size={20} className="text-blue-500" />
                {t('globalmodels.remote_sync')}</h3>
              <button 
                onClick={() => setIsSyncModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 p-1.5 rounded-md transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-zinc-500">
                {t('globalmodels.fetch_latest_official_pricing_')}</p>
              <div className="flex flex-col gap-3">
                <input 
                  type="text" 
                  placeholder={t('globalmodels.placeholder_url')} 
                  value={syncUrl}
                  onChange={e => setSyncUrl(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-4">
                  <button 
                    onClick={() => setIsSyncModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
                  >
                    {t('globalmodels.cancel')}</button>
                  <button 
                    onClick={handleRemoteSync}
                    disabled={syncing}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {syncing ? <RefreshCw size={16} className="animate-spin" /> : null}
                    {syncing ? 'Syncing...' : 'Start Sync'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-zinc-50/50">
              <h3 className="font-bold flex items-center gap-2 text-lg text-zinc-900">
                <Edit2 size={20} className="text-amber-500" />
                {t('globalmodels.edit_global_model')}</h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 p-1.5 rounded-md transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4 md:col-span-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">{t('globalmodels.model_id_read_only')}</label>
                  <div className="bg-zinc-100 text-zinc-500 px-3 py-2 rounded-lg font-mono text-sm border border-zinc-200">{editForm.id}</div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">{t('globalmodels.display_name')}</label>
                  <input 
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-blue-500 transition-all font-medium" 
                    value={editForm.name} 
                    onChange={e => setEditForm({...editForm, name: e.target.value})} 
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('globalmodels.main_pricing_1m_tokens')}</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{t('globalmodels.input_price')}</label>
                    <input 
                      type="number" step="0.000001" 
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm" 
                      value={ep.prompt || ''} 
                      onChange={e => setEditForm({...editForm, global_pricing: {...ep, prompt: Number(e.target.value)}})} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{t('globalmodels.output_price')}</label>
                    <input 
                      type="number" step="0.000001" 
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm" 
                      value={ep.completion || ''} 
                      onChange={e => setEditForm({...editForm, global_pricing: {...ep, completion: Number(e.target.value)}})} 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t('globalmodels.advanced_pricing')}</h4>
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs text-zinc-500 mb-1">{t('globalmodels.cache_read')}</label>
                      <input 
                        type="number" step="0.000001" 
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm" 
                        value={ep.cache_read || ''} 
                        onChange={e => setEditForm({...editForm, global_pricing: {...ep, cache_read: Number(e.target.value)}})} 
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-zinc-500 mb-1">{t('globalmodels.cache_write')}</label>
                      <input 
                        type="number" step="0.000001" 
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm" 
                        value={ep.cache_write || ''} 
                        onChange={e => setEditForm({...editForm, global_pricing: {...ep, cache_write: Number(e.target.value)}})} 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{t('globalmodels.reasoning_per_tkn')}</label>
                    <input 
                      type="number" step="0.000001" 
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm" 
                      value={ep.reasoning || ''} 
                      onChange={e => setEditForm({...editForm, global_pricing: {...ep, reasoning: Number(e.target.value)}})} 
                    />
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 pt-4 flex justify-end gap-2 border-t border-zinc-100">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  {t('globalmodels.cancel')}</button>
                <button 
                  onClick={handleSave}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center gap-2"
                >
                  <Save size={16} />
                  {t('globalmodels.save_changes')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border text-sm border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-zinc-50/50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 font-semibold text-zinc-600">{t('globalmodels.id_name')}</th>
              <th className="px-6 py-4 font-semibold text-zinc-600">{t('globalmodels.input_output')}</th>
              <th className="px-6 py-4 font-semibold text-zinc-600">{t('globalmodels.cache_r_w')}</th>
              <th className="px-6 py-4 font-semibold text-zinc-600">{t('globalmodels.reasoning')}</th>
              <th className="px-6 py-4 font-semibold text-right text-zinc-600">{t('globalmodels.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-zinc-400">{t('globalmodels.loading_models_registry')}</td></tr>
            ) : filteredModels.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-zinc-400">{t('globalmodels.no_models_found_in_database')}</td></tr>
            ) : filteredModels.map(m => {
              const pricing = m.global_pricing || {};
              
              return (
                <tr key={m.id} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="font-bold text-zinc-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{m.name}</div>
                    <div className="font-mono text-[10px] text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded w-max mt-1.5 opacity-70 group-hover:opacity-100 transition-opacity tracking-wider">{m.id}</div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="font-mono text-zinc-600 font-medium">${pricing.prompt ?? '-'} {t('globalmodels.')}{pricing.completion ?? '-'}</div>
                  </td>
                  <td className="px-6 py-5">
                    {(pricing.cache_read || pricing.cache_write) ? (
                      <div className="font-mono text-emerald-600 font-semibold">${pricing.cache_read ?? '-'} {t('globalmodels.')}{pricing.cache_write ?? '-'}</div>
                    ) : <span className="text-zinc-300 font-light italic">{t('globalmodels.not_cached')}</span>}
                  </td>
                  <td className="px-6 py-5">
                    {pricing.reasoning ? (
                      <div className="font-mono text-indigo-600 font-semibold">${pricing.reasoning}</div>
                    ) : <span className="text-zinc-300 font-light italic">{t('globalmodels.none')}</span>}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button 
                      onClick={() => handleEdit(m)} 
                      className="text-zinc-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-all"
                      title="Edit Model Metadata"
                    >
                      <Edit2 size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
