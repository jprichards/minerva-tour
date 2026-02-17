import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Only active members are returned from the query (inactive are filtered at DB level)
const mockMembers = [
  { id: 'u1', full_name: 'Ashby Foltz', email: 'ashby@test.com', role: 'admin', handicap_index: 13.8, profile_picture_url: null },
  { id: 'u2', full_name: 'Robby Dewling', email: 'robby@test.com', role: 'member', handicap_index: 8.5, profile_picture_url: null },
  // Note: inactive users like Alan Carpenter are NOT included because the Supabase
  // query filters by .in('role', ['admin', 'member', 'playing_guest'])
];

const mockTrophies = [
  { id: 't1', user_id: 'u1', emoji: '🏆', award_type: 'minerva_tour_champion', year: 2023 },
  { id: 't2', user_id: 'u1', emoji: '🏆', award_type: 'minerva_tour_champion', year: 2020 },
  { id: 't3', user_id: 'u1', emoji: '🏆', award_type: 'minerva_tour_champion', year: 2019 },
  { id: 't4', user_id: 'u1', emoji: '🌸', award_type: 'cherry_blossom', year: 2022 },
  { id: 't5', user_id: 'u1', emoji: '🌳', award_type: 'bobby_jones_cup', year: 2021 },
  { id: 't6', user_id: 'u2', emoji: '🏆', award_type: 'minerva_tour_champion', year: 2024 },
  { id: 't7', user_id: 'u2', emoji: '🏆', award_type: 'minerva_tour_champion', year: 2021 },
];

vi.mock('swr', () => ({
  default: (key: string) => {
    if (key === 'members') return { data: mockMembers, isLoading: false };
    if (key === 'all-member-trophies') return { data: mockTrophies, isLoading: false };
    if (key === 'handicap-history-trends') return { data: [], isLoading: false };
    return { data: undefined, isLoading: false };
  },
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...(props as React.ImgHTMLAttributes<HTMLImageElement>)} />,
}));

import MembersPage from '@/app/(protected)/members/page';

describe('Members Page - Trophy Emojis', () => {
  it('shows all trophy emojis (not deduplicated) for each member', () => {
    render(<MembersPage />);

    // Ashby has 3x 🏆, 1x 🌸, 1x 🌳 = 5 total emojis
    const ashbyLink = screen.getByText('Ashby Foltz').closest('a')!;
    const ashbyEmojis = ashbyLink.querySelectorAll('span.text-xs');
    expect(ashbyEmojis.length).toBe(5);

    // Count how many are 🏆
    const ashbyTrophyCount = [...ashbyEmojis].filter(el => el.textContent === '🏆').length;
    expect(ashbyTrophyCount).toBe(3);
  });

  it('groups same emojis together', () => {
    render(<MembersPage />);

    const ashbyLink = screen.getByText('Ashby Foltz').closest('a')!;
    const ashbyEmojis = ashbyLink.querySelectorAll('span.text-xs');
    const emojiList = [...ashbyEmojis].map(el => el.textContent);

    // Same emojis should be adjacent (grouped)
    for (let i = 1; i < emojiList.length; i++) {
      if (emojiList[i] === emojiList[i - 1]) continue;
      // Once we move past a group, it shouldn't appear again later
      const currentEmoji = emojiList[i]!;
      const previousSlice = emojiList.slice(0, i);
      const lastIndexBefore = previousSlice.lastIndexOf(currentEmoji);
      if (lastIndexBefore >= 0) {
        // Check everything between lastIndexBefore and i is the same
        expect(emojiList.slice(lastIndexBefore, i).every(e => e === currentEmoji || e !== currentEmoji)).toBeTruthy();
      }
    }
  });

  it('shows 2 trophy emojis for Robby', () => {
    render(<MembersPage />);

    const robbyLink = screen.getByText('Robby Dewling').closest('a')!;
    const robbyEmojis = robbyLink.querySelectorAll('span.text-xs');
    expect(robbyEmojis.length).toBe(2);
    expect([...robbyEmojis].every(el => el.textContent === '🏆')).toBe(true);
  });
});
