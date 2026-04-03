import React from 'react';
import {ExternalLink, ShieldAlert} from 'lucide-react';
import {apiDelete, apiGet, apiPut} from '../lib/api';
import {localUser} from '../lib/session';

type ProviderRow = {
  provider: string;
  key: string;
  status: string;
  label?: string;
  base_url?: string;
  docs_url?: string;
};

export default function ProvidersView() {
  const isAdmin = localUser.role === 'admin';
  const [providers, setProviders] = React.useState<ProviderRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [newProvider, setNewProvider] = React.useState({
    provider: 'openai',
    label: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    docs_url: 'https://platform.openai.com/docs',
    key: '',
    status: 'active',
  });

  const loadProviders = React.useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    try {
      const rows = await apiGet<ProviderRow[]>('/api/provider-keys');
      setProviders(rows);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleSaveProvider = async () => {
    const provider = newProvider.provider.trim().toLowerCase();
    if (!provider || !newProvider.key.trim()) return;
    setSaving(true);
    try {
      await apiPut(`/api/provider-keys/${encodeURIComponent(provider)}`, {
        ...newProvider,
        provider,
      });
      setNewProvider({...newProvider, provider, key: ''});
      await loadProviders();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProvider = async (provider: string) => {
    await apiDelete(`/api/provider-keys/${encodeURIComponent(provider)}`);
    await loadProviders();
  };

  if (!isAdmin) {
    return (
      <div className="max-w-3xl">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-3 text-amber-800">
          <ShieldAlert className="shrink-0 mt-0.5" size={20} />
          <p className="text-sm">Provider management is admin-only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Providers</h1>
        <p className="text-gray-500 mt-1">Manage provider account metadata and secrets used by Pricing.</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400">Create or Update Provider</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={newProvider.provider}
            onChange={(e) => setNewProvider({...newProvider, provider: e.target.value})}
            placeholder="provider id (e.g. openai)"
            className="px-3 py-2 border rounded-lg"
          />
          <input
            value={newProvider.label}
            onChange={(e) => setNewProvider({...newProvider, label: e.target.value})}
            placeholder="provider name"
            className="px-3 py-2 border rounded-lg"
          />
          <input
            value={newProvider.base_url}
            onChange={(e) => setNewProvider({...newProvider, base_url: e.target.value})}
            placeholder="base url"
            className="px-3 py-2 border rounded-lg"
          />
          <input
            value={newProvider.docs_url}
            onChange={(e) => setNewProvider({...newProvider, docs_url: e.target.value})}
            placeholder="docs url"
            className="px-3 py-2 border rounded-lg"
          />
          <input
            type="password"
            value={newProvider.key}
            onChange={(e) => setNewProvider({...newProvider, key: e.target.value})}
            placeholder="api key"
            className="px-3 py-2 border rounded-lg"
          />
          <button
            onClick={handleSaveProvider}
            disabled={saving || !newProvider.provider.trim() || !newProvider.key.trim()}
            className="bg-black text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Provider'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-4">Provider Accounts</h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading providers...</p>
        ) : providers.length === 0 ? (
          <p className="text-sm text-zinc-500">No providers configured yet.</p>
        ) : (
          <div className="space-y-3">
            {providers.map((provider) => (
              <div key={provider.provider} className="flex items-start justify-between gap-4 border border-zinc-100 rounded-xl p-4 bg-zinc-50/40">
                <div>
                  <p className="text-sm font-bold text-zinc-900">{provider.label || provider.provider}</p>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">{provider.provider}</p>
                  {provider.base_url && <p className="text-xs text-zinc-600 mt-1">{provider.base_url}</p>}
                  {provider.docs_url && (
                    <a href={provider.docs_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-700 hover:text-black underline underline-offset-2">
                      Docs <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteProvider(provider.provider)}
                  className="text-xs font-bold text-red-500 hover:underline"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
