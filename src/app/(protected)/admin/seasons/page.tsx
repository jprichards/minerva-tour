'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { captureHandicapsForEvent } from '@/lib/handicap-capture';
import Link from 'next/link';
import { ArrowLeft, Plus, Calendar, Edit, Save, X, Lock, Sparkles } from 'lucide-react';
import type { Season, Event, SeasonMode } from '@/types/database';

const modes: { value: SeasonMode; label: string; color: string }[] = [
  { value: 'off_season', label: 'Off Season', color: 'bg-[var(--bg-subtle)] text-[var(--text-muted)]' },
  { value: 'regular_season', label: 'Regular Season', color: 'bg-minerva-100 text-minerva-700' },
  { value: 'playoffs', label: 'Playoffs', color: 'bg-purple-100 text-purple-700' },
  { value: 'tournament', label: 'Tournament', color: 'bg-amber-100 text-amber-700' },
];

export default function AdminSeasonsPage() {
  const { isAdmin, loading: userLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const supabase = createClient();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [events, setEvents] = useState<Record<string, Event[]>>({});
  const [loading, setLoading] = useState(true);
  const [showAddSeason, setShowAddSeason] = useState(false);
  const [newSeasonYear, setNewSeasonYear] = useState(new Date().getFullYear());
  const [showAddEvent, setShowAddEvent] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<string | null>(null);

  // New event fields
  const [eventNumber, setEventNumber] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventHoles, setEventHoles] = useState('18');
  const [eventIsMajor, setEventIsMajor] = useState(false);
  const [eventIsPlayoff, setEventIsPlayoff] = useState(false);

  useEffect(() => {
    if (!userLoading && !isAdmin) router.push('/home');
  }, [isAdmin, userLoading, router]);

  const fetchData = async () => {
    const { data: seasonsData } = await supabase
      .from('seasons')
      .select('*')
      .order('year', { ascending: false });
    setSeasons(seasonsData || []);

    // Fetch events for each season
    if (seasonsData) {
      const eventsMap: Record<string, Event[]> = {};
      for (const season of seasonsData) {
        const { data: eventsData } = await supabase
          .from('events')
          .select('*')
          .eq('season_id', season.id)
          .order('event_number');
        eventsMap[season.id] = eventsData || [];
      }
      setEvents(eventsMap);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [supabase]);

  const handleCreateSeason = async () => {
    const { data, error } = await supabase
      .from('seasons')
      .insert({ year: newSeasonYear, mode: 'off_season' })
      .select()
      .single();

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    await logAuditEvent('season_create', 'season', data.id, { year: newSeasonYear });
    showToast('Season created!');
    setShowAddSeason(false);
    fetchData();
  };

  const handleModeChange = async (season: Season, newMode: SeasonMode) => {
    const { error } = await supabase
      .from('seasons')
      .update({ mode: newMode })
      .eq('id', season.id);

    if (error) {
      showToast('Failed to change mode.', 'error');
      return;
    }

    await logAuditEvent('season_mode_change', 'season', season.id, {
      before: season.mode,
      after: newMode,
    });

    showToast(`Mode changed to ${newMode.replace(/_/g, ' ')}!`);
    fetchData();
  };

  const handleSetCurrentEvent = async (season: Season, eventId: string | null) => {
    const { error } = await supabase
      .from('seasons')
      .update({ current_event_id: eventId })
      .eq('id', season.id);

    if (error) {
      showToast('Failed to set current event.', 'error');
      return;
    }

    const seasonEvents = events[season.id] || [];
    const event = seasonEvents.find((e) => e.id === eventId);
    await logAuditEvent('set_current_event', 'season', season.id, {
      season_year: season.year,
      event_id: eventId,
      event_name: event?.name || null,
    });

    showToast('Current event updated!');
    fetchData();
  };

  const handleCreateEvent = async (seasonId: string) => {
    const { data, error } = await supabase
      .from('events')
      .insert({
        season_id: seasonId,
        event_number: parseInt(eventNumber),
        name: eventName || null,
        start_date: eventStartDate,
        end_date: eventEndDate,
        holes: parseInt(eventHoles),
        is_major: eventIsMajor,
        is_playoff: eventIsPlayoff,
      })
      .select()
      .single();

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    await logAuditEvent('event_create', 'event', data.id, {
      event_number: parseInt(eventNumber),
      name: eventName,
      start_date: eventStartDate,
      end_date: eventEndDate,
    });

    showToast('Event created!');
    setShowAddEvent(null);
    resetEventFields();
    fetchData();
  };

  const resetEventFields = () => {
    setEventNumber('');
    setEventName('');
    setEventStartDate('');
    setEventEndDate('');
    setEventHoles('18');
    setEventIsMajor(false);
    setEventIsPlayoff(false);
  };

  const handleEditEvent = (event: Event) => {
    setEditingEvent(event.id);
    setEventNumber(String(event.event_number));
    setEventName(event.name || '');
    setEventStartDate(event.start_date);
    setEventEndDate(event.end_date);
    setEventHoles(String(event.holes));
    setEventIsMajor(event.is_major);
    setEventIsPlayoff(event.is_playoff);
  };

  const handleSaveEvent = async (event: Event) => {
    const { error } = await supabase
      .from('events')
      .update({
        event_number: parseInt(eventNumber),
        name: eventName || null,
        start_date: eventStartDate,
        end_date: eventEndDate,
        holes: parseInt(eventHoles),
        is_major: eventIsMajor,
        is_playoff: eventIsPlayoff,
      })
      .eq('id', event.id);

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    await logAuditEvent('event_edit', 'event', event.id, {
      before: { start_date: event.start_date, end_date: event.end_date },
      after: { start_date: eventStartDate, end_date: eventEndDate },
    });

    showToast('Event updated!');
    setEditingEvent(null);
    resetEventFields();
    fetchData();
  };

  const handleCaptureHandicaps = async (season: Season, event: Event) => {
    if (!confirm(`Capture handicaps for all members for "${event.name || 'Event ' + event.event_number}"?`)) return;
    const result = await captureHandicapsForEvent(supabase, event.id, season.id);
    if (result.errors.length > 0) {
      showToast(`Captured ${result.captured} handicaps (${result.errors.length} errors)`, 'error');
    } else {
      showToast(`Captured ${result.captured} handicaps!`, 'success');
    }
    logAuditEvent('handicap_capture', 'event', event.id, { captured: result.captured, errors: result.errors });
  };

  if (!isAdmin) return null;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-lg hover:bg-[var(--bg-subtle)]">
          <ArrowLeft className="w-5 h-5 text-[var(--text-muted)]" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Seasons & Events</h1>
      </div>

      <button
        onClick={() => setShowAddSeason(!showAddSeason)}
        className="flex items-center gap-1.5 bg-minerva-600 text-white text-sm font-medium px-4 py-2 rounded-xl"
      >
        <Plus className="w-4 h-4" />
        New Season
      </button>

      {showAddSeason && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-[var(--text-muted)] font-medium">Year</label>
            <input
              type="number"
              value={newSeasonYear}
              onChange={(e) => setNewSeasonYear(parseInt(e.target.value))}
              className="w-full mt-1 rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleCreateSeason}
            className="bg-minerva-600 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            Create
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {seasons.map((season) => (
            <div key={season.id} className="space-y-3">
              {/* Season Header */}
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">{season.year} Season</h2>
                  <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
                    modes.find((m) => m.value === season.mode)?.color || ''
                  }`}>
                    {season.mode.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Mode Switcher */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {modes.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => handleModeChange(season, m.value)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                        season.mode === m.value
                          ? 'bg-minerva-600 text-white'
                          : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-skeleton)]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Events */}
              <div className="space-y-2">
                {(events[season.id] || []).map((event) => (
                  <div key={event.id} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] p-3">
                    {editingEvent === event.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" value={eventNumber} onChange={(e) => setEventNumber(e.target.value)} placeholder="#" className="rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-2 py-1.5 text-sm" />
                          <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Name (optional)" className="rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-2 py-1.5 text-sm" />
                          <input type="date" value={eventStartDate} onChange={(e) => setEventStartDate(e.target.value)} className="rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-2 py-1.5 text-sm" />
                          <input type="date" value={eventEndDate} onChange={(e) => setEventEndDate(e.target.value)} className="rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-2 py-1.5 text-sm" />
                        </div>
                        <div className="flex items-center gap-4">
                          <select value={eventHoles} onChange={(e) => setEventHoles(e.target.value)} className="rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-2 py-1.5 text-sm">
                            <option value="9">9 holes</option>
                            <option value="18">18 holes</option>
                            <option value="36">36 holes</option>
                          </select>
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" checked={eventIsMajor} onChange={(e) => setEventIsMajor(e.target.checked)} />
                            Major
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" checked={eventIsPlayoff} onChange={(e) => setEventIsPlayoff(e.target.checked)} />
                            Playoff
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveEvent(event)} className="flex items-center gap-1 bg-minerva-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                            <Save className="w-3 h-3" /> Save
                          </button>
                          <button onClick={() => { setEditingEvent(null); resetEventFields(); }} className="flex items-center gap-1 bg-[var(--bg-subtle)] text-[var(--text-muted)] rounded-lg px-3 py-1.5 text-xs font-medium">
                            <X className="w-3 h-3" /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-[var(--bg-subtle)] rounded flex items-center justify-center">
                            <span className="text-xs font-bold text-[var(--text-muted)]">{event.event_number}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {event.name || `Event ${event.event_number}`}
                              {event.is_major && <span className="ml-1 text-xs text-yellow-600 font-semibold">Major</span>}
                              {event.is_playoff && <span className="ml-1 text-xs text-purple-600 font-semibold">Playoff</span>}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {event.holes}h &middot; {new Date(event.start_date).toLocaleDateString()} — {new Date(event.end_date).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {season.current_event_id === event.id ? (
                            <span className="text-xs bg-minerva-100 text-minerva-700 px-2 py-0.5 rounded font-medium">Active</span>
                          ) : (
                            <button
                              onClick={() => handleSetCurrentEvent(season, event.id)}
                              className="text-xs text-minerva-600 font-medium"
                            >
                              Set Active
                            </button>
                          )}
                          <Link
                            href={`/admin/recaps/${event.id}`}
                            className="p-1 hover:bg-orange-50 rounded"
                            title="Generate recap"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                          </Link>
                          <button
                            onClick={() => handleCaptureHandicaps(season, event)}
                            className="p-1 hover:bg-yellow-50 rounded"
                            title="Capture handicaps for this event"
                          >
                            <Lock className="w-3.5 h-3.5 text-yellow-600" />
                          </button>
                          <button onClick={() => handleEditEvent(event)} className="p-1 hover:bg-[var(--bg-subtle)] rounded">
                            <Edit className="w-3.5 h-3.5 text-[var(--text-faint)]" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add Event */}
                {showAddEvent === season.id ? (
                  <div className="bg-[var(--bg-card)] rounded-xl border border-minerva-200 shadow-[var(--shadow-sm)] p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" value={eventNumber} onChange={(e) => setEventNumber(e.target.value)} placeholder="Event #" className="rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-2 py-1.5 text-sm" />
                      <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Name (opt)" className="rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-2 py-1.5 text-sm" />
                      <input type="date" value={eventStartDate} onChange={(e) => setEventStartDate(e.target.value)} className="rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-2 py-1.5 text-sm" />
                      <input type="date" value={eventEndDate} onChange={(e) => setEventEndDate(e.target.value)} className="rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-2 py-1.5 text-sm" />
                    </div>
                    <div className="flex items-center gap-4">
                      <select value={eventHoles} onChange={(e) => setEventHoles(e.target.value)} className="rounded-lg border bg-[var(--input-bg)] border-[var(--input-border)] px-2 py-1.5 text-sm">
                        <option value="9">9 holes</option>
                        <option value="18">18 holes</option>
                        <option value="36">36 holes</option>
                      </select>
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={eventIsMajor} onChange={(e) => setEventIsMajor(e.target.checked)} />
                        Major
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={eventIsPlayoff} onChange={(e) => setEventIsPlayoff(e.target.checked)} />
                        Playoff
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleCreateEvent(season.id)} className="flex-1 bg-minerva-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
                        Add Event
                      </button>
                      <button onClick={() => { setShowAddEvent(null); resetEventFields(); }} className="flex-1 bg-[var(--bg-subtle)] text-[var(--text-muted)] rounded-lg px-3 py-1.5 text-xs font-medium">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowAddEvent(season.id); resetEventFields(); }}
                    className="flex items-center justify-center gap-1.5 w-full bg-[var(--bg-page)] text-[var(--text-muted)] rounded-xl py-2 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Event
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
