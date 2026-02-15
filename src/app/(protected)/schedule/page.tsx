'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { Calendar, List, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Event, Season } from '@/types/database';

type ViewMode = 'calendar' | 'list';

export default function SchedulePage() {
  const [view, setView] = useState<ViewMode>('list');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [pickedSeasonId, setPickedSeasonId] = useState<string | null>(null);
  const supabase = createClient();

  const { data: seasons = [], isLoading: seasonsLoading } = useSWR<Season[]>(
    'schedule-seasons',
    async () => {
      const { data } = await supabase.from('seasons').select('*').order('year', { ascending: false });
      return (data || []) as Season[];
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const selectedSeason = pickedSeasonId
    ? seasons.find((s) => s.id === pickedSeasonId) ?? null
    : seasons[0] ?? null;
  const setSelectedSeason = (s: Season) => setPickedSeasonId(s.id);

  const { data: events = [], isLoading: eventsLoading } = useSWR<Event[]>(
    selectedSeason ? ['schedule-events', selectedSeason.id] : null,
    async () => {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('season_id', selectedSeason!.id)
        .order('start_date');
      return (data || []) as Event[];
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const loading = seasonsLoading || eventsLoading;

  // Calendar helpers
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const days: (number | null)[] = [];

    for (let i = 0; i < startPad; i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(i);

    return days;
  }, [calendarMonth]);

  const getEventsForDay = (day: number) => {
    const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter((e) => e.start_date <= dateStr && e.end_date >= dateStr);
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>

      {/* Season + View Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 overflow-x-auto">
          {seasons.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSeason(s)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap ${
                selectedSeason?.id === s.id ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {s.year}
            </button>
          ))}
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setView('list')}
            className={`p-1.5 rounded ${view === 'list' ? 'bg-white shadow-sm' : ''}`}
          >
            <List className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`p-1.5 rounded ${view === 'calendar' ? 'bg-white shadow-sm' : ''}`}
          >
            <Calendar className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : view === 'list' ? (
        /* List View */
        <div className="space-y-2">
          {events.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No events scheduled.</p>
          ) : (
            events.map((event) => {
              const isActive = event.start_date <= todayStr && event.end_date >= todayStr;
              const isPast = event.end_date < todayStr;
              return (
                <div
                  key={event.id}
                  className={`bg-white rounded-xl border shadow-sm p-4 ${
                    isActive ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center text-xs font-bold text-gray-600">
                          {event.event_number}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {event.name || `Event ${event.event_number}`}
                        </span>
                        {event.is_major && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">Major</span>}
                        {event.is_playoff && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Playoff</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {event.holes} holes &middot; {new Date(event.start_date).toLocaleDateString()} &ndash; {new Date(event.end_date).toLocaleDateString()}
                      </p>
                    </div>
                    {isActive && <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full font-medium">Active</span>}
                    {isPast && <span className="text-xs text-gray-400">Completed</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Calendar View */
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h3 className="text-sm font-semibold text-gray-900">
              {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <button
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
            {calendarDays.map((day, idx) => {
              if (day === null) return <div key={idx} />;
              const dayEvents = getEventsForDay(day);
              const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              return (
                <div
                  key={idx}
                  className={`text-center py-1.5 rounded-lg text-xs relative ${
                    isToday ? 'bg-emerald-600 text-white font-bold' :
                    dayEvents.length > 0 ? 'bg-emerald-50 text-emerald-800 font-medium' :
                    'text-gray-700'
                  }`}
                >
                  {day}
                  {dayEvents.length > 0 && !isToday && (
                    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-emerald-500 rounded-full" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Events in this month */}
          <div className="mt-4 space-y-1 border-t border-gray-100 pt-3">
            {events
              .filter((e) => {
                const startMonth = new Date(e.start_date).getMonth();
                const endMonth = new Date(e.end_date).getMonth();
                const cm = calendarMonth.getMonth();
                return startMonth === cm || endMonth === cm;
              })
              .map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="font-medium text-gray-800">{e.name || `Event ${e.event_number}`}</span>
                  <span className="text-gray-400">
                    {new Date(e.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} &ndash; {new Date(e.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
