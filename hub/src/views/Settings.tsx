import React from 'react';
import {User, CreditCard, Shield, Sliders, Webhook, AlertTriangle, Save, TrendingUp} from 'lucide-react';
import {cn} from '../lib/utils';
import {apiDelete, apiGet, apiPut} from '../lib/api';
import {localUser} from '../lib/session';
import {useSearchParams} from 'react-router-dom';

export default function SettingsView() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = React.useState('profile');
  const isAdmin = localUser.role === 'admin';
  const [providerKeys, setProviderKeys] = React.useState<any[]>([]);
  const [newKey, setNewKey] = React.useState({provider: 'openai', key: '', status: 'active'});

  const loadProviderKeys = React.useCallback(async () => {
    if (!isAdmin) return;
    try {
      const rows = await apiGet<any[]>('/api/provider-keys');
      setProviderKeys(rows.map((row) => ({id: row.provider, ...row})));
    } catch (error) {
      console.error('Failed to load provider keys:', error);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    loadProviderKeys();
  }, [loadProviderKeys]);

  const handleAddKey = async () => {
    if (!newKey.key) return;
    try {
      await apiPut(`/api/provider-keys/${encodeURIComponent(newKey.provider)}`, newKey);
      setNewKey({...newKey, key: ''});
      await loadProviderKeys();
    } catch (error) {
      console.error('Failed to add key:', error);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await apiDelete(`/api/provider-keys/${encodeURIComponent(id)}`);
      await loadProviderKeys();
    } catch (error) {
      console.error('Failed to delete key:', error);
    }
  };

  const tabs = React.useMemo(
    () => [
      {id: 'profile', label: 'Profile', icon: User},
      {id: 'billing', label: 'Billing', icon: CreditCard},
      {id: 'routing', label: 'Routing', icon: Sliders},
      {id: 'integrations', label: 'Integrations', icon: Webhook},
      {id: 'security', label: 'Security', icon: Shield},
      ...(isAdmin ? [{id: 'provider-keys', label: 'Provider Keys', icon: Shield}] : []),
    ],
    [isAdmin],
  );

  React.useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (!requestedTab) return;
    if (tabs.some((tab) => tab.id === requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [searchParams, tabs]);

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-gray-500 mt-1">Manage your OpenHub account and platform preferences.</p>
        </div>
        <button className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-zinc-800 transition-all active:scale-95">
          <Save size={16} />
          Save Changes
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-64 shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all',
                activeTab === tab.id ? 'bg-black text-white shadow-lg shadow-black/10' : 'text-zinc-500 hover:bg-gray-100 hover:text-zinc-900',
              )}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-6">
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50">
                  <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">Personal Information</h3>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Email Address</label>
                      <input
                        type="email"
                        disabled
                        value={localUser.email}
                        className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-100 rounded-xl text-zinc-400 font-medium cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Display Name</label>
                      <input
                        type="text"
                        defaultValue={localUser.displayName}
                        className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-black/5 transition-all font-medium"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="space-y-2 text-center md:text-left">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Current Balance</p>
                  <h4 className="text-5xl font-black tracking-tighter">$12.45</h4>
                  <p className="text-xs text-emerald-600 font-bold flex items-center gap-1 justify-center md:justify-start">
                    <TrendingUp size={12} />
                    Estimated 45 days remaining
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'routing' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm p-6">Routing policy editing TBD.</div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm p-6">Integrations configuration TBD.</div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm p-6">
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3 text-red-800">
                  <AlertTriangle className="shrink-0" size={20} />
                  <p className="text-xs leading-relaxed opacity-80">Deleting account is permanent and cannot be undone.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'provider-keys' && isAdmin && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">Master Provider Keys</h3>
                  <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest bg-red-50 px-2 py-0.5 rounded">Admin Only</span>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Provider</label>
                      <select
                        value={newKey.provider}
                        onChange={(e) => setNewKey({...newKey, provider: e.target.value})}
                        className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm font-bold"
                      >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="google">Google</option>
                        <option value="mistral">Mistral</option>
                        <option value="meta">Meta</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">API Key</label>
                      <input
                        type="password"
                        placeholder="sk-..."
                        value={newKey.key}
                        onChange={(e) => setNewKey({...newKey, key: e.target.value})}
                        className="w-full px-4 py-2 border border-zinc-200 rounded-xl text-sm font-mono"
                      />
                    </div>
                    <button onClick={handleAddKey} className="bg-black text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-zinc-800">
                      Save Key
                    </button>
                  </div>

                  <div className="pt-6 border-t border-gray-50 space-y-4">
                    {providerKeys.map((pk) => (
                      <div key={pk.id} className="flex items-center justify-between p-4 border border-zinc-100 rounded-xl bg-zinc-50/50">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white border rounded-lg flex items-center justify-center font-bold text-zinc-400">
                            {pk.provider[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold capitalize">{pk.provider}</p>
                            <p className="text-xs text-zinc-400 font-mono">••••••••••••••••</p>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteKey(pk.id)} className="text-xs font-bold text-red-500 hover:underline">
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
