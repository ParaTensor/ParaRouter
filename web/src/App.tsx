import React from 'react';
import LandingView from './views/Landing';
import {Link, Navigate, Route, Routes, useLocation} from 'react-router-dom';
import {APP_SHELL_MAX_CLASS, APP_SHELL_PAD_CLASS} from './lib/appShellLayout';
import {isAuthenticated} from './lib/session';
import {useTranslation} from 'react-i18next';

const LoginView = React.lazy(() => import('./views/Login'));
const Navbar = React.lazy(() => import('./components/Navbar'));
const ModelsView = React.lazy(() => import('./views/Models'));
const KeysView = React.lazy(() => import('./views/Keys'));
const SettingsView = React.lazy(() => import('./views/Settings'));
const ChatView = React.lazy(() => import('./views/Chat'));
const DocsView = React.lazy(() => import('./views/Docs'));
const InsightsView = React.lazy(() => import('./views/Insights'));
const ActivityView = React.lazy(() => import('./views/Activity'));
const PricingView = React.lazy(() => import('./views/Pricing'));
const ProvidersView = React.lazy(() => import('./views/Providers'));
const ModelProvidersView = React.lazy(() => import('./views/ModelProviders'));
const GlobalModelsView = React.lazy(() => import('./views/GlobalModels'));
const CustomersView = React.lazy(() => import('./views/Customers'));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] flex-1 items-center justify-center px-6 py-12">
      <div className="h-2 w-full max-w-40 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-zinc-900" />
      </div>
    </div>
  );
}

export default function App() {
  const {t} = useTranslation();
  const location = useLocation();
  const [, setAuthRerender] = React.useState(0);

  React.useEffect(() => {
    const onAuthChange = () => setAuthRerender((v) => v + 1);
    window.addEventListener('pararouter-auth-changed', onAuthChange);
    return () => window.removeEventListener('pararouter-auth-changed', onAuthChange);
  }, []);

  const authed = isAuthenticated();
  const isLoginRoute = location.pathname === '/login';
  const isLandingRoute = location.pathname === '/';
  const isChatRoute = location.pathname.startsWith('/chat');
  const showShell = authed && !isLoginRoute;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-100 font-sans text-black selection:bg-purple-600 selection:text-white">
      {showShell && (
        <React.Suspense fallback={<div className="h-14 border-b border-zinc-100 bg-white/95" />}>
          <Navbar />
        </React.Suspense>
      )}

      <main className="flex-1 flex flex-col min-w-0">
        <div
          className={
            showShell && !isChatRoute
              ? `${APP_SHELL_MAX_CLASS} w-full min-w-0 mx-auto ${APP_SHELL_PAD_CLASS} py-12 flex-1 overflow-x-hidden`
              : isChatRoute
                ? 'flex-1 flex flex-col h-full min-w-0'
                : isLandingRoute && !authed
                  ? 'flex-1 flex flex-col min-w-0'
                  : ''
          }
        >
          <div
            key={location.pathname}
            className="flex-1 flex flex-col w-full min-w-0"
          >
            <React.Suspense fallback={<RouteFallback />}>
              <Routes location={location}>
                <Route path="/login" element={authed ? <Navigate to="/models" replace /> : <LoginView />} />
                <Route path="/" element={authed ? <Navigate to="/models" replace /> : <LandingView />} />
                <Route path="/models" element={authed ? <ModelsView /> : <Navigate to="/login" replace />} />
                <Route path="/activity" element={authed ? <ActivityView /> : <Navigate to="/login" replace />} />
                <Route path="/insights" element={authed ? <Navigate to="/activity" replace /> : <Navigate to="/login" replace />} />
                <Route path="/rankings" element={authed ? <Navigate to="/activity" replace /> : <Navigate to="/login" replace />} />
                <Route path="/pricing" element={authed ? <PricingView /> : <Navigate to="/login" replace />} />
                <Route path="/providers" element={authed ? <ProvidersView /> : <Navigate to="/login" replace />} />
                <Route path="/models/:modelId/providers" element={authed ? <ModelProvidersView /> : <Navigate to="/login" replace />} />
                <Route path="/global-models" element={authed ? <GlobalModelsView /> : <Navigate to="/login" replace />} />
                <Route path="/chat" element={authed ? <ChatView /> : <Navigate to="/login" replace />} />
                <Route path="/docs" element={authed ? <DocsView /> : <Navigate to="/login" replace />} />
                <Route
                  path="/hub"
                  element={authed ? <Navigate to="/models" replace /> : <Navigate to="/login" replace />}
                />
                <Route path="/keys" element={authed ? <KeysView /> : <Navigate to="/login" replace />} />
                <Route path="/settings" element={authed ? <SettingsView /> : <Navigate to="/login" replace />} />
                <Route path="/customers" element={authed ? <CustomersView /> : <Navigate to="/login" replace />} />
                <Route path="*" element={<Navigate to={authed ? '/models' : '/login'} replace />} />
              </Routes>
            </React.Suspense>
          </div>
        </div>
      </main>

      {showShell && !isChatRoute && <footer className="bg-white py-12">
        <div className={`${APP_SHELL_MAX_CLASS} mx-auto ${APP_SHELL_PAD_CLASS}`}>
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
