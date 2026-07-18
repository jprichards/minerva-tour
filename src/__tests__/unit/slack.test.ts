import { describe, it, expect, vi } from 'vitest';
import { formatSlackMessage, DEFAULT_SLACK_EVENTS } from '@/lib/slack';
import type { SlackNotifyPayload, SlackScorePayload, SlackFeedbackPayload, SlackPlayoffPayload } from '@/types/database';

// Mock chirps to return deterministic values
vi.mock('@/lib/chirps', () => ({
  getChirp: (netOverPar: number, ctx: { firstName: string }) =>
    `Mock chirp for ${ctx.firstName} at ${netOverPar > 0 ? '+' : ''}${netOverPar}`,
  getChirpFromTemplates: (_db: unknown, netOverPar: number, ctx: { firstName: string }) =>
    `Mock chirp for ${ctx.firstName} at ${netOverPar > 0 ? '+' : ''}${netOverPar}`,
}));

const basePayload: SlackScorePayload = {
  event_type: 'round_complete',
  player_name: 'John Smith',
  handicap_index: 12.4,
  course_name: 'Pine Valley',
  tee_name: 'White Tees',
  course_type: '18_holes',
  par: 72,
  gross_score: 85,
  net_score: 73,
  net_strokes_over_par: 1,
  holes_played: 18,
  max_holes: 18,
  tee_time: '2026-02-16T10:30:00Z',
  event_name: 'Event 3',
  is_complete: true,
};

function allBlockText(msg: { blocks: Array<{ type: string; text?: { text: string }; elements?: Array<{ text: string }> }> }): string {
  return msg.blocks.map((b) =>
    b.text?.text || b.elements?.map((e) => e.text).join('') || ''
  ).join('\n');
}

