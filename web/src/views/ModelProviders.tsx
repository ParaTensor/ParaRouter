import React from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {apiGet, apiPut} from '../lib/api';
import { useTranslation } from "react-i18next";

type PricingRow = {
  model: string;
  provider_account_id?: string | null;
  price_mode: 'fixed' | 'markup';
  input_price?: number | null;
  output_price?: number | null;
  cache_read_price?: number | null;
  cache_write_price?: number | null;
  reasoning_price?: number | null;
  markup_rate?: number | null;
  context_length?: number | null;
  latency_ms?: number | null;
  is_top_provider?: boolean | null;
  status?: string;
  currency: string;
  updated_at?: number;
  row_status?: 'Draft' | 'Published';
};

type ModelProvidersResponse = {
  model_id: string;
  version: string;
  rows: PricingRow[];
};

const fmtPrice = (value?: number | null) => (typeof value === 'number' ? `$${value.toFixed(2)}` : '-');

export default function ModelProvidersView() {
    const { t } = useTranslation();
  const {modelId = ''} = useParams();
  const navigate = useNavigate();
  const decodedModelId = decodeURIComponent(modelId);
  const [rows, setRows] = React.useState<PricingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingProvider, setSavingProvider] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<ModelProvidersResponse>(`/api/models/${encodeURIComponent(decodedModelId)}/providers`);
      setRows(data.rows || []);
    } finally {
      setLoading(false);
    }
  }, [decodedModelId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const updateRouting = async (providerAccountId: string, patch: {is_top_provider?: boolean; status?: string; latency_ms?: number}) => {
    setSavingProvider(providerAccountId);
    try {
      await apiPut(`/api/models/${encodeURIComponent(decodedModelId)}/routing`, {
        provider_account_id: providerAccountId,
        ...patch,
      });
      await load();
    } finally {
      setSavingProvider(null);
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('modelproviders.model_providers')}</h1>
          <p className="text-gray-500 mt-1">{decodedModelId}</p>
        </div>
        <button onClick={() => navigate('/pricing')} className="px-3 py-2 rounded-lg border text-sm font-semibold hover:bg-zinc-50">
          {t('modelproviders.back_to_pricing')}</button>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/70 border-b">
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.provider')}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.input')}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.output')}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.reasoning')}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.context')}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.latency')}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.mode')}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.top')}</th>
                <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.routing_status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-zinc-500 text-sm">{t('modelproviders.loading')}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-zinc-500 text-sm">{t('modelproviders.no_provider_pricing_found_for_')}</td></tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={`${row.provider_account_id || 'na'}-${idx}`} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm font-semibold">{row.provider_account_id || '-'}</td>
                    <td className="px-4 py-3 text-sm font-mono">{fmtPrice(row.input_price)}</td>
                    <td className="px-4 py-3 text-sm font-mono">{fmtPrice(row.output_price)}</td>
                    <td className="px-4 py-3 text-sm font-mono">{fmtPrice(row.reasoning_price)}</td>
                    <td className="px-4 py-3 text-sm">{row.context_length ?? '-'}</td>
                    <td className="px-4 py-3 text-sm">{row.latency_ms != null ? `${row.latency_ms}ms` : '-'}</td>
                    <td className="px-4 py-3 text-sm">{row.price_mode}</td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(row.is_top_provider)}
                        disabled={!row.provider_account_id || savingProvider === row.provider_account_id}
                        onChange={(e) => row.provider_account_id && updateRouting(row.provider_account_id, {is_top_provider: e.target.checked})}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={row.status || 'online'}
                        disabled={!row.provider_account_id || savingProvider === row.provider_account_id}
                        onChange={(e) => row.provider_account_id && updateRouting(row.provider_account_id, {status: e.target.value})}
                        className="px-2 py-1 border rounded text-xs bg-white"
                      >
                        <option value="online">{t('modelproviders.online')}</option>
                        <option value="degraded">{t('modelproviders.degraded')}</option>
                        <option value="offline">{t('modelproviders.offline')}</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
