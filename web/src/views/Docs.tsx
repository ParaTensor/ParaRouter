import React from 'react';
import { Book, Code, Terminal, Zap, Shield, Globe, ChevronRight, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from "react-i18next";

export default function DocsView() {
    const { t } = useTranslation();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sections = [
    {
      title: 'Quick Start',
      icon: Zap,
      content: 'Get up and running with OpenHub in minutes. Our unified API allows you to access multiple LLMs with a single integration.',
      code: `curl https://api.openhub.ai/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $OPENHUB_API_KEY" \\
  -d '{
    "model": "anthropic/claude-3.5-sonnet",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`
    },
    {
      title: 'Authentication',
      icon: Shield,
      content: 'OpenHub uses API keys to authenticate requests. You can manage your keys in the Keys dashboard.',
      code: 'Authorization: Bearer <YOUR_API_KEY>'
    },
    {
      title: 'Model Routing',
      icon: Globe,
      content: 'Route requests to specific models or use our intelligent routing to find the best provider based on latency, cost, or performance.',
      code: '"model": "openhub/auto" // Automatically routes to the best model'
    }
  ];

  return (
    <div className="max-w-5xl space-y-12 pb-20">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 text-zinc-900 text-[10px] font-bold uppercase tracking-widest border border-zinc-200">
          <Book size={12} />
          {t('docs.documentation')}</div>
        <h1 className="text-5xl font-black tracking-tight text-zinc-900">{t('docs.build_with_openhub')}</h1>
        <p className="text-xl text-zinc-500 max-w-2xl leading-relaxed">
          {t('docs.the_unified_control_plane_for_')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {sections.map((section, i) => (
          <div key={i} className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
            <div className="w-12 h-12 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-900 mb-6 group-hover:scale-110 transition-transform">
              <section.icon size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2">{section.title}</h3>
            <p className="text-sm text-zinc-500 leading-relaxed mb-6">{section.content}</p>
            <div className="relative group/code">
              <pre className="bg-zinc-900 text-zinc-300 p-4 rounded-xl text-[11px] font-mono overflow-x-auto leading-relaxed">
                {section.code}
              </pre>
              <button 
                onClick={() => copyToClipboard(section.code, `code-${i}`)}
                className="absolute top-2 right-2 p-2 bg-zinc-800 text-zinc-400 rounded-lg opacity-0 group-hover/code:opacity-100 transition-opacity hover:text-white"
              >
                {copiedId === `code-${i}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 rounded-3xl p-12 text-white overflow-hidden relative">
        <div className="relative z-10 space-y-6 max-w-xl">
          <h2 className="text-3xl font-bold tracking-tight">{t('docs.ready_to_scale')}</h2>
          <p className="text-zinc-400 leading-relaxed">
            {t('docs.join_thousands_of_developers_b')}</p>
          <div className="flex gap-4 pt-4">
            <button className="bg-white text-black px-8 py-3 rounded-xl font-bold text-sm hover:bg-zinc-200 transition-all">
              {t('docs.get_started_free')}</button>
            <button className="px-8 py-3 border border-zinc-700 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all">
              {t('docs.contact_sales')}</button>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-zinc-800/50 to-transparent pointer-events-none" />
        <Terminal className="absolute -bottom-10 -right-10 text-zinc-800 w-64 h-64 opacity-20 rotate-12" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-12 border-t border-zinc-100">
        <div className="space-y-6">
          <h3 className="text-xl font-bold">{t('docs.api_reference')}</h3>
          <div className="space-y-4">
            {['Chat Completions', 'Models List', 'Usage Statistics', 'Key Management'].map((item, i) => (
              <button key={i} className="w-full flex items-center justify-between p-4 rounded-xl border border-zinc-50 hover:border-zinc-200 hover:bg-zinc-50 transition-all group">
                <span className="font-bold text-sm text-zinc-600 group-hover:text-black">{item}</span>
                <ChevronRight size={16} className="text-zinc-300 group-hover:text-black transition-colors" />
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <h3 className="text-xl font-bold">{t('docs.sdks_libraries')}</h3>
          <div className="grid grid-cols-2 gap-4">
            {['Python', 'Node.js', 'Go', 'Rust'].map((item, i) => (
              <div key={i} className="p-6 rounded-2xl border border-zinc-100 flex flex-col items-center justify-center gap-3 hover:border-black transition-all cursor-pointer group">
                <Code size={24} className="text-zinc-300 group-hover:text-black transition-colors" />
                <span className="font-bold text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
