import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrophyCase from '@/components/TrophyCase';
import type { Trophy, SeasonFinish } from '@/types/database';

const mockTrophies: Trophy[] = [
  {
    id: '1',
    user_id: 'u1',
    year: 2022,
    award_type: 'minerva_tour_champion',
    award_name: 'Minerva Tour Champion',
    description: null,
    emoji: '🏆',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    user_id: 'u1',
    year: 2021,
    award_type: 'bobby_jones_cup',
    award_name: 'Bobby Jones Cup',
    description: 'Michigan',
    emoji: '🌳',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '3',
    user_id: 'u1',
    year: 2020,
    award_type: 'most_improved',
    award_name: 'Most Improved Golfer',
    description: null,
    emoji: '📉',
    created_at: '2024-01-01T00:00:00Z',
  },
];

const mockFinishes: SeasonFinish[] = [
  { id: 'f1', user_id: 'u1', year: 2022, finish_position: '1st', standing_type: 'net', created_at: '2024-01-01T00:00:00Z' },
  { id: 'f2', user_id: 'u1', year: 2022, finish_position: '5th', standing_type: 'scratch', created_at: '2024-01-01T00:00:00Z' },
  { id: 'f6', user_id: 'u1', year: 2022, finish_position: '3rd', standing_type: 'playoff', created_at: '2024-01-01T00:00:00Z' },
  { id: 'f3', user_id: 'u1', year: 2021, finish_position: '3rd', standing_type: 'net', created_at: '2024-01-01T00:00:00Z' },
  { id: 'f4', user_id: 'u1', year: 2021, finish_position: '2nd', standing_type: 'scratch', created_at: '2024-01-01T00:00:00Z' },
  { id: 'f7', user_id: 'u1', year: 2021, finish_position: '1st', standing_type: 'playoff', created_at: '2024-01-01T00:00:00Z' },
  { id: 'f5', user_id: 'u1', year: 2019, finish_position: '6th', standing_type: 'net', created_at: '2024-01-01T00:00:00Z' },
];

