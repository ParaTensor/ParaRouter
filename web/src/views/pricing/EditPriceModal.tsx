import React from 'react';
import { Zap } from 'lucide-react';
import { Select } from '../../components/Select';
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { useNavigate } from 'react-router-dom';
import { ProviderKeyRow, DrawerTab, PricingPreview, PricingRow } from './types';
import { useTranslation } from "react-i18next";
import { cn } from '../../lib/utils';

function PriceFieldRow({
  id,
  label,
  value,
  onChange,
  placeholder,
  min = '0',
  step = '0.000001',
  labelWidthClass,
  borderClass,
  fieldGridClass,
  /** Label above; full-width input. Use for long labels in narrow panes. */
  stacked = false,
  compact = false,
  inputMode,
  type = 'number',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  min?: string;
  step?: string;
  labelWidthClass?: string;
  borderClass?: string;
  fieldGridClass?: string;
  stacked?: boolean;
  compact?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  type?: 'number' | 'text';
}) {
  const focus =
    'focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:ring-offset-0';
  /** 与顶部 Select 触发器同高：h-10、圆角、边框 */
  const inputPad = 'h-10 min-h-10 px-3 text-sm leading-none rounded-lg box-border';
  const labelCls = compact
    ? 'text-xs font-bold uppercase tracking-widest text-zinc-400'
    : 'text-xs tracking-widest';
  if (stacked) {
    return (
      <div className={cn('min-w-0 w-full', compact ? 'space-y-1' : 'space-y-1.5')}>
        <label
          htmlFor={id}
          className={cn(
            'block font-bold leading-snug',
            labelCls,
            !compact && 'uppercase text-zinc-400',
            labelWidthClass
          )}
        >
          {label}
        </label>
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={onChange}
          min={type === 'number' ? min : undefined}
          step={type === 'number' ? step : undefined}
          placeholder={placeholder}
          className={cn(
            'w-full min-w-0 border border-zinc-200 bg-white box-border transition-all',
            inputPad,
            borderClass,
            focus
          )}
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'grid items-center min-w-0',
        compact ? 'gap-x-2 gap-y-0.5' : 'gap-2',
        fieldGridClass ?? 'grid-cols-[5.5rem_1fr] min-[420px]:grid-cols-[6.25rem_1fr]'
      )}
    >
      <label
        htmlFor={id}
        className={cn(
          'min-w-0 break-words text-left leading-tight',
          compact
            ? 'text-xs font-bold uppercase tracking-widest text-zinc-400'
            : 'font-bold uppercase text-zinc-400 text-xs tracking-widest',
          labelWidthClass
        )}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={onChange}
        min={type === 'number' ? min : undefined}
        step={type === 'number' ? step : undefined}
        placeholder={placeholder}
        className={cn(
          'w-full min-w-0 border border-zinc-200 transition-all bg-white',
          inputPad,
          borderClass,
          focus
        )}
      />
    </div>
  );
}

export type AppliedRateFields = {
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
};

function resolveGlobalModel(modelId: string, globalModels: any[]) {
  return globalModels.find((m) => m.id === modelId.trim());
}

/** 全局表 `llm_models`：计费与路由以 `id` 为准；`name` 仅为展示名。二者相同时不重复书写。 */
function labelForGlobalModelRow(m: { id: string; name?: string }) {
  const id = String(m.id || '').trim();
  const name = String(m.name || '').trim();
  if (!id) return '—';
  if (!name || name === id) return id;
  return `${name} — ${id}`;
}

/** 与 hub 拉目录逻辑一致：目录项可为全局 id 或与 id 尾段一致的上游名。 */
function globalModelMatchesProviderCatalog(globalId: string, catalog: string[]): boolean {
  if (!String(globalId || '').trim() || catalog.length === 0) return false;
  const g = globalId.trim();
  const gSuf = g.includes('/') ? g.split('/').pop()! : g;
  return catalog.some((c) => {
    const cv = String(c || '').trim();
    if (!cv) return false;
    if (cv.toLowerCase() === g.toLowerCase()) return true;
    return cv.toLowerCase() === gSuf.toLowerCase();
  });
}

