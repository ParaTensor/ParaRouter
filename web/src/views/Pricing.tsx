import React from 'react';
import { X } from 'lucide-react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import PricingHeader from './pricing/PricingHeader';
import PricingTable from './pricing/PricingTable';
import ProviderAccountModal from './pricing/ProviderAccountModal';
import EditPriceModal, { type AppliedRateFields } from './pricing/EditPriceModal';
import {
  PricingRow, PublishedPricingRow, ProviderKeyRow, PricingTableRow,
  PricingPreview, SortKey, PriceRange
} from './pricing/types';
import { pricingEdit, usePricingEditUi } from './pricing/pricingEditUiStore';
import { useTranslation } from "react-i18next";

const rowKey = (row: {model: string; provider_account_id?: string | null; provider_key_id?: string}) => 
    `${row.model}::${row.provider_account_id || ''}::${row.provider_key_id || ''}`;

const effectiveRowKey = (row: {
  model: string;
  global_model_id?: string | null;
  provider_account_id?: string | null;
  provider_key_id?: string;
}) =>
  `${(row.global_model_id || row.model || '').trim()}::${row.provider_account_id || ''}::${row.provider_key_id || ''}`;

const getFinalPrice = (row: Pick<PricingRow, 'price_mode' | 'input_price' | 'output_price' | 'markup_rate'>) => {
  if (row.price_mode === 'fixed') {
    return typeof row.output_price === 'number' ? row.output_price : row.input_price ?? null;
  }
  if (typeof row.markup_rate === 'number') {
    const base = typeof row.output_price === 'number' ? row.output_price : row.input_price;
    if (typeof base === 'number') return base * (1 + row.markup_rate);
  }
  return null;
};

