import { describe, it, expect } from 'vitest';
import type {
  UserRole,
  SeasonMode,
  CourseType,
  PlayoffFlight,
  AuditActionType,
  NotificationType,
  User,
  Score,
  Event,
  Season,
  Course,
  Tournament,
  Notification,
} from '@/types/database';

/**
 * Type-level tests to ensure our interfaces and type unions
 * are correct and cover all expected values.
 */
describe('Database Types', () => {
  describe('UserRole', () => {
    it('accepts all valid roles', () => {
      const roles: UserRole[] = ['admin', 'member', 'playing_guest', 'non_playing_guest'];
      expect(roles).toHaveLength(4);
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
  });
});