describe('formatSlackMessage', () => {
  describe('tee_time', () => {
    it('shows player name with handicap, course with holes, tee time, and Points: -', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'tee_time',
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('John Smith');
      expect(text).toContain('12.4');
      expect(text).toContain('Pine Valley - White Tees');
      expect(text).toContain('18 Holes');
      expect(text).toContain('Tee Time:');
      expect(text).toContain('Points: -');
    });

    it('formats tee time date with day of week and preserves the stored time (no timezone shift)', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'tee_time',
        tee_time: '2026-03-15T13:00:00Z',
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('Tee Time: Sunday, Mar 15 at 1:00 PM');
    });

    it('omits time portion when tee_time is midnight (no explicit time set)', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'tee_time',
        tee_time: '2026-03-15T00:00:00Z',
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('Tee Time: Sunday, Mar 15');
      expect(text).not.toContain('12:00 AM');
    });

    it('omits tee time line when no tee_time provided', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'tee_time',
        tee_time: null,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).not.toContain('Tee Time:');
      expect(text).toContain('Points: -');
    });

    it('omits handicap when not available', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'tee_time',
        handicap_index: null,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('*John Smith*');
      expect(text).not.toContain('12.4');
    });

    it('shows 9 Holes for 9_holes course type', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'tee_time',
        course_type: '9_holes',
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('9 Holes');
    });

    it('shows Front 9 / Back 9 for those course types', () => {
      const front = formatSlackMessage({ ...basePayload, event_type: 'tee_time', course_type: 'front_9' });
      const back = formatSlackMessage({ ...basePayload, event_type: 'tee_time', course_type: 'back_9' });

      expect(allBlockText(front)).toContain('Front 9');
      expect(allBlockText(back)).toContain('Back 9');
    });
  });

  describe('score_in_progress', () => {
    it('shows player with handicap, course, score line, and chirp', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'score_in_progress',
        holes_played: 14,
        is_complete: false,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('John Smith');
      expect(text).toContain('12.4');
      expect(text).toContain('Pine Valley - White Tees');
      expect(text).toContain('14 of 18');
      expect(text).toContain('Gross');
      expect(text).toContain('Mock chirp for John');
      // No projected points provided → falls back to dash
      expect(text).toContain('Points: -');
    });

    it('shows projected points when available', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'score_in_progress',
        holes_played: 14,
        is_complete: false,
        projected_net_points: 5,
        projected_scratch_points: 3,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('Points: Net 5 | Scratch 3');
      expect(text).not.toContain('Points: -');
    });

    it('shows only net points when scratch is null', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'score_in_progress',
        holes_played: 14,
        is_complete: false,
        projected_net_points: 7,
        projected_scratch_points: null,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('Points: Net 7');
      expect(text).not.toContain('Scratch');
    });

    it('does not include tee time line', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'score_in_progress',
        holes_played: 14,
        is_complete: false,
        tee_time: '2026-03-15T13:00:00Z',
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).not.toContain('Tee Time:');
    });

    it('omits chirp when no net_strokes_over_par', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'score_in_progress',
        net_strokes_over_par: null,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);
      expect(text).not.toContain('Mock chirp');
    });
  });

  describe('round_complete', () => {
    it('shows full player, course, score, and chirp lines with Points: - when no projected points', () => {
      const msg = formatSlackMessage(basePayload);
      const text = allBlockText(msg);

      expect(text).toContain('John Smith');
      expect(text).toContain('12.4');
      expect(text).toContain('Pine Valley - White Tees');
      expect(text).toContain('18 Holes');
      expect(text).toContain('Gross');
      expect(text).toContain('Net');
      expect(text).toContain('Mock chirp for John');
      expect(text).toContain('Points: -');
    });

    it('does not include tee time line', () => {
      const msg = formatSlackMessage(basePayload);
      const text = allBlockText(msg);

      expect(text).not.toContain('Tee Time:');
    });

    it('shows projected net and scratch points when available', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        projected_net_points: 8,
        projected_scratch_points: 4,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('Points: Net 8 | Scratch 4');
    });

    it('shows fractional points for ties', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        projected_net_points: 2.5,
        projected_scratch_points: 1.5,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('Points: Net 2.5 | Scratch 1.5');
    });

    it('rounds floating-point noise in points display', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        projected_net_points: 7.600000000000001,
        projected_scratch_points: 5.300000000000001,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('Points: Net 7.6 | Scratch 5.3');
      expect(text).not.toContain('7.600000');
      expect(text).not.toContain('5.300000');
    });

    it('rounds floating-point noise that resolves to whole numbers', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        projected_net_points: 10.999999999999998,
        projected_scratch_points: 8.000000000000002,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('Points: Net 11 | Scratch 8');
      expect(text).not.toContain('11.0');
      expect(text).not.toContain('8.0');
    });

    it('does not include divider (compact layout)', () => {
      const msg = formatSlackMessage(basePayload);
      const hasDivider = msg.blocks.some((b) => b.type === 'divider');
      expect(hasDivider).toBe(false);
    });

    it('handles no handicap (no net score)', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        handicap_index: null,
        net_score: null,
        net_strokes_over_par: null,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('Gross');
      expect(text).not.toContain('*Net:*');
    });
  });

  describe('score_edit', () => {
    it('shows player with handicap and before/after values', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'score_edit',
        old_gross_score: 82,
        old_net_score: 0,
        gross_score: 84,
        net_strokes_over_par: 2,
        holes_played: 18,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('John Smith');
      expect(text).toContain('12.4');
      expect(text).toContain('82');
      expect(text).toContain('84');
      expect(text).toContain('→');
    });

    it('handles edit with no old values', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'score_edit',
        old_gross_score: null,
        old_net_score: null,
      };

      const msg = formatSlackMessage(payload);
      expect(msg.blocks.length).toBeGreaterThanOrEqual(1);
      expect(allBlockText(msg)).toContain('John Smith');
    });
  });

  describe('retroactive', () => {
    it('shows player with handicap, course, score, and event name', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'retroactive',
        event_name: 'Regular Season #3',
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('John Smith');
      expect(text).toContain('12.4');
      expect(text).toContain('Pine Valley - White Tees');
      expect(text).toContain('Regular Season #3');
      expect(text).toContain('Points: -');
    });

    it('shows projected points when available', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'retroactive',
        event_name: 'Regular Season #3',
        projected_net_points: 6,
        projected_scratch_points: 2,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('Points: Net 6 | Scratch 2');
    });

    it('omits event line when no event name', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        event_type: 'retroactive',
        event_name: null,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).not.toContain('Event:');
    });
  });

  describe('edge cases', () => {
    it('handles partial rounds with holes_played < max_holes', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        holes_played: 9,
        max_holes: 18,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('*Thru:* 9 of 18');
    });

    it('shows Thru: F for completed 18-hole rounds', () => {
      const msg = formatSlackMessage(basePayload);
      const text = allBlockText(msg);

      expect(text).toContain('*Thru:* F');
      expect(text).not.toContain('18 of 18');
    });

    it('shows Thru: F for completed 9-hole rounds', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        course_type: '9_holes',
        holes_played: 9,
        max_holes: 9,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('*Thru:* F');
      expect(text).not.toContain('9 of 9');
    });

    it('shows thru without max_holes', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        max_holes: undefined,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('*Thru:* 18');
    });

    it('uses only section blocks (no header, title, context, or divider blocks)', () => {
      const msg = formatSlackMessage(basePayload);

      expect(msg.blocks.every((b) => b.type === 'section')).toBe(true);
      // Single block contains chirp, player, course, scores
      expect(msg.blocks[0].text?.text).toContain('John Smith');
    });

    it('always includes a fallback text string for score events', () => {
      const eventTypes: SlackScorePayload['event_type'][] = [
        'tee_time',
        'score_in_progress',
        'round_complete',
        'score_edit',
        'retroactive',
      ];

      for (const event_type of eventTypes) {
        const msg = formatSlackMessage({ ...basePayload, event_type });
        expect(msg.text).toBeTruthy();
        expect(typeof msg.text).toBe('string');
        expect(msg.text.length).toBeGreaterThan(0);
      }
    });

    it('includes a fallback text string for feedback events', () => {
      const feedbackPayload: SlackFeedbackPayload = {
        event_type: 'feedback_submitted',
        user_name: 'Jane Doe',
        feedback_type: 'bug',
        title: 'Something broke',
        description: 'Details here',
      };

      const msg = formatSlackMessage(feedbackPayload);
      expect(msg.text).toBeTruthy();
      expect(typeof msg.text).toBe('string');
      expect(msg.text.length).toBeGreaterThan(0);
    });
  });

  describe('feedback_submitted', () => {
    const feedbackPayload: SlackFeedbackPayload = {
      event_type: 'feedback_submitted',
      user_name: 'Jane Doe',
      feedback_type: 'bug',
      title: 'Login page broken',
      description: 'Cannot log in after the latest update.',
    };

    it('shows feedback type, user name, title, and description', () => {
      const msg = formatSlackMessage(feedbackPayload);
      const text = allBlockText(msg);

      expect(text).toContain('Bug Report');
      expect(text).toContain('Jane Doe');
      expect(text).toContain('Login page broken');
      expect(text).toContain('Cannot log in after the latest update.');
    });

    it('shows bug emoji for bug type', () => {
      const msg = formatSlackMessage(feedbackPayload);
      const text = allBlockText(msg);
      expect(text).toContain(':bug:');
    });

    it('shows bulb emoji for feature request type', () => {
      const msg = formatSlackMessage({ ...feedbackPayload, feedback_type: 'feature_request' });
      const text = allBlockText(msg);
      expect(text).toContain(':bulb:');
      expect(text).toContain('Feature Request');
    });

    it('shows speech balloon emoji for other type', () => {
      const msg = formatSlackMessage({ ...feedbackPayload, feedback_type: 'other' });
      const text = allBlockText(msg);
      expect(text).toContain(':speech_balloon:');
      expect(text).toContain('Other');
    });

    it('includes attachment links when provided', () => {
      const withAttachments: SlackFeedbackPayload = {
        ...feedbackPayload,
        attachments: [
          'https://storage.example.com/file1.png',
          'https://storage.example.com/file2.mp4',
        ],
      };

      const msg = formatSlackMessage(withAttachments);
      const text = allBlockText(msg);

      expect(text).toContain(':paperclip:');
      expect(text).toContain('Attachment 1');
      expect(text).toContain('Attachment 2');
      expect(text).toContain('https://storage.example.com/file1.png');
    });

    it('omits attachment section when no attachments', () => {
      const msg = formatSlackMessage(feedbackPayload);
      const text = allBlockText(msg);
      expect(text).not.toContain(':paperclip:');
      expect(text).not.toContain('Attachment');
    });

    it('omits attachment section for empty array', () => {
      const msg = formatSlackMessage({ ...feedbackPayload, attachments: [] });
      const text = allBlockText(msg);
      expect(text).not.toContain(':paperclip:');
    });

    it('uses only section blocks', () => {
      const msg = formatSlackMessage(feedbackPayload);
      expect(msg.blocks.every((b) => b.type === 'section')).toBe(true);
    });

    it('includes user name and type in fallback text', () => {
      const msg = formatSlackMessage(feedbackPayload);
      expect(msg.text).toContain('Jane Doe');
      expect(msg.text).toContain('Bug Report');
      expect(msg.text).toContain('Login page broken');
    });
  });

  describe('playoff events', () => {
    const basePlayoffPayload: SlackPlayoffPayload = {
      event_type: 'playoff_format_set',
      flight: 'championship',
      round: 2,
      round_label: 'Semifinal',
      player1_name: 'David Mustard',
      player2_name: 'Grady Bunn',
    };

    it('playoff_format_set names both players, the chosen format, and the flight/round', () => {
      const msg = formatSlackMessage({ ...basePlayoffPayload, format: 'match_play', holes: 36 });
      const text = allBlockText(msg);
      expect(text).toContain('David Mustard');
      expect(text).toContain('Grady Bunn');
      expect(text).toContain('Match Play');
      expect(text).toContain('36 holes');
      expect(text).toContain('Championship');
      expect(text).toContain('Semifinal');
    });

    it('playoff_match_start announces the matchup and format', () => {
      const msg = formatSlackMessage({
        ...basePlayoffPayload,
        event_type: 'playoff_match_start',
        format: 'match_play',
        holes: 18,
      });
      const text = allBlockText(msg);
      expect(text).toContain('Match started');
      expect(text).toContain('David Mustard');
      expect(text).toContain('Grady Bunn');
      expect(text).toContain('Match Play');
    });

    it('playoff_status_update includes the running status text on a single line, with no flight/round or hole number noise', () => {
      const msg = formatSlackMessage({
        ...basePlayoffPayload,
        event_type: 'playoff_status_update',
        status_text: '2 UP thru 7',
        hole_number: 7,
      });
      const text = allBlockText(msg);
      expect(text).toContain('2 UP thru 7');
      expect(text).not.toContain('Hole 7');
      expect(text).not.toContain('Championship');
      expect(text).not.toContain('Semifinal');
    });

    it('playoff_status_update prefixes the status text with the leader\'s first name so it is clear who is up', () => {
      const msg = formatSlackMessage({
        ...basePlayoffPayload,
        event_type: 'playoff_status_update',
        status_text: '2 UP thru 7',
        hole_number: 7,
        leader_first_name: 'Grady',
      });
      const text = allBlockText(msg);
      expect(text).toContain('Grady 2 UP thru 7');
    });

    it('playoff_status_update omits the leader name when the match is tied (no leader_first_name)', () => {
      const msg = formatSlackMessage({
        ...basePlayoffPayload,
        event_type: 'playoff_status_update',
        status_text: 'All Square thru 7',
        hole_number: 7,
        leader_first_name: null,
      });
      const text = allBlockText(msg);
      expect(text).toContain('David Mustard* vs *Grady Bunn* — All Square thru 7');
    });

    it('playoff_stroke_score includes the status text summary', () => {
      const msg = formatSlackMessage({
        ...basePlayoffPayload,
        event_type: 'playoff_stroke_score',
        status_text: 'David Mustard posted a net of E',
      });
      const text = allBlockText(msg);
      expect(text).toContain('David Mustard posted a net of E');
    });

    it('playoff_match_final announces the winner and loser with the closeout result', () => {
      const msg = formatSlackMessage({
        ...basePlayoffPayload,
        event_type: 'playoff_match_final',
        winner_name: 'David Mustard',
        status_text: '3 & 2',
      });
      const text = allBlockText(msg);
      expect(text).toContain('David Mustard');
      expect(text).toContain('defeats');
      expect(text).toContain('Grady Bunn');
      expect(text).toContain('3 & 2');
      expect(text).toContain('advances');
    });

    it('playoff_match_final does not say "defeats"/"advances" for the top-2-seed matchup, since both players advance regardless of this result', () => {
      const msg = formatSlackMessage({
        ...basePlayoffPayload,
        event_type: 'playoff_match_final',
        winner_name: 'David Mustard',
        status_text: '3 & 2',
        is_seed_selection_match: true,
      });
      const text = allBlockText(msg);
      expect(text).toContain('David Mustard');
      expect(text).toContain('Grady Bunn');
      expect(text).toContain('3 & 2');
      expect(text).toContain('seed matchup');
      expect(text).toContain('Round 2 opponent');
      expect(text).toContain('Both players advance');
      expect(text).not.toContain('defeats');
      expect(text).not.toContain('and advances!');
    });

    it('playoff_match_final falls back to the normal "defeats"/"advances" copy when is_seed_selection_match is false or omitted', () => {
      const msg = formatSlackMessage({
        ...basePlayoffPayload,
        event_type: 'playoff_match_final',
        winner_name: 'David Mustard',
        status_text: '3 & 2',
        is_seed_selection_match: false,
      });
      const text = allBlockText(msg);
      expect(text).toContain('defeats');
      expect(text).toContain('advances');
      expect(text).not.toContain('seed matchup');
    });

    it('playoff_round_complete announces the flight and round with matchup count, without needing player names', () => {
      const msg = formatSlackMessage({
        event_type: 'playoff_round_complete',
        flight: 'consolation',
        round: 1,
        round_label: 'Quarterfinal',
        matchup_count: 3,
      });
      const text = allBlockText(msg);
      expect(text).toContain('Quarterfinal');
      expect(text).toContain('Consolation');
      expect(text).toContain('3 matchups');
    });

    it('falls back to "Round N" when round_label is not provided', () => {
      const msg = formatSlackMessage({
        event_type: 'playoff_round_complete',
        flight: 'unicorn',
        round: 1,
        matchup_count: 1,
      });
      const text = allBlockText(msg);
      expect(text).toContain('Round 1');
    });

    it('always includes a fallback text string for every playoff event type', () => {
      const eventTypes: SlackPlayoffPayload['event_type'][] = [
        'playoff_format_set',
        'playoff_match_start',
        'playoff_status_update',
        'playoff_stroke_score',
        'playoff_match_final',
        'playoff_round_complete',
      ];

      for (const event_type of eventTypes) {
        const msg = formatSlackMessage({ ...basePlayoffPayload, event_type, winner_name: 'David Mustard' });
        expect(msg.text).toBeTruthy();
        expect(typeof msg.text).toBe('string');
        expect(msg.text.length).toBeGreaterThan(0);
      }
    });
  });

  describe('DEFAULT_SLACK_EVENTS', () => {
    it('ships playoff_stroke_score and playoff_format_set off by default, and the rest on', () => {
      expect(DEFAULT_SLACK_EVENTS.playoff_format_set).toBe(false);
      expect(DEFAULT_SLACK_EVENTS.playoff_stroke_score).toBe(false);
      expect(DEFAULT_SLACK_EVENTS.playoff_match_start).toBe(true);
      expect(DEFAULT_SLACK_EVENTS.playoff_status_update).toBe(true);
      expect(DEFAULT_SLACK_EVENTS.playoff_match_final).toBe(true);
      expect(DEFAULT_SLACK_EVENTS.playoff_round_complete).toBe(true);
    });

    it('defaults every regular-season event type to enabled', () => {
      expect(DEFAULT_SLACK_EVENTS.tee_time).toBe(true);
      expect(DEFAULT_SLACK_EVENTS.score_in_progress).toBe(true);
      expect(DEFAULT_SLACK_EVENTS.round_complete).toBe(true);
      expect(DEFAULT_SLACK_EVENTS.score_edit).toBe(true);
      expect(DEFAULT_SLACK_EVENTS.retroactive).toBe(true);
      expect(DEFAULT_SLACK_EVENTS.feedback_submitted).toBe(true);
    });
  });
});
