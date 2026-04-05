import React from 'react';
import { Trophy, TrendingUp, Zap, DollarSign, Award } from 'lucide-react';
import { useTranslation } from "react-i18next";

export default function RankingsView() {
    const { t } = useTranslation();
  const rankings = [
    {
      id: '1',
      name: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
      score: 92.4,
      latency: '1.2s',
      cost: '$3.00',
      trend: 'up'
    },
    {
      id: '2',
      name: 'GPT-4o',
      provider: 'OpenAI',
      score: 91.8,
      latency: '0.9s',
      cost: '$5.00',
      trend: 'down'
    },
    {
      id: '3',
      name: 'Llama 3.1 405B',
      provider: 'Meta',
      score: 89.5,
      latency: '2.1s',
      cost: '$1.50',
      trend: 'up'
    },
    {
      id: '4',
      name: 'Gemini 1.5 Pro',
      provider: 'Google',
      score: 88.2,
      latency: '1.5s',
      cost: '$3.50',
      trend: 'stable'
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-widest border border-amber-100">
            <Trophy size={12} />
            {t('rankings.leaderboard')}</div>
          <h1 className="text-4xl font-black tracking-tight text-zinc-900">{t('rankings.model_rankings')}</h1>
          <p className="text-zinc-500 max-w-xl">
            {t('rankings.the_most_comprehensive_and_up_')}</p>
        </div>
        
        <div className="flex bg-white border border-zinc-100 rounded-xl p-1 shadow-sm">
          {['Overall', 'Coding', 'Reasoning', 'Creative'].map((tab, i) => (
            <button 
              key={i}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${i === 0 ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-black'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{t('rankings.top_gainer')}</span>
          </div>
          <h3 className="text-sm font-bold text-zinc-500 mb-1">{t('rankings.claude_3_5_sonnet')}</h3>
          <p className="text-2xl font-black">{t('rankings.4_2_pts')}</p>
        </div>
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Zap size={20} />
            </div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{t('rankings.fastest')}</span>
          </div>
          <h3 className="text-sm font-bold text-zinc-500 mb-1">{t('rankings.gpt_4o')}</h3>
          <p className="text-2xl font-black">{t('rankings.0_9s_avg')}</p>
        </div>
        <div className="bg-white border border-zinc-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <DollarSign size={20} />
            </div>
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">{t('rankings.best_value')}</span>
          </div>
          <h3 className="text-sm font-bold text-zinc-500 mb-1">{t('rankings.llama_3_1_70b')}</h3>
          <p className="text-2xl font-black">{t('rankings.0_60_1m')}</p>
        </div>
      </div>

      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-50 bg-zinc-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('rankings.rank')}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('rankings.model')}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('rankings.provider')}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">{t('rankings.score')}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-center">{t('rankings.latency')}</th>
              <th className="px-6 py-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right">{t('rankings.cost_1m')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rankings.map((model, i) => (
              <tr key={model.id} className="hover:bg-zinc-50/50 transition-colors group">
                <td className="px-6 py-6">
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                      i === 0 ? 'bg-amber-100 text-amber-700' : 
                      i === 1 ? 'bg-zinc-100 text-zinc-600' : 
                      i === 2 ? 'bg-orange-50 text-orange-700' : 
                      'text-zinc-400'
                    }`}>
                      {i + 1}
                    </span>
                    {i === 0 && <Award size={16} className="text-amber-500" />}
                  </div>
                </td>
                <td className="px-6 py-6">
                  <span className="font-bold text-zinc-900 group-hover:text-black">{model.name}</span>
                </td>
                <td className="px-6 py-6">
                  <span className="text-sm text-zinc-500">{model.provider}</span>
                </td>
                <td className="px-6 py-6 text-center">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-zinc-900 text-white text-xs font-bold">
                    {model.score}
                  </span>
                </td>
                <td className="px-6 py-6 text-center">
                  <span className="text-sm font-medium text-zinc-600">{model.latency}</span>
                </td>
                <td className="px-6 py-6 text-right">
                  <span className="text-sm font-bold text-zinc-900">{model.cost}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
