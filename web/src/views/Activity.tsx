import React, {useEffect, useState} from 'react';
import {AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer} from 'recharts';
import {Calendar, Download, Zap, TrendingUp, Clock, DollarSign, Loader2} from 'lucide-react';
import {apiGet} from '../lib/api';
import {localUser} from '../lib/session';

const initialData = [
  {date: 'Mar 23', tokens: 45000, cost: 0.12},
  {date: 'Mar 24', tokens: 52000, cost: 0.15},
  {date: 'Mar 25', tokens: 38000, cost: 0.08},
  {date: 'Mar 26', tokens: 65000, cost: 0.22},
  {date: 'Mar 27', tokens: 85000, cost: 0.35},
  {date: 'Mar 28', tokens: 72000, cost: 0.28},
  {date: 'Mar 29', tokens: 95000, cost: 0.42},
];

const initialLogs = [
  {id: '1', time: '10:15:22', date: '2024-03-29', model: 'claude-3.5-sonnet', tokens: 1240, cost: '$0.018', status: 'Success', latency: '1.2s'},
  {id: '2', time: '10:12:05', date: '2024-03-29', model: 'gpt-4o', tokens: 850, cost: '$0.012', status: 'Success', latency: '0.8s'},
  {id: '3', time: '09:55:10', date: '2024-03-29', model: 'llama-3.1-405b', tokens: 2100, cost: '$0.004', status: 'Success', latency: '1.5s'},
  {id: '4', time: '09:42:33', date: '2024-03-29', model: 'deepseek-chat', tokens: 4500, cost: '$0.001', status: 'Success', latency: '0.5s'},
  {id: '5', time: '09:30:15', date: '2024-03-29', model: 'claude-3.5-sonnet', tokens: 520, cost: '$0.007', status: 'Success', latency: '1.1s'},
];

export default function ActivityView() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = localUser.role === 'admin';

  useEffect(() => {
    if (!isAdmin) {
      setLogs(initialLogs);
      setLoading(false);
      return;
    }

    const loadActivity = async () => {
      try {
        const rows = await apiGet<any[]>('/api/activity?limit=50');
        const logsData = rows.map((row) => {
          const dateObj = new Date(Number(row.timestamp));
          return {
            id: String(row.id),
            time: dateObj.toLocaleTimeString(),
            date: dateObj.toLocaleDateString(),
            model: row.model,
            tokens: row.tokens || 0,
            cost: row.cost || '$0.00',
            status: row.status === 200 ? 'Success' : 'Error',
            latency: `${((row.latency || 0) / 1000).toFixed(1)}s`,
          };
        });
        setLogs(logsData.length > 0 ? logsData : initialLogs);
      } catch (error) {
        console.error('Load activity failed:', error);
        setLogs(initialLogs);
      } finally {
        setLoading(false);
      }
    };

    loadActivity();
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
          <p className="text-gray-500 mt-1">Monitor your usage and spending across all models on OpenHub.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 border border-gray-200 bg-white px-4 py-2 rounded-lg text-sm font-bold hover:border-black transition-all">
            <Calendar size={16} />
            Last 7 Days
          </button>
          <button className="flex items-center gap-2 border border-gray-200 bg-white px-4 py-2 rounded-lg text-sm font-bold hover:border-black transition-all">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Zap size={14} />
            <p className="text-[11px] font-bold uppercase tracking-widest">Total Tokens</p>
          </div>
          <h3 className="text-3xl font-bold tracking-tight">
            {logs.reduce((acc, log) => acc + (typeof log.tokens === 'number' ? log.tokens : 0), 0).toLocaleString()}
          </h3>
          <div className="flex items-center gap-1.5 mt-2">
            <TrendingUp size={12} className="text-emerald-500" />
            <span className="text-xs font-bold text-emerald-600">+12%</span>
            <span className="text-[10px] text-zinc-400 font-medium">vs last week</span>
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <DollarSign size={14} />
            <p className="text-[11px] font-bold uppercase tracking-widest">Total Cost</p>
          </div>
          <h3 className="text-3xl font-bold tracking-tight">$1.62</h3>
          <div className="flex items-center gap-1.5 mt-2">
            <TrendingUp size={12} className="text-emerald-500" />
            <span className="text-xs font-bold text-emerald-600">+8%</span>
            <span className="text-[10px] text-zinc-400 font-medium">vs last week</span>
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Clock size={14} />
            <p className="text-[11px] font-bold uppercase tracking-widest">Avg. Latency</p>
          </div>
          <h3 className="text-3xl font-bold tracking-tight">1.2s</h3>
          <div className="flex items-center gap-1.5 mt-2">
            <TrendingUp size={12} className="text-red-500 rotate-180" />
            <span className="text-xs font-bold text-red-600">+5%</span>
            <span className="text-[10px] text-zinc-400 font-medium">vs last week</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">Token Usage History</h3>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={initialData}>
              <defs>
                <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#000" stopOpacity={0.05} />
                  <stop offset="95%" stopColor="#000" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#a1a1aa', fontWeight: 600}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#a1a1aa', fontWeight: 600}} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #f4f4f5',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  fontSize: '12px',
                  fontWeight: '600',
                }}
              />
              <Area type="monotone" dataKey="tokens" stroke="#000" fillOpacity={1} fill="url(#colorTokens)" strokeWidth={2} animationDuration={1500} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">Recent Requests</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-50">
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Time</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Model</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Tokens</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Latency</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Cost</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-zinc-900">{log.time}</span>
                      <span className="text-[10px] text-zinc-400 font-medium">{log.date}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-[11px] font-bold bg-zinc-100 text-zinc-600 px-2 py-1 rounded border border-zinc-200">
                      {log.model}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-zinc-700">{log.tokens.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
                      <Clock size={12} className="text-zinc-300" />
                      {log.latency}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-zinc-900">{log.cost}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
