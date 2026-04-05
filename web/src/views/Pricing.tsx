import React from 'react';
import { X } from 'lucide-react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import PricingHeader from './pricing/PricingHeader';
import PricingTable from './pricing/PricingTable';
import ProviderAccountModal from './pricing/ProviderAccountModal';
import EditPriceModal from './pricing/EditPriceModal';
import {
  PricingRow, PublishedPricingRow, ProviderKeyRow, PricingTableRow,
  PricingPreview, PricingRelease, SortKey, PriceRange, DrawerTab
} from './pricing/types';

const rowKey = (row: {model: string; provider_account_id?: string | null; provider_key_id?: string}) => 
    `${row.model}::${row.provider_account_id || ''}::${row.provider_key_id || ''}`;

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
  const [draft, setDraft] = React.useState<PricingRow[]>([]);
  const [published, setPublished] = React.useState<PublishedPricingRow[]>([]);
  const [providers, setProviders] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const [search, setSearch] = React.useState('');
  const [providerFilter, setProviderFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'published' | 'draft'>('all');
  const [priceRange, setPriceRange] = React.useState<PriceRange>('all');
  const [sortKey, setSortKey] = React.useState<SortKey>('updated');
  const [sortDesc, setSortDesc] = React.useState(true);
  const [currentPage, setCurrentPage] = React.useState(1);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerTab, setDrawerTab] = React.useState<DrawerTab>('quick');

  const [formPriceMode, setFormPriceMode] = React.useState<'fixed' | 'markup'>('fixed');
  const [model, setModel] = React.useState('');
  const [modelQuery, setModelQuery] = React.useState('');
  const [providerAccountId, setProviderAccountId] = React.useState('');
  const [inputCost, setInputCost] = React.useState('');
  const [outputCost, setOutputCost] = React.useState('');
  const [cacheReadCost, setCacheReadCost] = React.useState('');
  const [cacheWriteCost, setCacheWriteCost] = React.useState('');
  const [reasoningCost, setReasoningCost] = React.useState('');
  const [inputPrice, setInputPrice] = React.useState('');
  const [outputPrice, setOutputPrice] = React.useState('');
  const [cacheReadPrice, setCacheReadPrice] = React.useState('');
  const [cacheWritePrice, setCacheWritePrice] = React.useState('');
  const [reasoningPrice, setReasoningPrice] = React.useState('');
  const [contextLength, setContextLength] = React.useState('');
  const [latencyMs, setLatencyMs] = React.useState('');
  const [isTopProvider, setIsTopProvider] = React.useState(false);
  const [markupRate, setMarkupRate] = React.useState('');
  const [providerKeyId, setProviderKeyId] = React.useState('');
  const [providerKeyRows, setProviderKeyRows] = React.useState<ProviderKeyRow[]>([]);
  const [providerDrawerOpen, setProviderDrawerOpen] = React.useState(false);

  const [preview, setPreview] = React.useState<PricingPreview | null>(null);
  const [releases, setReleases] = React.useState<PricingRelease[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);
  const [historyTarget, setHistoryTarget] = React.useState<{model: string; provider: string} | null>(null);
  const [globalModels, setGlobalModels] = React.useState<any[]>([]);
  const [discountRate, setDiscountRate] = React.useState('1.0');

  const loadAll = React.useCallback(async () => {
    setLoading(true);
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
  }, [loadAll]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, providerFilter, statusFilter, priceRange]);

  const openCreateDrawer = (tab: DrawerTab = 'quick') => {
    setDrawerTab(tab);
    setFormPriceMode('fixed');
    setModel('');
    setModelQuery('');
    setProviderAccountId(providers[0] || '');
    setInputCost('');
    setOutputCost('');
    setCacheReadCost('');
    setCacheWriteCost('');
    setReasoningCost('');
    setInputPrice('');
    setOutputPrice('');
    setCacheReadPrice('');
    setCacheWritePrice('');
    setReasoningPrice('');
    setContextLength('');
    setLatencyMs('');
    setIsTopProvider(false);
    setMarkupRate('');
    setProviderKeyId('');
    setDrawerOpen(true);
  };

  const openProviderDrawer = () => {
    setProviderDrawerOpen(true);
  };

  const handleProviderSuccess = (providerSlug: string) => {
    setProviderAccountId(providerSlug);
    loadAll();
  };

  const openEditDrawer = (row: PricingTableRow) => {
    const numberText = (value?: number | null) => (typeof value === 'number' ? String(value) : '');
    setDrawerTab(row.price_mode === 'markup' ? 'advanced' : 'quick');
    setFormPriceMode(row.price_mode);
    setModel(row.model);
    setModelQuery('');
    setProviderAccountId(row.provider_account_id || '');
    setInputCost(numberText(row.input_cost));
    setOutputCost(numberText(row.output_cost));
    setCacheReadCost(numberText(row.cache_read_cost));
    setCacheWriteCost(numberText(row.cache_write_cost));
    setReasoningCost(numberText(row.reasoning_cost));
    setInputPrice(numberText(row.input_price));
    setOutputPrice(numberText(row.output_price));
    setCacheReadPrice(numberText(row.cache_read_price));
    setCacheWritePrice(numberText(row.cache_write_price));
    setReasoningPrice(numberText(row.reasoning_price));
    setContextLength(numberText(row.context_length));
    setLatencyMs(numberText(row.latency_ms));
    setIsTopProvider(Boolean(row.is_top_provider));
    setMarkupRate(numberText(row.markup_rate));
    setProviderKeyId(row.provider_key_id || '');
    setDrawerOpen(true);
  };

  const saveDraft = async () => {
    const mode = drawerTab === 'advanced' ? formPriceMode : 'fixed';
    const payload: Record<string, unknown> = {
      model: model.trim(),
      provider_account_id: providerAccountId,
      price_mode: mode,
      currency: 'USD',
      context_length: contextLength ? Number(contextLength) : null,
      latency_ms: latencyMs ? Number(latencyMs) : null,
      reasoning_price: reasoningPrice ? Number(reasoningPrice) : null,
      status: 'online',
      is_top_provider: isTopProvider,
      provider_key_id: providerKeyId || '',
    };

    if (!payload.model || !providerAccountId) return;

    if (mode === 'fixed') {
      if (!inputPrice || !outputPrice || !inputCost || !outputCost) return;
      payload.input_cost = Number(inputCost);
      payload.output_cost = Number(outputCost);
      payload.cache_read_cost = cacheReadCost ? Number(cacheReadCost) : null;
      payload.cache_write_cost = cacheWriteCost ? Number(cacheWriteCost) : null;
      payload.reasoning_cost = reasoningCost ? Number(reasoningCost) : null;
      payload.input_price = Number(inputPrice);
      payload.output_price = Number(outputPrice);
      payload.cache_read_price = cacheReadPrice ? Number(cacheReadPrice) : null;
      payload.cache_write_price = cacheWritePrice ? Number(cacheWritePrice) : null;
    } else {
      if (!markupRate) return;
      payload.markup_rate = Number(markupRate);
    }

    setBusy(true);
    try {
      await apiPut('/api/pricing/draft', payload);
      await loadAll();
      await handlePreview();
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
      await loadAll();
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
      await apiPost('/api/pricing/publish', {operator: 'admin@openhub.local'});
      await loadAll();
      await handlePreview();
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (row: PricingTableRow) => {
    if (releases.length === 0) {
      const rows = await apiGet<PricingRelease[]>('/api/pricing/releases?limit=8');
      setReleases(rows);
    }
    setHistoryTarget({model: row.model, provider: row.provider_account_id || '-'});
    setShowHistory(true);
  };

  const closeHistory = () => setShowHistory(false);

  const tableRows = React.useMemo(() => {
    const draftMap = new Set(draft.map((r) => rowKey(r)));
    const merged: PricingTableRow[] = [
      ...draft.map((r) => ({...r, operational_status: r.status, status: 'Draft' as const})),
      ...published.filter((r) => !draftMap.has(rowKey(r))).map((r) => ({...r, operational_status: r.status, status: 'Published' as const})),
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
      return direction * ((a.updated_at || 0) - (b.updated_at || 0));
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
    setSortDesc(nextKey === 'updated');
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pricing Center</h1>
          <p className="text-gray-500 mt-1">Provider-bound pricing • All prices are attached to a specific Provider Account.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-2 border border-gray-100 rounded-lg text-[13px] font-medium text-zinc-600 bg-white">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          $0.00
        </div>
      </div>

      <PricingHeader 
        search={search} setSearch={setSearch}
        providerFilter={providerFilter} setProviderFilter={setProviderFilter}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        priceRange={priceRange} setPriceRange={setPriceRange}
        providers={providers}
        openProviderDrawer={openProviderDrawer}
        openCreateDrawer={openCreateDrawer}
        draftOnly={statusFilter === 'draft'}
        draftCount={draft.length}
        preview={preview}
        busy={busy}
        handlePreview={handlePreview}
        handlePublish={handlePublish}
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
        deleteDraft={deleteDraft}
        openHistory={openHistory}
      />

      {showHistory && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Publish History</h3>
              {historyTarget && <p className="text-xs text-zinc-500 mt-0.5">{historyTarget.model} • {historyTarget.provider}</p>}
            </div>
            <button onClick={closeHistory} className="text-zinc-500 hover:text-black"><X size={16} /></button>
          </div>
          <div className="mt-3 space-y-2">
            {releases.length === 0 ? (
              <p className="text-sm text-zinc-500">No release history yet.</p>
            ) : (
              releases.map((release) => (
                <div key={release.version} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
                  <span className="font-mono text-zinc-700">{release.version}</span>
                  <span className="text-zinc-500">{release.operator}</span>
                  <span className="text-zinc-500">{fmtAge(release.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ProviderAccountModal 
        isOpen={providerDrawerOpen}
        onClose={() => setProviderDrawerOpen(false)}
        onSuccess={handleProviderSuccess}
      />

      <EditPriceModal 
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        drawerTab={drawerTab}
        setDrawerTab={setDrawerTab}
        model={model} setModel={setModel}
        modelQuery={modelQuery} setModelQuery={setModelQuery}
        providerAccountId={providerAccountId} setProviderAccountId={setProviderAccountId}
        providerKeyId={providerKeyId} setProviderKeyId={setProviderKeyId}
        formPriceMode={formPriceMode} setFormPriceMode={setFormPriceMode}
        inputCost={inputCost} setInputCost={setInputCost}
        outputCost={outputCost} setOutputCost={setOutputCost}
        cacheReadCost={cacheReadCost} setCacheReadCost={setCacheReadCost}
        cacheWriteCost={cacheWriteCost} setCacheWriteCost={setCacheWriteCost}
        reasoningCost={reasoningCost} setReasoningCost={setReasoningCost}
        inputPrice={inputPrice} setInputPrice={setInputPrice}
        outputPrice={outputPrice} setOutputPrice={setOutputPrice}
        cacheReadPrice={cacheReadPrice} setCacheReadPrice={setCacheReadPrice}
        cacheWritePrice={cacheWritePrice} setCacheWritePrice={setCacheWritePrice}
        reasoningPrice={reasoningPrice} setReasoningPrice={setReasoningPrice}
        contextLength={contextLength} setContextLength={setContextLength}
        latencyMs={latencyMs} setLatencyMs={setLatencyMs}
        isTopProvider={isTopProvider} setIsTopProvider={setIsTopProvider}
        markupRate={markupRate} setMarkupRate={setMarkupRate}
        providerKeyRows={providerKeyRows}
        globalModels={globalModels}
        discountRate={discountRate} setDiscountRate={setDiscountRate}
        providers={providers}
        busy={busy}
        draftCount={draft.length}
        handlePreview={handlePreview}
        saveDraft={saveDraft}
        handlePublish={handlePublish}
        preview={preview}
      />
    </div>
  );
}
