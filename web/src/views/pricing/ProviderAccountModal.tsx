import React from 'react';
import { X } from 'lucide-react';
import { Select } from '../../components/Select';
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { apiPut } from '../../lib/api';
import { useTranslation } from "react-i18next";

interface ProviderAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (providerSlug: string) => void;
}

export default function ProviderAccountModal({ isOpen, onClose, onSuccess }: ProviderAccountModalProps) {
    const { t } = useTranslation();
  const [providerSaving, setProviderSaving] = React.useState(false);
  const [newProvider, setNewProvider] = React.useState({
    provider: '',
    label: '',
    base_url: 'https://api.openai.com',
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
        base_url: 'https://api.openai.com',
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
        provider,
        label: newProvider.label,
        base_url: newProvider.base_url,
        docs_url: newProvider.docs_url,
        status: newProvider.status,
        driver_type: newProvider.driver_type,
        keys: [
          {
            label: 'Default',
            key: newProvider.key,
            status: newProvider.status,
          },
        ],
      });
      onSuccess(provider);
      onClose();
    } finally {
      setProviderSaving(false);
    }
  };

  // Using Headless UI Dialog for scroll lock management now

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <DialogPanel className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white text-left">
          <div>
            <h3 className="font-bold text-lg">{t('provideraccountmodal.add_provider_account')}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{t('provideraccountmodal.register_a_new_upstream_provid')}</p>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-5 py-5 space-y-4 text-left">
          <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 text-sm text-purple-700">
            A <strong>{t('provideraccountmodal.provider_account')}</strong> {t('provideraccountmodal.represents_a_single_upstream_a')}</div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('provideraccountmodal.display_name')}<span className="text-red-400">*</span></label>
            <input
              value={newProvider.label}
              onChange={(e) => {
                const label = e.target.value;
                const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                setNewProvider(prev => ({
                  ...prev,
                  label,
                  provider: slug,
                  base_url: slug ? `https://api.${slug}.com` : prev.base_url
                }));
              }}
              placeholder={t('provideraccountmodal.placeholder_label')}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5"
            />
            <p className="text-xs text-zinc-400">{t('provideraccountmodal.human_readable_name_shown_in_t')}</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('provideraccountmodal.protocol')}<span className="text-red-400">*</span></label>
            <div className="relative">
              <Select
                value={newProvider.driver_type}
                onChange={(val) => {
                  const updates: Record<string, string> = { driver_type: val };
                  if (val === 'anthropic' && newProvider.base_url === 'https://api.openai.com') {
                    updates.base_url = 'https://api.anthropic.com';
                    updates.docs_url = 'https://docs.anthropic.com/en/api/getting-started';
                  } else if (val === 'openai_compatible' && newProvider.base_url === 'https://api.anthropic.com') {
                    updates.base_url = 'https://api.openai.com';
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
            <p className="text-xs text-zinc-400">{t('provideraccountmodal.the_protocol_driver_to_use_for')}</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('provideraccountmodal.base_url')}</label>
            <input
              value={newProvider.base_url}
              onChange={(e) => setNewProvider({...newProvider, base_url: e.target.value})}
              placeholder={t('provideraccountmodal.placeholder_url')}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5"
            />
            <p className="text-xs text-zinc-400">{t('provideraccountmodal.the_api_endpoint_the_gateway_w')}</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('provideraccountmodal.api_key')}<span className="text-red-400">*</span></label>
            <input
              type="password"
              value={newProvider.key}
              onChange={(e) => setNewProvider({...newProvider, key: e.target.value})}
              placeholder={t('provideraccountmodal.placeholder_key')}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5"
            />
            <p className="text-xs text-zinc-400">{t('provideraccountmodal.stored_encrypted_used_by_the_g')}</p>
          </div>
        </div>
        <div className="border-t px-6 py-4 bg-zinc-50/80 flex flex-col sm:flex-row sm:items-center justify-end shrink-0 gap-3">
          <button onClick={onClose} className="text-[13px] font-bold text-zinc-500 hover:text-zinc-900 px-3">
            Cancel
          </button>
          <button
            onClick={saveProvider}
            disabled={providerSaving || !newProvider.provider.trim() || !newProvider.key.trim()}
            className="bg-purple-600 text-white rounded-lg px-6 py-2 text-sm font-semibold shadow-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            {providerSaving ? 'Saving...' : 'Save Provider Account'}
          </button>
        </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
