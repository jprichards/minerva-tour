'use client';

import { useState } from 'react';
import MyStatsContent from './MyStatsContent';
import TourStatsContent from './TourStatsContent';

type StatsTab = 'my' | 'tour';

export default function StatsPage() {
  const [tab, setTab] = useState<StatsTab>('my');

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Tour Stats</h1>

      {/* Tab Toggle */}
      <div className="flex bg-[var(--bg-subtle)] rounded-xl p-1">
        <button
          onClick={() => setTab('my')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'my'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
              : 'text-[var(--text-muted)]'
          }`}
        >
          My Stats
        </button>
        <button
          onClick={() => setTab('tour')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'tour'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
              : 'text-[var(--text-muted)]'
          }`}
        >
          Tour Stats
        </button>
      </div>

      {tab === 'my' ? <MyStatsContent /> : <TourStatsContent />}
    </div>
  );
}
