// Database types matching the Supabase schema

export type UserRole = 'admin' | 'member' | 'playing_guest' | 'non_playing_guest' | 'inactive';

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
  | 'event_delete'
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
  | 'admin_edit_record'
  | 'update_playoff_matchup'
  | 'manage_playoff_seeds'
  | 'feedback_delete'
  | 'user_delete'
  | 'trophy_award'
  | 'trophy_edit'
  | 'trophy_delete'
  | 'set_current_event'
  | 'chirp_template_add'
  | 'chirp_template_edit'
  | 'chirp_template_delete'
  | 'user_seen'
  | 'feature_flag_toggle'
  | 'feature_flag_update';

export interface User {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  handicap_index: number | null;
  ghin_number: string | null;
  profile_picture_url: string | null;
  is_commissioner: boolean;
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
  handicap_allowance: number | null;
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
  scratch_strokes_over_rating: number | null;
  points_awarded: number | null;
  scratch_points_awarded: number | null;
  handicap_index_used: number | null;
  combined_with_score_id: string | null;
  is_retroactive: boolean;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  user?: User;
  course?: Course;
  event?: Event;
  submitter?: Pick<User, 'full_name' | 'email'>;
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
  player1_result: string | null;
  player2_result: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayoffSeed {
  id: string;
  season_id: string;
  user_id: string;
  seed_number: number;
  created_at: string;
  user?: User;
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
  standing_type: 'net' | 'scratch' | 'playoff';
  created_at: string;
  // Joined
  user?: User;
}

export type FeedbackType = 'bug' | 'feature_request' | 'other';

export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Feedback {
  id: string;
  user_id: string;
  type: FeedbackType;
  title: string;
  description: string;
  attachments: string[];
  status: FeedbackStatus;
  admin_response: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  user?: User;
  responder?: User;
}

export interface FeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  target_user_ids: string[];
  target_roles: string[];
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type SlackScoreEventType = 'tee_time' | 'score_in_progress' | 'round_complete' | 'score_edit' | 'retroactive';
export type SlackEventType = SlackScoreEventType | 'feedback_submitted';

export interface SlackConfig {
  bot_token: string;
  channel_id: string;
  channel_name: string;
  events: Record<SlackEventType, boolean>;
  feedback_channel_id?: string;
  feedback_channel_name?: string;
  recap_channel_id?: string;
  recap_channel_name?: string;
  recap_images_in_thread?: boolean;
  score_post_trigger?: ChirpTrigger;
}

export interface AIConfig {
  api_endpoint: string;
  api_key: string;
  model: string;
  system_prompt: string;
  max_tokens: number;
}

export type ChirpTrigger = 'round_complete' | 'nine_holes_complete' | 'all_score_updates';

export interface ChirpConfig {
  trigger: ChirpTrigger;
}

export type ChirpSource = 'manual' | 'ai';

export interface ChirpTemplate {
  id: string;
  bucket: string;
  template: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  queue_position: number | null;
  source: ChirpSource;
  archived_at: string | null;
}

export interface EventRecap {
  id: string;
  event_id: string;
  recap_text: string;
  commissioner_notes: string | null;
  event_net_image_url: string | null;
  event_scratch_image_url: string | null;
  season_net_image_url: string | null;
  season_scratch_image_url: string | null;
  posted_to_slack: boolean;
  slack_message_ts: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlackScorePayload {
  event_type: SlackScoreEventType;
  player_name: string;
  handicap_index?: number | null;
  course_name: string;
  tee_name: string;
  course_type?: CourseType;
  par: number;
  rating?: number;
  gross_score?: number | null;
  net_score?: number | null;
  net_strokes_over_par?: number | null;
  holes_played?: number | null;
  max_holes?: number;
  tee_time?: string | null;
  event_name?: string | null;
  is_complete?: boolean;
  old_gross_score?: number | null;
  old_net_score?: number | null;
  projected_net_points?: number | null;
  projected_scratch_points?: number | null;
}

export interface SlackFeedbackPayload {
  event_type: 'feedback_submitted';
  user_name: string;
  feedback_type: string;
  title: string;
  description: string;
  attachments?: string[];
}

export type SlackNotifyPayload = SlackScorePayload | SlackFeedbackPayload;

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
