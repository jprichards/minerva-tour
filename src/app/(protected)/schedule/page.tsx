'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { createClient } from '@/lib/supabase/client';
import { Calendar, List, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Event, Season } from '@/types/database';
import { parseLocalDate, formatLocalDate } from '@/lib/date-utils';

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

  const getEventColor = (e: Event) => {
    if (e.is_playoff) return { dot: '#9333ea', bg: '#f3e8ff', text: '#7e22ce' };
    if (e.is_major) return { dot: '#d97706', bg: '#fef3c7', text: '#b45309' };
    if (e.event_number === 0) return { dot: '#0d9488', bg: '#ccfbf1', text: '#0f766e' };
    if (e.holes === 9) return { dot: '#2563eb', bg: '#dbeafe', text: '#1d4ed8' };
    return { dot: '#6652A3', bg: '#ede9f6', text: '#6652A3' };
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Schedule</h1>

      {/* Season + View Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 overflow-x-auto">
          {seasons.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSeason(s)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap ${
                selectedSeason?.id === s.id ? 'bg-minerva-600 text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
              }`}
            >
              {s.year}
            </button>
          ))}
        </div>
        <div className="flex bg-[var(--bg-subtle)] rounded-lg p-0.5">
          <button
            onClick={() => setView('list')}
            className={`p-1.5 rounded ${view === 'list' ? 'bg-[var(--bg-card)] shadow-[var(--shadow-sm)]' : ''}`}
          >
            <List className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`p-1.5 rounded ${view === 'calendar' ? 'bg-[var(--bg-card)] shadow-[var(--shadow-sm)]' : ''}`}
          >
            <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : view === 'list' ? (
        /* List View */
        <div className="space-y-2">
          {events.length === 0 ? (
            <p className="text-center text-[var(--text-faint)] text-sm py-8">No events scheduled.</p>
          ) : (
            events.map((event) => {
              const isActive = event.start_date <= todayStr && event.end_date >= todayStr;
              const isPast = event.end_date < todayStr;
              return (
                <div
                  key={event.id}
                  className={`bg-[var(--bg-card)] rounded-xl border shadow-[var(--shadow-sm)] p-4 ${
                    isActive ? 'border-minerva-300 bg-minerva-50/30' : 'border-[var(--border-light)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-[var(--bg-subtle)] rounded flex items-center justify-center text-xs font-bold text-[var(--text-muted)]">
                          {event.event_number}
                        </span>
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {event.name || `Event ${event.event_number}`}
                        </span>
                        {event.is_major && <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">Major</span>}
                        {event.is_playoff && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Playoff</span>}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {event.holes} holes &middot; {formatLocalDate(event.start_date)} &ndash; {formatLocalDate(event.end_date)}
                      </p>
                    </div>
                    {isActive && <span className="text-xs bg-minerva-600 text-white px-2 py-0.5 rounded-full font-medium">Active</span>}
                    {isPast && <span className="text-xs text-[var(--text-faint)]">Completed</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Calendar View */
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
              className="p-1 hover:bg-[var(--bg-subtle)] rounded"
            >
              <ChevronLeft className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <button
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
              className="p-1 hover:bg-[var(--bg-subtle)] rounded"
            >
              <ChevronRight className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-[var(--text-faint)] py-1">{d}</div>
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
                    isToday ? 'bg-minerva-600 text-white font-bold' :
                    dayEvents.length > 0 ? 'font-medium' :
                    'text-[var(--text-secondary)]'
                  }`}
                  style={!isToday && dayEvents.length > 0 ? { backgroundColor: getEventColor(dayEvents[0]).bg, color: getEventColor(dayEvents[0]).text } : undefined}
                >
                  {day}
                  {dayEvents.length > 0 && !isToday && (
                    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ backgroundColor: getEventColor(dayEvents[0]).dot }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Events in this month */}
          <div className="mt-4 space-y-1 border-t border-[var(--border-light)] pt-3">
            {events
              .filter((e) => {
                const startMonth = parseLocalDate(e.start_date).getMonth();
                const endMonth = parseLocalDate(e.end_date).getMonth();
                const cm = calendarMonth.getMonth();
                return startMonth === cm || endMonth === cm;
              })
              .map((e) => {
                const color = getEventColor(e);
                return (
                  <div key={e.id} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color.dot }} />
                    <span className="font-medium" style={{ color: color.text }}>{e.name || `Event ${e.event_number}`}</span>
                    <span className="text-[var(--text-faint)]">
                      {!e.is_playoff && e.event_number !== 0 && `${e.holes}H · `}{formatLocalDate(e.start_date, { month: 'short', day: 'numeric' })} &ndash; {formatLocalDate(e.end_date, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
