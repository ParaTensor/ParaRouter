import React, {useEffect, useState} from 'react';
import {Plus, Copy, Trash2, Eye, EyeOff, ShieldCheck, Check, X, Loader2} from 'lucide-react';
import {motion, AnimatePresence} from 'motion/react';
import {apiDelete, apiGet, apiPost} from '../lib/api';
import {localUser} from '../lib/session';

interface APIKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string;
  usage: string;
  uid: string;
}

export default function KeysView() {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadKeys = async () => {
    try {
      const data = await apiGet<APIKey[]>(`/api/user-api-keys?uid=${encodeURIComponent(localUser.uid)}`);
      setKeys(data);
    } catch (error) {
      console.error('Failed to load keys:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const key = `sk-oh-v1-${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`;
      await apiPost('/api/user-api-keys', {
        name: newKeyName,
        key,
        uid: localUser.uid,
        lastUsed: 'Never',
        usage: '$0.00',
      });
      setNewKeyName('');
      setIsModalOpen(false);
      await loadKeys();
    } catch (error) {
      console.error('Failed to create key:', error);
      alert('Failed to create key. Check console for details.');
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this key? This action cannot be undone.')) return;
    try {
      await apiDelete(`/api/user-api-keys/${id}`);
      await loadKeys();
    } catch (error) {
      console.error('Failed to delete key:', error);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-gray-500 mt-1">Manage your API keys to authenticate with OpenHub.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-all active:scale-95"
        >
          <Plus size={18} />
          Create Key
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-3 text-zinc-300">
        <ShieldCheck className="shrink-0 text-emerald-500" size={20} />
        <p className="text-sm">
          Your API keys are sensitive information. Never share them or commit them to version control.
          OpenHub will only show the full key once upon creation.
        </p>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b">
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Name</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Key</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Usage</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Created</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="font-semibold text-gray-900">{key.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 font-mono text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100 w-fit">
                      {showKey === key.id ? key.key : 'sk-oh-v1-••••••••••••'}
                      <button
                        onClick={() => setShowKey(showKey === key.id ? null : key.id)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        {showKey === key.id ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-zinc-600">{key.usage}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(key.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => copyToClipboard(key.key, key.id)}
                        className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-all"
                      >
                        {copiedId === key.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                      </button>
                      <button
                        onClick={() => handleDeleteKey(key.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 text-sm">
                    No API keys found. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{opacity: 0, scale: 0.95, y: 20}}
              animate={{opacity: 1, scale: 1, y: 0}}
              exit={{opacity: 0, scale: 0.95, y: 20}}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="font-bold text-lg">Create API Key</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Key Name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. My Production App"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
                    className="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-4 focus:ring-black/5 transition-all"
                  />
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Give your key a descriptive name to help you identify it later. You can create multiple keys for different projects.
                </p>
              </div>
              <div className="px-6 py-4 bg-gray-50 flex gap-3">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2.5 border rounded-xl font-bold text-sm hover:bg-white transition-all">
                  Cancel
                </button>
                <button
                  onClick={handleCreateKey}
                  disabled={!newKeyName.trim()}
                  className="flex-1 px-4 py-2.5 bg-black text-white rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Key
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
