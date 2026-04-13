import React from 'react';
import {useSearchParams} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import {cn} from '../lib/utils';
import RankingsView from './Rankings';
import ActivityView from './Activity';

type InsightsTab = 'rankings' | 'activity';

export default function InsightsView() {
  const {t} = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: InsightsTab =
    tabParam === 'activity' || tabParam === 'trends' ? 'activity' : 'rankings';

  const setTab = (next: InsightsTab) => {
    if (next === 'rankings') {
      setSearchParams({});
    } else {
      setSearchParams({tab: 'activity'});
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-4">
        <button
          type="button"
          onClick={() => setTab('rankings')}
          className={cn(
            'px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
            tab === 'rankings'
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-500 hover:text-black hover:bg-gray-50',
          )}
        >
          {t('navbar.rankings')}
        </button>
        <button
          type="button"
          onClick={() => setTab('activity')}
          className={cn(
            'px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
            tab === 'activity'
              ? 'bg-zinc-900 text-white'
              : 'text-zinc-500 hover:text-black hover:bg-gray-50',
          )}
        >
          {t('navbar.activity')}
        </button>
      </div>
      <div
        className={cn(tab !== 'rankings' && 'hidden')}
        aria-hidden={tab !== 'rankings'}
      >
        <RankingsView />
      </div>
      <div
        className={cn(tab !== 'activity' && 'hidden')}
        aria-hidden={tab !== 'activity'}
      >
        <ActivityView />
      </div>
    </div>
  );
}
