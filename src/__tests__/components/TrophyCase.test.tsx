import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  { id: 'f3', user_id: 'u1', year: 2021, finish_position: '3rd', standing_type: 'net', created_at: '2024-01-01T00:00:00Z' },
  { id: 'f4', user_id: 'u1', year: 2021, finish_position: '2nd', standing_type: 'scratch', created_at: '2024-01-01T00:00:00Z' },
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

  it('renders season finishes section with net and scratch columns', () => {
    render(<TrophyCase trophies={[]} seasonFinishes={mockFinishes} />);
    expect(screen.getByText('Season Finishes')).toBeTruthy();
    // Column headers
    expect(screen.getByText('Net')).toBeTruthy();
    expect(screen.getByText('Scratch')).toBeTruthy();
    // Net positions
    expect(screen.getByText('1st')).toBeTruthy();
    expect(screen.getByText('3rd')).toBeTruthy();
    expect(screen.getByText('6th')).toBeTruthy();
    // Scratch positions
    expect(screen.getByText('5th')).toBeTruthy();
    expect(screen.getByText('2nd')).toBeTruthy();
  });

  it('shows dash for missing scratch data', () => {
    render(<TrophyCase trophies={[]} seasonFinishes={mockFinishes} />);
    // 2019 has net only, scratch should show dash
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders compact mode with unique emojis only', () => {
    render(<TrophyCase trophies={mockTrophies} compact={true} />);
    const badge = screen.getByLabelText('Trophy badges');
    expect(badge).toBeTruthy();
    // Should not render the full trophy case header
    expect(screen.queryByText('Trophy Case')).toBeNull();
  });

  it('compact mode de-duplicates emojis', () => {
    const duplicateTrophies: Trophy[] = [
      { ...mockTrophies[0], id: 'a' },
      { ...mockTrophies[0], id: 'b', year: 2021 },
    ];
    render(<TrophyCase trophies={duplicateTrophies} compact={true} />);
    const badge = screen.getByLabelText('Trophy badges');
    const emojiSpans = badge.querySelectorAll('span[role="img"]');
    expect(emojiSpans.length).toBe(1);
  });
});
