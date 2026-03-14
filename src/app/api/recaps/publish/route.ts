import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import {
  StandingsImage,
  SideBySideStandings,
  computeImageWidth,
  computeImageHeight,
  computeSideBySideWidth,
  computeSideBySideHeight,
} from '@/lib/og-standings';
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

async function generateSideBySideImage(left: ImagePayload, right: ImagePayload): Promise<ArrayBuffer> {
  const width = computeSideBySideWidth();
  const height = computeSideBySideHeight(left.rows.length, right.rows.length);
  const response = new ImageResponse(
    SideBySideStandings({ left, right }),
    { width, height }
  );
  return response.arrayBuffer();
}

async function uploadImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  imageType: string,
  buffer: ArrayBuffer
): Promise<string | null> {
  const fileName = `${eventId}/${imageType}-${Date.now()}.png`;

  const { error: uploadError } = await supabase.storage
    .from('recaps')
    .upload(fileName, buffer, { contentType: 'image/png', upsert: true });

  if (uploadError) {
    console.error(`Failed to upload ${imageType}:`, uploadError);
    return null;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('recaps')
    .getPublicUrl(fileName);

  return publicUrl;
}

/**
 * POST /api/recaps/publish
 *
 * 1. Generates 3 standings images (event net, event scratch, season combined)
 * 2. Uploads them to Supabase Storage
 * 3. Posts the recap to Slack (images inline or threaded based on config)
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
    const imagesInThread = slackConfig.recap_images_in_thread === true;

    if (!slackConfig.bot_token || !channelId) {
      return NextResponse.json({ error: 'Slack bot token and channel required' }, { status: 400 });
    }

    // Generate and upload images
    const imageUrls: Record<string, string> = {};

    // Event net
    try {
      const buf = await generateStandingsImage(standings_images.event_net, true);
      const url = await uploadImage(supabase, event_id, 'event-net', buf);
      if (url) imageUrls.event_net = url;
    } catch (err) { console.error('Failed to generate event-net image:', err); }

    // Event scratch
    try {
      const buf = await generateStandingsImage(standings_images.event_scratch, true);
      const url = await uploadImage(supabase, event_id, 'event-scratch', buf);
      if (url) imageUrls.event_scratch = url;
    } catch (err) { console.error('Failed to generate event-scratch image:', err); }

    // Season combined (net + scratch side by side)
    try {
      const buf = await generateSideBySideImage(standings_images.season_net, standings_images.season_scratch);
      const url = await uploadImage(supabase, event_id, 'season-combined', buf);
      if (url) imageUrls.season_combined = url;
    } catch (err) { console.error('Failed to generate season-combined image:', err); }

    // Build image blocks (3 images)
    const imageBlocks: unknown[] = [];
    const imageOrder = [
      { key: 'event_net', alt: 'Event Standings - Net' },
      { key: 'event_scratch', alt: 'Event Standings - Scratch' },
      { key: 'season_combined', alt: 'Season Standings - Net & Scratch' },
    ];
    for (const { key, alt } of imageOrder) {
      if (imageUrls[key]) {
        imageBlocks.push({ type: 'image', image_url: imageUrls[key], alt_text: alt });
      }
    }

    // Build main message blocks (recap text)
    const mainBlocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${event_name} Recap`, emoji: true },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: event_dates }],
      },
    ];

    if (recap_text.length <= 3000) {
      mainBlocks.push({ type: 'section', text: { type: 'mrkdwn', text: recap_text } });
    } else {
      let remaining = recap_text;
      while (remaining.length > 0) {
        if (remaining.length <= 3000) {
          mainBlocks.push({ type: 'section', text: { type: 'mrkdwn', text: remaining } });
          break;
        }
        const splitAt = remaining.lastIndexOf('\n', 3000);
        const cutPoint = splitAt > 0 ? splitAt : 3000;
        mainBlocks.push({ type: 'section', text: { type: 'mrkdwn', text: remaining.slice(0, cutPoint) } });
        remaining = remaining.slice(cutPoint).trimStart();
      }
    }

    if (body.model) {
      mainBlocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `*_Generated by ${body.model}_*` }],
      });
    }

    // If images are inline, append them to the main message
    if (!imagesInThread && imageBlocks.length > 0) {
      mainBlocks.push({ type: 'divider' });
      mainBlocks.push(...imageBlocks);
    }

    // Post main message to Slack
    const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackConfig.bot_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelId,
        text: `${event_name} Recap`,
        blocks: mainBlocks,
      }),
    });

    const slackData = await slackResponse.json();

    if (!slackData.ok) {
      console.error('Slack post failed:', slackData.error, slackData.response_metadata);
      return NextResponse.json({ error: `Slack error: ${slackData.error}` }, { status: 502 });
    }

    // If images go in a thread, post them as a reply
    if (imagesInThread && imageBlocks.length > 0 && slackData.ts) {
      const threadResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${slackConfig.bot_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: channelId,
          thread_ts: slackData.ts,
          text: 'Standings',
          blocks: imageBlocks,
        }),
      });

      const threadData = await threadResponse.json();
      if (!threadData.ok) {
        console.error('Slack thread post failed:', threadData.error, threadData.response_metadata);
      }
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
        season_net_image_url: imageUrls.season_combined || null,
        season_scratch_image_url: null,
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
