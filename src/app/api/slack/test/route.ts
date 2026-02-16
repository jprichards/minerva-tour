import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/slack/test
 *
 * Posts a test message to the specified Slack channel to verify
 * the bot token and channel are configured correctly.
 * Requires an authenticated admin session.
 *
 * Body: { bot_token: string; channel_id: string }
 * Returns: { ok: true } or error
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { bot_token, channel_id } = body;

    if (!bot_token || !channel_id) {
      return NextResponse.json(
        { error: 'bot_token and channel_id are required' },
        { status: 400 }
      );
    }

    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channel_id,
        text: '🏌️ Minerva Tour is connected! Slack notifications are working.',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🏌️ Minerva Tour Connected*\nSlack notifications are working. You will see score updates, tee times, and round results here.',
            },
          },
        ],
      }),
    });

    const slackData = await slackResponse.json();

    if (!slackData.ok) {
      return NextResponse.json(
        { error: slackData.error || 'Failed to post test message' },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Slack test error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