/** Merge official benchmark × multipliers into current price strings (same rules as applyRates). */
export function mergeAppliedRates(
  modelId: string,
  crate: string,
  srate: string,
  globalModels: any[],
  current: AppliedRateFields
): AppliedRateFields {
  const gm = resolveGlobalModel(modelId, globalModels);
  if (!gm?.pricing) return current;
  const p = gm.pricing;
  const parse = (str?: string) => (str ? parseFloat(str.replace(/[^0-9.]/g, '')) : 0);
  const format = (val: number) => parseFloat(val.toFixed(2)).toString();
  const next = { ...current };
  const cmap = parseFloat(crate);
  if (!isNaN(cmap)) {
    if (p.prompt) next.inputCost = format(parse(p.prompt) * cmap);
    if (p.completion) next.outputCost = format(parse(p.completion) * cmap);
    if (p.cache_read) next.cacheReadCost = format(parse(p.cache_read) * cmap);
    if (p.cache_write) next.cacheWriteCost = format(parse(p.cache_write) * cmap);
    if (p.reasoning) next.reasoningCost = format(parse(p.reasoning) * cmap);
  }
  const smap = parseFloat(srate);
  if (!isNaN(smap)) {
    if (p.prompt) next.inputPrice = format(parse(p.prompt) * smap);
    if (p.completion) next.outputPrice = format(parse(p.completion) * smap);
    if (p.cache_read) next.cacheReadPrice = format(parse(p.cache_read) * smap);
    if (p.cache_write) next.cacheWritePrice = format(parse(p.cache_write) * smap);
    if (p.reasoning) next.reasoningPrice = format(parse(p.reasoning) * smap);
  }
  return next;
}

interface EditPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  model: string;
  setModel: (m: string) => void;
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
  markupRate: string;
  setMarkupRate: (val: string) => void;
  providerKeyRows: ProviderKeyRow[];
  globalModels: any[];
  discountRate: string;
  setDiscountRate: (val: string) => void;
  providers: string[];
  busy: boolean;
  handlePreview: () => Promise<void>;
  saveDraft: (rates?: AppliedRateFields) => Promise<boolean>;
  handlePublish: () => Promise<boolean>;
  preview: PricingPreview | null;
  draft: PricingRow[];
}

