import React from 'react';
import {apiDelete, apiGet, apiPost, apiPut} from '../lib/api';

type PricingRow = {
  model: string;
  provider_account_id?: string | null;
  price_mode: 'fixed' | 'markup';
  input_price?: number | null;
  output_price?: number | null;
  markup_rate?: number | null;
  currency: string;
};

export default function PricingView() {
  const [draft, setDraft] = React.useState<PricingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [model, setModel] = React.useState('');
  const [inputPrice, setInputPrice] = React.useState('');
  const [outputPrice, setOutputPrice] = React.useState('');
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

  React.useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const saveDraft = async () => {
    if (!model || !inputPrice || !outputPrice) return;
    await apiPut('/api/pricing/draft', {
      model,
      price_mode: 'fixed',
      input_price: Number(inputPrice),
      output_price: Number(outputPrice),
      currency: 'USD',
    });
    setModel('');
    setInputPrice('');
    setOutputPrice('');
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
        <p className="text-gray-500 mt-1">L1 quick pricing: manage global model prices and publish changes.</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Quick Price Editor</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model id (e.g. openai/gpt-4o)"
            className="px-3 py-2 border rounded-lg"
          />
          <input
            value={inputPrice}
            onChange={(e) => setInputPrice(e.target.value)}
            placeholder="input price / 1M"
            className="px-3 py-2 border rounded-lg"
          />
          <input
            value={outputPrice}
            onChange={(e) => setOutputPrice(e.target.value)}
            placeholder="output price / 1M"
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
                      ? `in ${row.input_price} / out ${row.output_price}`
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
