import React from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {apiGet, apiPut} from '../lib/api';
import { Select } from '../components/Select';
import { useTranslation } from "react-i18next";

type PricingRow = {
  model: string;
  provider_model_id?: string | null;
  provider_account_id?: string | null;
  provider_key_id?: string | null;
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

  const updateRouting = async (
    providerAccountId: string,
    providerKeyId: string,
    patch: {is_top_provider?: boolean; status?: string; latency_ms?: number},
  ) => {
    const saveKey = `${providerAccountId}::${providerKeyId}`;
    setSavingProvider(saveKey);
    try {
      await apiPut(`/api/models/${encodeURIComponent(decodedModelId)}/routing`, {
        provider_account_id: providerAccountId,
        provider_key_id: providerKeyId,
        ...patch,
      });
      await load();
    } finally {
      setSavingProvider(null);
    }
  };

  return (
    <div className="w-full space-y-6">
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
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.provider')}</th>
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Key</th>
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Upstream</th>
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.input')}</th>
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.output')}</th>
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.reasoning')}</th>
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.context')}</th>
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.latency')}</th>
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.mode')}</th>
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.top')}</th>
                <th className="px-3 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('modelproviders.routing_status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={11} className="px-3 py-12 text-center text-zinc-500 text-sm">{t('modelproviders.loading')}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-12 text-center text-zinc-500 text-sm">{t('modelproviders.no_provider_pricing_found_for_')}</td></tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={`${row.provider_account_id || 'na'}::${row.provider_key_id || idx}`} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-3 text-sm font-semibold">{row.provider_account_id || '-'}</td>
                    <td className="px-3 py-3 text-sm font-mono text-xs text-zinc-500">{row.provider_key_id || '-'}</td>
                    <td className="px-3 py-3 text-sm font-mono text-xs text-zinc-500">{row.provider_model_id || decodedModelId}</td>
                    <td className="px-3 py-3 text-sm font-mono">{fmtPrice(row.input_price)}</td>
                    <td className="px-3 py-3 text-sm font-mono">{fmtPrice(row.output_price)}</td>
                    <td className="px-3 py-3 text-sm font-mono">{fmtPrice(row.reasoning_price)}</td>
                    <td className="px-3 py-3 text-sm">{row.context_length ?? '-'}</td>
                    <td className="px-3 py-3 text-sm">{row.latency_ms != null ? `${row.latency_ms}ms` : '-'}</td>
                    <td className="px-3 py-3 text-sm">{row.price_mode}</td>
                    <td className="px-3 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(row.is_top_provider)}
                        disabled={!row.provider_account_id || !row.provider_key_id || savingProvider === `${row.provider_account_id}::${row.provider_key_id}`}
                        onChange={(e) => row.provider_account_id && row.provider_key_id && updateRouting(row.provider_account_id, row.provider_key_id, {is_top_provider: e.target.checked})}
                      />
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <Select
                        value={row.status || 'online'}
                        disabled={!row.provider_account_id || !row.provider_key_id || savingProvider === `${row.provider_account_id}::${row.provider_key_id}`}
                        onChange={(value) => row.provider_account_id && row.provider_key_id && updateRouting(row.provider_account_id, row.provider_key_id, {status: value})}
                        options={[
                          { value: 'online', label: t('modelproviders.online') },
                          { value: 'paused', label: t('modelproviders.paused') },
                          { value: 'offline', label: t('modelproviders.offline') },
                        ]}
                        className="min-w-[9rem]"
                      />
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
