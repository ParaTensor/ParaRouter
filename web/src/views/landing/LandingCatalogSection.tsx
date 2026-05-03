import React, {useEffect, useMemo, useState} from 'react';
import {Globe, Search, Zap} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {apiGet} from '../../lib/api';
import {APP_SHELL_MAX_CLASS, APP_SHELL_PAD_CLASS, LANDING_CONTENT_COLUMN_CLASS} from '../../lib/appShellLayout';
import {MODEL_CARD_GRID, MODEL_CARD_SHELL} from '../../lib/modelCardShell';
import {sortByNameThenId} from '../../lib/modelSort';

type PublicGlobalModel = {
  id: string;
  name: string;
  description?: string;
  context_length: number | null;
  global_pricing?: {
    prompt?: number;
    completion?: number;
    cache_read?: number;
    cache_write?: number;
    reasoning?: number;
  } | null;
};

type RoutedRow = {id: string; name: string; provider?: string};

function buildCatalogFallbackFromRouted(routed: RoutedRow[]): PublicGlobalModel[] {
  const uniqueById = new Map<string, PublicGlobalModel>();
  for (const row of routed) {
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id || uniqueById.has(id)) continue;
    uniqueById.set(id, {
      id,
      name: (typeof row.name === 'string' && row.name.trim()) || id,
      description: '',
      context_length: null,
      global_pricing: null,
    });
  }
  return Array.from(uniqueById.values());
}

function orderRegistryLikeModelsPage(registry: PublicGlobalModel[], routed: RoutedRow[]) {
  if (!registry.length) return [];
  if (!routed.length) return sortByNameThenId(registry);

  const sortedRouted = sortByNameThenId(routed);
  const routedIdsOrdered: string[] = [];
  const seen = new Set<string>();

  for (const model of sortedRouted) {
    if (!seen.has(model.id)) {
      seen.add(model.id);
      routedIdsOrdered.push(model.id);
    }
  }

  const catalogOnly = registry.filter((model) => model.id && !seen.has(model.id));
  const sortedCatalog = sortByNameThenId(catalogOnly);
  const byId = new Map(registry.map((model) => [model.id, model]));

  return [...routedIdsOrdered, ...sortedCatalog.map((model) => model.id)]
    .map((id) => byId.get(id))
    .filter((model): model is PublicGlobalModel => model != null);
}

function fmtUsdShort(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
}

function contextShort(contextLength: number | null): string {
  if (contextLength == null || contextLength <= 0) return '';
  return contextLength >= 1000 ? `${Math.round(contextLength / 1000)}K` : String(contextLength);
}

