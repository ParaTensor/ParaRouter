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
import {motion, AnimatePresence} from 'motion/react';
import {Link, Navigate, Route, Routes, useLocation} from 'react-router-dom';
import {isAuthenticated} from './lib/session';

export default function App() {
  const location = useLocation();
  const [authVersion, setAuthVersion] = React.useState(0);

  React.useEffect(() => {
    const onAuthChange = () => setAuthVersion((v) => v + 1);
    window.addEventListener('openhub-auth-changed', onAuthChange);
    return () => window.removeEventListener('openhub-auth-changed', onAuthChange);
  }, []);

  const authed = isAuthenticated();
  const isLoginRoute = location.pathname === '/login';
  const showShell = authed && !isLoginRoute;

  return (
    <div className="min-h-screen bg-[#fafafa] text-black font-sans selection:bg-black selection:text-white">
      {showShell && <Navbar />}

      <main className="min-h-screen">
        <div className={showShell ? 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12' : ''}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${location.pathname}:${authVersion}`}
              initial={{opacity: 0, y: 10}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: -10}}
              transition={{duration: 0.2, ease: 'easeOut'}}
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
          </AnimatePresence>
        </div>
      </main>

      {showShell && <footer className="border-t bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-1 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
                  <div className="w-4 h-4 bg-white rounded-sm rotate-45" />
                </div>
                <span className="font-bold tracking-tight text-xl">OpenHub</span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                The unified interface for LLMs. Access any model via a single API.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-sm mb-4 uppercase tracking-widest text-gray-400">Product</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><Link to="/models" className="hover:text-black transition-colors">Models</Link></li>
                <li><Link to="/rankings" className="hover:text-black transition-colors">Rankings</Link></li>
                <li><Link to="/pricing" className="hover:text-black transition-colors">Pricing</Link></li>
                <li><Link to="/chat" className="hover:text-black transition-colors">Chat</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-sm mb-4 uppercase tracking-widest text-gray-400">Resources</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#" className="hover:text-black transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-black transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-black transition-colors">Discord</a></li>
                <li><a href="#" className="hover:text-black transition-colors">Status</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-sm mb-4 uppercase tracking-widest text-gray-400">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#" className="hover:text-black transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-black transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-black transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-400">© 2024 OpenHub. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="text-gray-400 hover:text-black transition-colors">Twitter</a>
              <a href="#" className="text-gray-400 hover:text-black transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>}
    </div>
  );
}
