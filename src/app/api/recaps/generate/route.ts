import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { AIConfig } from '@/types/database';

/**
 * POST /api/recaps/generate
 *
 * Reads AI config from app_settings, sends standings data to the configured
 * OpenAI-compatible endpoint, and returns the generated recap text.
 *
 * Body: { standings: object } — the full standings JSON payload
 * Returns: { recap_text: string } or error
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { standings } = await request.json();
    if (!standings) {
      return NextResponse.json({ error: 'standings payload is required' }, { status: 400 });
    }

    // Read AI config
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'ai_config')
      .single();

    if (!setting?.value) {
      return NextResponse.json({ error: 'AI not configured. Set up AI config in Admin Settings.' }, { status: 400 });
    }

    const config = setting.value as unknown as AIConfig;
    if (!config.api_endpoint || !config.api_key || !config.model) {
      return NextResponse.json({ error: 'Incomplete AI configuration. Check endpoint, API key, and model in Admin Settings.' }, { status: 400 });
    }

    const systemPrompt = config.system_prompt || 'Generate a brief event recap for a golf league based on the provided standings data.';
    const maxTokens = config.max_tokens || 700;

    const aiResponse = await fetch(config.api_endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(standings) },
        ],
        temperature: 0.9,
        max_tokens: maxTokens,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return NextResponse.json(
        { error: `AI provider returned ${aiResponse.status}: ${errorText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const aiData = await aiResponse.json();
    const rawText = aiData.choices?.[0]?.message?.content?.trim();
    // Collapse hard line wraps within paragraphs while preserving paragraph breaks (double newlines)
    const recapText = rawText
      ?.replace(/\r\n/g, '\n')
      .replace(/([^\n])\n(?!\n)/g, '$1 ')
      .replace(/\n{2,}/g, '\n\n');

    if (!recapText) {
      return NextResponse.json({ error: 'AI returned empty response' }, { status: 502 });
    }

    return NextResponse.json({ recap_text: recapText, model: config.model });
  } catch (error) {
    console.error('Recap generation error:', error);
    return NextResponse.json({ error: 'Failed to generate recap' }, { status: 500 });
  }
}
