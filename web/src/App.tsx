import React from 'react';
import Navbar from './components/Navbar';
import ModelsView from './views/Models';
import KeysView from './views/Keys';
import ActivityView from './views/Activity';
import SettingsView from './views/Settings';
import ChatView from './views/Chat';
import DocsView from './views/Docs';
import RankingsView from './views/Rankings';
import HubConsoleView from './views/HubConsole';
import PricingView from './views/Pricing';
import ProvidersView from './views/Providers';
import ModelProvidersView from './views/ModelProviders';
import GlobalModelsView from './views/GlobalModels';
import LoginView from './views/Login';
import {motion} from 'motion/react';
import {Link, Navigate, Route, Routes, useLocation} from 'react-router-dom';
import {isAuthenticated} from './lib/session';
import {useTranslation} from 'react-i18next';

export default function App() {
  const {t} = useTranslation();
  const location = useLocation();
  const [authVersion, setAuthVersion] = React.useState(0);

  React.useEffect(() => {
    const onAuthChange = () => setAuthVersion((v) => v + 1);
    window.addEventListener('pararouter-auth-changed', onAuthChange);
    return () => window.removeEventListener('pararouter-auth-changed', onAuthChange);
  }, []);

  const authed = isAuthenticated();
  const isLoginRoute = location.pathname === '/login';
  const isChatRoute = location.pathname.startsWith('/chat');
  const showShell = authed && !isLoginRoute;

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa] text-black font-sans selection:bg-black selection:text-white">
      {showShell && <Navbar />}

      <main className="flex-1 flex flex-col">
        <div className={showShell && !isChatRoute ? 'max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1' : (isChatRoute ? 'flex-1 flex flex-col h-full' : '')}>
          <motion.div
            key={`${location.pathname}:${authVersion}`}
            initial={{opacity: 0, y: 10}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.2, ease: 'easeOut'}}
            className="flex-1 flex flex-col"
          >
            <Routes location={location}>
              <Route path="/login" element={authed ? <Navigate to="/models" replace /> : <LoginView />} />
              <Route path="/" element={<Navigate to={authed ? '/models' : '/login'} replace />} />
              <Route path="/models" element={authed ? <ModelsView /> : <Navigate to="/login" replace />} />
              <Route path="/rankings" element={authed ? <RankingsView /> : <Navigate to="/login" replace />} />
              <Route path="/activity" element={authed ? <ActivityView /> : <Navigate to="/login" replace />} />
              <Route path="/pricing" element={authed ? <PricingView /> : <Navigate to="/login" replace />} />
              <Route path="/providers" element={authed ? <ProvidersView /> : <Navigate to="/login" replace />} />
              <Route path="/models/:modelId/providers" element={authed ? <ModelProvidersView /> : <Navigate to="/login" replace />} />
              <Route path="/global-models" element={authed ? <GlobalModelsView /> : <Navigate to="/login" replace />} />
              <Route path="/chat" element={authed ? <ChatView /> : <Navigate to="/login" replace />} />
              <Route path="/docs" element={authed ? <DocsView /> : <Navigate to="/login" replace />} />
              <Route path="/hub" element={authed ? <HubConsoleView /> : <Navigate to="/login" replace />} />
              <Route path="/keys" element={authed ? <KeysView /> : <Navigate to="/login" replace />} />
              <Route path="/settings" element={authed ? <SettingsView /> : <Navigate to="/login" replace />} />
              <Route path="*" element={<Navigate to={authed ? '/models' : '/login'} replace />} />
            </Routes>
          </motion.div>
        </div>
      </main>

      {showShell && !isChatRoute && <footer className="bg-white py-12">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-gray-500">
              <Link to="/models" className="hover:text-black transition-colors">{t('footer.models')}</Link>
              <Link to="/pricing" className="hover:text-black transition-colors">{t('footer.pricing')}</Link>
              <a href="#" className="hover:text-black transition-colors">{t('footer.privacy')}</a>
              <a href="#" className="hover:text-black transition-colors">{t('footer.terms')}</a>
              <a href="#" className="hover:text-black transition-colors">{t('footer.docs')}</a>
            </div>

            <p className="text-sm text-gray-400">
              © 2024 ParaRouter. All rights reserved.
            </p>
          </div>
        </div>
      </footer>}
    </div>
  );
}
