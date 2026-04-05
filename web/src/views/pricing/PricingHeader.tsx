import React from 'react';
import { Search, Plus, SlidersHorizontal } from 'lucide-react';
import { Select } from '../../components/Select';
import { PriceRange, PricingPreview } from './types';

interface PricingHeaderProps {
  search: string;
  setSearch: (v: string) => void;
  providerFilter: string;
  setProviderFilter: (v: string) => void;
  statusFilter: 'all' | 'published' | 'draft';
  setStatusFilter: React.Dispatch<React.SetStateAction<'all' | 'published' | 'draft'>>;
  priceRange: PriceRange;
  setPriceRange: (v: PriceRange) => void;
  providers: string[];
  openProviderDrawer: () => void;
  openCreateDrawer: (tab: 'quick' | 'batch') => void;
  draftOnly: boolean;
  draftCount: number;
  preview: PricingPreview | null;
  busy: boolean;
  handlePreview: () => Promise<void>;
  handlePublish: () => Promise<void>;
}

export default function PricingHeader({
  search, setSearch, providerFilter, setProviderFilter, statusFilter, setStatusFilter,
  priceRange, setPriceRange, providers, openProviderDrawer, openCreateDrawer,
  draftOnly, draftCount, preview, busy, handlePreview, handlePublish
}: PricingHeaderProps) {
  const hasProviders = providers.length > 0;

  return (
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
          <Select
            className="w-[180px]"
            value={providerFilter}
            onChange={(val) => setProviderFilter(val)}
            options={[
              { value: 'all', label: 'Provider: All' },
              ...providers.map(p => ({ value: p, label: p }))
            ]}
          />

          <Select
            className="w-[140px]"
            value={statusFilter}
            onChange={(val) => setStatusFilter(val as 'all' | 'published' | 'draft')}
            options={[
              { value: 'all', label: 'Status: All' },
              { value: 'published', label: 'Published' },
              { value: 'draft', label: 'Draft' }
            ]}
          />

          <Select
            className="w-[160px]"
            value={priceRange}
            onChange={(val) => setPriceRange(val as PriceRange)}
            options={[
              { value: 'all', label: 'Price: All' },
              { value: 'lt1', label: '< $1 / 1M' },
              { value: '1to10', label: '$1 - $10 / 1M' },
              { value: 'gte10', label: '> $10 / 1M' }
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openProviderDrawer}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <Plus size={14} /> Provider
          </button>
          <button
            onClick={() => {
              if (!hasProviders) {
                openProviderDrawer();
                return;
              }
              openCreateDrawer('quick');
            }}
            className={`inline-flex items-center gap-1.5 bg-black text-white rounded-lg px-3.5 py-2 text-sm font-semibold ${!hasProviders ? 'opacity-70' : ''}`}
            title={!hasProviders ? 'Please create a Provider Account first' : 'Add a new price entry'}
          >
            <Plus size={14} /> New Price
          </button>
          <button
            onClick={() => {
              if (!hasProviders) {
                openProviderDrawer();
                return;
              }
              openCreateDrawer('batch');
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 text-sm font-semibold hover:bg-zinc-50 ${!hasProviders ? 'opacity-70' : ''}`}
            title={!hasProviders ? 'Please create a Provider Account first' : 'Configure batch markup rules'}
          >
            <SlidersHorizontal size={14} /> Batch Rules
          </button>
          <button
            onClick={() => setStatusFilter((v) => (v === 'draft' ? 'all' : 'draft'))}
            className={`px-3.5 py-2 rounded-lg border text-sm font-semibold inline-flex items-center gap-1.5 ${draftOnly ? 'border-amber-300 text-amber-800 bg-amber-50' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}
          >
            Drafts
            <span className={`inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${draftCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-500'}`}>
              {draftCount}
            </span>
          </button>
        </div>
      </div>

      {draftOnly && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3">
          <p className="text-sm text-zinc-700">
            {draftCount} draft items • affecting {preview?.affected_models ?? draftCount} models • estimated profit {preview?.estimated_profit_margin == null ? '-' : `${preview.estimated_profit_margin}%`}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={handlePreview} className="px-3 py-1.5 rounded border text-sm font-semibold" disabled={busy}>Preview All</button>
            <button onClick={handlePublish} className="px-3 py-1.5 rounded bg-black text-white text-sm font-semibold disabled:opacity-50" disabled={busy || draftCount === 0}>Publish All</button>
          </div>
        </div>
      )}
    </div>
  );
}
