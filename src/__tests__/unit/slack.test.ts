import { describe, it, expect, vi } from 'vitest';
import { formatSlackMessage } from '@/lib/slack';
import type { SlackNotifyPayload, SlackScorePayload, SlackFeedbackPayload } from '@/types/database';

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

      expect(text).toContain('9 of 18');
    });

    it('shows holes without max_holes', () => {
      const payload: SlackNotifyPayload = {
        ...basePayload,
        max_holes: undefined,
      };

      const msg = formatSlackMessage(payload);
      const text = allBlockText(msg);

      expect(text).toContain('*Holes:* 18');
    });

    it('uses only section blocks (no header, title, context, or divider blocks)', () => {
      const msg = formatSlackMessage(basePayload);

      expect(msg.blocks.every((b) => b.type === 'section')).toBe(true);
      // First block is the content section
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
});
