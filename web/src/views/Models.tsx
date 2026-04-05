import React, {useEffect, useState} from 'react';
import {Search, ArrowUpRight, Zap, SlidersHorizontal} from 'lucide-react';
import {apiGet, apiPost} from '../lib/api';
import {localUser} from '../lib/session';
import { useTranslation } from "react-i18next";

// No initialModels needed anymore, data comes from real pricing API.


export default function ModelsView() {
    const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = localUser.role === 'admin';

  const loadModels = async () => {
    try {
      const data = await apiGet<any[]>('/api/models');
      setModels(data);
    } catch (error) {
      console.error('Load models failed:', error);
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);



  const filteredModels = models.filter(
    (m) => (m.name + ' ' + m.provider).toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => {
    const numA = parseFloat(a.name.match(/\d+(\.\d+)?/)?.[0] || '0');
    const numB = parseFloat(b.name.match(/\d+(\.\d+)?/)?.[0] || '0');
    if (numB !== numA) return numB - numA;
    return a.name.length - b.name.length;
  });

  if (loading) {
    return <div className="text-center text-zinc-500">{t('models.loading_models')}</div>;
  }

  return (
    <div className="space-y-10">
      <div className="text-center max-w-2xl mx-auto pt-4 pb-4">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900 mb-4">{t('models.the_unified_interface_for_llms')}</h1>
        <p className="text-lg text-zinc-500 font-medium">{t('models.access_any_ai_model_via_a_sing')}</p>
      </div>

      <div className="max-w-3xl mx-auto sticky top-[72px] z-30 bg-white/80 backdrop-blur-md py-2">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-black transition-colors" size={20} />
          <input
            type="text"
            placeholder={t('models.placeholder_search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-12 py-3.5 bg-white border border-gray-200 rounded-xl text-[15px] focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5 transition-all"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button className="p-1.5 hover:bg-gray-100 rounded-md text-zinc-400 hover:text-black transition-colors">
              <SlidersHorizontal size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredModels.length > 0 ? (
          filteredModels.map((model) => (
            <div key={model.id} className="group bg-white border border-gray-100 rounded-xl p-4 hover:border-zinc-300 transition-all duration-200 flex flex-col">
              {/* ... existing model card content ... */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-50 border border-gray-100 flex items-center justify-center font-bold text-zinc-300 text-lg">
                    {model.provider ? model.provider[0] : '?'}
                  </div>
                  <div>
                    <h3 className="font-bold text-[15px] text-zinc-900 leading-tight">{model.name}</h3>
                    <p className="text-xs text-zinc-400 font-medium">{model.provider}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {model.isPopular && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-zinc-900 text-white text-[9px] font-bold uppercase tracking-wider rounded">
                      {t('models.trending')}</span>
                  )}
                  <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">{model.context}</span>
                </div>
              </div>

              <p className="text-[13px] text-zinc-500 leading-relaxed mb-4 flex-grow line-clamp-2">
                {t(`models.descriptions.${model.id}`, {defaultValue: model.description})}
              </p>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-zinc-50/50 rounded-lg p-2.5 border border-gray-50">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">{t('models.prompt')}</p>
                  <p className="font-mono text-xs font-semibold text-zinc-700">{model.pricing.prompt}</p>
                </div>
                <div className="bg-zinc-50/50 rounded-lg p-2.5 border border-gray-50">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">{t('models.completion')}</p>
                  <p className="font-mono text-xs font-semibold text-zinc-700">{model.pricing.completion}</p>
                </div>
              </div>

              {(model.pricing.cache_read || model.pricing.cache_write || model.pricing.reasoning) && (
                <div className="grid grid-cols-2 gap-2 mb-4 pt-1 border-t border-gray-50/50">
                  {model.pricing.cache_read ? (
                    <div className="bg-emerald-50/30 rounded-lg p-2.5 border border-emerald-50/50">
                      <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">{t('models.cache_hit')}</p>
                      <p className="font-mono text-xs font-semibold text-emerald-700">{model.pricing.cache_read}</p>
                    </div>
                  ) : <div className="bg-transparent p-2.5"></div>}
                  {model.pricing.reasoning ? (
                    <div className="bg-indigo-50/30 rounded-lg p-2.5 border border-indigo-50/50">
                      <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mb-0.5">{t('models.reasoning')}</p>
                      <p className="font-mono text-xs font-semibold text-indigo-700">{model.pricing.reasoning}</p>
                    </div>
                  ) : (
                    <div className="bg-transparent p-2.5"></div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-gray-50 mt-auto">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                  <Zap size={10} className="text-emerald-500" />
                  {model.latency}
                </div>
                <button className="flex items-center gap-1 text-xs font-bold text-zinc-900 opacity-0 group-hover:opacity-100 transition-all">
                  {t('models.details')}<ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
             <div className="max-w-xs mx-auto">
               <p className="text-zinc-400 font-medium mb-1">暂无可用模型</p>
               <p className="text-xs text-zinc-300">请前往定价中心配置并发布您的第一个模型价格。</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
