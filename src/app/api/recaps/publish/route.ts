import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { StandingsImage, computeImageWidth, computeImageHeight } from '@/lib/og-standings';
import type { StandingsRow } from '@/lib/og-standings';
import type { SlackConfig } from '@/types/database';

interface ImagePayload {
  title: string;
  subtitle: string;
  rows: StandingsRow[];
  columns?: { value: string; secondary?: string };
}

interface PublishBody {
  event_id: string;
  recap_text: string;
  commissioner_notes?: string;
  standings_images: {
    event_net: ImagePayload;
    event_scratch: ImagePayload;
    season_net: ImagePayload;
    season_scratch: ImagePayload;
  };
  event_name: string;
  event_dates: string;
  model?: string;
}

async function generateStandingsImage(data: ImagePayload, showCourse: boolean): Promise<ArrayBuffer> {
  const hasSecondary = !!data.columns?.secondary;
  const width = computeImageWidth(showCourse, hasSecondary);
  const height = computeImageHeight(data.rows.length);
  const response = new ImageResponse(
    StandingsImage({ title: data.title, subtitle: data.subtitle, rows: data.rows, showCourse, columns: data.columns }),
    { width, height }
  );
  return response.arrayBuffer();
}

/**
 * POST /api/recaps/publish
 *
 * 1. Generates 4 standings images directly via ImageResponse
 * 2. Uploads them to Supabase Storage
 * 3. Posts the recap + images to Slack
 * 4. Saves the recap to event_recaps table
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
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body: PublishBody = await request.json();
    const { event_id, recap_text, commissioner_notes, standings_images, event_name, event_dates } = body;

    if (!event_id || !recap_text || !standings_images) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Read Slack config
    const { data: slackSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'slack_config')
      .single();

    if (!slackSetting?.value) {
      return NextResponse.json({ error: 'Slack not configured' }, { status: 400 });
    }

    const slackConfig = slackSetting.value as unknown as SlackConfig;
    const channelId = slackConfig.recap_channel_id || slackConfig.channel_id;

    if (!slackConfig.bot_token || !channelId) {
      return NextResponse.json({ error: 'Slack bot token and channel required' }, { status: 400 });
    }

    // Generate images directly and upload to storage
    const imageConfigs = [
      { key: 'event_net', type: 'event-net', data: standings_images.event_net, showCourse: true },
      { key: 'event_scratch', type: 'event-scratch', data: standings_images.event_scratch, showCourse: true },
      { key: 'season_net', type: 'season-net', data: standings_images.season_net, showCourse: false },
      { key: 'season_scratch', type: 'season-scratch', data: standings_images.season_scratch, showCourse: false },
    ] as const;

    const imageUrls: Record<string, string> = {};

    for (const config of imageConfigs) {
      try {
        const imageBuffer = await generateStandingsImage(config.data, config.showCourse);
        const fileName = `${event_id}/${config.type}-${Date.now()}.png`;

        const { error: uploadError } = await supabase.storage
          .from('recaps')
          .upload(fileName, imageBuffer, {
            contentType: 'image/png',
            upsert: true,
          });

        if (uploadError) {
          console.error(`Failed to upload ${config.type}:`, uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('recaps')
          .getPublicUrl(fileName);

        imageUrls[config.key] = publicUrl;
      } catch (imgErr) {
        console.error(`Failed to generate ${config.type} image:`, imgErr);
      }
    }

    // Build Slack Block Kit message
    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${event_name} Recap`, emoji: true },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: event_dates }],
      },
    ];

    // Section text blocks have a 3000 char limit; split if needed
    if (recap_text.length <= 3000) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: recap_text } });
    } else {
      let remaining = recap_text;
      while (remaining.length > 0) {
        if (remaining.length <= 3000) {
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: remaining } });
          break;
        }
        const splitAt = remaining.lastIndexOf('\n', 3000);
        const cutPoint = splitAt > 0 ? splitAt : 3000;
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: remaining.slice(0, cutPoint) } });
        remaining = remaining.slice(cutPoint).trimStart();
      }
    }

    if (body.model) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `_Generated by ${body.model}_` }],
      });
    }

    blocks.push({ type: 'divider' });

    const imageLabels: Record<string, string> = {
      event_net: 'Event Standings - Net',
      event_scratch: 'Event Standings - Scratch',
      season_net: 'Season Standings - Net',
      season_scratch: 'Season Standings - Scratch',
    };

    const imageKeys = ['event_net', 'event_scratch', 'season_net', 'season_scratch'] as const;
    for (const key of imageKeys) {
      if (imageUrls[key]) {
        blocks.push({
          type: 'image',
          image_url: imageUrls[key],
          alt_text: imageLabels[key],
        });
      }
    }

    // Post to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackConfig.bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        text: `${event_name} Recap`,
        blocks,
      }),
    });

    const slackData = await slackResponse.json();

    if (!slackData.ok) {
      console.error('Slack post failed:', slackData.error, slackData.response_metadata);
      return NextResponse.json({ error: `Slack error: ${slackData.error}` }, { status: 502 });
    }

    // Save/update the recap in the database
    const { error: dbError } = await supabase
      .from('event_recaps')
      .upsert({
        event_id,
        recap_text,
        commissioner_notes: commissioner_notes || null,
        event_net_image_url: imageUrls.event_net || null,
        event_scratch_image_url: imageUrls.event_scratch || null,
        season_net_image_url: imageUrls.season_net || null,
        season_scratch_image_url: imageUrls.season_scratch || null,
        posted_to_slack: true,
        slack_message_ts: slackData.ts || null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'event_id' });

    if (dbError) {
      console.error('Failed to save recap:', dbError);
    }

    return NextResponse.json({
      ok: true,
      slack_ts: slackData.ts,
      image_urls: imageUrls,
    });
  } catch (error) {
    console.error('Recap publish error:', error);
    return NextResponse.json({ error: 'Failed to publish recap' }, { status: 500 });
  }
}
