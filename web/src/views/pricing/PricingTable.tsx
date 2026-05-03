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
}

function getEffectivePublicModelId(row: PricingTableRow) {
  return (row.public_model_id || row.model || '').trim();
}

function getEffectiveGlobalModelId(row: PricingTableRow) {
  return (row.global_model_id || row.model || '').trim();
}

function getExplicitPublicModelId(row: PricingTableRow) {
  return (row.public_model_id || '').trim();
}

const rowKey = (row: {model: string; provider_account_id?: string | null; provider_key_id?: string}) => 
    `${row.model}::${row.provider_account_id || ''}::${row.provider_key_id || ''}`;

const fmtPrice = (value?: number | null) => (typeof value === 'number' ? `$${value.toFixed(2)}` : '-');
const fmtContext = (value?: number | null) => (typeof value === 'number' ? `${value}K` : '-');
const fmtPercent = (value?: number | null) => (typeof value === 'number' ? `${value.toFixed(1)}%` : '-');

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

const getReferenceCost = (row: Pick<PricingTableRow, 'output_cost' | 'input_cost'>) => {
  if (typeof row.output_cost === 'number') return row.output_cost;
  return typeof row.input_cost === 'number' ? row.input_cost : null;
};

const getGrossProfit = (
  row: Pick<PricingTableRow, 'price_mode' | 'input_price' | 'output_price' | 'markup_rate' | 'output_cost' | 'input_cost'>,
) => {
  const finalPrice = getFinalPrice(row);
  const referenceCost = getReferenceCost(row);
  if (typeof finalPrice !== 'number' || typeof referenceCost !== 'number') return null;
  return finalPrice - referenceCost;
};

const getGrossMarginRate = (
  row: Pick<PricingTableRow, 'price_mode' | 'input_price' | 'output_price' | 'markup_rate' | 'output_cost' | 'input_cost'>,
) => {
  const finalPrice = getFinalPrice(row);
  const grossProfit = getGrossProfit(row);
  if (typeof finalPrice !== 'number' || finalPrice <= 0 || typeof grossProfit !== 'number') return null;
  return (grossProfit / finalPrice) * 100;
};



export default function PricingTable({
  loading, pagedRows, tableRowsCount, hasProviders, onSort,
  currentPage, setCurrentPage, totalPages,
  openEditDrawer
}: PricingTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/70 border-b">
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('model')}>{t('pricingtable.global_model')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('pricingtable.public_model')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('provider')}>{t('pricingtable.provider_account')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('input')}>{t('pricingtable.input_1m')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('output')}>{t('pricingtable.output_1m')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                <span title={t('pricingtable.tooltip_cost_basis')}>{t('pricingtable.cost_basis')}</span>
              </th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                <span title={t('pricingtable.tooltip_gross_margin')}>{t('pricingtable.gross_margin')}</span>
              </th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                <span title={t('pricingtable.tooltip_gross_profit')}>{t('pricingtable.gross_profit')}</span>
              </th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('pricingtable.context')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('pricingtable.cache_read')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer" onClick={() => onSort('status')}>{t('pricingtable.status')}</th>
              <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right">{t('pricingtable.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={12} className="px-3 py-12 text-center text-zinc-400 text-sm">{t('pricingtable.loading_pricing')}</td>
              </tr>
            ) : pagedRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-12 text-center text-zinc-400 text-sm">
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
              pagedRows.map((row) => {
                const effectivePublicModelId = getEffectivePublicModelId(row);
                const effectiveGlobalModelId = getEffectiveGlobalModelId(row);
                const explicitPublicModelId = getExplicitPublicModelId(row);
                const effectiveProviderModelId = (row.provider_model_id || '').trim();

                return (
                <tr key={`${row.status}:${rowKey(row)}`} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-3 py-3 text-sm font-semibold text-zinc-900">
                    <button onClick={() => navigate(`/models/${encodeURIComponent(effectivePublicModelId || row.model)}/providers`)} className="hover:underline underline-offset-2 text-left font-mono">
                      {effectiveGlobalModelId || '-'}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold text-zinc-900">
                    <div className="font-mono">{explicitPublicModelId || t('pricingtable.same_as_global')}</div>
                    {effectiveProviderModelId && (
                      <div className="text-[10px] text-zinc-500 font-normal mt-0.5" title={t('pricingtable.provider_model')}>
                        {t('pricingtable.provider_model')}: {effectiveProviderModelId}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-600">{row.provider_account_id || '-'}</td>
                  <td className="px-3 py-3 text-sm font-mono text-zinc-800 whitespace-nowrap">{fmtPrice(row.input_price)}</td>
                  <td className="px-3 py-3 text-sm font-mono text-zinc-800 whitespace-nowrap">{fmtPrice(row.output_price)}</td>
                  <td className="px-3 py-3 text-sm font-mono text-zinc-700 whitespace-nowrap">{fmtPrice(getReferenceCost(row))}</td>
                  <td className="px-3 py-3 text-sm font-mono font-semibold text-emerald-700 whitespace-nowrap">{fmtPercent(getGrossMarginRate(row))}</td>
                  <td className="px-3 py-3 text-sm font-mono font-semibold whitespace-nowrap">
                    {(() => {
                      const grossProfit = getGrossProfit(row);
                      const tone = typeof grossProfit === 'number'
                        ? grossProfit >= 0
                          ? 'text-emerald-700'
                          : 'text-red-700'
                        : 'text-zinc-500';
                      return <span className={tone}>{fmtPrice(grossProfit)}</span>;
                    })()}
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-700 whitespace-nowrap">{fmtContext(row.context_length)}</td>
                  <td className="px-3 py-3 text-sm font-mono text-zinc-600 whitespace-nowrap">{fmtPrice(row.cache_read_price)}</td>
                  <td className="px-3 py-3 text-sm whitespace-nowrap">
                    {(() => {
                      const operationalStatus = (row.operational_status || '').toLowerCase();
                      if (operationalStatus === 'offline' || operationalStatus === 'rate_limited' || operationalStatus === 'paused') {
                        const isPaused = operationalStatus === 'paused';
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            isPaused
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {operationalStatus === 'rate_limited'
                              ? t('pricingtable.rate_limited')
                              : isPaused
                                ? t('pricingtable.paused')
                                : t('pricingtable.offline')}
                          </span>
                        );
                      }
                      if (operationalStatus === 'deprecated') {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                            {t('pricingtable.deprecated')}
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {operationalStatus === 'online' ? t('pricingtable.online') : t('pricingtable.published')}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => openEditDrawer(row)} className="px-2 py-1 text-xs font-semibold border rounded hover:bg-white">{t('pricingtable.edit')}</button>
                    </div>
                  </td>
                </tr>
                );
              })
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
