import React from 'react';
import {apiDelete, apiGet, apiPost, apiPut} from '../lib/api';

type PricingRow = {
  model: string;
  provider_account_id?: string | null;
  price_mode: 'fixed' | 'markup';
  input_price?: number | null;
  output_price?: number | null;
  cache_read_price?: number | null;
  cache_write_price?: number | null;
  markup_rate?: number | null;
  currency: string;
};

type ProviderKeyRow = {
  provider: string;
  status: string;
};

export default function PricingView() {
  const [draft, setDraft] = React.useState<PricingRow[]>([]);
  const [providers, setProviders] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [scope, setScope] = React.useState<'global' | 'provider'>('global');
  const [model, setModel] = React.useState('');
  const [providerAccountId, setProviderAccountId] = React.useState('');
  const [inputPrice, setInputPrice] = React.useState('');
  const [outputPrice, setOutputPrice] = React.useState('');
  const [cacheReadPrice, setCacheReadPrice] = React.useState('');
  const [cacheWritePrice, setCacheWritePrice] = React.useState('');
  const [preview, setPreview] = React.useState<any>(null);

  const loadDraft = React.useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiGet<PricingRow[]>('/api/pricing/draft');
      setDraft(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProviders = React.useCallback(async () => {
    const rows = await apiGet<ProviderKeyRow[]>('/api/provider-keys');
    setProviders(rows.map((r) => r.provider));
  }, []);

  React.useEffect(() => {
    loadDraft();
    loadProviders();
  }, [loadDraft, loadProviders]);

  const saveDraft = async () => {
    if (!model || !inputPrice || !outputPrice) return;
    if (scope === 'provider' && !providerAccountId) return;
    await apiPut('/api/pricing/draft', {
      model,
      provider_account_id: scope === 'provider' ? providerAccountId : undefined,
      price_mode: 'fixed',
      input_price: Number(inputPrice),
      output_price: Number(outputPrice),
      cache_read_price: cacheReadPrice ? Number(cacheReadPrice) : null,
      cache_write_price: cacheWritePrice ? Number(cacheWritePrice) : null,
      currency: 'USD',
    });
    setModel('');
    setProviderAccountId('');
    setInputPrice('');
    setOutputPrice('');
    setCacheReadPrice('');
    setCacheWritePrice('');
    await loadDraft();
  };

  const deleteDraft = async (row: PricingRow) => {
    const params = new URLSearchParams({model: row.model});
    if (row.provider_account_id) params.set('provider_account_id', row.provider_account_id);
    await apiDelete(`/api/pricing/draft?${params.toString()}`);
    await loadDraft();
  };

  const handlePreview = async () => {
    const data = await apiPost('/api/pricing/preview', {});
    setPreview(data);
  };

  const handlePublish = async () => {
    await apiPost('/api/pricing/publish', {operator: 'admin@openhub.local'});
    await loadDraft();
    await handlePreview();
  };

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pricing Center</h1>
        <p className="text-gray-500 mt-1">Bind pricing to global or provider account and configure input/output/cache prices.</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Quick Price Editor</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model id (e.g. openai/gpt-4o)"
            className="px-3 py-2 border rounded-lg"
          />
          <div className="flex items-center gap-2 border rounded-lg px-2">
            <button
              onClick={() => setScope('global')}
              className={`px-2 py-1 text-xs rounded ${scope === 'global' ? 'bg-black text-white' : 'text-zinc-600'}`}
            >
              Global
            </button>
            <button
              onClick={() => setScope('provider')}
              className={`px-2 py-1 text-xs rounded ${scope === 'provider' ? 'bg-black text-white' : 'text-zinc-600'}`}
            >
              Provider-bound
            </button>
          </div>
          <input
            value={inputPrice}
            onChange={(e) => setInputPrice(e.target.value)}
            placeholder="input price / 1M"
            className="px-3 py-2 border rounded-lg"
          />
        </div>
        {scope === 'provider' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={providerAccountId}
              onChange={(e) => setProviderAccountId(e.target.value)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">Select provider account</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500 flex items-center">
              {providers.length > 0
                ? 'This price will override global pricing for the selected provider.'
                : 'No provider accounts found yet. Add provider keys in Settings first.'}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={outputPrice}
            onChange={(e) => setOutputPrice(e.target.value)}
            placeholder="output price / 1M"
            className="px-3 py-2 border rounded-lg"
          />
          <input
            value={cacheReadPrice}
            onChange={(e) => setCacheReadPrice(e.target.value)}
            placeholder="cache read price / 1M (optional)"
            className="px-3 py-2 border rounded-lg"
          />
          <input
            value={cacheWritePrice}
            onChange={(e) => setCacheWritePrice(e.target.value)}
            placeholder="cache write price / 1M (optional)"
            className="px-3 py-2 border rounded-lg"
          />
          <button onClick={saveDraft} className="bg-black text-white rounded-lg px-4 py-2 font-semibold">
            Save Draft
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Draft Items</h2>
          <div className="flex gap-2">
            <button onClick={handlePreview} className="px-3 py-1.5 rounded border text-sm font-semibold">Preview</button>
            <button onClick={handlePublish} className="px-3 py-1.5 rounded bg-black text-white text-sm font-semibold">Publish</button>
          </div>
        </div>
        {loading ? (
          <p className="text-zinc-500 text-sm">Loading...</p>
        ) : draft.length === 0 ? (
          <p className="text-zinc-500 text-sm">No draft pricing yet.</p>
        ) : (
          <div className="space-y-2">
            {draft.map((row) => (
              <div key={`${row.model}:${row.provider_account_id || 'global'}`} className="flex items-center justify-between border rounded-lg px-3 py-2">
                <div className="text-sm">
                  <span className="font-semibold">{row.model}</span>
                  <span className="text-zinc-500 ml-2">{row.provider_account_id || 'global'}</span>
                  <span className="text-zinc-500 ml-2">
                    {row.price_mode === 'fixed'
                      ? `in ${row.input_price} / out ${row.output_price} / cache-r ${row.cache_read_price ?? '-'} / cache-w ${row.cache_write_price ?? '-'}`
                      : `markup ${row.markup_rate}`}
                  </span>
                </div>
                <button onClick={() => deleteDraft(row)} className="text-red-600 text-xs font-semibold">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6">
          <h3 className="font-semibold mb-2">Preview</h3>
          <p className="text-sm text-zinc-600">Affected models: {preview.affected_models ?? 0}</p>
          <p className="text-sm text-zinc-600">Changes: {preview.changes_count ?? 0}</p>
        </div>
      )}
    </div>
  );
}
