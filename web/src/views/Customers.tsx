import React, {useEffect, useState} from 'react';
import {Plus, Copy, Trash2, Eye, EyeOff, Check, X, Loader2, UserPlus, Key, ChevronRight, Users, Search, Pencil} from 'lucide-react';
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react';
import {apiGet, apiPost, apiPatch, apiDelete} from '../lib/api';
import {localUser} from '../lib/session';
import {useTranslation} from 'react-i18next';

interface Customer {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  balance: number;
  createdAt: string;
  keyCount: number;
  allowedModels?: string[] | null;
}

interface CustomerKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed: string;
  usage: string;
}

export default function CustomersView() {
  const {t} = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerKeys, setCustomerKeys] = useState<CustomerKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string; type: 'success' | 'error'} | null>(null);

  // Create form
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newBalance, setNewBalance] = useState('10');
  const [selectedAllowedModelIds, setSelectedAllowedModelIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [modelRegistry, setModelRegistry] = useState<{id: string; name: string}[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelFilter, setModelFilter] = useState('');

  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBalance, setEditBalance] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editAllowedModelIds, setEditAllowedModelIds] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  // Result after creation
  const [createResult, setCreateResult] = useState<{password: string; apiKey: string} | null>(null);

  const showNotification = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({message: msg, type});
    setTimeout(() => setNotification(null), 5000);
  };

  const loadCustomers = async () => {
    try {
      const data = await apiGet<Customer[]>('/api/admin/customers');
      setCustomers(data);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const needModels = (isCreateOpen && !createResult) || !!editCustomer;
    if (!needModels) return;
    let cancelled = false;
    setModelsLoading(true);
    apiGet<{id: string; name: string}[]>('/api/llm-models')
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setModelRegistry(data.map((m) => ({id: m.id, name: m.name || m.id})));
      })
      .catch(() => {
        if (!cancelled) setModelRegistry([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isCreateOpen, createResult, editCustomer]);

  const toggleAllowedModel = (id: string) => {
    setSelectedAllowedModelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleEditAllowedModel = (id: string) => {
    setEditAllowedModelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const openEditCustomer = (c: Customer) => {
    setEditCustomer(c);
    setEditUsername(c.username);
    setEditEmail(c.email);
    setEditBalance(String(c.balance));
    setEditStatus(c.status === 'active' ? 'active' : 'inactive');
    setEditNewPassword('');
    setEditAllowedModelIds(Array.isArray(c.allowedModels) ? [...c.allowedModels] : []);
    setModelFilter('');
  };

  const closeEditCustomer = () => {
    setEditCustomer(null);
    setEditUsername('');
    setEditEmail('');
    setEditBalance('');
    setEditStatus('active');
    setEditNewPassword('');
    setEditAllowedModelIds([]);
    setModelFilter('');
  };

  const handleSaveEditCustomer = async () => {
    if (!editCustomer || !editUsername.trim()) return;
    setEditSaving(true);
    try {
      await apiPatch<Customer>(`/api/admin/customers/${editCustomer.id}`, {
        username: editUsername.trim(),
        email: editEmail.trim(),
        balance: parseFloat(editBalance) || 0,
        status: editStatus,
        allowedModels: editAllowedModelIds.length > 0 ? editAllowedModelIds : null,
        ...(editNewPassword.trim() ? {newPassword: editNewPassword.trim()} : {}),
      });
      showNotification(t('customers.update_success'), 'success');
      closeEditCustomer();
      await loadCustomers();
    } catch (error: any) {
      showNotification(error?.message || t('customers.update_failed'), 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const filteredRegistry = modelRegistry.filter((m) => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return true;
    return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  });

  const loadCustomerKeys = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setKeysLoading(true);
    try {
      const data = await apiGet<CustomerKey[]>(`/api/admin/customers/${customer.id}/keys`);
      setCustomerKeys(data);
    } catch (error) {
      console.error('Failed to load keys:', error);
    } finally {
      setKeysLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newUsername.trim()) return;
    setCreating(true);
    try {
      const result = await apiPost<{status: string; user: {password: string}; apiKey: string}>(
        '/api/admin/customers',
        {
          username: newUsername.trim(),
          email: newEmail.trim() || undefined,
          password: newPassword || undefined,
          balance: parseFloat(newBalance) || 10,
          allowedModels: selectedAllowedModelIds.length > 0 ? selectedAllowedModelIds : undefined,
        }
      );
      setCreateResult({password: result.user.password, apiKey: result.apiKey});
      showNotification(t('customers.create_success'), 'success');
      await loadCustomers();
    } catch (error: any) {
      showNotification(error?.message || t('customers.create_failed'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    setNewUsername('');
    setNewEmail('');
    setNewPassword('');
    setNewBalance('10');
    setSelectedAllowedModelIds([]);
    setModelFilter('');
    setCreateResult(null);
  };

  const handleCreateKey = async () => {
    if (!selectedCustomer) return;
    try {
      const result = await apiPost<{id: string; key: string; name: string}>(
        `/api/admin/customers/${selectedCustomer.id}/keys`,
        {name: 'Admin Generated'}
      );
      showNotification(t('customers.key_created'), 'success');
      await loadCustomerKeys(selectedCustomer);
      await loadCustomers();
    } catch (error: any) {
      showNotification(error?.message || t('customers.key_create_failed'), 'error');
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!window.confirm(t('customers.confirm_delete_key'))) return;
    try {
      await apiDelete(`/api/admin/customers/keys/${keyId}`);
      if (selectedCustomer) await loadCustomerKeys(selectedCustomer);
      await loadCustomers();
      showNotification(t('customers.key_deleted'), 'success');
    } catch (error: any) {
      showNotification(error?.message || t('customers.key_delete_failed'), 'error');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (localUser.role !== 'admin') {
    return (
      <div className="min-h-[400px] flex items-center justify-center text-zinc-400 text-sm">
        {t('customers.admin_only')}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 relative">
      {/* Notification */}
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

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('customers.title')}</h1>
          <p className="text-gray-500 mt-1">{t('customers.description')}</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-all active:scale-95"
        >
          <UserPlus size={18} />
          {t('customers.create_customer')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Users size={14} />
            <p className="text-[11px] font-bold uppercase tracking-widest">{t('customers.total_customers')}</p>
          </div>
          <h3 className="text-3xl font-bold tracking-tight">{customers.length}</h3>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Key size={14} />
            <p className="text-[11px] font-bold uppercase tracking-widest">{t('customers.total_keys')}</p>
          </div>
          <h3 className="text-3xl font-bold tracking-tight">
            {customers.reduce((sum, c) => sum + c.keyCount, 0)}
          </h3>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <p className="text-[11px] font-bold uppercase tracking-widest">{t('customers.active_customers')}</p>
          </div>
          <h3 className="text-3xl font-bold tracking-tight">
            {customers.filter((c) => c.status === 'active').length}
          </h3>
        </div>
      </div>

      {/* Customers Table — Type 2: Content & Trends Output */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">{t('customers.all_customers')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-50">
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('customers.username')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('customers.email')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('customers.balance')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('customers.api_keys')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('customers.status')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('customers.created')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">{t('customers.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                        {customer.username.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900 text-sm">{customer.username}</span>
                        {customer.role === 'admin' && (
                          <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-zinc-900 text-white px-1.5 py-0.5 rounded">admin</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{customer.email}</td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-zinc-900">${customer.balance.toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-[11px] font-bold bg-zinc-100 text-zinc-600 px-2 py-1 rounded border border-zinc-200">
                      {customer.keyCount}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      customer.status === 'active'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-red-50 text-red-600 border border-red-100'
                    }`}>
                      {customer.status === 'active' ? t('customers.active') : t('customers.inactive')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditCustomer(customer)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg transition-all"
                      >
                        <Pencil size={12} />
                        {t('customers.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => loadCustomerKeys(customer)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-all"
                      >
                        <Key size={12} />
                        {t('customers.manage_keys')}
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-400 text-sm">
                    {t('customers.no_customers')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Customer Modal */}
      <Dialog open={isCreateOpen} onClose={handleCloseCreate} className="relative z-[100]">
        <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <DialogPanel className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[min(90vh,720px)] overflow-hidden text-left ring-1 ring-black/[0.04]">
              <div className="px-5 sm:px-6 py-4 border-b border-zinc-100 flex items-start justify-between gap-4 shrink-0 bg-gradient-to-b from-zinc-50/80 to-white">
                <div className="min-w-0">
                  <h3 className="font-bold text-lg tracking-tight text-zinc-900">{t('customers.create_customer')}</h3>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed max-w-xl">{t('customers.create_description')}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseCreate}
                  className="shrink-0 p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                  aria-label={t('customers.cancel')}
                >
                  <X size={18} />
                </button>
              </div>

              {!createResult ? (
                <>
                  <div className="flex-1 overflow-auto px-5 sm:px-6 py-5 space-y-5 min-h-[320px]">
                    <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 sm:p-5 space-y-4">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{t('customers.section_account')}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.username')}</label>
                          <input
                            autoFocus
                            type="text"
                            placeholder={t('customers.placeholder_username')}
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.email')}</label>
                          <input
                            type="email"
                            placeholder={t('customers.placeholder_email')}
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.password')}</label>
                          <input
                            type="text"
                            placeholder={t('customers.placeholder_password')}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.initial_balance')}</label>
                          <input
                            type="number"
                            placeholder={t('customers.placeholder_balance')}
                            value={newBalance}
                            onChange={(e) => setNewBalance(e.target.value)}
                            className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 sm:p-5 space-y-4">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{t('customers.section_limits')}</p>
                      <div className="space-y-2 pt-1">
                        <div className="flex flex-wrap items-end justify-between gap-2">
                          <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.allowed_models')}</label>
                            <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed max-w-prose">{t('customers.allowed_models_hint')}</p>
                          </div>
                          {selectedAllowedModelIds.length > 0 && (
                            <span className="text-[10px] font-bold tracking-wide text-purple-800 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-md whitespace-nowrap">
                              {t('customers.models_selected_count', {count: selectedAllowedModelIds.length})}
                            </span>
                          )}
                        </div>
                        {modelsLoading ? (
                          <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-xl border border-zinc-200/80 bg-white text-zinc-500 text-sm shadow-sm">
                            <Loader2 size={18} className="animate-spin text-zinc-400" />
                            {t('customers.models_loading')}
                          </div>
                        ) : modelRegistry.length === 0 ? (
                          <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white text-sm text-zinc-500">
                            {t('customers.models_empty')}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-purple-500/25 focus-within:border-purple-400 transition-all">
                            <div className="relative border-b border-zinc-100 bg-zinc-50/30">
                              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                              <input
                                type="search"
                                value={modelFilter}
                                onChange={(e) => setModelFilter(e.target.value)}
                                placeholder={t('customers.models_search')}
                                className="w-full pl-10 pr-3 py-2.5 text-sm bg-transparent focus:outline-none placeholder:text-zinc-400"
                              />
                            </div>
                            <div className="max-h-[min(240px,40vh)] min-h-[180px] overflow-y-auto overscroll-contain p-1.5">
                              {filteredRegistry.length === 0 ? (
                                <p className="text-xs text-zinc-400 text-center py-10">{t('models.no_matching_models_found')}</p>
                              ) : (
                                <ul className="space-y-0.5">
                                  {filteredRegistry.map((m) => {
                                    const checked = selectedAllowedModelIds.includes(m.id);
                                    return (
                                      <li key={m.id}>
                                        <label
                                          className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer text-left border border-transparent transition-colors ${
                                            checked ? 'bg-purple-50/60 border-purple-100/80' : 'hover:bg-zinc-50'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleAllowedModel(m.id)}
                                            className="mt-1 size-4 shrink-0 rounded border-zinc-300 text-purple-600 focus:ring-purple-500/30"
                                          />
                                          <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-medium text-zinc-900 leading-snug">{m.name}</span>
                                            <span className="block text-[11px] font-mono text-zinc-400 truncate mt-0.5">{m.id}</span>
                                          </span>
                                        </label>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-zinc-100 px-5 sm:px-6 py-4 bg-zinc-50/90 flex flex-col-reverse sm:flex-row sm:items-center justify-end shrink-0 gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={handleCloseCreate}
                      className="text-[13px] font-bold text-zinc-500 hover:text-zinc-900 px-4 py-2.5 rounded-lg hover:bg-zinc-200/50 transition-colors sm:mr-1"
                    >
                      {t('customers.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={!newUsername.trim() || creating}
                      className="bg-zinc-900 text-white rounded-lg px-6 py-2.5 text-sm font-semibold shadow-sm hover:bg-zinc-800 disabled:opacity-45 disabled:pointer-events-none flex items-center justify-center gap-2 transition-all"
                    >
                      {creating && <Loader2 size={14} className="animate-spin" />}
                      {t('customers.create_customer')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 overflow-auto px-5 py-5 space-y-4">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-800">
                      <p className="font-bold mb-2">{t('customers.created_success_title')}</p>
                      <p className="text-xs text-emerald-600">{t('customers.created_success_hint')}</p>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.password')}</label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-zinc-50 border rounded-lg font-mono text-sm">{createResult.password}</code>
                          <button
                            onClick={() => copyToClipboard(createResult.password, 'pw')}
                            className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-all"
                          >
                            {copiedId === 'pw' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.api_key')}</label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-zinc-50 border rounded-lg font-mono text-sm break-all">{createResult.apiKey}</code>
                          <button
                            onClick={() => copyToClipboard(createResult.apiKey, 'ak')}
                            className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-all"
                          >
                            {copiedId === 'ak' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="border-t px-6 py-4 bg-zinc-50/80 flex justify-end shrink-0">
                    <button
                      onClick={handleCloseCreate}
                      className="bg-purple-600 text-white rounded-lg px-6 py-2 text-sm font-semibold shadow-sm hover:bg-purple-700 transition-all"
                    >
                      {t('customers.done')}
                    </button>
                  </div>
                </>
              )}
            </DialogPanel>
          </div>
      </Dialog>

      {/* Edit Customer */}
      <Dialog open={!!editCustomer} onClose={closeEditCustomer} className="relative z-[100]">
        <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <DialogPanel className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[min(90vh,720px)] overflow-hidden text-left ring-1 ring-black/[0.04]">
            <div className="px-5 sm:px-6 py-4 border-b border-zinc-100 flex items-start justify-between gap-4 shrink-0 bg-gradient-to-b from-zinc-50/80 to-white">
              <div className="min-w-0">
                <h3 className="font-bold text-lg tracking-tight text-zinc-900">{t('customers.edit_customer')}</h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{t('customers.edit_description')}</p>
              </div>
              <button
                type="button"
                onClick={closeEditCustomer}
                className="shrink-0 p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                aria-label={t('customers.cancel')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-5 sm:px-6 py-5 space-y-5 min-h-[280px]">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 sm:p-5 space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{t('customers.section_account')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.username')}</label>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.email')}</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.balance')}</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editBalance}
                      onChange={(e) => setEditBalance(e.target.value)}
                      className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.status')}</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as 'active' | 'inactive')}
                      className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    >
                      <option value="active">{t('customers.active')}</option>
                      <option value="inactive" disabled={editCustomer != null && localUser.uid === editCustomer.id}>
                        {t('customers.inactive')}
                      </option>
                    </select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.new_password_optional')}</label>
                    <input
                      type="text"
                      placeholder={t('customers.placeholder_new_password')}
                      value={editNewPassword}
                      onChange={(e) => setEditNewPassword(e.target.value)}
                      className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm bg-white shadow-sm focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 sm:p-5 space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{t('customers.section_limits')}</p>
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('customers.allowed_models')}</label>
                      <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed max-w-prose">{t('customers.allowed_models_hint')}</p>
                    </div>
                    {editAllowedModelIds.length > 0 && (
                      <span className="text-[10px] font-bold tracking-wide text-purple-800 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-md whitespace-nowrap">
                        {t('customers.models_selected_count', {count: editAllowedModelIds.length})}
                      </span>
                    )}
                  </div>
                  {modelsLoading ? (
                    <div className="flex min-h-[180px] items-center justify-center gap-2 rounded-xl border border-zinc-200/80 bg-white text-zinc-500 text-sm shadow-sm">
                      <Loader2 size={18} className="animate-spin text-zinc-400" />
                      {t('customers.models_loading')}
                    </div>
                  ) : modelRegistry.length === 0 ? (
                    <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white text-sm text-zinc-500">
                      {t('customers.models_empty')}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-purple-500/25 focus-within:border-purple-400 transition-all">
                      <div className="relative border-b border-zinc-100 bg-zinc-50/30">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                        <input
                          type="search"
                          value={modelFilter}
                          onChange={(e) => setModelFilter(e.target.value)}
                          placeholder={t('customers.models_search')}
                          className="w-full pl-10 pr-3 py-2.5 text-sm bg-transparent focus:outline-none placeholder:text-zinc-400"
                        />
                      </div>
                      <div className="max-h-[min(220px,36vh)] min-h-[160px] overflow-y-auto overscroll-contain p-1.5">
                        {filteredRegistry.length === 0 ? (
                          <p className="text-xs text-zinc-400 text-center py-8">{t('models.no_matching_models_found')}</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {filteredRegistry.map((m) => {
                              const checked = editAllowedModelIds.includes(m.id);
                              return (
                                <li key={m.id}>
                                  <label
                                    className={`flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer text-left border border-transparent transition-colors ${
                                      checked ? 'bg-purple-50/60 border-purple-100/80' : 'hover:bg-zinc-50'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleEditAllowedModel(m.id)}
                                      className="mt-1 size-4 shrink-0 rounded border-zinc-300 text-purple-600 focus:ring-purple-500/30"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-sm font-medium text-zinc-900 leading-snug">{m.name}</span>
                                      <span className="block text-[11px] font-mono text-zinc-400 truncate mt-0.5">{m.id}</span>
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-zinc-100 px-5 sm:px-6 py-4 bg-zinc-50/90 flex flex-col-reverse sm:flex-row sm:items-center justify-end shrink-0 gap-2 sm:gap-3">
              <button
                type="button"
                onClick={closeEditCustomer}
                className="text-[13px] font-bold text-zinc-500 hover:text-zinc-900 px-4 py-2.5 rounded-lg hover:bg-zinc-200/50 transition-colors sm:mr-1"
              >
                {t('customers.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveEditCustomer}
                disabled={!editUsername.trim() || editSaving}
                className="bg-zinc-900 text-white rounded-lg px-6 py-2.5 text-sm font-semibold shadow-sm hover:bg-zinc-800 disabled:opacity-45 disabled:pointer-events-none flex items-center justify-center gap-2 transition-all"
              >
                {editSaving && <Loader2 size={14} className="animate-spin" />}
                {t('customers.save_changes')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Manage Keys Drawer (Modal) */}
      <Dialog open={!!selectedCustomer} onClose={() => {setSelectedCustomer(null); setCustomerKeys([]);}} className="relative z-[100]">
        <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <DialogPanel className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden text-left">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
                <div>
                  <h3 className="font-bold text-lg">{selectedCustomer ? t('customers.keys_for', {name: selectedCustomer.username}) : ''}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{selectedCustomer?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreateKey}
                    className="flex items-center gap-1.5 bg-black text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-zinc-800 transition-all active:scale-95"
                  >
                    <Plus size={14} />
                    {t('customers.add_key')}
                  </button>
                  <button
                    onClick={() => {setSelectedCustomer(null); setCustomerKeys([]);}}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X size={18} className="text-zinc-400" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {keysLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                  </div>
                ) : customerKeys.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400 text-sm gap-2">
                    <Key size={24} className="text-zinc-300" />
                    {t('customers.no_keys')}
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-50">
                        <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('customers.key_name')}</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('customers.key_value')}</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('customers.created')}</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">{t('customers.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {customerKeys.map((k) => (
                        <tr key={k.id} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="px-6 py-4 w-32">
                            <span className="font-semibold text-gray-900 text-sm truncate block">{k.name}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 font-mono text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100 w-[460px] whitespace-nowrap">
                              <span className="flex-1 tabular-nums">
                                {showKey === k.id ? k.key : `sk-••••••••${k.key.slice(-6)}`}
                              </span>
                              <button
                                onClick={() => setShowKey(showKey === k.id ? null : k.id)}
                                className="p-1 hover:bg-gray-200 rounded transition-colors shrink-0"
                              >
                                {showKey === k.id ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">{new Date(k.createdAt).toLocaleDateString()}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => copyToClipboard(k.key, k.id)}
                                className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-all"
                              >
                                {copiedId === k.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                              </button>
                              <button
                                onClick={() => handleDeleteKey(k.id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </DialogPanel>
          </div>
      </Dialog>
    </div>
  );
}
