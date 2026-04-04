import React, {useEffect, useState} from 'react';
import {Search, ArrowUpRight, Zap, SlidersHorizontal, RefreshCw} from 'lucide-react';
import {apiGet, apiPost} from '../lib/api';
import {localUser} from '../lib/session';

const initialModels = [
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    description: "Anthropic's most intelligent model to date, offering high performance and speed.",
    context: '200k',
    pricing: {prompt: '$3.00', completion: '$15.00'},
    tags: ['New', 'Intelligent'],
    isPopular: true,
    latency: '1.2s',
    status: 'online',
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    description: "OpenAI's most advanced multimodal model, optimized for speed and reasoning.",
    context: '128k',
    pricing: {prompt: '$5.00', completion: '$15.00'},
    tags: ['Multimodal', 'Fast'],
    isPopular: true,
    latency: '0.8s',
    status: 'online',
  },
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    provider: 'Google',
    description: "Google's next-generation model with a massive context window and strong reasoning.",
    context: '2M',
    pricing: {prompt: '$3.50', completion: '$10.50'},
    tags: ['Large Context'],
    isPopular: false,
    latency: '2.1s',
    status: 'online',
  },
  {
    id: 'meta-llama/llama-3.1-405b',
    name: 'Llama 3.1 405B',
    provider: 'Meta',
    description: "The world's largest open-weights model, rivaling top proprietary models.",
    context: '128k',
    pricing: {prompt: '$2.00', completion: '$2.00'},
    tags: ['Open Weights'],
    isPopular: false,
    latency: '1.5s',
    status: 'online',
  },
  {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    provider: 'Mistral',
    description: "Mistral's flagship model with top-tier reasoning and multilingual capabilities.",
    context: '32k',
    pricing: {prompt: '$4.00', completion: '$12.00'},
    tags: ['Multilingual'],
    isPopular: false,
    latency: '1.8s',
    status: 'online',
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'DeepSeek',
    description: 'Highly efficient and cost-effective model with strong coding and math skills.',
    context: '64k',
    pricing: {prompt: '$0.14', completion: '$0.28'},
    tags: ['Cheap', 'Coding'],
    isPopular: true,
    latency: '0.5s',
    status: 'online',
  },
];

export default function ModelsView() {
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = localUser.role === 'admin';

  const loadModels = async () => {
    try {
      const data = await apiGet<any[]>('/api/models');
      setModels(data.length > 0 ? data : initialModels);
    } catch (error) {
      console.error('Load models failed:', error);
      setModels(initialModels);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleSync = async () => {
    if (!isAdmin) return;
    try {
      await apiPost('/api/models/sync', {models: initialModels});
      await loadModels();
      alert('Models synced to PostgreSQL!');
    } catch (error) {
      console.error('Sync failed:', error);
      alert('Sync failed. Check console for details.');
    }
  };

  const filteredModels = models.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return <div className="text-center text-zinc-500">Loading models...</div>;
  }

  return (
    <div className="space-y-10">
      <div className="text-center max-w-2xl mx-auto pt-4 pb-8 relative">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900 mb-4">The unified interface for LLMs.</h1>
        <p className="text-lg text-zinc-500 font-medium">Access any AI model via a single API.</p>

        {isAdmin && (
          <button
            onClick={handleSync}
            className="absolute top-0 right-0 p-2 text-zinc-400 hover:text-black transition-colors flex items-center gap-2 text-xs font-bold"
            title="Sync initial models to PostgreSQL"
          >
            <RefreshCw size={14} /> Sync
          </button>
        )}
      </div>

      <div className="max-w-3xl mx-auto sticky top-[72px] z-30 bg-white/80 backdrop-blur-md py-2">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-black transition-colors" size={20} />
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-12 py-3.5 bg-white border border-gray-200 rounded-xl text-[15px] focus:outline-none focus:border-black focus:ring-4 focus:ring-black/5 transition-all"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button className="p-1.5 hover:bg-gray-100 rounded-md text-zinc-400 hover:text-black transition-colors">
              <SlidersHorizontal size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredModels.map((model) => (
          <div key={model.id} className="group bg-white border border-gray-100 rounded-xl p-5 hover:border-zinc-300 transition-all duration-200 flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-zinc-50 border border-gray-100 flex items-center justify-center font-bold text-zinc-300 text-lg">
                  {model.provider[0]}
                </div>
                <div>
                  <h3 className="font-bold text-[15px] text-zinc-900 leading-tight">{model.name}</h3>
                  <p className="text-xs text-zinc-400 font-medium">{model.provider}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {model.isPopular && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-zinc-900 text-white text-[9px] font-bold uppercase tracking-wider rounded">
                    Trending
                  </span>
                )}
                <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">{model.context}</span>
              </div>
            </div>

            <p className="text-[13px] text-zinc-500 leading-relaxed mb-6 flex-grow line-clamp-2">{model.description}</p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-zinc-50/50 rounded-lg p-2.5 border border-gray-50">
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Prompt</p>
                <p className="font-mono text-xs font-semibold text-zinc-700">{model.pricing.prompt}</p>
              </div>
              <div className="bg-zinc-50/50 rounded-lg p-2.5 border border-gray-50">
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-0.5">Completion</p>
                <p className="font-mono text-xs font-semibold text-zinc-700">{model.pricing.completion}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-50">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                <Zap size={10} className="text-emerald-500" />
                {model.latency}
              </div>
              <button className="flex items-center gap-1 text-xs font-bold text-zinc-900 opacity-0 group-hover:opacity-100 transition-all">
                Details <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
