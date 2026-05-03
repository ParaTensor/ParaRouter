import React from 'react';
import {BookOpen, Check, Copy, KeyRound, LayoutGrid, Link2} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {cn} from '../lib/utils';

const SECTION_IDS = {
  intro: 'doc-intro',
  integration: 'doc-integration',
  params: 'doc-params',
  next: 'doc-next',
} as const;

export default function DocsView() {
  const {t} = useTranslation();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [codeTab, setCodeTab] = React.useState<'curl' | 'sdk'>('curl');

  const apiBase = React.useMemo(() => {
    const fromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
    if (fromEnv) return fromEnv;
    if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '');
    return '';
  }, []);

  const completionsUrl = `${apiBase}/v1/chat/completions`;

  const curlExample = React.useMemo(
    () =>
      `curl ${completionsUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_API_KEY>" \\
  -d '{"model":"<MODEL_ID>","messages":[{"role":"user","content":"Hello"}]}'`,
    [completionsUrl],
  );

  const sdkExample = React.useMemo(
    () =>
      `import OpenAI from "openai";
const client = new OpenAI({
  baseURL: "${apiBase}/v1",
  apiKey: process.env.PARAROUTER_API_KEY,
});`,
    [apiBase],
  );

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const paramRows = [
    {nameKey: 'docs.param_model', descKey: 'docs.param_model_desc'},
    {nameKey: 'docs.param_messages', descKey: 'docs.param_messages_desc'},
    {nameKey: 'docs.param_stream', descKey: 'docs.param_stream_desc'},
    {nameKey: 'docs.param_temperature', descKey: 'docs.param_temperature_desc'},
    {nameKey: 'docs.param_max_tokens', descKey: 'docs.param_max_tokens_desc'},
    {nameKey: 'docs.param_provider', descKey: 'docs.param_provider_desc'},
  ] as const;

  const reasoningTips = [
    t('docs.reasoning_tip_1'),
    t('docs.reasoning_tip_2'),
    t('docs.reasoning_tip_3'),
  ];

  const tocItems = [
    {id: SECTION_IDS.intro, labelKey: 'docs.intro_title'},
    {id: SECTION_IDS.integration, labelKey: 'docs.integration_title'},
    {id: SECTION_IDS.params, labelKey: 'docs.params_title'},
    {id: SECTION_IDS.next, labelKey: 'docs.cta_title'},
  ] as const;

  const CodeBlock = ({id, code}: {id: string; code: string}) => (
    <div className="relative group/code">
      <pre className="bg-zinc-950 text-zinc-300 p-4 rounded-xl text-[11px] sm:text-[12px] font-mono overflow-x-auto leading-relaxed border border-zinc-800 shadow-inner">
        {code}
      </pre>
      <button
        type="button"
        onClick={() => copyToClipboard(code, id)}
        className="absolute top-2 right-2 p-2 bg-zinc-800/90 text-zinc-400 rounded-lg opacity-0 group-hover/code:opacity-100 transition-opacity hover:text-white"
        aria-label={t('docs.copy_code')}
      >
        {copiedId === id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
      </button>
    </div>
  );

  const TocLink = ({to, children}: {to: string; children: React.ReactNode}) => (
    <a
      href={`#${to}`}
      className="block text-sm text-zinc-600 hover:text-black py-1.5 border-l-2 border-transparent hover:border-zinc-900 pl-3 -ml-px transition-colors"
    >
      {children}
    </a>
  );

  return (
    <div className="w-full max-w-6xl mx-auto pb-20 space-y-12">
      <header className="pt-4 space-y-5 border-b border-gray-200/90 pb-10">
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <span className="inline-flex items-center gap-2">
            <BookOpen size={14} className="text-zinc-400" aria-hidden />
            {t('docs.badge')}
          </span>
          <span className="h-3 w-px bg-zinc-200 hidden sm:block" aria-hidden />
          <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-700 normal-case tracking-normal">
            {t('docs.meta_compat')}
          </span>
        </div>
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-8">
          <div className="space-y-3 max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900">{t('docs.title')}</h1>
            <p className="text-lg text-zinc-600 leading-relaxed">{t('docs.subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {tocItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="lg:hidden rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-400 transition-colors"
              >
                {t(item.labelKey)}
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-stretch gap-3">
          <div className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-50 border-b border-gray-100 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              <Link2 size={13} className="text-zinc-400" aria-hidden />
              {t('docs.endpoint_label')}
            </div>
            <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="shrink-0 inline-flex items-center justify-center rounded-md bg-emerald-600/10 text-emerald-800 text-xs font-bold px-2 py-1">
                POST
              </span>
              <code className="text-[13px] sm:text-sm font-mono text-zinc-800 break-all">{completionsUrl}</code>
              <button
                type="button"
                onClick={() => copyToClipboard(completionsUrl, 'url')}
                className="sm:ml-auto shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-black border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-zinc-50 transition-colors"
              >
                {copiedId === 'url' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                {t('docs.copy_url')}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-10 xl:gap-12 items-start">
        <div className="min-w-0 space-y-8 lg:max-w-none">
          <section
            id={SECTION_IDS.intro}
            className="bg-white border border-gray-100 rounded-2xl p-6 sm:p-8 shadow-sm ring-1 ring-black/[0.02] scroll-mt-28"
          >
            <div className="flex gap-5">
              <div className="hidden sm:block w-1 rounded-full bg-purple-600 shrink-0" aria-hidden />
              <div className="space-y-3 min-w-0">
                <h2 className="text-xl font-bold text-zinc-900 tracking-tight">{t('docs.intro_title')}</h2>
                <p className="text-[15px] text-zinc-600 leading-relaxed">{t('docs.intro_body')}</p>
              </div>
            </div>
          </section>

          <section
            id={SECTION_IDS.integration}
            className="bg-white border border-gray-100 rounded-2xl p-6 sm:p-8 shadow-sm ring-1 ring-black/[0.02] space-y-8 scroll-mt-28"
          >
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">{t('docs.integration_title')}</h2>
            <div className="space-y-4 text-[15px] text-zinc-600 leading-relaxed" role="list">
              <div className="flex gap-4" role="listitem">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white text-sm font-bold"
                  aria-hidden
                >
                  1
                </span>
                <p className="pt-0.5">{t('docs.integration_step1')}</p>
              </div>
              <div className="flex gap-4" role="listitem">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white text-sm font-bold"
                  aria-hidden
                >
                  2
                </span>
                <p className="pt-0.5">{t('docs.integration_step2')}</p>
              </div>
              <div className="flex gap-4" role="listitem">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white text-sm font-bold"
                  aria-hidden
                >
                  3
                </span>
                <p className="pt-0.5">{t('docs.integration_step3')}</p>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-zinc-50/50 p-1">
              <div
                className="flex flex-wrap gap-1 p-1"
                role="tablist"
                aria-label={t('docs.code_examples_label')}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={codeTab === 'curl'}
                  onClick={() => setCodeTab('curl')}
                  className={cn(
                    'px-3 py-2 text-xs font-semibold rounded-lg transition-colors',
                    codeTab === 'curl'
                      ? 'bg-white text-zinc-900 shadow-sm border border-gray-100'
                      : 'text-zinc-600 hover:text-zinc-900',
                  )}
                >
                  {t('docs.integration_curl')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={codeTab === 'sdk'}
                  onClick={() => setCodeTab('sdk')}
                  className={cn(
                    'px-3 py-2 text-xs font-semibold rounded-lg transition-colors',
                    codeTab === 'sdk'
                      ? 'bg-white text-zinc-900 shadow-sm border border-gray-100'
                      : 'text-zinc-600 hover:text-zinc-900',
                  )}
                >
                  {t('docs.integration_sdk')}
                </button>
              </div>
              <div className="p-3 pt-0" role="tabpanel">
                {codeTab === 'curl' ? <CodeBlock id="curl" code={curlExample} /> : <CodeBlock id="sdk" code={sdkExample} />}
              </div>
            </div>
          </section>

          <section
            id={SECTION_IDS.params}
            className="bg-white border border-gray-100 rounded-2xl p-6 sm:p-8 shadow-sm ring-1 ring-black/[0.02] space-y-5 scroll-mt-28"
          >
            <div>
              <h2 className="text-xl font-bold text-zinc-900 tracking-tight">{t('docs.params_title')}</h2>
              <p className="mt-2 text-sm text-zinc-500">{t('docs.params_note')}</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
              <table className="w-full text-sm text-left min-w-[520px]">
                <thead>
                  <tr className="bg-zinc-50/90 border-b border-gray-100">
                    <th className="px-5 py-3.5 font-semibold text-zinc-800 w-[38%]">{t('docs.table_field')}</th>
                    <th className="px-5 py-3.5 font-semibold text-zinc-800">{t('docs.table_detail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paramRows.map((row, i) => (
                    <tr
                      key={row.nameKey}
                      className={cn('border-b border-gray-100 last:border-0', i % 2 === 1 && 'bg-zinc-50/40')}
                    >
                      <td className="px-5 py-3.5 font-mono text-[13px] text-zinc-900 align-top">{t(row.nameKey)}</td>
                      <td className="px-5 py-3.5 text-zinc-600 leading-relaxed">{t(row.descKey)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-amber-950">{t('docs.reasoning_title')}</h3>
                <p className="mt-1 text-sm text-amber-900/80">{t('docs.reasoning_intro')}</p>
              </div>
              <div className="space-y-2" role="list">
                {reasoningTips.map((tip) => (
                  <p key={tip} className="text-sm leading-relaxed text-amber-950/90" role="listitem">
                    {tip}
                  </p>
                ))}
              </div>
            </div>
          </section>

          <section
            id={SECTION_IDS.next}
            className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-2xl p-6 sm:p-8 shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 scroll-mt-28"
          >
            <div className="space-y-2 max-w-xl">
              <h2 className="text-xl font-bold tracking-tight">{t('docs.cta_title')}</h2>
              <p className="text-sm text-zinc-300 leading-relaxed">{t('docs.cta_body')}</p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Link
                to="/keys"
                className="inline-flex items-center gap-2 bg-white text-zinc-900 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-zinc-100 transition-colors"
              >
                <KeyRound size={16} aria-hidden />
                {t('docs.cta_keys')}
              </Link>
              <Link
                to="/models"
                className="inline-flex items-center gap-2 border border-white/25 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                <LayoutGrid size={16} aria-hidden />
                {t('docs.cta_models')}
              </Link>
            </div>
          </section>
        </div>

        <aside className="hidden lg:block sticky top-28">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ring-1 ring-black/[0.02] space-y-6">
            <nav aria-label={t('docs.toc_title')}>
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-3">{t('docs.toc_title')}</p>
              <div className="border-l border-zinc-200">
                {tocItems.map((item) => (
                  <TocLink key={item.id} to={item.id}>
                    {t(item.labelKey)}
                  </TocLink>
                ))}
              </div>
            </nav>
            <div className="border-t border-gray-100 pt-5 space-y-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{t('docs.quick_title')}</p>
              <dl className="space-y-3">
                <div>
                  <dt className="text-zinc-500 text-xs font-medium mb-1">{t('docs.quick_base')}</dt>
                  <dd>
                    <code className="text-[12px] font-mono text-zinc-900 break-all block bg-zinc-50 rounded-lg px-2.5 py-2 border border-gray-100">
                      {apiBase || '—'}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 text-xs font-medium mb-1">{t('docs.quick_path')}</dt>
                  <dd className="font-mono text-[13px] text-zinc-900">/v1/chat/completions</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 text-xs font-medium mb-1">{t('docs.quick_auth')}</dt>
                  <dd className="text-zinc-700 leading-snug">{t('docs.quick_auth_value')}</dd>
                </div>
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
