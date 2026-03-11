'use client';

import { useState, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useTourStats } from '@/lib/hooks/useTourStats';
import { useUser } from '@/lib/hooks/useUser';
import SeasonFilter from './components/SeasonFilter';
import PointsRaceChart from './components/PointsRaceChart';
import ActivityChart from './components/ActivityChart';
import ScoreDistribution from './components/ScoreDistribution';
import CourseExplorer from './components/CourseExplorer';
import TourRecords from './components/TourRecords';
import CourseDifficulty from './components/CourseDifficulty';
import HandicapTrends from './components/HandicapTrends';
import { HeadToHeadMatrix } from './components/HeadToHeadMatrix';

export default function TourStatsContent() {
  const { profile } = useUser();
  const [seasonYear, setSeasonYear] = useState<number | 'all'>(() => new Date().getFullYear());
  const { data, isLoading } = useTourStats(seasonYear);

  const members = useMemo(() => {
    if (!data?.members) return [];
    return data.members.map((m) => ({
      id: m.id,
      name: m.full_name || m.email || 'Unknown',
    }));
  }, [data?.members]);

  const isAllTime = seasonYear === 'all';

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-[var(--bg-skeleton)] rounded-lg animate-pulse" />
        <div className="h-[320px] bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!data || data.seasonEvents.length === 0) {
    return (
      <div className="space-y-4">
        <SeasonFilter
          seasons={data?.seasons || []}
          selectedYear={seasonYear}
          onChange={setSeasonYear}
        />
        <div className="text-center py-12">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">No event data available for this selection.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SeasonFilter
        seasons={data.seasons}
        selectedYear={seasonYear}
        onChange={setSeasonYear}
      />

      {isAllTime ? (
        <div className="bg-[var(--bg-subtle)] rounded-xl p-3">
          <p className="text-xs text-[var(--text-muted)] text-center">
            Points Race is only available for individual seasons.
          </p>
        </div>
      ) : (
        <PointsRaceChart
          scores={data.allScores}
          events={data.seasonEvents}
          members={members}
        />
      )}

      <ActivityChart
        scores={data.allScores}
        members={members}
      />

      <ScoreDistribution
        scores={data.allScores}
        currentUserId={profile?.id}
      />

      <CourseExplorer
        scores={data.allScores}
        members={members}
      />

      <TourRecords
        scores={data.allScores}
        events={data.seasonEvents}
        members={members}
      />

      <CourseDifficulty
        scores={data.allScores}
      />

      <HandicapTrends
        handicapHistory={data.handicapHistory}
        members={members}
      />

      <HeadToHeadMatrix
        scores={data.allScores}
        members={members}
      />
    </div>
  );
}
