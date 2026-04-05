import React from 'react';
import { X } from 'lucide-react';
import { Select } from '../../components/Select';
import { apiPut } from '../../lib/api';

interface ProviderAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (providerSlug: string) => void;
}

export default function ProviderAccountModal({ isOpen, onClose, onSuccess }: ProviderAccountModalProps) {
  const [providerSaving, setProviderSaving] = React.useState(false);
  const [newProvider, setNewProvider] = React.useState({
    provider: '',
    label: '',
    base_url: 'https://api.openai.com/v1',
    docs_url: 'https://platform.openai.com/docs',
    key: '',
    status: 'active',
    driver_type: 'openai_compatible',
  });

  React.useEffect(() => {
    if (isOpen) {
      setNewProvider({
        provider: '',
        label: '',
        base_url: 'https://api.openai.com/v1',
        docs_url: 'https://platform.openai.com/docs',
        key: '',
        status: 'active',
        driver_type: 'openai_compatible',
      });
    }
  }, [isOpen]);

  const saveProvider = async () => {
    const provider = newProvider.provider.trim().toLowerCase();
    if (!provider || !newProvider.key.trim()) return;
    setProviderSaving(true);
    try {
      await apiPut(`/api/provider-keys/${encodeURIComponent(provider)}`, {
        ...newProvider,
        provider,
      });
      onSuccess(provider);
      onClose();
    } finally {
      setProviderSaving(false);
    }
  };

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
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Add Provider Account</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Register a new upstream provider to bind pricing rules to.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-zinc-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-5 space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            A <strong>Provider Account</strong> represents a single upstream API account (e.g. your OpenAI org key). Each price rule must be linked to one.
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Display Name <span className="text-red-400">*</span></label>
            <input
              value={newProvider.label}
              onChange={(e) => {
                const label = e.target.value;
                const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                setNewProvider(prev => ({
                  ...prev,
                  label,
                  provider: slug,
                  base_url: slug ? `https://api.${slug}.com/v1` : prev.base_url
                }));
              }}
              placeholder="e.g. OpenAI (Production)"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5"
            />
            <p className="text-xs text-zinc-400">Human-readable name shown in the UI.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Protocol <span className="text-red-400">*</span></label>
            <div className="relative">
              <Select
                value={newProvider.driver_type}
                onChange={(val) => {
                  const updates: Record<string, string> = { driver_type: val };
                  if (val === 'anthropic' && newProvider.base_url === 'https://api.openai.com/v1') {
                    updates.base_url = 'https://api.anthropic.com/v1';
                    updates.docs_url = 'https://docs.anthropic.com/en/api/getting-started';
                  } else if (val === 'openai_compatible' && newProvider.base_url === 'https://api.anthropic.com/v1') {
                    updates.base_url = 'https://api.openai.com/v1';
                    updates.docs_url = 'https://platform.openai.com/docs';
                  }
                  setNewProvider(prev => ({...prev, ...updates}));
                }}
                options={[
                  { value: 'openai_compatible', label: 'OpenAI Compatible' },
                  { value: 'anthropic', label: 'Anthropic' }
                ]}
              />
            </div>
            <p className="text-xs text-zinc-400">The protocol/driver to use for upstream API.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Base URL</label>
            <input
              value={newProvider.base_url}
              onChange={(e) => setNewProvider({...newProvider, base_url: e.target.value})}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5"
            />
            <p className="text-xs text-zinc-400">The API endpoint the gateway will forward requests to.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">API Key <span className="text-red-400">*</span></label>
            <input
              type="password"
              value={newProvider.key}
              onChange={(e) => setNewProvider({...newProvider, key: e.target.value})}
              placeholder="sk-..."
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5"
            />
            <p className="text-xs text-zinc-400">Stored encrypted. Used by the gateway to authenticate upstream requests.</p>
          </div>
        </div>
        <div className="border-t px-5 py-4 bg-white">
          <button
            onClick={saveProvider}
            disabled={providerSaving || !newProvider.provider.trim() || !newProvider.key.trim()}
            className="w-full bg-black text-white rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
          >
            {providerSaving ? 'Saving...' : 'Save Provider Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
