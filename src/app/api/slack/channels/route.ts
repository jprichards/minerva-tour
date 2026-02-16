import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/slack/channels
 *
 * Lists public Slack channels using the provided bot token.
 * Requires an authenticated admin session.
 *
 * Body: { bot_token: string }
 * Returns: { channels: Array<{ id: string; name: string }> }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { bot_token } = body;

    if (!bot_token || typeof bot_token !== 'string') {
      return NextResponse.json({ error: 'bot_token is required' }, { status: 400 });
    }

    // Fetch channels from Slack API
    const slackResponse = await fetch('https://slack.com/api/conversations.list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        types: 'public_channel',
        exclude_archived: true,
        limit: 200,
      }),
    });

    const slackData = await slackResponse.json();

    if (!slackData.ok) {
      return NextResponse.json(
        { error: slackData.error || 'Failed to fetch channels from Slack' },
        { status: 400 }
      );
    }

    const channels = (slackData.channels || []).map((ch: { id: string; name: string }) => ({
      id: ch.id,
      name: ch.name,
    }));

    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Slack channels error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
