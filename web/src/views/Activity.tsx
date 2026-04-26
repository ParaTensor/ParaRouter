import React, {useEffect, useState, useTransition} from 'react';
import {AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer} from 'recharts';
import {Download, Zap, TrendingUp, Clock, DollarSign, Loader2, Search, ChevronLeft, ChevronRight} from 'lucide-react';
import { Select } from '../components/Select';
import {apiGet} from '../lib/api';
import {localUser} from '../lib/session';
import { useTranslation } from "react-i18next";

interface ActivityStats {
  summary: {
    totalTokens: number;
    totalCost: number;
    avgLatency: number;
    changes: {
      tokens: string | null;
      cost: string | null;
      latency: string | null;
    };
  };
  trend: Array<{
    date: string;
    tokens: number;
    cost: number;
  }>;
}

export default function ActivityView() {
  const { t, i18n } = useTranslation();
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const isAdmin = localUser.role === 'admin';
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [queryTrigger, setQueryTrigger] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const loadAll = async () => {
      if (logs.length === 0) setLoading(true);
      try {
        // Load customer list for admin filter
        if (isAdmin && customers.length === 0) {
          try {
            const customerList = await apiGet<any[]>('/api/admin/customers');
            setCustomers(customerList);
          } catch {
            // ignore
          }
        }

        const mineParam = showMineOnly ? '&mine=true' : '';
        const userIdParam = isAdmin && !showMineOnly && selectedUserId ? `&userId=${encodeURIComponent(selectedUserId)}` : '';
        const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
        const timeParam = startDate && endDate
          ? `&startTime=${new Date(startDate).getTime()}&endTime=${new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1}`
          : '';
        const offset = page * pageSize;

        const [logsRes, statsData] = await Promise.all([
          apiGet<{ rows: any[]; total: number }>(`/api/activity?limit=${pageSize}&offset=${offset}${mineParam}${userIdParam}${searchParam}${timeParam}`),
          apiGet<ActivityStats>(`/api/activity/stats?${mineParam ? 'mine=true' : ''}${userIdParam}${searchParam}${timeParam}`)
        ]);

        const logsData = logsRes.rows.map((row) => {
          const dateObj = new Date(Number(row.timestamp));
          return {
            id: String(row.id),
            time: dateObj.toLocaleTimeString(),
            date: dateObj.toLocaleDateString(),
            model: row.model,
            tokens: row.tokens || 0,
            cost: row.cost || '$0.00',
            status: row.status === 200 ? t('activity.success') : t('activity.error'),
            latency: `${((row.latency || 0) / 1000).toFixed(1)}s`,
            userId: row.user_id || '-',
          };
        });

        setLogs(logsData);
        setTotal(logsRes.total);
        setStats(statsData);
      } catch (error) {
        console.error('Load activity failed:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [isAdmin, i18n.language, showMineOnly, selectedUserId, page, queryTrigger, customers.length, pageSize]);

  if (loading && logs.length === 0) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  const summary = stats?.summary || {
    totalTokens: 0,
    totalCost: 0,
    avgLatency: 0,
    changes: { tokens: null, cost: null, latency: null }
  };

  const showUserCol = isAdmin && !showMineOnly;
  const totalPages = Math.ceil(total / pageSize);

  const handleExport = () => {
    const headers = ['Time', 'Date', 'Model', 'Tokens', 'Latency', 'Cost', ...(showUserCol ? ['User'] : []), 'Status'];
    const rows = logs.map((log) => [
      log.time,
      log.date,
      log.model,
      log.tokens,
      log.latency,
      log.cost,
      ...(showUserCol ? [log.userId] : []),
      log.status,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleQuery = () => {
    setPage(0);
    setQueryTrigger((v) => v + 1);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('activity.activity')}</h1>
          <p className="text-gray-500 mt-1">{t('activity.monitor_your_usage_and_spendin')}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Select
                value={selectedUserId}
                onChange={(value) => {
                  startTransition(() => {
                    setSelectedUserId(value);
                    setShowMineOnly(false);
                    setPage(0);
                    setQueryTrigger((v) => v + 1);
                  });
                }}
                options={[
                  { value: '', label: t('activity.all_users_option') || t('activity.all_users') },
                  ...customers.map((c) => ({ value: c.id, label: c.username || c.email })),
                ]}
                placeholder={t('activity.all_users_option') || t('activity.all_users')}
                className="w-44"
              />
              <button
                onClick={handleExport}
                className="flex items-center gap-2 border border-gray-200 bg-white px-4 py-2 rounded-lg text-sm font-bold hover:border-black transition-all"
              >
                <Download size={16} />
                {t('activity.export')}</button>
            </>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder={t('activity.search_model') || 'Search model...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              className="border border-gray-200 bg-white pl-9 pr-3 py-2 rounded-lg text-sm font-medium text-zinc-600 focus:outline-none focus:border-black transition-all w-48"
            />
          </div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-200 bg-white px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 focus:outline-none focus:border-black transition-all"
          />
          <span className="text-sm text-zinc-400">~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-200 bg-white px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 focus:outline-none focus:border-black transition-all"
          />
          <button
            onClick={() => startTransition(handleQuery)}
            className="bg-black text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-zinc-800 transition-all active:scale-95"
          >
            {t('activity.query') || 'Query'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Zap size={14} />
            <p className="text-[11px] font-bold uppercase tracking-widest">{t('activity.total_tokens')}</p>
          </div>
          <h3 className="text-3xl font-bold tracking-tight">
            {summary.totalTokens.toLocaleString()}
          </h3>
          {summary.changes.tokens && (
            <div className="flex items-center gap-1.5 mt-2">
              <TrendingUp size={12} className={summary.changes.tokens.startsWith('+') ? "text-emerald-500" : "text-red-500"} />
              <span className={`text-xs font-bold ${summary.changes.tokens.startsWith('+') ? "text-emerald-600" : "text-red-600"}`}>
                {summary.changes.tokens}
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">{t('activity.vs_last_week')}</span>
            </div>
          )}
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <DollarSign size={14} />
            <p className="text-[11px] font-bold uppercase tracking-widest">{t('activity.total_cost')}</p>
          </div>
          <h3 className="text-3xl font-bold tracking-tight">${summary.totalCost.toFixed(2)}</h3>
          {summary.changes.cost && (
            <div className="flex items-center gap-1.5 mt-2">
              <TrendingUp size={12} className={summary.changes.cost.startsWith('+') ? "text-emerald-500" : "text-red-500"} />
              <span className={`text-xs font-bold ${summary.changes.cost.startsWith('+') ? "text-emerald-600" : "text-red-600"}`}>
                {summary.changes.cost}
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">{t('activity.vs_last_week')}</span>
            </div>
          )}
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Clock size={14} />
            <p className="text-[11px] font-bold uppercase tracking-widest">{t('activity.avg_latency')}</p>
          </div>
          <h3 className="text-3xl font-bold tracking-tight">{(summary.avgLatency / 1000).toFixed(2)}s</h3>
          {summary.changes.latency && (
            <div className="flex items-center gap-1.5 mt-2">
              <TrendingUp size={12} className={summary.changes.latency.startsWith('-') ? "text-emerald-500 rotate-180" : "text-red-500"} />
              <span className={`text-xs font-bold ${summary.changes.latency.startsWith('-') ? "text-emerald-600" : "text-red-600"}`}>
                {summary.changes.latency}
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">{t('activity.vs_last_week')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">{t('activity.token_usage_history')}</h3>
        </div>
        <div className="h-[300px] w-full">
          {stats?.trend && stats.trend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.trend}>
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
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-400 text-sm italic">
              No trend data available for the selected period.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">{t('activity.recent_requests')}</h3>
          {total > 0 && (
            <span className="text-xs text-zinc-400 font-medium">{total.toLocaleString()} records total</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-50">
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('activity.time')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('activity.model')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('activity.tokens')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('activity.latency')}</th>
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('activity.cost')}</th>
                {showUserCol && (
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">User</th>
                )}
                <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('activity.status')}</th>
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
                  {showUserCol && (
                    <td className="px-6 py-4 text-xs font-bold text-zinc-700">{log.userId}</td>
                  )}
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      log.status === t('activity.success') 
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                        : 'bg-red-50 text-red-600 border border-red-100'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && (
            <div className="px-6 py-12 text-center text-zinc-500 italic">
              {(!isAdmin || showMineOnly) ? t('activity.no_personal_records') : 'No recent requests found.'}
            </div>
          )}

          {total > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-50">
              <span className="text-sm text-zinc-500 font-medium">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => startTransition(() => setPage((p) => Math.max(0, p - 1)))}
                  disabled={page === 0 || isPending}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:border-black transition-all"
                >
                  <ChevronLeft size={14} />
                  {t('activity.prev_page') || 'Prev'}
                </button>
                <button
                  onClick={() => startTransition(() => setPage((p) => p + 1))}
                  disabled={(page + 1) * pageSize >= total || isPending}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:border-black transition-all"
                >
                  {t('activity.next_page') || 'Next'}
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
