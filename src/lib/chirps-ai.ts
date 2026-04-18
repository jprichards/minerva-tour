/**
 * Chirps AI Generation — shared utility for generating chirp templates via LLM.
 *
 * Used by:
 * - POST /api/chirps/generate (manual "Generate More" / "Initialize Queue")
 * - Slack notify route (auto-replenish after queue consumption)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ALL_BUCKETS, BUCKET_LABELS, CHIRP_TEMPLATES, CHIRP_WILDCARDS, NO_CHIRP_BUCKETS, type ChirpBucket } from '@/lib/chirps';
import type { AIConfig } from '@/types/database';

export const CHIRPS_QUEUE_TARGET = 10;

const EXAMPLE_CHIRPS_PER_BUCKET = 3;

const DEFAULT_CHIRP_SYSTEM_PROMPT = `You are the trash-talk writer for a men's golf league called Monday Tour. Your job is to write short, one-liner chirps that get sent to the group chat when someone posts a score.

TONE & STYLE:
- The tone varies by bucket (see below) — from mega hype to full roast.
- Profanity is welcome where appropriate. Over-the-top insults and dark humor are fair game for roast buckets.
- No sexual innuendo or sexual jokes.
- Pop culture references, sports analogies, and creative metaphors land well.
- British/Scottish golf humor is a nice touch but not required.

FORMAT:
- Each chirp must be exactly ONE sentence. Short, punchy, and quotable.
- Every chirp MUST include $first_name. Other placeholders are optional.

AVAILABLE PLACEHOLDERS:
- $first_name — Player's first name (REQUIRED in every chirp)
- $course — Course name
- $gross — Gross score (e.g. 82)
- $net — Net strokes over par (e.g. +7, -2)
- $holes — Holes played (e.g. 14)
- $handicap — Handicap index (e.g. 24.2)

CHIRP BUCKETS AND TONE (by net score relative to par):
- Legendary (net -5 or better): MEGA HYPE. This player crushed it — gas them up hard, pure celebration, no sarcasm.
- Excellent (net -4 to -1): POSITIVE. Great round, genuine props — can be playful but the vibe is complimentary, not backhanded.
- Neutral (net E to +1): DECENT, POSITIVE-LEANING. A chill nod — not negative, not a backhanded compliment, just acknowledging a solid day.
- Rough (net +5 to +8): LIGHT ROAST. Playful jab, nothing too harsh — think friendly ribbing, not a funeral.
- Bad (net +9 or worse): FULLY ROASTED. Go hard. Savage, creative destruction. No mercy.

WHAT MAKES A GREAT CHIRP:
- It matches the tone for its bucket — hype chirps should feel genuinely exciting, roast chirps should make people laugh-cry
- It's something the guys would actually laugh at and screenshot
- Vary your angle — swing roasts, life roasts, scorecard roasts, equipment jokes, course jokes, etc.

EXAMPLES OF EXISTING CHIRPS BY BUCKET (match or exceed this energy):
- Legendary: "$first_name just lapped the field so hard the cart path is calling for child support."
- Excellent: "$first_name came to play today. Impressive stuff."
- Neutral: "$first_name posted a card so neutral it could host peace talks."
- Rough: "$first_name's swing path? More like a drunk Uber driver rerouting mid-ride."
- Bad: "$first_name turned the front nine into a crime scene and the back nine into a cover-up."

BOUNDARIES:
- Don't be racist, homophobic, or target anything outside of golf performance
- No sexual innuendo or sexual content
- Don't repeat the same joke structure over and over

You will be told which performance bucket to write for and given additional examples for that specific bucket. Match or exceed the energy of those examples.`;

function pickExamples(bucket: ChirpBucket): string[] {
  const templates = CHIRP_TEMPLATES[bucket];
  const shuffled = [...templates].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, EXAMPLE_CHIRPS_PER_BUCKET);
}

function buildWildcardRef(): string {
  return CHIRP_WILDCARDS.map((w) => `${w.token} — ${w.description}`).join('\n');
}

export function buildGenerationPrompt(bucket: ChirpBucket, count: number, existingInQueue: string[]): string {
  const examples = pickExamples(bucket);
  const bucketLabel = BUCKET_LABELS[bucket];

  let prompt = `Generate exactly ${count} unique golf chirp template${count > 1 ? 's' : ''} for the "${bucketLabel}" performance bucket in a golf league app.\n\n`;
  prompt += `These are short, one-line trash-talk messages displayed when a player finishes a round. They should be funny, creative, and match the tone of the examples below.\n\n`;
  prompt += `Available placeholders (use these in your templates):\n${buildWildcardRef()}\n\n`;
  prompt += `You MUST use $first_name in every chirp. Other placeholders are optional.\n\n`;
  prompt += `Example chirps for this bucket:\n`;
  examples.forEach((e, i) => { prompt += `${i + 1}. ${e}\n`; });

  if (existingInQueue.length > 0) {
    prompt += `\nChirps already in the queue (do NOT repeat these or generate very similar ones):\n`;
    existingInQueue.forEach((e, i) => { prompt += `${i + 1}. ${e}\n`; });
  }

  prompt += `\nRespond with ONLY a JSON array of ${count} string${count > 1 ? 's' : ''}, no markdown, no explanation. Example: ["chirp one", "chirp two"]`;

  return prompt;
}

export async function loadChirpAIConfig(
  supabase: SupabaseClient
): Promise<AIConfig | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'chirp_ai_config')
    .maybeSingle();

  if (!data?.value) return null;

  const config = data.value as unknown as AIConfig;
  if (!config.api_endpoint || !config.api_key || !config.model) return null;
  return config;
}

export async function getQueueCountForBucket(
  supabase: SupabaseClient,
  bucket: ChirpBucket
): Promise<number> {
  const { count } = await supabase
    .from('chirp_templates')
    .select('id', { count: 'exact', head: true })
    .eq('bucket', bucket)
    .not('queue_position', 'is', null);

  return count ?? 0;
}

export async function getMaxQueuePosition(
  supabase: SupabaseClient,
  bucket: ChirpBucket
): Promise<number> {
  const { data } = await supabase
    .from('chirp_templates')
    .select('queue_position')
    .eq('bucket', bucket)
    .not('queue_position', 'is', null)
    .order('queue_position', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.queue_position ?? 0;
}

async function getExistingQueueTemplates(
  supabase: SupabaseClient,
  bucket: ChirpBucket
): Promise<string[]> {
  const { data } = await supabase
    .from('chirp_templates')
    .select('template')
    .eq('bucket', bucket)
    .not('queue_position', 'is', null)
    .order('queue_position', { ascending: true });

  return (data ?? []).map((r) => r.template);
}

function parseAIResponse(text: string): string[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
      return parsed.filter((s) => s.trim().length > 0);
    }
  } catch {
    // Fallback: try to extract strings from malformed response
  }

  const lineMatches = cleaned.match(/"([^"]+)"/g);
  if (lineMatches) {
    return lineMatches.map((m) => m.replace(/^"|"$/g, '').trim()).filter(Boolean);
  }

  return [];
}

export interface GenerateChirpsResult {
  bucket: ChirpBucket;
  generated: number;
  deficit: number;
  error?: string;
}

/**
 * Generate chirps for one or all buckets to fill them up to CHIRPS_QUEUE_TARGET.
 * Returns results per bucket.
 */
