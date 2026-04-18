import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateChirps } from '@/lib/chirps-ai';
import { ALL_BUCKETS, type ChirpBucket } from '@/lib/chirps';

/**
 * POST /api/chirps/generate
 *
 * Generate AI chirps to fill queue buckets up to 10.
 *
 * Body (all optional):
 *   { bucket?: ChirpBucket }
 *   - If bucket is omitted, generates for ALL buckets below 10.
 *   - Only generates enough to reach 10 per bucket (deficit-based).
 *
 * Auth: requires authenticated admin or member.
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

    if (!profile || !['admin', 'member'].includes(profile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const targetBucket = body.bucket as ChirpBucket | undefined;

    if (targetBucket && !ALL_BUCKETS.includes(targetBucket)) {
      return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 });
    }

    const results = await generateChirps(supabase, targetBucket);

    const totalGenerated = results.reduce((sum, r) => sum + r.generated, 0);
    const errors = results.filter((r) => r.error);

    return NextResponse.json({
      ok: true,
      total_generated: totalGenerated,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Chirp generation route error:', error);
    return NextResponse.json({ error: 'Failed to generate chirps' }, { status: 500 });
  }
}
