import React from 'react';
import { X, ChevronDown, Zap } from 'lucide-react';
import { Select } from '../../components/Select';
import { Combobox, ComboboxInput, ComboboxOptions, ComboboxOption, ComboboxButton } from '@headlessui/react';
import { ProviderKeyRow, DrawerTab, PricingPreview } from './types';

interface EditPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  drawerTab: DrawerTab;
  setDrawerTab: (tab: DrawerTab) => void;
  model: string;
  setModel: (m: string) => void;
  modelQuery: string;
  setModelQuery: (q: string) => void;
  providerAccountId: string;
  setProviderAccountId: (id: string) => void;
  providerKeyId: string;
  setProviderKeyId: (id: string) => void;
  formPriceMode: 'fixed' | 'markup';
  setFormPriceMode: (mode: 'fixed' | 'markup') => void;
  inputCost: string;
  setInputCost: (val: string) => void;
  outputCost: string;
  setOutputCost: (val: string) => void;
  cacheReadCost: string;
  setCacheReadCost: (val: string) => void;
  cacheWriteCost: string;
  setCacheWriteCost: (val: string) => void;
  reasoningCost: string;
  setReasoningCost: (val: string) => void;
  inputPrice: string;
  setInputPrice: (val: string) => void;
  outputPrice: string;
  setOutputPrice: (val: string) => void;
  cacheReadPrice: string;
  setCacheReadPrice: (val: string) => void;
  cacheWritePrice: string;
  setCacheWritePrice: (val: string) => void;
  reasoningPrice: string;
  setReasoningPrice: (val: string) => void;
  contextLength: string;
  setContextLength: (val: string) => void;
  latencyMs: string;
  setLatencyMs: (val: string) => void;
  isTopProvider: boolean;
  setIsTopProvider: (val: boolean) => void;
  markupRate: string;
  setMarkupRate: (val: string) => void;
  providerKeyRows: ProviderKeyRow[];
  globalModels: any[];
  discountRate: string;
  setDiscountRate: (val: string) => void;
  providers: string[];
  busy: boolean;
  draftCount: number;
  handlePreview: () => Promise<void>;
  saveDraft: () => Promise<void>;
  handlePublish: () => Promise<void>;
  preview: PricingPreview | null;
}

