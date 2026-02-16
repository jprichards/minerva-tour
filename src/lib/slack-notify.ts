/**
 * Client-side helper to fire Slack notifications.
 *
 * Calls the server-side /api/slack/notify route in a fire-and-forget
 * pattern — failures are silently caught so score operations are
 * never blocked by Slack issues.
 */

import type { SlackNotifyPayload } from '@/types/database';

export function notifySlack(payload: SlackNotifyPayload): void {
  fetch('/api/slack/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Silent fail — Slack notifications are best-effort
  });
}
