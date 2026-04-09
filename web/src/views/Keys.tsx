import React, {useEffect, useState} from 'react';
import {Plus, Copy, Trash2, Eye, EyeOff, ShieldCheck, Check, X, Loader2} from 'lucide-react';
import {motion, AnimatePresence} from 'motion/react';
import {apiDelete, apiGet, apiPost} from '../lib/api';
import {localUser} from '../lib/session';
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string; type: 'success' | 'error'} | null>(null);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification(null), 5000);
  };

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
      showNotification(t('keys.create_success', 'Key created successfully'), 'success');
    } catch (error: any) {
      console.error('Failed to create key:', error);
      showNotification(error?.message || 'Failed to create key. Please try again.', 'error');
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this key? This action cannot be undone.')) return;
    try {
      await apiDelete(`/api/user-api-keys/${id}`);
      await loadKeys();
      showNotification(t('keys.delete_success', 'Key deleted successfully'), 'success');
    } catch (error: any) {
      console.error('Failed to delete key:', error);
      showNotification(error?.message || 'Failed to delete key.', 'error');
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
    <div className="space-y-8 relative">
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

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('keys.api_keys')}</h1>
          <p className="text-gray-500 mt-1">{t('keys.manage_your_api_keys_to_authen')}</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-all active:scale-95"
        >
          <Plus size={18} />
          {t('keys.create_key')}</button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-3 text-zinc-300">
        <ShieldCheck className="shrink-0 text-emerald-500" size={20} />
        <p className="text-sm">
          {t('keys.your_api_keys_are_sensitive_in')}</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-50">
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('keys.name')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('keys.key')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('keys.usage')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('keys.created')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">{t('keys.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
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
                    {t('keys.no_api_keys_found_create_one_t')}</td>
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
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
                <div>
                  <h3 className="font-bold text-lg">{t('keys.create_api_key')}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Generate a new API key for access</p>
                </div>
              </div>
              <div className="flex-1 overflow-auto px-5 py-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">{t('keys.key_name')}</label>
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
                  {t('keys.give_your_key_a_descriptive_na')}</p>
              </div>
              <div className="border-t px-6 py-4 bg-zinc-50/80 flex flex-col sm:flex-row sm:items-center justify-end shrink-0 gap-3">
                <button onClick={() => setIsModalOpen(false)} className="text-[13px] font-bold text-zinc-500 hover:text-zinc-900 px-3">
                  {t('keys.cancel')}
                </button>
                <button
                  onClick={handleCreateKey}
                  disabled={!newKeyName.trim()}
                  className="bg-blue-600 text-white rounded-lg px-6 py-2 text-sm font-semibold shadow-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {t('keys.create_key')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