const fmtAge = (ts?: number) => {
  if (!ts) return '-';
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export default function PricingView() {
    const { t } = useTranslation();
  const [draft, setDraft] = React.useState<PricingRow[]>([]);
  const [published, setPublished] = React.useState<PublishedPricingRow[]>([]);
  const [providers, setProviders] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const [search, setSearch] = React.useState('');
  const [providerFilter, setProviderFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'published' | 'draft'>('all');
  const [priceRange, setPriceRange] = React.useState<PriceRange>('all');
  const [sortKey, setSortKey] = React.useState<SortKey>('model');
  const [sortDesc, setSortDesc] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);

  const {
    drawerOpen,
    providerDrawerOpen,
    formPriceMode,
    status,
    model,
    publicModelId,
    providerModelId,
    providerAccountId,
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
    contextLength,
    latencyMs,
    markupRate,
    discountRate,
  } = usePricingEditUi();

  const [providerKeyRows, setProviderKeyRows] = React.useState<ProviderKeyRow[]>([]);

  const [preview, setPreview] = React.useState<PricingPreview | null>(null);
  const [globalModels, setGlobalModels] = React.useState<any[]>([]);
  const [notification, setNotification] = React.useState<{message: string; type: 'success' | 'error'} | null>(null);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadAll = React.useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [draftRows, providerRows, publishedRows, modelsData] = await Promise.all([
        apiGet<PricingRow[]>('/api/pricing/draft'),
        apiGet<ProviderKeyRow[]>('/api/provider-keys'),
        apiGet<PublishedPricingRow[]>('/api/pricing'),
        apiGet<any[]>('/api/llm-models').catch(() => []),
      ]);
      setDraft(draftRows);
      setProviderKeyRows(providerRows);
      setProviders(providerRows.map((r) => r.provider));
      setPublished(publishedRows);
      // Map llm_models format to the shape expected by the Combobox
      const mapped = modelsData.map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        provider: m.description || '',
        context_length: m.context_length || null,
        pricing: m.global_pricing ? {
          prompt: typeof m.global_pricing.prompt === 'number' ? `$${m.global_pricing.prompt}` : m.global_pricing.prompt,
          completion: typeof m.global_pricing.completion === 'number' ? `$${m.global_pricing.completion}` : m.global_pricing.completion,
          cache_read: m.global_pricing.cache_read ? (typeof m.global_pricing.cache_read === 'number' ? `$${m.global_pricing.cache_read}` : m.global_pricing.cache_read) : undefined,
          cache_write: m.global_pricing.cache_write ? (typeof m.global_pricing.cache_write === 'number' ? `$${m.global_pricing.cache_write}` : m.global_pricing.cache_write) : undefined,
          reasoning: m.global_pricing.reasoning ? (typeof m.global_pricing.reasoning === 'number' ? `$${m.global_pricing.reasoning}` : m.global_pricing.reasoning) : undefined,
        } : undefined,
      }));
      setGlobalModels(mapped);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
    return () => {
      pricingEdit.closeEditDrawer();
      pricingEdit.setProviderDrawerOpen(false);
    };
  }, [loadAll]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, providerFilter, statusFilter, priceRange]);

  const openCreateDrawer = () => {
    pricingEdit.openCreateFromKeys(providerKeyRows);
  };

  const openProviderDrawer = () => {
    pricingEdit.setProviderDrawerOpen(true);
  };

  const handleProviderSuccess = (providerSlug: string) => {
    pricingEdit.setProviderAccountId(providerSlug);
    loadAll(false);
  };

  const openEditDrawer = (row: PricingTableRow) => {
    pricingEdit.openEditFromRow(row);
  };

  const saveDraft = async (rates?: AppliedRateFields): Promise<boolean> => {
    const s = pricingEdit.get();
    const mode = 'fixed';
    const r = rates ?? {
      inputCost: s.inputCost,
      outputCost: s.outputCost,
      cacheReadCost: s.cacheReadCost,
      cacheWriteCost: s.cacheWriteCost,
      reasoningCost: s.reasoningCost,
      inputPrice: s.inputPrice,
      outputPrice: s.outputPrice,
      cacheReadPrice: s.cacheReadPrice,
      cacheWritePrice: s.cacheWritePrice,
      reasoningPrice: s.reasoningPrice,
    };
    const trimmedModelId = s.model.trim();
    const trimmedPublicModelId = s.publicModelId.trim();
    const payload: Record<string, unknown> = {
      model: trimmedModelId,
      public_model_id:
        trimmedPublicModelId && trimmedPublicModelId !== trimmedModelId
          ? trimmedPublicModelId
          : null,
      provider_model_id: s.providerModelId.trim() || null,
      provider_account_id: s.providerAccountId,
      price_mode: mode,
      currency: 'USD',
      context_length: s.contextLength ? Number(s.contextLength) : null,
      latency_ms: s.latencyMs ? Number(s.latencyMs) : null,
      reasoning_price: r.reasoningPrice ? Number(r.reasoningPrice) : null,
      status: s.status,
      provider_key_id: s.providerAccountId || '',
    };

    if (!s.model.trim()) {
      return false;
    }
    if (!s.providerAccountId) {
      return false;
    }

    if (mode === 'fixed') {
      if (!r.inputPrice || !r.outputPrice || !r.inputCost || !r.outputCost) {
        return false;
      }
      payload.input_cost = Number(r.inputCost);
      payload.output_cost = Number(r.outputCost);
      payload.cache_read_cost = r.cacheReadCost ? Number(r.cacheReadCost) : null;
      payload.cache_write_cost = r.cacheWriteCost ? Number(r.cacheWriteCost) : null;
      payload.reasoning_cost = r.reasoningCost ? Number(r.reasoningCost) : null;
      payload.input_price = Number(r.inputPrice);
      payload.output_price = Number(r.outputPrice);
      payload.cache_read_price = r.cacheReadPrice ? Number(r.cacheReadPrice) : null;
      payload.cache_write_price = r.cacheWritePrice ? Number(r.cacheWritePrice) : null;
    }

    setBusy(true);
    try {
      await apiPut('/api/pricing/draft', payload);
      await loadAll(false);
      await handlePreview();
      return true;
    } catch (err) {
      console.error('Failed to save draft:', err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const deleteDraft = async (row: PricingTableRow) => {
    if (row.status !== 'Draft') return;
    const params = new URLSearchParams({model: row.model});
    if (row.provider_account_id) params.set('provider_account_id', row.provider_account_id);
    if (row.provider_key_id) params.set('provider_key_id', row.provider_key_id);
    setBusy(true);
    try {
      await apiDelete(`/api/pricing/draft?${params.toString()}`);
      await loadAll(false);
      await handlePreview();
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    const data = await apiPost<PricingPreview>('/api/pricing/preview', {});
    setPreview(data);
  };

  const handlePublish = async () => {
    setBusy(true);
    try {
      await apiPost('/api/pricing/publish', {operator: 'admin@pararouter.com'});
      await loadAll(false);
      setCurrentPage(1);
      await handlePreview();
      showNotification(t('pricing.publish_success', '发布成功'));
      return true;
    } catch (err) {
      showNotification(err instanceof Error ? err.message : String(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const loadAllFiltered = React.useCallback(async () => {
    // some logic
  }, []);

  const tableRows = React.useMemo(() => {
    const draftMap = new Set(draft.map((r) => effectiveRowKey(r)));
    const merged: PricingTableRow[] = [
      ...draft.map((r) => ({...r, operational_status: r.status, status: 'Draft' as const})),
      ...published
        .filter((r) => !draftMap.has(effectiveRowKey(r)))
        .map((r) => ({...r, operational_status: r.status, status: 'Published' as const})),
    ];

    const lowerSearch = search.trim().toLowerCase();

    const filtered = merged.filter((row) => {
      const provider = row.provider_account_id || '';
      const primaryPrice = typeof row.output_price === 'number' ? row.output_price : row.input_price ?? null;

      if (lowerSearch) {
        const hit = row.model.toLowerCase().includes(lowerSearch) || provider.toLowerCase().includes(lowerSearch);
        if (!hit) return false;
      }

      if (providerFilter !== 'all' && provider !== providerFilter) return false;

      if (statusFilter === 'draft' && row.status !== 'Draft') return false;
      if (statusFilter === 'published' && row.status !== 'Published') return false;

      if (priceRange === 'lt1' && !(typeof primaryPrice === 'number' && primaryPrice < 1)) return false;
      if (priceRange === '1to10' && !(typeof primaryPrice === 'number' && primaryPrice >= 1 && primaryPrice <= 10)) return false;
      if (priceRange === 'gte10' && !(typeof primaryPrice === 'number' && primaryPrice > 10)) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      const direction = sortDesc ? -1 : 1;
      const providerA = a.provider_account_id || '';
      const providerB = b.provider_account_id || '';
      if (sortKey === 'model') return direction * a.model.localeCompare(b.model);
      if (sortKey === 'provider') return direction * providerA.localeCompare(providerB);
      if (sortKey === 'status') return direction * a.status.localeCompare(b.status);
      if (sortKey === 'input') return direction * ((a.input_price || 0) - (b.input_price || 0));
      if (sortKey === 'output') return direction * ((a.output_price || 0) - (b.output_price || 0));
      if (sortKey === 'final') return direction * ((getFinalPrice(a) || 0) - (getFinalPrice(b) || 0));
      return direction * a.model.localeCompare(b.model);
    });
  }, [draft, published, search, providerFilter, statusFilter, priceRange, sortKey, sortDesc]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(tableRows.length / pageSize));
  const pagedRows = tableRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const onSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDesc((v) => !v);
      return;
    }
    setSortKey(nextKey);
    setSortDesc(false);
  };

  return (
    <div className="space-y-6 relative">
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

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('pricing.pricing_center')}</h1>
          <p className="text-gray-500 mt-1">{t('pricing.provider_bound_pricing_all_pri')}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-2 border border-gray-100 rounded-lg text-[13px] font-medium text-zinc-600 bg-white">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          {t('pricing.0_00')}</div>
      </div>

      <PricingHeader 
        search={search} setSearch={setSearch}
        providerFilter={providerFilter} setProviderFilter={setProviderFilter}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        priceRange={priceRange} setPriceRange={setPriceRange}
        providers={providers}
        openProviderDrawer={openProviderDrawer}
        openCreateDrawer={openCreateDrawer}
        preview={preview}
        busy={busy}
        handlePreview={handlePreview}
      />

      <PricingTable 
        loading={loading}
        pagedRows={pagedRows}
        tableRowsCount={tableRows.length}
        hasProviders={providers.length > 0}
        onSort={onSort}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        openEditDrawer={openEditDrawer}
      />

      <ProviderAccountModal 
        isOpen={providerDrawerOpen}
        onClose={() => pricingEdit.closeProviderDrawer()}
        onSuccess={handleProviderSuccess}
      />

      <EditPriceModal 
        isOpen={drawerOpen}
        onClose={() => pricingEdit.closeEditDrawer()}
        model={model} setModel={pricingEdit.setModel}
        publicModelId={publicModelId} setPublicModelId={pricingEdit.setPublicModelId}
        providerModelId={providerModelId} setProviderModelId={pricingEdit.setProviderModelId}
        providerAccountId={providerAccountId} setProviderAccountId={pricingEdit.setProviderAccountId}
        formPriceMode={formPriceMode} setFormPriceMode={pricingEdit.setFormPriceMode}
        inputCost={inputCost} setInputCost={pricingEdit.setInputCost}
        outputCost={outputCost} setOutputCost={pricingEdit.setOutputCost}
        cacheReadCost={cacheReadCost} setCacheReadCost={pricingEdit.setCacheReadCost}
        cacheWriteCost={cacheWriteCost} setCacheWriteCost={pricingEdit.setCacheWriteCost}
        reasoningCost={reasoningCost} setReasoningCost={pricingEdit.setReasoningCost}
        inputPrice={inputPrice} setInputPrice={pricingEdit.setInputPrice}
        outputPrice={outputPrice} setOutputPrice={pricingEdit.setOutputPrice}
        cacheReadPrice={cacheReadPrice} setCacheReadPrice={pricingEdit.setCacheReadPrice}
        cacheWritePrice={cacheWritePrice} setCacheWritePrice={pricingEdit.setCacheWritePrice}
        reasoningPrice={reasoningPrice} setReasoningPrice={pricingEdit.setReasoningPrice}
        contextLength={contextLength} setContextLength={pricingEdit.setContextLength}
        latencyMs={latencyMs} setLatencyMs={pricingEdit.setLatencyMs}
        markupRate={markupRate} setMarkupRate={pricingEdit.setMarkupRate}
        providerKeyRows={providerKeyRows}
        globalModels={globalModels}
        discountRate={discountRate} setDiscountRate={pricingEdit.setDiscountRate}
        providers={providers}
        busy={busy}
        handlePreview={handlePreview}
        saveDraft={saveDraft}
        handlePublish={handlePublish}
        preview={preview}
        draft={draft}
        published={published}
      />
    </div>
  );
}
