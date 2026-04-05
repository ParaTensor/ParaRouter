import React from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PricingTableRow, SortKey } from './types';
import { useTranslation } from "react-i18next";

interface PricingTableProps {
  loading: boolean;
  pagedRows: PricingTableRow[];
  tableRowsCount: number;
  hasProviders: boolean;
  onSort: (nextKey: SortKey) => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  openEditDrawer: (row: PricingTableRow) => void;
  deleteDraft: (row: PricingTableRow) => void;
}

const rowKey = (row: {model: string; provider_account_id?: string | null; provider_key_id?: string}) => 
    `${row.model}::${row.provider_account_id || ''}::${row.provider_key_id || ''}`;

const fmtPrice = (value?: number | null) => (typeof value === 'number' ? `$${value.toFixed(2)}` : '-');
const fmtNum = (value?: number | null) => (typeof value === 'number' ? String(value) : '-');
const fmtContext = (value?: number | null) => (typeof value === 'number' ? `${value}K` : '-');
const fmtLatency = (value?: number | null) => (typeof value === 'number' ? `${value}ms` : '-');

const fmtMarkup = (value?: number | null) => {
  if (typeof value !== 'number') return '-';
  const percent = value > 1 ? value : value * 100;
  return `+${percent.toFixed(2)}%`;
};

const getFinalPrice = (row: Pick<PricingTableRow, 'price_mode' | 'input_price' | 'output_price' | 'markup_rate'>) => {
  if (row.price_mode === 'fixed') {
    return typeof row.output_price === 'number' ? row.output_price : row.input_price ?? null;
  }
  if (typeof row.markup_rate === 'number') {
    const base = typeof row.output_price === 'number' ? row.output_price : row.input_price;
    if (typeof base === 'number') return base * (1 + row.markup_rate);
  }
  return null;
};



export default function PricingTable({
  loading, pagedRows, tableRowsCount, hasProviders, onSort,
  currentPage, setCurrentPage, totalPages,
  openEditDrawer, deleteDraft
}: PricingTableProps) {
    const { t } = useTranslation();
  const navigate = useNavigate();

  const fmtAge = (ts?: number) => {
    if (!ts) return '-';
    const diff = Math.max(0, Date.now() - ts);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('pricingtable.just_now');
    if (minutes < 60) return t('pricingtable.m_ago', { minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('pricingtable.h_ago', { hours });
    return t('pricingtable.d_ago', { days: Math.floor(hours / 24) });
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/70 border-b">
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('model')}>{t('pricingtable.model_id')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('provider')}>{t('pricingtable.provider_account')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('input')}>{t('pricingtable.input_1m')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('output')}>{t('pricingtable.output_1m')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('final')}>
                <span title={t('pricingtable.tooltip_markup_final')}>{t('pricingtable.final_price')}</span>
              </th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('pricingtable.reasoning')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('pricingtable.context')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('pricingtable.latency')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('pricingtable.cache_read')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('pricingtable.cache_write')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('status')}>{t('pricingtable.status')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('updated')}>{t('pricingtable.updated')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">{t('pricingtable.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={15} className="px-3 py-12 text-center text-zinc-400 text-sm">{t('pricingtable.loading_pricing')}</td>
              </tr>
            ) : pagedRows.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-3 py-12 text-center text-zinc-400 text-sm">
                  {hasProviders ? (
                    t('pricingtable.no_pricing_yet')
                  ) : (
                    <span>
                      {t('pricingtable.no_provider_account_yet')}<br />
                      {t('pricingtable.click')}<span className="font-semibold">{t('pricingtable.provider')}</span> {t('pricingtable.in_the_toolbar_to_enable_prici')}</span>
                  )}
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr key={`${row.status}:${rowKey(row)}`} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-3 py-3 text-sm font-semibold text-zinc-900">
                    <button onClick={() => navigate(`/models/${encodeURIComponent(row.model)}/providers`)} className="hover:underline underline-offset-2 text-left">
                      {row.model}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-600">{row.provider_account_id || '-'}</td>
                  <td className="px-3 py-3 text-sm font-mono text-zinc-800 whitespace-nowrap">{fmtPrice(row.input_price)}</td>
                  <td className="px-3 py-3 text-sm font-mono text-zinc-800 whitespace-nowrap">{fmtPrice(row.output_price)}</td>
                  <td className="px-3 py-3 text-sm font-mono font-semibold text-zinc-900 whitespace-nowrap">
                    <span title={row.price_mode === 'markup' ? t('pricingtable.tooltip_markup_final') : t('pricingtable.tooltip_final_effective')}>
                      {(() => {
                        const finalPrice = getFinalPrice(row);
                        if (typeof finalPrice === 'number') return fmtPrice(finalPrice);
                        return row.price_mode === 'markup' ? fmtMarkup(row.markup_rate) : '-';
                      })()}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm font-mono text-zinc-700 whitespace-nowrap">{fmtPrice(row.reasoning_price)}</td>
                  <td className="px-3 py-3 text-sm text-zinc-700 whitespace-nowrap">{fmtContext(row.context_length)}</td>
                  <td className="px-3 py-3 text-sm text-zinc-700 whitespace-nowrap">{fmtLatency(row.latency_ms)}</td>
                  <td className="px-3 py-3 text-sm font-mono text-zinc-600 whitespace-nowrap">{fmtPrice(row.cache_read_price)}</td>
                  <td className="px-3 py-3 text-sm font-mono text-zinc-600 whitespace-nowrap">{fmtPrice(row.cache_write_price)}</td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">
                    {(() => {
                      const operationalStatus = (row.operational_status || '').toLowerCase();
                      if (row.status === 'Draft') {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            {t('pricingtable.draft')}</span>
                        );
                      }
                      if (operationalStatus === 'offline' || operationalStatus === 'rate_limited') {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                            {operationalStatus === 'rate_limited' ? t('pricingtable.rate_limited') : t('pricingtable.offline')}
                          </span>
                        );
                      }
                      if (operationalStatus === 'deprecated') {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                            {t('pricingtable.deprecated')}</span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {operationalStatus === 'online' ? t('pricingtable.online') : t('pricingtable.published')}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-500">{fmtAge(row.updated_at)}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => openEditDrawer(row)} className="px-2 py-1 text-xs font-semibold border rounded hover:bg-white">{t('pricingtable.edit')}</button>
                      <button onClick={() => deleteDraft(row)} disabled={row.status !== 'Draft'} className="px-2 py-1 text-xs font-semibold text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">{t('pricingtable.delete')}</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-gray-50/40">
        <p className="text-xs text-zinc-500">{tableRowsCount} {t('pricingtable.items')}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1.5 border rounded disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-zinc-600">{t('pricingtable.page')}{currentPage} / {totalPages}</span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1.5 border rounded disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
