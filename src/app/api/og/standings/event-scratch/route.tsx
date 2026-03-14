import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { StandingsImage, computeImageWidth, computeImageHeight } from '@/lib/og-standings';
import type { StandingsRow } from '@/lib/og-standings';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const { title, subtitle, rows, columns } = (await request.json()) as {
    title: string;
    subtitle: string;
    rows: StandingsRow[];
    columns?: { value: string; secondary?: string };
  };

  const hasSecondary = !!columns?.secondary;
  const width = computeImageWidth(true, hasSecondary);
  const height = computeImageHeight(rows.length);

  return new ImageResponse(
    <StandingsImage title={title} subtitle={subtitle} rows={rows} showCourse columns={columns} />,
    { width, height }
  );
}
