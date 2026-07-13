import { describe, it, expect } from 'vitest';
import type {
  UserRole,
  SeasonMode,
  CourseType,
  PlayoffFlight,
  PlayoffFormat,
  PlayoffMatchStatus,
  PlayoffHoleResult,
  PlayoffBracket,
  PlayoffMatchHole,
  AuditActionType,
  NotificationType,
  User,
  Score,
  Event,
  Season,
  Course,
  Tournament,
  Notification,
  SlackEventType,
  PlayoffSlackEventType,
  SlackPlayoffPayload,
  SlackNotifyPayload,
} from '@/types/database';

/**
 * Type-level tests to ensure our interfaces and type unions
 * are correct and cover all expected values.
 */
describe('Database Types', () => {
  describe('UserRole', () => {
    it('accepts all valid roles', () => {
      const roles: UserRole[] = ['admin', 'member', 'playing_guest', 'non_playing_guest', 'inactive'];
      expect(roles).toHaveLength(5);
      roles.forEach((r) => expect(typeof r).toBe('string'));
    });
  });

  describe('SeasonMode', () => {
    it('accepts all valid modes', () => {
      const modes: SeasonMode[] = ['off_season', 'regular_season', 'playoffs', 'tournament'];
      expect(modes).toHaveLength(4);
    });
  });

  describe('CourseType', () => {
    it('accepts all valid types', () => {
      const types: CourseType[] = ['18_holes', '9_holes', 'front_9', 'back_9'];
      expect(types).toHaveLength(4);
    });
  });

  describe('PlayoffFlight', () => {
    it('accepts all valid flights', () => {
      const flights: PlayoffFlight[] = ['championship', 'consolation', 'unicorn'];
      expect(flights).toHaveLength(3);
    });
  });

  describe('PlayoffFormat', () => {
    it('accepts all valid formats', () => {
      const formats: PlayoffFormat[] = ['stroke_play', 'match_play'];
      expect(formats).toHaveLength(2);
    });
  });

  describe('PlayoffMatchStatus', () => {
    it('accepts all valid statuses', () => {
      const statuses: PlayoffMatchStatus[] = ['scheduled', 'in_progress', 'final'];
      expect(statuses).toHaveLength(3);
    });
  });

  describe('PlayoffHoleResult', () => {
    it('accepts all valid hole results', () => {
      const results: PlayoffHoleResult[] = ['player1', 'player2', 'halve'];
      expect(results).toHaveLength(3);
    });
  });

  describe('NotificationType', () => {
    it('accepts all valid types', () => {
      const types: NotificationType[] = [
        'event_start', 'event_end', 'score_posted', 'handicap_update',
        'admin_message', 'season_mode', 'tournament', 'general',
      ];
      expect(types).toHaveLength(8);
    });
  });

  describe('AuditActionType', () => {
    it('accepts all defined action types', () => {
      const actions: AuditActionType[] = [
        'login', 'logout', 'score_submission', 'score_edit', 'score_delete',
        'course_add', 'course_edit', 'course_delete',
        'user_role_change', 'user_provision',
        'event_create', 'event_edit', 'season_create', 'season_mode_change',
        'handicap_update', 'handicap_capture',
        'profile_update', 'profile_picture_upload',
        'bridge_scores', 'create_playoff_matchup', 'set_playoff_winner',
        'create_tournament', 'edit_tournament', 'toggle_tournament',
        'update_settings',
      ];
      expect(actions).toHaveLength(25);
    });
  });

  describe('Interface shapes', () => {
    it('User has all required fields', () => {
      const user: User = {
        id: 'abc-123',
        full_name: 'John Doe',
        email: 'john@example.com',
        role: 'member',
        handicap_index: 12.5,
        ghin_number: '1234567',
        profile_picture_url: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(user.id).toBeDefined();
      expect(user.role).toBe('member');
    });

    it('Score has all required fields including nullable', () => {
      const score: Score = {
        id: 'score-1',
        user_id: 'user-1',
        event_id: null,
        course_id: 'course-1',
        tee_time: null,
        gross_score: 85,
        holes_played: 18,
        is_complete: true,
        course_handicap: 12,
        net_score: 73,
        net_strokes_over_par: 1,
        points_awarded: 5,
        combined_with_score_id: null,
        is_retroactive: false,
        submitted_by: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(score.is_complete).toBe(true);
      expect(score.combined_with_score_id).toBeNull();
    });

    it('Season has mode field', () => {
      const season: Season = {
        id: 's-1',
        year: 2024,
        mode: 'regular_season',
        current_event_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(season.mode).toBe('regular_season');
    });

    it('Notification has all required fields', () => {
      const notif: Notification = {
        id: 'n-1',
        user_id: 'user-1',
        type: 'event_start',
        title: 'Event Started',
        body: 'Check the leaderboard',
        link: '/leaderboard',
        is_read: false,
        created_at: '2024-01-01T00:00:00Z',
      };
      expect(notif.is_read).toBe(false);
      expect(notif.type).toBe('event_start');
    });

    it('Tournament has all required fields', () => {
      const tourn: Tournament = {
        id: 't-1',
        name: 'Annual Championship',
        season_id: 's-1',
        start_date: '2024-06-01',
        end_date: '2024-06-03',
        format: 'stroke_play',
        settings: { flights: 2 },
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(tourn.is_active).toBe(true);
    });

    it('PlayoffBracket has all required fields including format/holes/status', () => {
      const bracket: PlayoffBracket = {
        id: 'b-1',
        season_id: 's-1',
        flight: 'championship',
        round: 1,
        matchup_number: 1,
        player1_id: 'u-1',
        player2_id: 'u-2',
        winner_id: null,
        player1_result: null,
        player2_result: null,
        event_id: null,
        format: 'match_play',
        holes: 18,
        status: 'scheduled',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(bracket.format).toBe('match_play');
      expect(bracket.holes).toBe(18);
      expect(bracket.status).toBe('scheduled');
    });

    it('PlayoffBracket allows a null format (undecided -> best-net stroke play)', () => {
      const bracket: Partial<PlayoffBracket> = { format: null, holes: 18, status: 'scheduled' };
      expect(bracket.format).toBeNull();
    });

    it('PlayoffMatchHole has all required fields', () => {
      const hole: PlayoffMatchHole = {
        id: 'h-1',
        matchup_id: 'b-1',
        hole_number: 7,
        result: 'player1',
        updated_by: 'u-1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(hole.hole_number).toBe(7);
      expect(hole.result).toBe('player1');
    });
  });

  describe('AuditActionType playoff additions', () => {
    it('includes the new playoffs self-service action types', () => {
      const actions: AuditActionType[] = ['set_playoff_format', 'log_playoff_hole', 'set_playoff_match_status'];
      expect(actions).toHaveLength(3);
    });
  });

  describe('PlayoffSlackEventType', () => {
    it('accepts all 6 playoff Slack event types', () => {
      const types: PlayoffSlackEventType[] = [
        'playoff_format_set',
        'playoff_match_start',
        'playoff_status_update',
        'playoff_stroke_score',
        'playoff_match_final',
        'playoff_round_complete',
      ];
      expect(types).toHaveLength(6);
    });

    it('is a member of the broader SlackEventType union', () => {
      const eventType: SlackEventType = 'playoff_match_final';
      expect(eventType).toBe('playoff_match_final');
    });
  });

  describe('SlackPlayoffPayload', () => {
    it('accepts a full matchup-scoped payload', () => {
      const payload: SlackPlayoffPayload = {
        event_type: 'playoff_status_update',
        flight: 'championship',
        round: 2,
        round_label: 'Semifinal',
        player1_name: 'David Mustard',
        player2_name: 'Grady Bunn',
        format: 'match_play',
        holes: 18,
        status_text: '2 UP thru 7',
        hole_number: 7,
      };
      expect(payload.event_type).toBe('playoff_status_update');
    });

    it('allows omitting player names for a round-scoped (not matchup-scoped) payload', () => {
      const payload: SlackPlayoffPayload = {
        event_type: 'playoff_round_complete',
        flight: 'consolation',
        round: 1,
        matchup_count: 3,
      };
      expect(payload.player1_name).toBeUndefined();
      expect(payload.matchup_count).toBe(3);
    });

    it('is assignable to the SlackNotifyPayload union', () => {
      const payload: SlackNotifyPayload = {
        event_type: 'playoff_match_final',
        flight: 'unicorn',
        round: 3,
        winner_name: 'David Mustard',
        status_text: '3 & 2',
      };
      expect(payload.event_type).toBe('playoff_match_final');
    });
  });
});
