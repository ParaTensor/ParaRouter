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
import {motion, AnimatePresence} from 'motion/react';

export default function App() {
  const [activeTab, setActiveTab] = React.useState('models');

  const renderContent = () => {
    switch (activeTab) {
      case 'models':
        return <ModelsView />;
      case 'keys':
        return <KeysView />;
      case 'activity':
        return <ActivityView />;
      case 'settings':
        return <SettingsView />;
      case 'chat':
        return <ChatView />;
      case 'docs':
        return <DocsView />;
      case 'rankings':
        return <RankingsView />;
      case 'hub':
        return <HubConsoleView />;
      default:
        return <ModelsView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-black font-sans selection:bg-black selection:text-white">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{opacity: 0, y: 10}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: -10}}
              transition={{duration: 0.2, ease: 'easeOut'}}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <footer className="border-t bg-white">
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
                <li><a href="#" className="hover:text-black transition-colors">Models</a></li>
                <li><a href="#" className="hover:text-black transition-colors">Rankings</a></li>
                <li><a href="#" className="hover:text-black transition-colors">Pricing</a></li>
                <li><a href="#" className="hover:text-black transition-colors">Chat</a></li>
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
      </footer>
    </div>
  );
}
