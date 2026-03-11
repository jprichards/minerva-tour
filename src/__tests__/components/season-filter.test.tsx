import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SeasonFilter from '@/app/(protected)/stats/components/SeasonFilter';
import type { Season } from '@/types/database';

const mockSeasons: Season[] = [
  { id: 's3', year: 2026, mode: 'regular_season', current_event_id: null, handicap_allowance: 95, created_at: '', updated_at: '' },
  { id: 's2', year: 2025, mode: 'off_season', current_event_id: null, handicap_allowance: 95, created_at: '', updated_at: '' },
  { id: 's1', year: 2024, mode: 'off_season', current_event_id: null, handicap_allowance: 100, created_at: '', updated_at: '' },
];

describe('SeasonFilter', () => {
  it('renders all seasons plus All Time option', () => {
    const onChange = vi.fn();
    render(<SeasonFilter seasons={mockSeasons} selectedYear={2026} onChange={onChange} />);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(options[0]).toHaveTextContent('2026 Season');
    expect(options[1]).toHaveTextContent('2025 Season');
    expect(options[2]).toHaveTextContent('2024 Season');
    expect(options[3]).toHaveTextContent('All Time');
  });

  it('calls onChange with season year when a season is selected', () => {
    const onChange = vi.fn();
    render(<SeasonFilter seasons={mockSeasons} selectedYear={2026} onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2025' } });
    expect(onChange).toHaveBeenCalledWith(2025);
  });

  it('calls onChange with "all" when All Time is selected', () => {
    const onChange = vi.fn();
    render(<SeasonFilter seasons={mockSeasons} selectedYear={2026} onChange={onChange} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'all' } });
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('shows the selected year as the current value', () => {
    const onChange = vi.fn();
    render(<SeasonFilter seasons={mockSeasons} selectedYear={2025} onChange={onChange} />);

    expect(screen.getByRole('combobox')).toHaveValue('2025');
  });

  it('handles empty seasons list gracefully', () => {
    const onChange = vi.fn();
    render(<SeasonFilter seasons={[]} selectedYear={2026} onChange={onChange} />);

    const options = screen.queryAllByRole('option');
    expect(options).toHaveLength(0);
  });
});
