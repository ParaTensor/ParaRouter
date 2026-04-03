import React from 'react';
import {Search, Plus, SlidersHorizontal, X, ChevronRight, ChevronLeft} from 'lucide-react';
import {apiDelete, apiGet, apiPost, apiPut} from '../lib/api';
import {useNavigate} from 'react-router-dom';

type PricingRow = {
  model: string;
  provider_account_id?: string | null;
  price_mode: 'fixed' | 'markup';
  input_price?: number | null;
  output_price?: number | null;
  cache_read_price?: number | null;
  cache_write_price?: number | null;
  reasoning_price?: number | null;
  markup_rate?: number | null;
  currency: string;
  context_length?: number | null;
  latency_ms?: number | null;
  is_top_provider?: boolean | null;
  status?: string;
  updated_at?: number;
};

type PublishedPricingRow = PricingRow & {
  version: string;
  updated_at: number;
};

type ProviderKeyRow = {
  provider: string;
  status: string;
};

type PricingTableRow = PricingRow & {
  status: 'Draft' | 'Published';
};

type PricingPreview = {
  affected_models?: number;
  changes_count?: number;
  estimated_profit_margin?: number | null;
};

type PricingRelease = {
  version: string;
  status: string;
  operator: string;
  created_at: number;
};

type SortKey = 'model' | 'provider' | 'input' | 'output' | 'final' | 'status' | 'updated';

type PriceRange = 'all' | 'lt1' | '1to10' | 'gte10';

type DrawerTab = 'quick' | 'batch' | 'advanced';

const rowKey = (row: {model: string; provider_account_id?: string | null}) => `${row.model}::${row.provider_account_id || ''}`;

const numberText = (value?: number | null) => (typeof value === 'number' ? String(value) : '');

const fmtPrice = (value?: number | null) => (typeof value === 'number' ? `$${value.toFixed(2)}` : '-');
const fmtNum = (value?: number | null) => (typeof value === 'number' ? String(value) : '-');
const fmtLatency = (value?: number | null) => (typeof value === 'number' ? `${value}ms` : '-');