describe('TrophyCase', () => {
  it('renders nothing when no trophies or finishes', () => {
    const { container } = render(<TrophyCase trophies={[]} seasonFinishes={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders trophy case header', () => {
    render(<TrophyCase trophies={mockTrophies} />);
    expect(screen.getByText('Trophy Case')).toBeTruthy();
  });

  it('renders all trophies with emoji, name, and year', () => {
    render(<TrophyCase trophies={mockTrophies} />);
    expect(screen.getByText('Minerva Tour Champion')).toBeTruthy();
    expect(screen.getByText('Bobby Jones Cup')).toBeTruthy();
    expect(screen.getByText('Most Improved Golfer')).toBeTruthy();
    expect(screen.getByText('2022')).toBeTruthy();
    expect(screen.getByText('2021')).toBeTruthy();
    expect(screen.getByText('2020')).toBeTruthy();
  });

  it('renders description when present (e.g. Bobby Jones Cup location)', () => {
    render(<TrophyCase trophies={mockTrophies} />);
    expect(screen.getByText('(Michigan)')).toBeTruthy();
  });

  it('sorts trophies by year descending', () => {
    render(<TrophyCase trophies={mockTrophies} />);
    const years = screen.getAllByText(/20\d{2}/).map(el => el.textContent);
    expect(years[0]).toBe('2022');
    expect(years[1]).toBe('2021');
    expect(years[2]).toBe('2020');
  });

  it('renders season finishes section with net, scratch, and playoff columns', () => {
    render(<TrophyCase trophies={[]} seasonFinishes={mockFinishes} />);
    expect(screen.getByText('Season Finishes')).toBeTruthy();
    // Column headers
    expect(screen.getByText('Net')).toBeTruthy();
    expect(screen.getByText('Scratch')).toBeTruthy();
    expect(screen.getByText('Playoff')).toBeTruthy();
    // Net positions
    expect(screen.getByText('6th')).toBeTruthy();
    // Scratch positions
    expect(screen.getByText('5th')).toBeTruthy();
  });

  it('shows dash for missing scratch/playoff data', () => {
    render(<TrophyCase trophies={[]} seasonFinishes={mockFinishes} />);
    // 2019 has net only, scratch and playoff should show dashes
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('hides playoff column when no playoff data exists', () => {
    const netOnlyFinishes: SeasonFinish[] = [
      { id: 'n1', user_id: 'u1', year: 2023, finish_position: '4th', standing_type: 'net', created_at: '2024-01-01T00:00:00Z' },
    ];
    render(<TrophyCase trophies={[]} seasonFinishes={netOnlyFinishes} />);
    expect(screen.queryByText('Playoff')).toBeNull();
    expect(screen.queryByText('Scratch')).toBeNull();
    expect(screen.getByText('Net')).toBeTruthy();
  });

  it('groups net, scratch, and playoff by year on the same row', () => {
    render(<TrophyCase trophies={[]} seasonFinishes={mockFinishes} />);
    // 2022 has all three types, should appear on one row
    const year2022 = screen.getByText('2022');
    const row = year2022.parentElement!;
    expect(row.textContent).toContain('1st');  // net
    expect(row.textContent).toContain('5th');  // scratch
    expect(row.textContent).toContain('3rd');  // playoff (this is the f6 entry)
  });

  it('renders compact mode with emoji badges', () => {
    render(<TrophyCase trophies={mockTrophies} compact={true} />);
    const badge = screen.getByLabelText('Trophy badges');
    expect(badge).toBeTruthy();
    // Should not render the full trophy case header
    expect(screen.queryByText('Trophy Case')).toBeNull();
  });

  it('compact mode shows all emojis grouped by type (not deduplicated)', () => {
    const duplicateTrophies: Trophy[] = [
      { ...mockTrophies[0], id: 'a', year: 2023 },
      { ...mockTrophies[0], id: 'b', year: 2021 },
      { ...mockTrophies[0], id: 'c', year: 2020 },
    ];
    render(<TrophyCase trophies={duplicateTrophies} compact={true} />);
    const badge = screen.getByLabelText('Trophy badges');
    const emojiSpans = badge.querySelectorAll('span[role="img"]');
    expect(emojiSpans.length).toBe(3);
  });

  it('shows only 5 trophies initially when more than 5 exist', () => {
    const manyTrophies: Trophy[] = Array.from({ length: 7 }, (_, i) => ({
      id: `t-${i}`,
      user_id: 'u1',
      year: 2025 - i,
      award_type: 'minerva_tour_champion',
      award_name: `Award ${i + 1}`,
      description: null,
      emoji: '🏆',
      created_at: '2024-01-01T00:00:00Z',
    }));
    render(<TrophyCase trophies={manyTrophies} />);

    expect(screen.getByText('Award 1')).toBeTruthy();
    expect(screen.getByText('Award 5')).toBeTruthy();
    expect(screen.queryByText('Award 6')).toBeNull();
    expect(screen.getByText('Show All (7)')).toBeTruthy();
  });

  it('expands to show all trophies when Show All is clicked', () => {
    const manyTrophies: Trophy[] = Array.from({ length: 7 }, (_, i) => ({
      id: `t-${i}`,
      user_id: 'u1',
      year: 2025 - i,
      award_type: 'minerva_tour_champion',
      award_name: `Award ${i + 1}`,
      description: null,
      emoji: '🏆',
      created_at: '2024-01-01T00:00:00Z',
    }));
    render(<TrophyCase trophies={manyTrophies} />);

    fireEvent.click(screen.getByText('Show All (7)'));
    expect(screen.getByText('Award 6')).toBeTruthy();
    expect(screen.getByText('Award 7')).toBeTruthy();
    expect(screen.getByText('Show Less')).toBeTruthy();
  });

  it('does not show expand button when 5 or fewer trophies', () => {
    render(<TrophyCase trophies={mockTrophies} />);
    expect(screen.queryByText(/Show All/)).toBeNull();
  });
});