export async function generateChirps(
  supabase: SupabaseClient,
  targetBucket?: ChirpBucket
): Promise<GenerateChirpsResult[]> {
  const config = await loadChirpAIConfig(supabase);
  if (!config) {
    const buckets = targetBucket ? [targetBucket] : ALL_BUCKETS;
    return buckets.map((b) => ({
      bucket: b,
      generated: 0,
      deficit: 0,
      error: 'Chirp AI not configured',
    }));
  }

  const buckets = targetBucket ? [targetBucket] : ALL_BUCKETS;
  const results: GenerateChirpsResult[] = [];

  for (const bucket of buckets) {
    if (NO_CHIRP_BUCKETS.has(bucket)) {
      results.push({ bucket, generated: 0, deficit: 0 });
      continue;
    }

    const queueCount = await getQueueCountForBucket(supabase, bucket);
    const deficit = CHIRPS_QUEUE_TARGET - queueCount;

    if (deficit <= 0) {
      results.push({ bucket, generated: 0, deficit: 0 });
      continue;
    }

    try {
      const existingTemplates = await getExistingQueueTemplates(supabase, bucket);
      const systemPrompt = config.system_prompt || DEFAULT_CHIRP_SYSTEM_PROMPT;
      const userPrompt = buildGenerationPrompt(bucket, deficit, existingTemplates);

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
            { role: 'user', content: userPrompt },
          ],
          temperature: 1.0,
          max_tokens: config.max_tokens || 250,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error(`Chirp AI error for ${bucket}:`, aiResponse.status, errorText);
        results.push({ bucket, generated: 0, deficit, error: `AI returned ${aiResponse.status}` });
        continue;
      }

      const aiData = await aiResponse.json();
      const rawText = aiData.choices?.[0]?.message?.content?.trim();
      if (!rawText) {
        results.push({ bucket, generated: 0, deficit, error: 'AI returned empty response' });
        continue;
      }

      const chirps = parseAIResponse(rawText);
      if (chirps.length === 0) {
        results.push({ bucket, generated: 0, deficit, error: 'Failed to parse AI response' });
        continue;
      }

      let maxPos = await getMaxQueuePosition(supabase, bucket);
      const inserts = chirps.slice(0, deficit).map((template) => ({
        bucket,
        template,
        source: 'ai' as const,
        queue_position: ++maxPos,
      }));

      const { error: insertError } = await supabase
        .from('chirp_templates')
        .insert(inserts);

      if (insertError) {
        console.error(`Failed to insert chirps for ${bucket}:`, insertError);
        results.push({ bucket, generated: 0, deficit, error: 'DB insert failed' });
      } else {
        results.push({ bucket, generated: inserts.length, deficit });
      }
    } catch (err) {
      console.error(`Chirp generation error for ${bucket}:`, err);
      results.push({ bucket, generated: 0, deficit, error: 'Unexpected error' });
    }
  }

  return results;
}
