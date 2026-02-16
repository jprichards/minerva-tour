// Database types matching the Supabase schema

export type UserRole = 'admin' | 'member' | 'playing_guest' | 'non_playing_guest';

export type SeasonMode = 'off_season' | 'regular_season' | 'playoffs' | 'tournament';

export type CourseType = '18_holes' | '9_holes' | 'front_9' | 'back_9';

export type PlayoffFlight = 'championship' | 'consolation' | 'unicorn';

export type AuditActionType =
  | 'login'
  | 'logout'
  | 'score_submission'
  | 'score_edit'
  | 'score_delete'
  | 'course_add'
  | 'course_edit'
  | 'course_delete'
  | 'user_role_change'
  | 'user_provision'
  | 'event_create'
  | 'event_edit'
  | 'season_create'
  | 'season_mode_change'
  | 'handicap_update'
  | 'handicap_capture'
  | 'profile_update'
  | 'profile_picture_upload'
  | 'bridge_scores'
  | 'create_playoff_matchup'
  | 'set_playoff_winner'
  | 'create_tournament'
  | 'edit_tournament'
  | 'toggle_tournament'
  | 'update_settings'
  | 'admin_edit_record';

export interface User {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  handicap_index: number | null;
  ghin_number: string | null;
  profile_picture_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProvision {
  id: string;
  email: string;
  role: UserRole;
  provisioned_by: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
}

export interface HandicapHistory {
  id: string;
  user_id: string;
  handicap_index: number;
  effective_date: string;
  source: string | null;
  created_at: string;
}

export interface Season {
  id: string;
  year: number;
  mode: SeasonMode;
  current_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  season_id: string;
  event_number: number;
  name: string | null;
  start_date: string;
  end_date: string;
  holes: number;
  is_major: boolean;
  is_playoff: boolean;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  course_name: string;
  tee_name: string;
  type: CourseType;
  rating: number;
  slope: number;
  par: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  // Joined fields
  created_by_user?: User;
  updated_by_user?: User;
}

export interface Score {
  id: string;
  user_id: string;
  event_id: string | null;
  course_id: string;
  tee_time: string | null;
  gross_score: number | null;
  holes_played: number | null;
  is_complete: boolean;
  course_handicap: number | null;
  net_score: number | null;
  net_strokes_over_par: number | null;
  points_awarded: number | null;
  combined_with_score_id: string | null;
  is_retroactive: boolean;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  user?: User;
  course?: Course;
  event?: Event;
}

export interface PlayoffBracket {
  id: string;
  season_id: string;
  flight: PlayoffFlight;
  round: number;
  matchup_number: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action_type: AuditActionType;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  // Joined
  user?: User;
}

export interface Tournament {
  id: string;
  name: string;
  season_id: string | null;
  start_date: string;
  end_date: string;
  format: string | null;
  settings: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppSetting {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
}

export interface Trophy {
  id: string;
  user_id: string;
  year: number;
  award_type: string;
  award_name: string;
  description: string | null;
  emoji: string;
  created_at: string;
  // Joined
  user?: User;
}

export interface SeasonFinish {
  id: string;
  user_id: string;
  year: number;
  finish_position: string;
  created_at: string;
  // Joined
  user?: User;
}

export type NotificationType = 'event_start' | 'event_end' | 'score_posted' | 'handicap_update' | 'admin_message' | 'season_mode' | 'tournament' | 'general';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}
