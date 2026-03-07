import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MemberPicker from '@/components/MemberPicker';
import type { User } from '@/types/database';

const makeUser = (overrides: Partial<User> & { id: string; full_name: string }): User => ({
  email: `${overrides.full_name.toLowerCase().replace(/\s/g, '.')}@test.com`,
  role: 'member',
  handicap_index: 10,
  ghin_number: null,
  profile_picture_url: null,
  is_commissioner: false,
  created_at: '',
  updated_at: '',
  ...overrides,
});

const members: User[] = [
  makeUser({ id: 'u1', full_name: 'Alice Smith' }),
  makeUser({ id: 'u2', full_name: 'Bob Jones' }),
  makeUser({ id: 'u3', full_name: 'Charlie Brown' }),
  makeUser({ id: 'u4', full_name: 'Diana Prince' }),
];

describe('MemberPicker', () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all non-excluded members', () => {
    render(
      <MemberPicker
        members={members}
        excludeIds={['u1']}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    expect(screen.getByText('Diana Prince')).toBeInTheDocument();
  });

  it('filters members by search input', () => {
    render(
      <MemberPicker
        members={members}
        excludeIds={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Search members...'), {
      target: { value: 'bob' },
    });
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie Brown')).not.toBeInTheDocument();
  });

  it('allows selecting and deselecting members', () => {
    render(
      <MemberPicker
        members={members}
        excludeIds={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    const bobButton = screen.getByText('Bob Jones').closest('button')!;
    const charlieButton = screen.getByText('Charlie Brown').closest('button')!;

    fireEvent.click(bobButton);
    fireEvent.click(charlieButton);
    expect(screen.getByText('Copy to 2 members')).toBeInTheDocument();

    fireEvent.click(bobButton);
    expect(screen.getByText('Copy to 1 member')).toBeInTheDocument();
  });

  it('calls onConfirm with selected IDs', () => {
    render(
      <MemberPicker
        members={members}
        excludeIds={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('Bob Jones').closest('button')!);
    fireEvent.click(screen.getByText('Copy to 1 member'));
    expect(onConfirm).toHaveBeenCalledWith(['u2']);
  });

  it('calls onCancel when cancel is clicked', () => {
    render(
      <MemberPicker
        members={members}
        excludeIds={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables the confirm button when no members selected', () => {
    render(
      <MemberPicker
        members={members}
        excludeIds={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    const confirmButton = screen.getByText('Copy to 0 members');
    expect(confirmButton.closest('button')).toBeDisabled();
  });

  it('shows disabled members with reason and prevents selection', () => {
    render(
      <MemberPicker
        members={members}
        excludeIds={[]}
        disabledIds={['u2']}
        disabledReason="Already has tee time"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    const bobButton = screen.getByText('Bob Jones').closest('button')!;
    expect(bobButton).toBeDisabled();
    expect(screen.getByText('Already has tee time')).toBeInTheDocument();
    expect(screen.getByText('Exists')).toBeInTheDocument();
  });

  it('shows loading state when loading prop is true', () => {
    render(
      <MemberPicker
        members={members}
        excludeIds={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
        loading={true}
      />
    );
    expect(screen.getByText('Copying...')).toBeInTheDocument();
  });

  it('shows "No members found" when search yields no results', () => {
    render(
      <MemberPicker
        members={members}
        excludeIds={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    fireEvent.change(screen.getByPlaceholderText('Search members...'), {
      target: { value: 'zzzzz' },
    });
    expect(screen.getByText('No members found.')).toBeInTheDocument();
  });
});