export default function EditPriceModal({
  isOpen, onClose, drawerTab, setDrawerTab,
  model, setModel, modelQuery, setModelQuery,
  providerAccountId, setProviderAccountId, providerKeyId, setProviderKeyId,
  formPriceMode, setFormPriceMode,
  inputCost, setInputCost, outputCost, setOutputCost,
  cacheReadCost, setCacheReadCost, cacheWriteCost, setCacheWriteCost,
  reasoningCost, setReasoningCost,
  inputPrice, setInputPrice, outputPrice, setOutputPrice,
  cacheReadPrice, setCacheReadPrice, cacheWritePrice, setCacheWritePrice,
  reasoningPrice, setReasoningPrice, contextLength, setContextLength, latencyMs, setLatencyMs,
  isTopProvider, setIsTopProvider, markupRate, setMarkupRate,
  providerKeyRows, globalModels, discountRate, setDiscountRate, providers, busy, draftCount,
  handlePreview, saveDraft, handlePublish, preview
}: EditPriceModalProps) {

  const [costMultiplier, setCostMultiplier] = React.useState('1.0');
  const [salesMultiplier, setSalesMultiplier] = React.useState('1.0');
  const [activePriceView, setActivePriceView] = React.useState<'sales' | 'cost'>('sales');

  const applyRates = (modelId: string, crate: string, srate: string) => {
    const gm = globalModels.find(m => m.id === modelId.trim() || m.name.toLowerCase() === modelId.trim().toLowerCase() || m.id.split('/').pop() === modelId.trim());
    if (!gm || !gm.pricing) return;
    const p = gm.pricing;
    const parse = (str?: string) => str ? parseFloat(str.replace(/[^0-9.]/g, '')) : 0;
    const format = (val: number) => parseFloat(val.toFixed(2)).toString();
    
    const cmap = parseFloat(crate);
    if (!isNaN(cmap)) {
      if (p.prompt) setInputCost(format(parse(p.prompt) * cmap));
      if (p.completion) setOutputCost(format(parse(p.completion) * cmap));
      if (p.cache_read) setCacheReadCost(format(parse(p.cache_read) * cmap));
      if (p.cache_write) setCacheWriteCost(format(parse(p.cache_write) * cmap));
      if (p.reasoning) setReasoningCost(format(parse(p.reasoning) * cmap));
    }
    const smap = parseFloat(srate);
    if (!isNaN(smap)) {
      if (p.prompt) setInputPrice(format(parse(p.prompt) * smap));
      if (p.completion) setOutputPrice(format(parse(p.completion) * smap));
      if (p.cache_read) setCacheReadPrice(format(parse(p.cache_read) * smap));
      if (p.cache_write) setCacheWritePrice(format(parse(p.cache_write) * smap));
      if (p.reasoning) setReasoningPrice(format(parse(p.reasoning) * smap));
    }
  };

  const hasOfficialPricing = Boolean(globalModels.find(m => m.id === model.trim() || m.name.toLowerCase() === model.trim().toLowerCase() || m.id.split('/').pop() === model.trim())?.pricing);

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">{model ? 'Edit Price' : 'New Price'}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Provider-bound draft editor</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-zinc-100"><X size={18} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-5 py-3 border-b shrink-0 bg-zinc-50/30">
              <div className="inline-flex p-1 bg-white rounded-lg text-sm font-medium shadow-sm border border-zinc-200">
                <button onClick={() => setDrawerTab('quick')} className={`px-3 py-1.5 rounded-md ${drawerTab === 'quick' ? 'bg-zinc-100 text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>Quick Pricing</button>
                <button onClick={() => setDrawerTab('batch')} className={`px-3 py-1.5 rounded-md ${drawerTab === 'batch' ? 'bg-zinc-100 text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>Batch Rules</button>
                <button onClick={() => setDrawerTab('advanced')} className={`px-3 py-1.5 rounded-md ${drawerTab === 'advanced' ? 'bg-zinc-100 text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>Advanced</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {drawerTab === 'quick' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Cost Channel (Key)</label>
                    <Select
                      value={providerKeyId}
                      onChange={(val) => {
                        setProviderKeyId(val);
                        const selectedP = providerKeyRows.find(p => p.keys && p.keys.some(k => k.id === val));
                        if(selectedP) setProviderAccountId(selectedP.provider);
                      }}
                      options={[
                        { value: '', label: 'Select a key channel...' },
                        ...providerKeyRows
                          .filter(p => !providerAccountId || p.provider === providerAccountId)
                          .flatMap(p => (p.keys || []).filter(k => !!k.id).map(k => ({
                            value: k.id as string,
                            label: `${p.provider} / ${k.label}`
                          })))
                      ]}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Model Name</label>
                    <Combobox value={model} onChange={(val) => {
                      setModel(val || ''); setModelQuery('');
                      const gm = globalModels.find(m => m.id === val);
                      if (gm?.pricing) {
                        const parse = (str?: string) => str ? String(parseFloat(str.replace(/[^0-9.]/g, ''))) : '';
                        setInputPrice(parse(gm.pricing.prompt));
                        setOutputPrice(parse(gm.pricing.completion));
                        setCacheReadPrice(parse(gm.pricing.cache_read));
                        setCacheWritePrice(parse(gm.pricing.cache_write));
                        setReasoningPrice(parse(gm.pricing.reasoning));
                      }
                    }} onClose={() => setModelQuery('')}>
                      {(({open}) => {
                        const filtered = modelQuery === '' ? globalModels : globalModels.filter(m => m.id.toLowerCase().includes(modelQuery.toLowerCase()) || m.name.toLowerCase().includes(modelQuery.toLowerCase()));
                        return (
                          <div className="relative group">
                            <ComboboxInput 
                              displayValue={(m: string) => m}
                              onChange={(e) => {
                                setModel(e.target.value);
                                setModelQuery(e.target.value);
                                applyRates(e.target.value, costMultiplier, salesMultiplier);
                              }}
                              onFocus={() => {
                                setModelQuery('');
                              }}
                              placeholder="e.g. claude-opus-4-6 or any string"
                              className="w-full pl-3 pr-8 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all"
                            />
                            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2.5">
                               <ChevronDown size={14} className="text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                            </ComboboxButton>
                            {filtered.length > 0 && (
                              <ComboboxOptions 
                                anchor="bottom start"
                                portal 
                                className="w-[var(--input-width)] z-[100] mt-1 max-h-60 overflow-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none"
                              >
                                {filtered.map((m) => (
                                  <ComboboxOption key={m.id} value={m.id} className="cursor-pointer select-none py-2 px-3 text-zinc-900 hover:bg-zinc-100 data-[focus]:bg-zinc-100 transition-colors">
                                    <div className="font-bold text-[13px] text-zinc-900">{m.name}</div>
                                    <div className="text-[11px] text-zinc-500 font-medium truncate">{m.id} <span className="opacity-70">({m.provider})</span></div>
                                  </ComboboxOption>
                                ))}
                              </ComboboxOptions>
                            )}
                            {open && filtered.length === 0 && (
                              <div className="absolute left-0 right-0 mt-1 rounded-xl bg-white py-3 px-4 text-sm text-zinc-500 text-center shadow-lg ring-1 ring-black/5 z-[100]">
                                No matching models found.
                              </div>
                            )}
                          </div>
                        );
                      }) as any}
                    </Combobox>

                  </div>
                  
                  <div className="flex items-end gap-2 mb-3">
                    <div className="space-y-1 flex-1">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Cost Rate</label>
                      <input value={costMultiplier} onChange={e => setCostMultiplier(e.target.value)} type="number" step="0.01" className="w-full px-3 py-1.5 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500 bg-emerald-50/50" placeholder="e.g. 0.9" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-indigo-600">Sales Rate</label>
                      <input value={salesMultiplier} onChange={e => setSalesMultiplier(e.target.value)} type="number" step="0.01" className="w-full px-3 py-1.5 border border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 bg-indigo-50/50" placeholder="e.g. 1.0" />
                    </div>
                    <button disabled={!hasOfficialPricing} onClick={() => applyRates(model, costMultiplier, salesMultiplier)} className="px-4 py-1.5 bg-zinc-900 text-white rounded-lg shadow-sm text-xs font-bold hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                      Apply Rates
                    </button>
                  </div>
                  
                  <div className="flex bg-zinc-100 p-1 rounded-lg w-fit mb-3">
                    <button 
                      onClick={() => setActivePriceView('sales')} 
                      className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${activePriceView === 'sales' ? 'bg-white text-indigo-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >
                      Sales Price (What you charge)
                    </button>
                    <button 
                      onClick={() => setActivePriceView('cost')} 
                      className={`px-4 py-1 text-xs font-bold rounded-md transition-all ${activePriceView === 'cost' ? 'bg-white text-emerald-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >
                      Cost Price (What you pay)
                    </button>
                  </div>

                  {activePriceView === 'sales' && (
                    <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-200 mb-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Input $/1M</label>
                        <input value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-1.5 border rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Output $/1M</label>
                        <input value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-1.5 border rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Cache Read $/1M</label>
                        <input value={cacheReadPrice} onChange={(e) => setCacheReadPrice(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-1.5 border rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Cache Write $/1M</label>
                        <input value={cacheWritePrice} onChange={(e) => setCacheWritePrice(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-1.5 border rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Reasoning $/1M</label>
                        <input value={reasoningPrice} onChange={(e) => setReasoningPrice(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-1.5 border rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                      </div>
                    </div>
                  )}

                  {activePriceView === 'cost' && (
                    <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-200 mb-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Input $/1M</label>
                        <input value={inputCost} onChange={(e) => setInputCost(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-1.5 border rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Output $/1M</label>
                        <input value={outputCost} onChange={(e) => setOutputCost(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-1.5 border rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Cache Read $/1M</label>
                        <input value={cacheReadCost} onChange={(e) => setCacheReadCost(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-1.5 border rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Cache Write $/1M</label>
                        <input value={cacheWriteCost} onChange={(e) => setCacheWriteCost(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-1.5 border rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Reasoning $/1M</label>
                        <input value={reasoningCost} onChange={(e) => setReasoningCost(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-1.5 border rounded-lg text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Context Length (K)</label>
                      <input value={contextLength} onChange={(e) => setContextLength(e.target.value)} type="number" min="0" step="1" className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="e.g. 128" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Latency (ms)</label>
                      <input value={latencyMs} onChange={(e) => setLatencyMs(e.target.value)} type="number" min="0" step="1" className="w-full px-3 py-1.5 border rounded-lg text-sm" placeholder="e.g. 120" />
                    </div>
                  </div>
                  
                  <label className="inline-flex items-center gap-2 text-[11px] font-bold text-zinc-600 mb-1">
                    <input type="checkbox" checked={isTopProvider} onChange={(e) => setIsTopProvider(e.target.checked)} />
                    Top provider for this model
                  </label>
                </div>
              )}

              {drawerTab === 'batch' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                    Batch Rules is intentionally kept as L2. Configure a base provider and percentage, then save as draft entries by model scope.
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input value={providerAccountId} onChange={(e) => setProviderAccountId(e.target.value)} placeholder="provider account" className="px-3 py-2 border rounded-lg" />
                    <input value={markupRate} onChange={(e) => setMarkupRate(e.target.value)} placeholder="markup % (optional)" type="number" className="px-3 py-2 border rounded-lg" />
                  </div>
                </div>
              )}

              {drawerTab === 'advanced' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Cost Channel (Key)</label>
                    <Select
                      value={providerKeyId}
                      onChange={(val) => {
                        setProviderKeyId(val);
                        const selectedP = providerKeyRows.find(p => p.keys && p.keys.some(k => k.id === val));
                        if(selectedP) setProviderAccountId(selectedP.provider);
                      }}
                      options={[
                        { value: '', label: 'Select a key channel...' },
                        ...providerKeyRows
                          .filter(p => !providerAccountId || p.provider === providerAccountId)
                          .flatMap(p => (p.keys || []).filter(k => !!k.id).map(k => ({
                            value: k.id as string,
                            label: `${p.provider} / ${k.label}`
                          })))
                      ]}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Price Mode</label>
                    <Select
                      value={formPriceMode}
                      onChange={(val) => setFormPriceMode(val as 'fixed' | 'markup')}
                      options={[
                        { value: 'fixed', label: 'Fixed' },
                        { value: 'markup', label: 'Markup' }
                      ]}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Model Name</label>
                    <Combobox value={model} onChange={(val) => {
                      setModel(val || ''); setModelQuery('');
                      const gm = globalModels.find(m => m.id === val);
                      if (gm?.pricing) {
                        const parse = (str?: string) => str ? String(parseFloat(str.replace(/[^0-9.]/g, ''))) : '';
                        setInputPrice(parse(gm.pricing.prompt));
                        setOutputPrice(parse(gm.pricing.completion));
                        setCacheReadPrice(parse(gm.pricing.cache_read));
                        setCacheWritePrice(parse(gm.pricing.cache_write));
                        setReasoningPrice(parse(gm.pricing.reasoning));
                      }
                    }} onClose={() => setModelQuery('')}>
                      {(({open}) => {
                        const filtered = modelQuery === '' ? globalModels : globalModels.filter(m => m.id.toLowerCase().includes(modelQuery.toLowerCase()) || m.name.toLowerCase().includes(modelQuery.toLowerCase()));
                        return (
                          <div className="relative group">
                            <ComboboxInput 
                              displayValue={(m: string) => m}
                              onChange={(e) => {
                                setModel(e.target.value);
                                setModelQuery(e.target.value);
                              }}
                              onFocus={() => {
                                setModelQuery('');
                              }}
                              placeholder="e.g. claude-opus-4-6 or any string"
                              className="w-full pl-3 pr-8 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent transition-all"
                            />
                            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2.5">
                               <ChevronDown size={14} className="text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                            </ComboboxButton>
                            {filtered.length > 0 && (
                              <ComboboxOptions 
                                anchor="bottom start"
                                portal 
                                className="w-[var(--input-width)] z-[100] mt-1 max-h-60 overflow-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5 focus:outline-none"
                              >
                                {filtered.map((m) => (
                                  <ComboboxOption key={m.id} value={m.id} className="cursor-pointer select-none py-2 px-3 text-zinc-900 hover:bg-zinc-100 data-[focus]:bg-zinc-100 transition-colors">
                                    <div className="font-bold text-[13px] text-zinc-900">{m.name}</div>
                                    <div className="text-[11px] text-zinc-500 font-medium truncate">{m.id} <span className="opacity-70">({m.provider})</span></div>
                                  </ComboboxOption>
                                ))}
                              </ComboboxOptions>
                            )}
                            {open && filtered.length === 0 && (
                              <div className="absolute left-0 right-0 mt-1 rounded-xl bg-white py-3 px-4 text-sm text-zinc-500 text-center shadow-lg ring-1 ring-black/5 z-[100]">
                                No matching models found.
                              </div>
                            )}
                          </div>
                        );
                      }) as any}
                    </Combobox>

                  </div>
                  {formPriceMode === 'markup' ? (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Markup Rate</label>
                      <input value={markupRate} onChange={(e) => setMarkupRate(e.target.value)} type="number" step="0.0001" className="w-full px-3 py-1.5 border rounded-lg text-sm" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <input value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} type="number" step="0.000001" placeholder="input /1M" className="w-full px-3 py-1.5 border rounded-lg text-sm" />
                      <input value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} type="number" step="0.000001" placeholder="output /1M" className="w-full px-3 py-1.5 border rounded-lg text-sm" />
                      <input value={cacheReadPrice} onChange={(e) => setCacheReadPrice(e.target.value)} type="number" step="0.000001" placeholder="cache read /1M" className="w-full px-3 py-1.5 border rounded-lg text-sm" />
                      <input value={cacheWritePrice} onChange={(e) => setCacheWritePrice(e.target.value)} type="number" step="0.000001" placeholder="cache write /1M" className="w-full px-3 py-1.5 border rounded-lg text-sm" />
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <input value={reasoningPrice} onChange={(e) => setReasoningPrice(e.target.value)} type="number" step="0.000001" placeholder="reasoning /1M" className="px-3 py-1.5 border rounded-lg text-sm" />
                    <input value={contextLength} onChange={(e) => setContextLength(e.target.value)} type="number" step="1" placeholder="context length" className="px-3 py-1.5 border rounded-lg text-sm" />
                    <input value={latencyMs} onChange={(e) => setLatencyMs(e.target.value)} type="number" step="1" placeholder="latency ms" className="px-3 py-1.5 border rounded-lg text-sm" />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input type="checkbox" checked={isTopProvider} onChange={(e) => setIsTopProvider(e.target.checked)} />
                    Top provider for this model
                  </label>
                </div>
              )}

            </div>
          </div>

          <div className="w-[340px] bg-zinc-50/50 p-6 flex flex-col shrink-0 overflow-y-auto border-l border-zinc-100">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-4">Live Preview</h4>
            
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col pointer-events-none relative overflow-hidden">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-50 border border-gray-100 flex items-center justify-center font-bold text-zinc-300 text-lg uppercase">
                    {(providerAccountId || 'A')[0]}
                  </div>
                  <div className="min-w-0 pr-1">
                    <h3 className="font-bold text-[14px] text-zinc-900 leading-tight truncate w-[110px] break-all">{model || 'Model ID'}</h3>
                    <p className="text-[10px] text-zinc-400 font-medium truncate mt-0.5">{providerAccountId || 'Unknown'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {isTopProvider && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-zinc-900 text-white text-[9px] font-bold uppercase tracking-wider rounded">
                      Trending
                    </span>
                  )}
                  <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">{contextLength ? `${contextLength}K` : '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-zinc-50/50 rounded-lg p-2 border border-gray-50 flex flex-col items-start min-w-0 max-w-full">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Prompt</p>
                  <p className="block font-mono text-[11px] font-semibold text-zinc-700 truncate w-full">{inputPrice || '-'}</p>
                </div>
                <div className="bg-zinc-50/50 rounded-lg p-2 border border-gray-50 flex flex-col items-start min-w-0 max-w-full">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Completion</p>
                  <p className="block font-mono text-[11px] font-semibold text-zinc-700 truncate w-full">{outputPrice || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4 pt-1 border-t border-gray-50/50">
                <div className="bg-emerald-50/30 rounded-lg p-2 border border-emerald-50/50 flex flex-col items-start min-w-0 max-w-full">
                  <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">Cache Hit (R/W)</p>
                  <p className="block font-mono text-[11px] font-semibold text-emerald-700 truncate w-full">
                    {cacheReadPrice || '-'} / {cacheWritePrice || '-'}
                  </p>
                </div>
                <div className="bg-indigo-50/30 rounded-lg p-2 border border-indigo-50/50 flex flex-col items-start min-w-0 max-w-full">
                  <p className="text-[8px] font-bold text-indigo-500 uppercase tracking-wider mb-0.5">Reasoning</p>
                  <p className="block font-mono text-[11px] font-semibold text-indigo-700 truncate w-full">{reasoningPrice || '-'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-50 mt-auto">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                  <Zap size={10} className="text-emerald-500" />
                  {latencyMs || '-'} ms
                </div>
              </div>
            </div>

            {(() => {
              const gm = globalModels.find(m => m.id === model.trim() || m.name.toLowerCase() === model.trim().toLowerCase() || m.id.split('/').pop() === model.trim());
              if (!gm || !gm.pricing) return null;
              const p = gm.pricing;
              const cMap = parseFloat(costMultiplier) || 1;
              const sMap = parseFloat(salesMultiplier) || 1;
              const isLosing = sMap < cMap;
              
              return (
                <div className="mt-4 flex flex-col gap-3">
                  {isLosing && (
                    <div className="bg-red-50/50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                       <p className="text-[11px] font-medium text-red-700 leading-snug">
                         <strong className="font-bold uppercase tracking-widest text-[10px] block mb-0.5">Warning</strong>
                         Sales Rate ({sMap}) is lower than Cost Rate ({cMap}). This configuration will generate a financial loss!
                       </p>
                    </div>
                  )}
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
                    <p className="text-[10px] font-bold text-blue-800 uppercase tracking-widest">Official Benchmark</p>
                    <div className="space-y-1.5 text-[11px] text-blue-900">
                      {p.prompt && <div className="flex justify-between"><span className="text-blue-600">Input</span><span className="font-mono font-medium">{p.prompt}</span></div>}
                      {p.completion && <div className="flex justify-between"><span className="text-blue-600">Output</span><span className="font-mono font-medium">{p.completion}</span></div>}
                      {p.cache_read && <div className="flex justify-between"><span className="text-blue-600">Cache Read</span><span className="font-mono font-medium">{p.cache_read}</span></div>}
                      {p.cache_write && <div className="flex justify-between"><span className="text-blue-600">Cache Write</span><span className="font-mono font-medium">{p.cache_write}</span></div>}
                      {p.reasoning && <div className="flex justify-between"><span className="text-blue-600">Reasoning</span><span className="font-mono font-medium">{p.reasoning}</span></div>}
                    </div>
                  </div>
                </div>
              );
            })()}

          </div>
        </div>

        <div className="border-t px-6 py-4 bg-zinc-50/80 flex items-center justify-between shrink-0">
          <button className="text-[13px] font-bold text-zinc-500 hover:text-zinc-900" onClick={onClose}>Cancel</button>
          <div className="flex items-center gap-3">
            <button onClick={saveDraft} disabled={busy || providers.length === 0} className="bg-white border border-zinc-200 text-zinc-900 rounded-lg px-6 py-2 text-sm font-semibold shadow-sm hover:bg-zinc-50 disabled:opacity-50">Save Draft</button>
            <button onClick={handlePublish} disabled={busy || draftCount === 0} className="bg-blue-600 text-white rounded-lg px-6 py-2 text-sm font-semibold shadow-sm hover:bg-blue-700 disabled:opacity-50">Publish Model</button>
          </div>
        </div>
      </div>
    </div>
  );
}
