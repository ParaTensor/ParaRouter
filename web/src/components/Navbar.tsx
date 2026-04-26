import React from 'react';
import {Menu, X, ChevronDown, Key, Settings, LogOut, LayoutGrid, BarChart3, MessageSquare, BookOpen, BadgeDollarSign, PlugZap, Database, UsersRound} from 'lucide-react';
import {cn} from '../lib/utils';
import {APP_SHELL_MAX_CLASS, APP_SHELL_PAD_CLASS} from '../lib/appShellLayout';
import {clearAuthSession, localUser, getAuthSession, setAuthSession} from '../lib/session';
import {apiPost, apiGet} from '../lib/api';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import { useTranslation } from "react-i18next";
import LocaleSwitcher from './LocaleSwitcher';

export default function Navbar() {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = localUser.role === 'admin';
  const isAdminPage = isAdmin && ['/pricing', '/providers', '/customers', '/global-models'].some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/')
  );

  React.useEffect(() => {
    const refreshBalance = async () => {
      try {
        const data = await apiGet<{ balance?: number }>('/api/auth/me');
        if (typeof data?.balance === 'number') {
          const session = getAuthSession();
          if (session) {
            session.user.balance = data.balance;
            setAuthSession(session);
          }
        }
      } catch {
        // ignore refresh errors
      }
    };
    refreshBalance();
  }, []);

  const handleLogout = async () => {
    try {
      await apiPost('/api/auth/logout', {});
    } catch {
      // keep local logout behavior even if request fails
    }
    clearAuthSession();
    navigate('/login');
  };

  const navLinks = [
    {id: '/models', labelKey: 'navbar.models', icon: LayoutGrid},
    {id: '/activity', labelKey: 'navbar.activity', icon: BarChart3},
    {id: '/pricing', labelKey: 'navbar.pricing', icon: BadgeDollarSign, adminOnly: true},
    {id: '/providers', labelKey: 'navbar.providers', icon: PlugZap, adminOnly: true},
    {id: '/chat', labelKey: 'navbar.chat', icon: MessageSquare},
    {id: '/docs', labelKey: 'navbar.docs', icon: BookOpen},
  ];

  const filteredLinks = [
    ...navLinks.filter((link) => !link.adminOnly || localUser?.role === 'admin'),
    ...(localUser?.role === 'admin' ? [
      {id: '/customers', labelKey: 'navbar.customers', icon: UsersRound},
      {id: '/global-models', labelKey: 'navbar.global_models', icon: Database},
    ] : [])
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-zinc-100 bg-white/95 backdrop-blur-sm">
      <div className={`mx-auto ${APP_SHELL_MAX_CLASS} ${APP_SHELL_PAD_CLASS}`}>
        <div className="flex h-14 items-center justify-between">
          <Link to="/models" className="group flex cursor-pointer items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 transition-transform group-hover:scale-105">
              <div className="h-3.5 w-3.5 rotate-45 rounded-sm bg-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-black">{t('navbar.pararouter')}</span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {filteredLinks.map((link) => (
              <Link
                key={link.id}
                to={link.id}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                  location.pathname === link.id ? 'bg-purple-50 text-purple-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-black',
                )}
              >
                {t(link.labelKey)}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {localUser.role !== 'admin' && (
              <div className="hidden cursor-pointer items-center gap-2 rounded-full border border-zinc-200 px-2.5 py-1 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 sm:flex">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                ${(localUser.balance || 0).toFixed(2)}
              </div>
            )}

            <LocaleSwitcher className="hidden sm:flex" />

            <div className="relative group">
              <button className="flex items-center gap-2 p-0.5 rounded-full hover:bg-gray-100 transition-colors">
                <div className="w-7 h-7 rounded-full bg-zinc-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                  {localUser.displayName.substring(0, 2).toUpperCase()}
                </div>
                <ChevronDown size={12} className="text-zinc-400" />
              </button>

              <div className="invisible absolute right-0 z-50 mt-2 w-52 rounded-xl border border-zinc-100 bg-white py-1.5 opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:opacity-100">
                <div className="mb-1 border-b border-zinc-50 px-4 py-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{t('navbar.account')}</p>
                  <p className="truncate text-sm font-medium text-zinc-900">{localUser.email}</p>
                </div>
                <button
                  onClick={() => navigate('/keys')}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-600 hover:text-black hover:bg-gray-50 transition-colors"
                >
                  <Key size={14} /> {t('navbar.api_keys')}</button>
                <button
                  onClick={() => navigate('/settings')}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-600 hover:text-black hover:bg-gray-50 transition-colors"
                >
                  <Settings size={14} /> {t('navbar.settings')}</button>
                {isAdmin && (
                  <>
                    <div className="my-1.5 h-px bg-zinc-100" />
                    <div className="px-4 py-1.5 mb-0.5">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('navbar.admin')}</p>
                    </div>
                    <button
                      onClick={() => navigate('/global-models')}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-600 hover:text-black hover:bg-gray-50 transition-colors"
                    >
                      <Database size={14} /> {t('navbar.global_models')}</button>
                    <button
                      onClick={() => navigate('/customers')}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-600 hover:text-black hover:bg-gray-50 transition-colors"
                    >
                      <UsersRound size={14} /> {t('navbar.customers')}</button>
                  </>
                )}
                <div className="my-1.5 h-px bg-zinc-100" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} /> {t('navbar.logout')}</button>
              </div>
            </div>

            <button className="md:hidden p-1.5 text-zinc-600 hover:bg-gray-100 rounded-md" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="space-y-1 border-b border-zinc-100 bg-white px-4 py-3 shadow-sm md:hidden">
          <div className="mb-2 flex justify-end border-b border-zinc-50 pb-2 sm:hidden">
            <LocaleSwitcher />
          </div>
          {filteredLinks.map((link) => (
            <Link
              key={link.id}
              to={link.id}
              onClick={() => setIsMenuOpen(false)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                location.pathname === link.id ? 'bg-purple-600 text-white' : 'text-zinc-600 hover:bg-zinc-50',
              )}
            >
              <link.icon size={16} />
              {t(link.labelKey)}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