export default function LandingCatalogSection() {
  const {t} = useTranslation();
  const [catalog, setCatalog] = useState<PublicGlobalModel[]>([]);
  const [routedSnapshot, setRoutedSnapshot] = useState<RoutedRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [registryResult, routedResult] = await Promise.allSettled([
        apiGet<PublicGlobalModel[]>('/api/llm-models'),
        apiGet<RoutedRow[]>('/api/models'),
      ]);

      if (cancelled) return;

      const registry = registryResult.status === 'fulfilled' && Array.isArray(registryResult.value) ? registryResult.value : [];
      const routed = routedResult.status === 'fulfilled' && Array.isArray(routedResult.value) ? routedResult.value : [];
      const bothRequestsFailed = registryResult.status === 'rejected' && routedResult.status === 'rejected';

      const effectiveCatalog = registry.length > 0 ? registry : buildCatalogFallbackFromRouted(routed);

      setCatalog(effectiveCatalog);
      setRoutedSnapshot(routed);
      setCatalogError(bothRequestsFailed);
      setCatalogLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const catalogOrdered = useMemo(
    () => orderRegistryLikeModelsPage(catalog, routedSnapshot),
    [catalog, routedSnapshot],
  );

  const filteredCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) {
      return catalogOrdered;
    }

    return catalogOrdered.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(query));
  }, [catalogOrdered, catalogSearch]);

  const routedIdSet = useMemo(() => new Set(routedSnapshot.map((row) => row.id)), [routedSnapshot]);

  const routedProviderById = useMemo(() => {
    const providerById = new Map<string, string>();
    for (const row of routedSnapshot) {
      const provider = typeof row.provider === 'string' ? row.provider.trim() : '';
      if (provider && !providerById.has(row.id)) {
        providerById.set(row.id, provider);
      }
    }
    return providerById;
  }, [routedSnapshot]);

  return (
    <section id="models" className="border-t border-zinc-100 bg-zinc-50/40 py-14 sm:py-16">
      <div className={LANDING_CONTENT_COLUMN_CLASS}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">{t('landing.explorer_title')}</h2>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 sm:text-base">{t('landing.explorer_subtitle')}</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
            <input
              type="search"
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder={t('models.placeholder_search')}
              className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-3 text-sm text-zinc-900 shadow-sm outline-none ring-zinc-900/5 placeholder:text-zinc-400 focus:border-purple-300 focus:ring-4 focus:ring-purple-100"
            />
          </div>
        </div>

        <div className="mt-8">
          {catalogLoading ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center text-sm text-zinc-500 shadow-sm">
              {t('landing.models_loading')}
            </div>
          ) : catalogError ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center text-sm text-red-600 shadow-sm">
              {t('landing.models_error')}
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 text-center text-sm text-zinc-500 shadow-sm">
              {t('landing.models_empty')}
            </div>
          ) : (
            <div className={MODEL_CARD_GRID}>
              {filteredCatalog.map((model) => {
                const pricing = model.global_pricing || {};
                const isRouted = routedIdSet.has(model.id);
                const providerLine = isRouted
                  ? routedProviderById.get(model.id) || t('landing.model_provider_routed')
                  : t('models.catalog_no_provider');
                const context = contextShort(model.context_length);
                const description = t(`models.descriptions.${model.id}`, {
                  defaultValue: model.description || '',
                });
                const cacheRead = fmtUsdShort(pricing.cache_read);
                const reasoning = fmtUsdShort(pricing.reasoning);
                const showExtra = cacheRead !== '—' || reasoning !== '—';

                return (
                  <div key={model.id} className={MODEL_CARD_SHELL}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-zinc-50 text-sm font-bold text-zinc-400">
                          {isRouted ? (
                            <span className="leading-none">{providerLine ? providerLine[0] : '?'}</span>
                          ) : (
                            <Globe className="h-4 w-4 text-zinc-400" aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="flex flex-col gap-0.5 text-sm font-bold leading-snug text-zinc-900">
                            <span className="line-clamp-2">{model.name || model.id}</span>
                            <span className="w-fit max-w-full truncate rounded border border-zinc-200 bg-zinc-100 px-1 py-0.5 font-mono text-[10px] text-zinc-500">
                              {model.id}
                            </span>
                          </h3>
                          <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-400">{providerLine}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        {!isRouted && (
                          <span className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                            {t('models.catalog_badge')}
                          </span>
                        )}
                        {context ? (
                          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-300">{context}</span>
                        ) : null}
                      </div>
                    </div>

                    {description ? (
                      <p className="mb-3 line-clamp-3 flex-grow text-xs leading-relaxed text-zinc-500">{description}</p>
                    ) : (
                      <div className="mb-3 flex-grow" />
                    )}

                    <div className="mb-2 grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg border border-gray-50 bg-zinc-50/50 p-2">
                        <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                          {t('models.prompt')}
                        </p>
                        <p className="truncate font-mono text-[11px] font-semibold text-zinc-700">
                          {fmtUsdShort(pricing.prompt)}
                          <span className="ml-0.5 text-[9px] font-normal text-zinc-400">/1M</span>
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-50 bg-zinc-50/50 p-2">
                        <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                          {t('models.completion')}
                        </p>
                        <p className="truncate font-mono text-[11px] font-semibold text-zinc-700">
                          {fmtUsdShort(pricing.completion)}
                          <span className="ml-0.5 text-[9px] font-normal text-zinc-400">/1M</span>
                        </p>
                      </div>
                    </div>

                    {showExtra ? (
                      <div className="mb-2 grid grid-cols-2 gap-1.5 border-t border-gray-50/50 pt-1">
                        {cacheRead !== '—' ? (
                          <div className="rounded-lg border border-emerald-50/50 bg-emerald-50/30 p-2">
                            <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-500">
                              {t('models.cache_hit')}
                            </p>
                            <p className="truncate font-mono text-[11px] font-semibold text-emerald-700">{cacheRead}</p>
                          </div>
                        ) : (
                          <div />
                        )}
                        {reasoning !== '—' ? (
                          <div className="rounded-lg border border-indigo-50/50 bg-indigo-50/30 p-2">
                            <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-500">
                              {t('models.reasoning')}
                            </p>
                            <p className="truncate font-mono text-[11px] font-semibold text-indigo-700">{reasoning}</p>
                          </div>
                        ) : (
                          <div />
                        )}
                      </div>
                    ) : null}

                    <div className="mt-auto flex items-center gap-1 border-t border-gray-50 pt-2 text-[10px] font-medium text-zinc-400">
                      {isRouted ? (
                        <>
                          <Zap size={10} className="shrink-0 text-emerald-500" aria-hidden />
                          <span className="min-w-0 truncate">{t('landing.model_footer_routed')}</span>
                        </>
                      ) : (
                        <span className="min-w-0 truncate">{t('models.catalog_latency_hint')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}