/**
 * Shared JSX components for OG standings image rendering via Satori.
 * Satori requires every element with multiple children to have explicit display: flex.
 */

export interface StandingsRow {
  rank: number;
  player: string;
  /** Primary value column (score for events, points for season) */
  value: string;
  /** Secondary value column (points for events, events played for season) */
  secondary?: string;
  course?: string;
}

export interface StandingsImageProps {
  title: string;
  subtitle: string;
  rows: StandingsRow[];
  showCourse?: boolean;
  /** Column headers for value/secondary columns */
  columns?: { value: string; secondary?: string };
}

const COURSE_COL_WIDTH = '220px';

function HeaderRow({ showCourse, columns }: { showCourse: boolean; columns: { value: string; secondary?: string } }) {
  const base = { fontSize: '11px', fontWeight: 600, color: '#9ca3af' };
  const cols = [
    <div key="r" style={{ ...base, width: '40px', display: 'flex' }}>#</div>,
    <div key="p" style={{ ...base, flex: 1, display: 'flex' }}>Player</div>,
    <div key="v" style={{ ...base, width: '70px', display: 'flex', justifyContent: 'flex-end' }}>{columns.value}</div>,
  ];
  if (columns.secondary) {
    cols.push(
      <div key="s" style={{ ...base, width: '60px', display: 'flex', justifyContent: 'flex-end' }}>{columns.secondary}</div>
    );
  }
  if (showCourse) {
    cols.push(
      <div key="c" style={{ ...base, width: COURSE_COL_WIDTH, display: 'flex', justifyContent: 'flex-end', paddingLeft: '12px' }}>Course</div>
    );
  }
  return (
    <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', paddingBottom: '8px', marginBottom: '4px' }}>
      {cols}
    </div>
  );
}

function DataRow({ row, idx, showCourse, hasSecondary }: { row: StandingsRow; idx: number; showCourse: boolean; hasSecondary: boolean }) {
  const isTop3 = row.rank <= 3;
  const bgColor = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
  const rankColors: Record<number, string> = { 1: '#eab308', 2: '#9ca3af', 3: '#b45309' };
  const rankColor = rankColors[row.rank] || '#6b7280';

  const valueColor = row.value.startsWith('-') ? '#dc2626' : row.value === 'E' ? '#059669' : '#1f2937';

  const cols = [
    <div key="r" style={{ width: '40px', fontSize: '15px', fontWeight: isTop3 ? 700 : 500, color: rankColor, display: 'flex' }}>
      {String(row.rank)}
    </div>,
    <div key="p" style={{ flex: 1, fontSize: '15px', fontWeight: isTop3 ? 600 : 400, color: '#1f2937', display: 'flex' }}>
      {row.player}
    </div>,
    <div key="v" style={{ width: '70px', fontSize: '15px', fontWeight: 600, color: valueColor, display: 'flex', justifyContent: 'flex-end' }}>
      {row.value}
    </div>,
  ];
  if (hasSecondary && row.secondary != null) {
    cols.push(
      <div key="s" style={{ width: '60px', fontSize: '14px', fontWeight: 500, color: '#6b7280', display: 'flex', justifyContent: 'flex-end' }}>
        {row.secondary}
      </div>
    );
  }
  if (showCourse) {
    cols.push(
      <div key="c" style={{ width: COURSE_COL_WIDTH, fontSize: '12px', color: '#9ca3af', display: 'flex', justifyContent: 'flex-end', paddingLeft: '12px', textAlign: 'right' }}>
        {row.course || ''}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', backgroundColor: bgColor, borderBottom: '1px solid #f3f4f6' }}>
      {cols}
    </div>
  );
}

/** Compute the image width based on visible columns */
export function computeImageWidth(showCourse: boolean, hasSecondary: boolean): number {
  let w = 64 + 40 + 160 + 70; // padding + rank + player base + value
  if (hasSecondary) w += 60;
  if (showCourse) w += 220;
  return w;
}

/** Compute the image height with breathing room at the bottom */
export function computeImageHeight(rowCount: number): number {
  return Math.max(300, 140 + rowCount * 44 + 48);
}

const SIDE_BY_SIDE_GAP = 40;
const SIDE_BY_SIDE_PADDING = 32;
const SIDE_BY_SIDE_TOTAL_WIDTH = 700;

export function computeSideBySideWidth(): number {
  return SIDE_BY_SIDE_TOTAL_WIDTH;
}

export function computeSideBySideHeight(leftRows: number, rightRows: number): number {
  const maxRows = Math.max(leftRows, rightRows);
  return Math.max(300, 140 + maxRows * 44 + 48);
}

export interface SideBySideProps {
  left: StandingsImageProps;
  right: StandingsImageProps;
}

function StandingsPanel({ title, subtitle, rows, columns }: StandingsImageProps) {
  const cols = columns || { value: 'Score', secondary: 'Points' };
  const hasSecondary = !!cols.secondary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
        <div style={{ display: 'flex', fontSize: '17px', fontWeight: 700, color: '#1a1a2e', lineHeight: 1.2 }}>
          {title}
        </div>
        <div style={{ display: 'flex', fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
          {subtitle}
        </div>
      </div>

      <HeaderRow showCourse={false} columns={cols} />

      {rows.map((row, idx) => (
        <DataRow key={`${row.rank}-${row.player}`} row={row} idx={idx} showCourse={false} hasSecondary={hasSecondary} />
      ))}
    </div>
  );
}

export function SideBySideStandings({ left, right }: SideBySideProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: `${computeSideBySideWidth()}px`,
        backgroundColor: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: `${SIDE_BY_SIDE_PADDING}px`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', gap: `${SIDE_BY_SIDE_GAP}px` }}>
        <StandingsPanel {...left} />
        <StandingsPanel {...right} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', fontSize: '11px', color: '#d1d5db' }}>
        Minerva Tour
      </div>
    </div>
  );
}

export function StandingsImage({ title, subtitle, rows, showCourse = false, columns }: StandingsImageProps) {
  const cols = columns || { value: 'Score', secondary: 'Points' };
  const hasSecondary = !!cols.secondary;
  const width = computeImageWidth(showCourse, hasSecondary);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: `${width}px`,
        backgroundColor: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '32px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '20px' }}>
        <div style={{ display: 'flex', fontSize: '28px', fontWeight: 700, color: '#1a1a2e', lineHeight: 1.2 }}>
          {title}
        </div>
        <div style={{ display: 'flex', fontSize: '16px', color: '#6b7280', marginTop: '4px' }}>
          {subtitle}
        </div>
      </div>

      <HeaderRow showCourse={showCourse} columns={cols} />

      {rows.map((row, idx) => (
        <DataRow key={`${row.rank}-${row.player}`} row={row} idx={idx} showCourse={showCourse} hasSecondary={hasSecondary} />
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', fontSize: '11px', color: '#d1d5db' }}>
        Minerva Tour
      </div>
    </div>
  );
}