const fmtMarkup = (value?: number | null) => {
  if (typeof value !== 'number') return '-';
  const percent = value > 1 ? value : value * 100;
  return `+${percent.toFixed(2)}%`;
};

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
  const navigate = useNavigate();
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
  const [showCacheFields, setShowCacheFields] = React.useState(false);
  const [formPriceMode, setFormPriceMode] = React.useState<'fixed' | 'markup'>('fixed');
  const [model, setModel] = React.useState('');
  const [providerAccountId, setProviderAccountId] = React.useState('');
  const [inputPrice, setInputPrice] = React.useState('');
  const [outputPrice, setOutputPrice] = React.useState('');
  const [cacheReadPrice, setCacheReadPrice] = React.useState('');
  const [cacheWritePrice, setCacheWritePrice] = React.useState('');
  const [reasoningPrice, setReasoningPrice] = React.useState('');
  const [contextLength, setContextLength] = React.useState('');
  const [latencyMs, setLatencyMs] = React.useState('');
  const [isTopProvider, setIsTopProvider] = React.useState(false);
  const [markupRate, setMarkupRate] = React.useState('');

  const [preview, setPreview] = React.useState<PricingPreview | null>(null);
  const [releases, setReleases] = React.useState<PricingRelease[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);
  const [historyTarget, setHistoryTarget] = React.useState<{model: string; provider: string} | null>(null);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [draftRows, providerRows, publishedRows] = await Promise.all([
        apiGet<PricingRow[]>('/api/pricing/draft'),
        apiGet<ProviderKeyRow[]>('/api/provider-keys'),
        apiGet<PublishedPricingRow[]>('/api/pricing'),
      ]);
      setDraft(draftRows);
      setProviders(providerRows.map((r) => r.provider));
      setPublished(publishedRows);
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
    setProviderAccountId(providers[0] || '');
    setInputPrice('');
    setOutputPrice('');
    setCacheReadPrice('');
    setCacheWritePrice('');
    setReasoningPrice('');
    setContextLength('');
    setLatencyMs('');
    setIsTopProvider(false);
    setMarkupRate('');
    setShowCacheFields(false);
    setDrawerOpen(true);
  };

  const openEditDrawer = (row: PricingTableRow) => {
    setDrawerTab(row.price_mode === 'markup' ? 'advanced' : 'quick');
    setFormPriceMode(row.price_mode);
    setModel(row.model);
    setProviderAccountId(row.provider_account_id || '');
    setInputPrice(numberText(row.input_price));
    setOutputPrice(numberText(row.output_price));
    setCacheReadPrice(numberText(row.cache_read_price));
    setCacheWritePrice(numberText(row.cache_write_price));
    setReasoningPrice(numberText(row.reasoning_price));
    setContextLength(numberText(row.context_length));
    setLatencyMs(numberText(row.latency_ms));
    setIsTopProvider(Boolean(row.is_top_provider));
    setMarkupRate(numberText(row.markup_rate));
    setShowCacheFields(Boolean(row.cache_read_price || row.cache_write_price));
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
    };

    if (!payload.model || !providerAccountId) return;

    if (mode === 'fixed') {
      if (!inputPrice || !outputPrice) return;
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
      ...draft.map((r) => ({...r, status: 'Draft' as const})),
      ...published.filter((r) => !draftMap.has(rowKey(r))).map((r) => ({...r, status: 'Published' as const})),
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
  const draftOnly = statusFilter === 'draft';
  const hasProviders = providers.length > 0;

  const onSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDesc((v) => !v);
      return;
    }
    setSortKey(nextKey);
    setSortDesc(nextKey === 'updated');
  };

  return (
    <div className="max-w-7xl space-y-6 relative">
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

      <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1 min-w-0">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-black transition-colors" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search model or provider..."
                className="w-full pl-10 pr-3 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5 transition-all"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white"
            >
              <option value="all">Provider: All</option>
              {providers.map((provider) => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'published' | 'draft')}
              className="px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white"
            >
              <option value="all">Status: All</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>

            <select
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value as PriceRange)}
              className="px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white"
            >
              <option value="all">Price: All</option>
              <option value="lt1">&lt; $1 / 1M</option>
              <option value="1to10">$1 - $10 / 1M</option>
              <option value="gte10">&gt; $10 / 1M</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => navigate('/providers')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <Plus size={14} /> Provider
            </button>
            <button
              onClick={() => {
                if (!hasProviders) {
                  navigate('/providers');
                  return;
                }
                openCreateDrawer('quick');
              }}
              className={`inline-flex items-center gap-1.5 bg-black text-white rounded-lg px-3.5 py-2 text-sm font-semibold ${!hasProviders ? 'opacity-70' : ''}`}
              title={!hasProviders ? 'Create a Provider Account first' : undefined}
            >
              <Plus size={14} /> New Price
            </button>
            <button
              onClick={() => {
                if (!hasProviders) {
                  navigate('/providers');
                  return;
                }
                openCreateDrawer('batch');
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 text-sm font-semibold hover:bg-zinc-50 ${!hasProviders ? 'opacity-70' : ''}`}
              title={!hasProviders ? 'Create a Provider Account first' : undefined}
            >
              <SlidersHorizontal size={14} /> Batch Rules
            </button>
            <button
              onClick={() => setStatusFilter((v) => (v === 'draft' ? 'all' : 'draft'))}
              className={`px-3.5 py-2 rounded-lg border text-sm font-semibold inline-flex items-center gap-1.5 ${draftOnly ? 'border-amber-300 text-amber-800 bg-amber-50' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}
            >
              Drafts
              <span className={`inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${draft.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>
                {draft.length}
              </span>
            </button>
          </div>
        </div>

        {draftOnly && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
            <p className="text-sm text-zinc-700">
              {draft.length} draft items • affecting {preview?.affected_models ?? draft.length} models • estimated profit {preview?.estimated_profit_margin == null ? '-' : `${preview.estimated_profit_margin}%`}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={handlePreview} className="px-3 py-1.5 rounded border text-sm font-semibold" disabled={busy}>Preview All</button>
              <button onClick={handlePublish} className="px-3 py-1.5 rounded bg-black text-white text-sm font-semibold disabled:opacity-50" disabled={busy || draft.length === 0}>Publish All</button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/70 border-b">
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('model')}>Model ID</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('provider')}>Provider Account</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('input')}>Input $/1M</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('output')}>Output $/1M</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('final')}>Final Price</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Reasoning</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Context</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Latency</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Cache Read</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Cache Write</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('status')}>Status</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('updated')}>Updated</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-zinc-400 text-sm">Loading pricing...</td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-zinc-400 text-sm">
                    {hasProviders ? (
                      'No pricing configured yet. Create your first price.'
                    ) : (
                      <span>
                        No Provider Account found yet.
                        <br />
                        Pricing requires at least one Provider Account.
                        <br />
                        Click <span className="font-semibold">+ Provider</span> in the toolbar to get started.
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={`${row.status}:${rowKey(row)}`} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-zinc-900">
                      <button onClick={() => navigate(`/models/${encodeURIComponent(row.model)}/providers`)} className="hover:underline underline-offset-2">
                        {row.model}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">{row.provider_account_id || '-'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-zinc-800">{fmtPrice(row.input_price)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-zinc-800">{fmtPrice(row.output_price)}</td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-zinc-900">
                      {row.price_mode === 'markup' ? fmtMarkup(row.markup_rate) : fmtPrice(getFinalPrice(row))}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-zinc-700">{fmtPrice(row.reasoning_price)}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{fmtNum(row.context_length)}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{fmtLatency(row.latency_ms)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-zinc-600">{fmtPrice(row.cache_read_price)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-zinc-600">{fmtPrice(row.cache_write_price)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${row.status === 'Published' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        {row.status}
                      </span>
                      {row.is_top_provider && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border border-blue-200 bg-blue-50 text-blue-700">
                          Top
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{fmtAge(row.updated_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openEditDrawer(row)} className="px-2 py-1 text-xs font-semibold border rounded hover:bg-white">Edit</button>
                        <button onClick={() => deleteDraft(row)} disabled={row.status !== 'Draft'} className="px-2 py-1 text-xs font-semibold text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">Delete</button>
                        <button onClick={() => openHistory(row)} className="px-2 py-1 text-xs font-semibold border rounded hover:bg-white">History</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-gray-50/40">
          <p className="text-xs text-zinc-500">{tableRows.length} items</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 border rounded disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-zinc-600">Page {currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 border rounded disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

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

      {preview && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5">
          <h3 className="font-semibold mb-2">Preview Changes</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="text-zinc-500">Affected models</p>
              <p className="font-semibold text-zinc-900">{preview.affected_models ?? 0}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="text-zinc-500">Changes</p>
              <p className="font-semibold text-zinc-900">{preview.changes_count ?? 0}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="text-zinc-500">Estimated profit</p>
              <p className="font-semibold text-zinc-900">{preview.estimated_profit_margin == null ? '-' : `${preview.estimated_profit_margin}%`}</p>
            </div>
          </div>
        </div>
      )}

      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-white border-l border-zinc-200 shadow-2xl z-50 flex flex-col">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">{model ? 'Edit Price' : 'New Price'}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Provider-bound draft editor</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-md hover:bg-zinc-100"><X size={18} /></button>
            </div>

            <div className="px-5 pt-4 border-b">
              <div className="inline-flex p-1 bg-zinc-100 rounded-lg text-sm font-medium">
                <button onClick={() => setDrawerTab('quick')} className={`px-3 py-1.5 rounded-md ${drawerTab === 'quick' ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>Quick Pricing</button>
                <button onClick={() => setDrawerTab('batch')} className={`px-3 py-1.5 rounded-md ${drawerTab === 'batch' ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>Batch Rules</button>
                <button onClick={() => setDrawerTab('advanced')} className={`px-3 py-1.5 rounded-md ${drawerTab === 'advanced' ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>Advanced</button>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
              {drawerTab === 'quick' && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Model ID</label>
                    <input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="openai/gpt-4o"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Provider Account</label>
                    <select value={providerAccountId} onChange={(e) => setProviderAccountId(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white">
                      <option value="">Select provider account (required)</option>
                      {providers.map((provider) => (
                        <option key={provider} value={provider}>{provider}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Input $/1M</label>
                      <input value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Output $/1M</label>
                      <input value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>

                  <button onClick={() => setShowCacheFields((v) => !v)} className="text-sm font-semibold text-zinc-600 hover:text-black">
                    {showCacheFields ? 'Hide' : 'Show'} cache read/write
                  </button>

                  {showCacheFields && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Cache Read $/1M</label>
                        <input value={cacheReadPrice} onChange={(e) => setCacheReadPrice(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Cache Write $/1M</label>
                        <input value={cacheWritePrice} onChange={(e) => setCacheWritePrice(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-2 border rounded-lg" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Reasoning $/1M</label>
                      <input value={reasoningPrice} onChange={(e) => setReasoningPrice(e.target.value)} type="number" min="0" step="0.000001" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Context Length</label>
                      <input value={contextLength} onChange={(e) => setContextLength(e.target.value)} type="number" min="0" step="1" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Latency (ms)</label>
                    <input value={latencyMs} onChange={(e) => setLatencyMs(e.target.value)} type="number" min="0" step="1" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input type="checkbox" checked={isTopProvider} onChange={(e) => setIsTopProvider(e.target.checked)} />
                    Top provider for this model
                  </label>
                </>
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
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Price Mode</label>
                    <select value={formPriceMode} onChange={(e) => setFormPriceMode(e.target.value as 'fixed' | 'markup')} className="w-full px-3 py-2 border rounded-lg bg-white">
                      <option value="fixed">Fixed</option>
                      <option value="markup">Markup</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Model ID</label>
                    <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model id" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Provider Account</label>
                    <select value={providerAccountId} onChange={(e) => setProviderAccountId(e.target.value)} className="w-full px-3 py-2 border rounded-lg bg-white">
                      <option value="">Select provider account (required)</option>
                      {providers.map((provider) => (
                        <option key={provider} value={provider}>{provider}</option>
                      ))}
                    </select>
                  </div>
                  {formPriceMode === 'markup' ? (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Markup Rate</label>
                      <input value={markupRate} onChange={(e) => setMarkupRate(e.target.value)} type="number" step="0.0001" className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <input value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} type="number" step="0.000001" placeholder="input /1M" className="px-3 py-2 border rounded-lg" />
                      <input value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} type="number" step="0.000001" placeholder="output /1M" className="px-3 py-2 border rounded-lg" />
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <input value={reasoningPrice} onChange={(e) => setReasoningPrice(e.target.value)} type="number" step="0.000001" placeholder="reasoning /1M" className="px-3 py-2 border rounded-lg" />
                    <input value={contextLength} onChange={(e) => setContextLength(e.target.value)} type="number" step="1" placeholder="context length" className="px-3 py-2 border rounded-lg" />
                    <input value={latencyMs} onChange={(e) => setLatencyMs(e.target.value)} type="number" step="1" placeholder="latency ms" className="px-3 py-2 border rounded-lg" />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                    <input type="checkbox" checked={isTopProvider} onChange={(e) => setIsTopProvider(e.target.checked)} />
                    Top provider for this model
                  </label>
                </div>
              )}

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs uppercase tracking-widest font-bold text-zinc-400">Preview Card</p>
                <p className="text-sm text-zinc-700 mt-2">Effective price: input {inputPrice ? `$${Number(inputPrice).toFixed(2)}` : '-'} / output {outputPrice ? `$${Number(outputPrice).toFixed(2)}` : '-'}</p>
                <p className="text-sm text-zinc-500 mt-1">Estimated margin: {preview?.estimated_profit_margin == null ? '-' : `${preview.estimated_profit_margin}%`}</p>
              </div>
            </div>

            <div className="border-t px-5 py-4 bg-white space-y-2">
              <div className="flex items-center gap-2">
                <button onClick={saveDraft} disabled={busy || providers.length === 0} className="flex-1 bg-black text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-50">Save Draft</button>
                <button onClick={handlePreview} disabled={busy} className="px-3 py-2 rounded-lg border text-sm font-semibold">Preview Changes</button>
                <button onClick={handlePublish} disabled={busy || draft.length === 0} className="px-3 py-2 rounded-lg border border-black bg-black text-white text-sm font-semibold disabled:opacity-50">Publish</button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