export default function EditPriceModal({
  isOpen, onClose,
  model, setModel,
  providerAccountId, setProviderAccountId, providerKeyId, setProviderKeyId,
  formPriceMode, setFormPriceMode,
  inputCost, setInputCost, outputCost, setOutputCost,
  cacheReadCost, setCacheReadCost, cacheWriteCost, setCacheWriteCost,
  reasoningCost, setReasoningCost,
  inputPrice, setInputPrice, outputPrice, setOutputPrice,
  cacheReadPrice, setCacheReadPrice, cacheWritePrice, setCacheWritePrice,
  reasoningPrice, setReasoningPrice, contextLength, setContextLength, latencyMs, setLatencyMs,
  markupRate, setMarkupRate,
  providerKeyRows, globalModels, discountRate, setDiscountRate, providers, busy,
  handlePreview, saveDraft, handlePublish, preview, draft
}: EditPriceModalProps) {
    const { t } = useTranslation();
  const navigate = useNavigate();

  const [formError, setFormError] = React.useState<string | null>(null);
  const [costMultiplier, setCostMultiplier] = React.useState('1.0');
  const [salesMultiplier, setSalesMultiplier] = React.useState('1.0');
  const [activePriceView, setActivePriceView] = React.useState<'sales' | 'cost'>('sales');

  const selectedProvider = providerKeyRows.find((row) => row.provider === providerAccountId);
  const selectedKey = selectedProvider?.keys?.find((k) => (k as { id?: string }).id === providerKeyId) as
    | { id?: string; supported_models?: string[] }
    | undefined;
  const keyCatalog = Array.isArray(selectedKey?.supported_models) ? selectedKey!.supported_models! : [];
  const accountCatalog = Array.isArray(selectedProvider?.supported_models) ? selectedProvider!.supported_models! : [];
  const providerCatalogForKey = keyCatalog.length > 0 ? keyCatalog : accountCatalog;
  const showModelNotInProviderCatalog = Boolean(
    providerKeyId &&
      model.trim() &&
      providerCatalogForKey.length > 0 &&
      !globalModelMatchesProviderCatalog(model, providerCatalogForKey),
  );

  /** 下拉选项始终来自 /api/llm-models 全量，不按密钥 supported_models 过滤。 */
  React.useEffect(() => {
    if (!isOpen || globalModels.length === 0) return;
    if (!model.trim()) return;
    if (!globalModels.some((g) => g.id === model)) {
      setModel('');
    }
  }, [isOpen, globalModels, model, setModel]);

  React.useEffect(() => {
    setFormError(null);
  }, [model, formPriceMode]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (isOpen) {
      if (!model) {
        setCostMultiplier('1.0');
        setSalesMultiplier('1.0');
        setActivePriceView('sales');
      }
    } else {
      // Reset ref when closed to force recalculation if the same model is opened again
      lastPopRef.current = { model: '', providerKeyId: '' };
    }
  }, [isOpen, model]);

  const lastPopRef = React.useRef({ model: '', providerKeyId: '' });
  React.useEffect(() => {
    if (model === lastPopRef.current.model && providerKeyId === lastPopRef.current.providerKeyId) {
      return;
    }
    lastPopRef.current = { model, providerKeyId };

    if (!model || !providerKeyId) return;

    const existing = draft.find(d => d.model === model && d.provider_key_id === providerKeyId);
    if (existing) {
      setFormPriceMode(existing.price_mode as 'fixed' | 'markup');
      const numTxt = (val?: number | null) => (typeof val === 'number' ? String(val) : '');
      setInputCost(numTxt(existing.input_cost));
      setOutputCost(numTxt(existing.output_cost));
      setCacheReadCost(numTxt(existing.cache_read_cost));
      setCacheWriteCost(numTxt(existing.cache_write_cost));
      setReasoningCost(numTxt(existing.reasoning_cost));
      setInputPrice(numTxt(existing.input_price));
      setOutputPrice(numTxt(existing.output_price));
      setCacheReadPrice(numTxt(existing.cache_read_price));
      setCacheWritePrice(numTxt(existing.cache_write_price));
      setReasoningPrice(numTxt(existing.reasoning_price));
      setContextLength(numTxt(existing.context_length));
      setLatencyMs(numTxt(existing.latency_ms));
      setMarkupRate(numTxt(existing.markup_rate));

      // Calculate multipliers if global pricing is available
      const gm = globalModels.find((m) => m.id === model.trim());
      if (gm?.pricing) {
        const parse = (str?: string | number) => typeof str === 'string' ? parseFloat(str.replace(/[^0-9.]/g, '')) : (str || 0);
        const pPrompt = parse(gm.pricing.prompt);
        const pComp = parse(gm.pricing.completion);

        if (existing.input_cost && pPrompt) {
          setCostMultiplier(parseFloat((existing.input_cost / pPrompt).toFixed(2)).toString());
        } else if (existing.output_cost && pComp) {
          setCostMultiplier(parseFloat((existing.output_cost / pComp).toFixed(2)).toString());
        }

        if (existing.input_price && pPrompt) {
          setSalesMultiplier(parseFloat((existing.input_price / pPrompt).toFixed(2)).toString());
        } else if (existing.output_price && pComp) {
          setSalesMultiplier(parseFloat((existing.output_price / pComp).toFixed(2)).toString());
        }
      }
    }
  }, [
    model, providerKeyId, draft,
    setFormPriceMode, setInputCost, setOutputCost, setCacheReadCost,
    setCacheWriteCost, setReasoningCost, setInputPrice, setOutputPrice,
    setCacheReadPrice, setCacheWritePrice, setReasoningPrice,
    setContextLength, setLatencyMs, setMarkupRate, globalModels
  ]);

  const validateForm = (rates: AppliedRateFields) => {
    if (!model.trim()) {
      setFormError(t('editpricemodal.error_model_required'));
      return false;
    }
    if (!globalModels.some((m) => m.id === model.trim())) {
      setFormError(t('editpricemodal.error_model_registry'));
      return false;
    }

    // Check key
    if (!providerKeyId) {
      setFormError(t('editpricemodal.error_key_required'));
      return false;
    }

    // Check pricing fields
    const mode = formPriceMode;
    if (mode === 'fixed') {
      if (!rates.inputPrice || !rates.outputPrice || !rates.inputCost || !rates.outputCost) {
        setFormError(t('editpricemodal.error_pricing_fields_required'));
        return false;
      }
    } else {
      if (!markupRate) {
        setFormError(t('editpricemodal.error_markup_required'));
        return false;
      }
    }

    setFormError(null);
    return true;
  };

  const onPublish = async () => {
    if (showModelNotInProviderCatalog) return;
    const merged = mergeAppliedRates(model, costMultiplier, salesMultiplier, globalModels, {
      inputCost,
      outputCost,
      cacheReadCost,
      cacheWriteCost,
      reasoningCost,
      inputPrice,
      outputPrice,
      cacheReadPrice,
      cacheWritePrice,
      reasoningPrice,
    });
    if (!validateForm(merged)) return;
    setInputCost(merged.inputCost);
    setOutputCost(merged.outputCost);
    setCacheReadCost(merged.cacheReadCost);
    setCacheWriteCost(merged.cacheWriteCost);
    setReasoningCost(merged.reasoningCost);
    setInputPrice(merged.inputPrice);
    setOutputPrice(merged.outputPrice);
    setCacheReadPrice(merged.cacheReadPrice);
    setCacheWritePrice(merged.cacheWritePrice);
    setReasoningPrice(merged.reasoningPrice);
    const success = await saveDraft(merged);
    if (!success) {
      setFormError(t('editpricemodal.error_save_failed_before_publish'));
      return;
    }
    const successMsg = await handlePublish();
    if (successMsg) {
      onClose();
    }
  };

  const applyRates = (modelId: string, crate: string, srate: string) => {
    const next = mergeAppliedRates(modelId, crate, srate, globalModels, {
      inputCost,
      outputCost,
      cacheReadCost,
      cacheWriteCost,
      reasoningCost,
      inputPrice,
      outputPrice,
      cacheReadPrice,
      cacheWritePrice,
      reasoningPrice,
    });
    setInputCost(next.inputCost);
    setOutputCost(next.outputCost);
    setCacheReadCost(next.cacheReadCost);
    setCacheWriteCost(next.cacheWriteCost);
    setReasoningCost(next.reasoningCost);
    setInputPrice(next.inputPrice);
    setOutputPrice(next.outputPrice);
    setCacheReadPrice(next.cacheReadPrice);
    setCacheWritePrice(next.cacheWritePrice);
    setReasoningPrice(next.reasoningPrice);
  };

  const hasOfficialPricing = Boolean(resolveGlobalModel(model, globalModels)?.pricing);

  // Using Headless UI Dialog for scroll lock management now
  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={() => {
        // Headless UI 会把「点在 DialogPanel 外」和 portaled 下拉层都当成 dismiss；定价表单用取消按钮关闭
      }}
      className="relative z-[100]"
    >
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <DialogPanel className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">{model ? t('editpricemodal.edit_price') : t('editpricemodal.new_price')}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{t('editpricemodal.provider_bound_draft_editor')}</p>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 max-h-[calc(90vh-7rem)] overflow-y-auto overflow-x-hidden">
          <div className="flex-1 flex flex-col min-w-0 shrink-0">
            <div className="px-5 py-3 space-y-3">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('editpricemodal.cost_channel_key')}</label>
                      <Select
                        className="[&_button]:h-10 [&_button]:rounded-lg [&_button]:border-zinc-200 [&_button]:focus:ring-2 [&_button]:focus:ring-purple-500/30 [&_button]:focus:ring-offset-0 [&_button]:focus:border-purple-500"
                        value={providerKeyId}
                        onChange={(val) => {
                          setProviderKeyId(val);
                          const selectedP = providerKeyRows.find(p => p.keys && p.keys.some(k => k.id === val));
                          if(selectedP) setProviderAccountId(selectedP.provider);
                        }}
                        options={[
                          { value: '', label: t('editpricemodal.select_key_channel') },
                          ...providerKeyRows
                            .flatMap(p => (p.keys || []).filter(k => !!k.id).map(k => ({
                              value: k.id as string,
                              label: `${p.provider} / ${k.label}`
                            })))
                        ]}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('editpricemodal.global_model_label')}</label>
                      <Select
                        className="[&_button]:h-10 [&_button]:rounded-lg [&_button]:border-zinc-200 [&_button]:focus:ring-2 [&_button]:focus:ring-purple-500/30 [&_button]:focus:ring-offset-0 [&_button]:focus:border-purple-500"
                        value={model}
                        onChange={(val) => {
                          setModel(val);
                          applyRates(val, costMultiplier, salesMultiplier);
                          const gm = globalModels.find((m) => m.id === val);
                          if (gm?.pricing) {
                            const parse = (str?: string) => (str ? String(parseFloat(str.replace(/[^0-9.]/g, ''))) : '');
                            setInputPrice(parse(gm.pricing.prompt));
                            setOutputPrice(parse(gm.pricing.completion));
                            setCacheReadPrice(parse(gm.pricing.cache_read));
                            setCacheWritePrice(parse(gm.pricing.cache_write));
                            setReasoningPrice(parse(gm.pricing.reasoning));
                          }
                          if (gm?.context_length) {
                            setContextLength(String(Math.floor(gm.context_length / 1000)));
                          } else {
                            setContextLength('');
                          }
                        }}
                        placeholder={t('editpricemodal.select_global_model_placeholder')}
                        options={[
                          { value: '', label: t('editpricemodal.select_global_model_placeholder') },
                          ...globalModels.map((m) => {
                            const label = labelForGlobalModelRow(m);
                            return {
                              value: m.id,
                              label,
                              title: `${t('editpricemodal.global_model_id_title')}: ${m.id}`,
                            };
                          }),
                        ]}
                      />
                    </div>
                  </div>

                  {showModelNotInProviderCatalog ? (
                    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                      <p className="text-xs leading-relaxed text-amber-900">
                        {t('editpricemodal.provider_catalog_mismatch', {model: model.trim()})}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          const params = new URLSearchParams();
                          if (providerAccountId.trim()) params.set('provider', providerAccountId.trim());
                          if (providerKeyId.trim()) params.set('key', providerKeyId.trim());
                          const query = params.toString();
                          navigate(query ? `/providers?${query}` : '/providers');
                        }}
                        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
                      >
                        {t('editpricemodal.open_provider_catalog_editor')}
                      </button>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      'space-y-3',
                      showModelNotInProviderCatalog && 'pointer-events-none opacity-45',
                    )}
                    inert={showModelNotInProviderCatalog || undefined}
                  >
                  <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/40 p-2.5 space-y-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1 min-w-0">
                        <label className="text-xs font-bold uppercase tracking-widest text-emerald-600">
                          {t('editpricemodal.cost_rate')}
                          <span className="text-zinc-400 font-medium normal-case">{t('editpricemodal.official_price_note')}</span>
                        </label>
                        <input
                          value={costMultiplier}
                          onChange={(e) => setCostMultiplier(e.target.value)}
                          onBlur={() => applyRates(model, costMultiplier, salesMultiplier)}
                          type="number"
                          step="0.01"
                          className="w-full h-10 min-h-10 px-3 text-sm leading-none border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                          placeholder={t('editpricemodal.placeholder_cost_rate')}
                        />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <label className="text-xs font-bold uppercase tracking-widest text-purple-700">
                          {t('editpricemodal.sales_rate')}
                          <span className="text-zinc-400 font-medium normal-case">{t('editpricemodal.official_price_note')}</span>
                        </label>
                        <input
                          value={salesMultiplier}
                          onChange={(e) => setSalesMultiplier(e.target.value)}
                          onBlur={() => applyRates(model, costMultiplier, salesMultiplier)}
                          type="number"
                          step="0.01"
                          className="w-full h-10 min-h-10 px-3 text-sm leading-none border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                          placeholder={t('editpricemodal.placeholder_sales_rate')}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-2.5 space-y-2 shadow-sm">
                    <div className="flex flex-col gap-1 min-[500px]:flex-row min-[500px]:items-center min-[500px]:justify-between">
                      <div className="flex bg-zinc-100/90 p-0.5 rounded-lg w-fit" role="tablist" aria-label={t('editpricemodal.sales_price_what_you_charge')}>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activePriceView === 'sales'}
                          onClick={() => setActivePriceView('sales')}
                          className={`px-2.5 py-1.5 min-h-8 text-xs font-semibold rounded-md transition-all ${
                            activePriceView === 'sales' ? 'bg-white text-purple-700 shadow-sm ring-1 ring-zinc-200/80' : 'text-zinc-500 hover:text-zinc-800'
                          }`}
                        >
                          {t('editpricemodal.sales_price_what_you_charge')}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activePriceView === 'cost'}
                          onClick={() => setActivePriceView('cost')}
                          className={`px-2.5 py-1.5 min-h-8 text-xs font-semibold rounded-md transition-all ${
                            activePriceView === 'cost' ? 'bg-white text-purple-700 shadow-sm ring-1 ring-zinc-200/80' : 'text-zinc-500 hover:text-zinc-800'
                          }`}
                        >
                          {t('editpricemodal.cost_price_what_you_pay')}
                        </button>
                      </div>
                      <p className="text-[10px] text-zinc-500 min-[500px]:text-right leading-tight shrink-0 max-w-md">
                        {t('editpricemodal.pricing_per_million_legend')}
                      </p>
                    </div>

                    {activePriceView === 'sales' && (
                      <div
                        className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1.5 md:items-center animate-in fade-in duration-200"
                        key="sales"
                      >
                        <PriceFieldRow
                          id="ep-sp-in"
                          label={t('editpricemodal.input')}
                          value={inputPrice}
                          onChange={(e) => setInputPrice(e.target.value)}
                          compact
                        />
                        <PriceFieldRow
                          id="ep-sp-out"
                          label={t('editpricemodal.output')}
                          value={outputPrice}
                          onChange={(e) => setOutputPrice(e.target.value)}
                          compact
                        />
                        <PriceFieldRow
                          id="ep-sp-cr"
                          label={t('editpricemodal.token_label_cache_read')}
                          value={cacheReadPrice}
                          onChange={(e) => setCacheReadPrice(e.target.value)}
                          compact
                        />
                        <PriceFieldRow
                          id="ep-sp-cw"
                          label={t('editpricemodal.token_label_cache_write')}
                          value={cacheWritePrice}
                          onChange={(e) => setCacheWritePrice(e.target.value)}
                          compact
                        />
                        <PriceFieldRow
                          id="ep-sp-re"
                          label={t('editpricemodal.reasoning')}
                          value={reasoningPrice}
                          onChange={(e) => setReasoningPrice(e.target.value)}
                          compact
                        />
                      </div>
                    )}

                    {activePriceView === 'cost' && (
                      <div
                        className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1.5 md:items-center animate-in fade-in duration-200"
                        key="cost"
                      >
                        <PriceFieldRow
                          id="ep-cp-in"
                          label={t('editpricemodal.input')}
                          value={inputCost}
                          onChange={(e) => setInputCost(e.target.value)}
                          compact
                        />
                        <PriceFieldRow
                          id="ep-cp-out"
                          label={t('editpricemodal.output')}
                          value={outputCost}
                          onChange={(e) => setOutputCost(e.target.value)}
                          compact
                        />
                        <PriceFieldRow
                          id="ep-cp-cr"
                          label={t('editpricemodal.token_label_cache_read')}
                          value={cacheReadCost}
                          onChange={(e) => setCacheReadCost(e.target.value)}
                          compact
                        />
                        <PriceFieldRow
                          id="ep-cp-cw"
                          label={t('editpricemodal.token_label_cache_write')}
                          value={cacheWriteCost}
                          onChange={(e) => setCacheWriteCost(e.target.value)}
                          compact
                        />
                        <PriceFieldRow
                          id="ep-cp-re"
                          label={t('editpricemodal.reasoning')}
                          value={reasoningCost}
                          onChange={(e) => setReasoningCost(e.target.value)}
                          compact
                        />
                      </div>
                    )}

                    <div className="pt-2 border-t border-zinc-100">
                      <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                        {t('editpricemodal.model_limits_section')}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
                        <PriceFieldRow
                          id="ep-ctx"
                          label={t('editpricemodal.context_length_k')}
                          value={contextLength}
                          onChange={(e) => setContextLength(e.target.value)}
                          min="0"
                          step="1"
                          placeholder={t('editpricemodal.placeholder_context')}
                          fieldGridClass="grid grid-cols-[minmax(5.5rem,7.25rem)_1fr] sm:grid-cols-[minmax(6.25rem,7.5rem)_1fr]"
                          compact
                        />
                        <PriceFieldRow
                          id="ep-lat"
                          label={t('editpricemodal.latency_ms')}
                          value={latencyMs}
                          onChange={(e) => setLatencyMs(e.target.value)}
                          min="0"
                          step="1"
                          placeholder={t('editpricemodal.placeholder_latency')}
                          fieldGridClass="grid grid-cols-[minmax(5.5rem,7.25rem)_1fr] sm:grid-cols-[minmax(6.25rem,7.5rem)_1fr]"
                          compact
                        />
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
            </div>
          </div>

          <div
            className={cn(
              'w-[300px] sm:w-[320px] bg-zinc-50/50 p-4 flex flex-col shrink-0 border-l border-zinc-100',
              showModelNotInProviderCatalog && 'pointer-events-none opacity-45',
            )}
            inert={showModelNotInProviderCatalog || undefined}
          >
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">{t('editpricemodal.live_preview')}</h4>
            
            <div className="bg-white border border-zinc-200 rounded-xl p-3 shadow-sm flex flex-col pointer-events-none relative overflow-hidden">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-50 border border-gray-100 flex items-center justify-center font-bold text-zinc-300 text-lg uppercase">
                    {(providerAccountId || 'A')[0]}
                  </div>
                  <div className="min-w-0 pr-1">
                    <h3 className="font-bold text-[14px] text-zinc-900 leading-tight truncate w-[110px] break-all">
                      {resolveGlobalModel(model, globalModels)?.name || t('editpricemodal.preview_model_id')}
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-medium truncate mt-0.5" title={model || undefined}>
                      {model ? (
                        <>
                          <span className="font-mono text-zinc-500">{model}</span>
                          {providerAccountId ? <span> · {providerAccountId}</span> : null}
                        </>
                      ) : (
                        providerAccountId || t('editpricemodal.preview_unknown')
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">{contextLength ? `${contextLength}K` : '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-zinc-50/50 rounded-lg p-2 border border-gray-50 flex flex-col items-start min-w-0 max-w-full">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">{t('editpricemodal.prompt')}</p>
                  <p className="block font-mono text-[11px] font-semibold text-zinc-700 truncate w-full">{inputPrice || '-'}</p>
                </div>
                <div className="bg-zinc-50/50 rounded-lg p-2 border border-gray-50 flex flex-col items-start min-w-0 max-w-full">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">{t('editpricemodal.completion')}</p>
                  <p className="block font-mono text-[11px] font-semibold text-zinc-700 truncate w-full">{outputPrice || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-0 pt-2 border-t border-zinc-100/80">
                <div className="bg-emerald-50/30 rounded-lg p-2 border border-emerald-50/50 flex flex-col items-start min-w-0 max-w-full">
                  <p className="text-[8px] font-bold text-emerald-500 uppercase tracking-wider mb-0.5">{t('editpricemodal.cache_hit_r_w')}</p>
                  <p className="block font-mono text-[11px] font-semibold text-emerald-700 truncate w-full">
                    {cacheReadPrice || '-'} / {cacheWritePrice || '-'}
                  </p>
                </div>
                <div className="bg-indigo-50/30 rounded-lg p-2 border border-indigo-50/50 flex flex-col items-start min-w-0 max-w-full">
                  <p className="text-[8px] font-bold text-indigo-500 uppercase tracking-wider mb-0.5">{t('editpricemodal.reasoning')}</p>
                  <p className="block font-mono text-[11px] font-semibold text-indigo-700 truncate w-full">{reasoningPrice || '-'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100/80">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                  <Zap size={10} className="text-purple-500" />
                  {latencyMs || '-'} {t('editpricemodal.ms')}</div>
              </div>
            </div>

            {(() => {
              const gm = globalModels.find((m) => m.id === model.trim());
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
                         <strong className="font-bold uppercase tracking-widest text-[10px] block mb-0.5">{t('editpricemodal.warning')}</strong>
                         {t('editpricemodal.sales_rate')}{sMap}{t('editpricemodal.is_lower_than_cost_rate')}{cMap}{t('editpricemodal.this_configuration_will_genera')}</p>
                    </div>
                  )}
                  <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-bold text-purple-800 uppercase tracking-widest">{t('editpricemodal.official_benchmark')}</p>
                    <div className="space-y-1.5 text-[11px] text-purple-900">
                      {p.prompt && <div className="flex justify-between"><span className="text-purple-600">{t('editpricemodal.input')}</span><span className="font-mono font-medium">{p.prompt}</span></div>}
                      {p.completion && <div className="flex justify-between"><span className="text-purple-600">{t('editpricemodal.output')}</span><span className="font-mono font-medium">{p.completion}</span></div>}
                      {p.cache_read && <div className="flex justify-between"><span className="text-purple-600">{t('editpricemodal.cache_read')}</span><span className="font-mono font-medium">{p.cache_read}</span></div>}
                      {p.cache_write && <div className="flex justify-between"><span className="text-purple-600">{t('editpricemodal.cache_write')}</span><span className="font-mono font-medium">{p.cache_write}</span></div>}
                      {p.reasoning && <div className="flex justify-between"><span className="text-purple-600">{t('editpricemodal.reasoning')}</span><span className="font-mono font-medium">{p.reasoning}</span></div>}
                    </div>
                  </div>
                </div>
              );
            })()}

          </div>
        </div>

        <div className="border-t px-5 py-3 bg-zinc-50/80 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-4">
            {formError && (
              <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100">{formError}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 px-4 py-2 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-white transition-colors">{t('editpricemodal.cancel')}</button>
            <button type="button" onClick={onPublish} disabled={busy || providers.length === 0 || !model.trim() || showModelNotInProviderCatalog} className="bg-purple-600 text-white rounded-lg h-10 min-h-10 px-6 text-sm font-semibold shadow-sm hover:bg-purple-700 disabled:opacity-50">
              {t('editpricemodal.publish')}</button>
          </div>
        </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
