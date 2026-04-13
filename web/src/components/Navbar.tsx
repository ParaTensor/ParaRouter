import React from 'react';
import {Menu, X, ChevronDown, Key, Settings, LogOut, LayoutGrid, BarChart3, MessageSquare, BookOpen, BadgeDollarSign, PlugZap, Database, UsersRound} from 'lucide-react';
import {cn} from '../lib/utils';
import {clearAuthSession, localUser} from '../lib/session';
import {apiPost} from '../lib/api';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import { useTranslation } from "react-i18next";

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const location = useLocation();
  const navigate = useNavigate();

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
    {id: '/insights', labelKey: 'navbar.insights', icon: BarChart3},
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
    <nav className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 items-center">
          <Link to="/models" className="flex items-center gap-2.5 cursor-pointer group">
            <div className="w-7 h-7 bg-black rounded flex items-center justify-center transition-transform group-hover:scale-105">
              <div className="w-3.5 h-3.5 bg-white rounded-sm rotate-45" />
            </div>
            <span className="font-bold text-lg tracking-tight">{t('navbar.pararouter')}</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {filteredLinks.map((link) => (
              <Link
                key={link.id}
                to={link.id}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                  location.pathname === link.id ? 'text-black bg-gray-100/80' : 'text-zinc-500 hover:text-black hover:bg-gray-50',
                )}
              >
                {t(link.labelKey)}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 border border-gray-100 rounded-md text-[13px] font-medium text-zinc-600 hover:border-gray-200 transition-colors cursor-pointer">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              {t('navbar.0_00')}
            </div>

            <select 
                value={i18n.language?.startsWith('zh') ? 'zh' : 'en'} 
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                className="hidden sm:block bg-transparent outline-none cursor-pointer text-sm font-medium text-zinc-600 hover:text-black hover:bg-gray-50 border border-gray-100 rounded-md px-2 py-1"
            >
                <option value="en">EN</option>
                <option value="zh">中</option>
            </select>

            <div className="relative group">
              <button className="flex items-center gap-2 p-0.5 rounded-full hover:bg-gray-100 transition-colors">
                <div className="w-7 h-7 rounded-full bg-zinc-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                  {localUser.displayName.substring(0, 2).toUpperCase()}
                </div>
                <ChevronDown size={12} className="text-zinc-400" />
              </button>

              <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-100 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 py-1.5 z-50">
                <div className="px-4 py-2 border-b border-gray-50 mb-1">
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('navbar.account')}</p>
                  <p className="text-sm font-medium text-zinc-900 truncate">{localUser.email}</p>
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
                {localUser?.role === 'admin' && (
                  <>
                    <div className="h-px bg-gray-50 my-1.5" />
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
                <div className="h-px bg-gray-50 my-1.5" />
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
        <div className="md:hidden bg-white border-b border-gray-100 px-4 py-3 space-y-1 shadow-sm">
          {filteredLinks.map((link) => (
            <Link
              key={link.id}
              to={link.id}
              onClick={() => setIsMenuOpen(false)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
                location.pathname === link.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-gray-50',
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
