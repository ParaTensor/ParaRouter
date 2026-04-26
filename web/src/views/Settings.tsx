import React from 'react';
import {User, CreditCard, Shield, Sliders, Webhook, AlertTriangle, Save, TrendingUp} from 'lucide-react';
import {cn} from '../lib/utils';
import {localUser} from '../lib/session';
import {ApiError, apiPost} from '../lib/api';
import {useTranslation} from 'react-i18next';

export default function SettingsView() {
  const {t} = useTranslation();
  const [activeTab, setActiveTab] = React.useState('profile');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [securityMessage, setSecurityMessage] = React.useState('');
  const [securityError, setSecurityError] = React.useState('');

  const isAdmin = localUser.role === 'admin';
  const tabs = [
    {id: 'profile', labelKey: 'settings.tabs.profile', icon: User},
    ...(!isAdmin ? [{id: 'billing', labelKey: 'settings.tabs.billing', icon: CreditCard}] : []),
    {id: 'routing', labelKey: 'settings.tabs.routing', icon: Sliders},
    {id: 'integrations', labelKey: 'settings.tabs.integrations', icon: Webhook},
    {id: 'security', labelKey: 'settings.tabs.security', icon: Shield},
  ];

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setSavingPassword(true);
    setSecurityError('');
    setSecurityMessage('');
    try {
      await apiPost('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setSecurityMessage(t('settings.password_updated'));
    } catch (err) {
      if (err instanceof ApiError) {
        setSecurityError(err.body?.error || err.message);
      } else {
        setSecurityError(err instanceof Error ? err.message : t('settings.password_failed'));
      }
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
          <p className="text-gray-500 mt-1">{t('settings.description')}</p>
        </div>
        <button className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-zinc-800 transition-all active:scale-95">
          <Save size={16} />
          {t('settings.saveChanges')}
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
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-6">
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50">
                  <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">{t('settings.personal_information')}</h3>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{t('settings.email_address')}</label>
                      <input
                        type="email"
                        disabled
                        value={localUser.email}
                        className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-100 rounded-xl text-zinc-400 font-medium cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{t('settings.display_name')}</label>
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

          {!isAdmin && activeTab === 'billing' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm p-8 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="space-y-2 text-center md:text-left">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{t('settings.current_balance')}</p>
                  <h4 className="text-5xl font-black tracking-tighter">${(localUser.balance || 0).toFixed(4)}</h4>
                  <p className="text-xs text-emerald-600 font-bold flex items-center gap-1 justify-center md:justify-start">
                    <TrendingUp size={12} />
                    {t('settings.estimated_45_days_remaining')}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'routing' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm p-6">{t('settings.routing_policy_editing_tbd')}</div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm p-6">{t('settings.integrations_configuration_tbd')}</div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm p-6 space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">{t('settings.change_password')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t('settings.placeholder_current_password')}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('settings.placeholder_new_password')}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl"
                  />
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={savingPassword || !currentPassword || newPassword.length < 8}
                  className="px-4 py-2 rounded-lg bg-black text-white text-sm font-bold disabled:opacity-50"
                >
                  {savingPassword ? t('settings.updating') : t('settings.update_password')}
                </button>
                {securityMessage && <p className="text-sm text-emerald-600">{securityMessage}</p>}
                {securityError && <p className="text-sm text-red-600">{securityError}</p>}
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm p-6">
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3 text-red-800">
                  <AlertTriangle className="shrink-0" size={20} />
                  <p className="text-xs leading-relaxed opacity-80">{t('settings.deleting_account_is_permanent_')}</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
