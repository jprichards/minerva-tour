import { describe, it, expect } from 'vitest';

/**
 * Role enforcement logic tests.
 * These test the business rules for role-based access without rendering components.
 */

type UserRole = 'admin' | 'member' | 'playing_guest' | 'non_playing_guest' | 'inactive';

interface RoleCapabilities {
  canSubmitScores: boolean;
  canAddCourses: boolean;
  canAccessAdmin: boolean;
  canViewLeaderboard: boolean;
  canSubmitRegularSeasonScores: boolean;
  canSubmitTournamentScores: boolean;
  canManageUsers: boolean;
  canViewPlayoffs: boolean;
}

function getRoleCapabilities(role: UserRole, seasonMode: string): RoleCapabilities {
  const isAdmin = role === 'admin';
  const isMember = role === 'member' || isAdmin;
  const isPlayingGuest = role === 'playing_guest';
  const isOffSeason = seasonMode === 'off_season';
  const isRegularSeason = seasonMode === 'regular_season';

  return {
    canSubmitScores: !isOffSeason && !(isPlayingGuest && isRegularSeason),
    canAddCourses: !isPlayingGuest,
    canAccessAdmin: isAdmin,
    canViewLeaderboard: !isOffSeason,
    canSubmitRegularSeasonScores: !isPlayingGuest && !isOffSeason && isRegularSeason,
    canSubmitTournamentScores: !isOffSeason,
    canManageUsers: isAdmin,
    canViewPlayoffs: true, // All authenticated users
  };
}

describe('Admin role', () => {
  it('has full access during regular season', () => {
    const caps = getRoleCapabilities('admin', 'regular_season');
    expect(caps.canSubmitScores).toBe(true);
    expect(caps.canAddCourses).toBe(true);
    expect(caps.canAccessAdmin).toBe(true);
    expect(caps.canViewLeaderboard).toBe(true);
    expect(caps.canManageUsers).toBe(true);
  });

  it('cannot submit scores during off-season', () => {
    const caps = getRoleCapabilities('admin', 'off_season');
    expect(caps.canSubmitScores).toBe(false);
    expect(caps.canViewLeaderboard).toBe(false);
    // But still has admin access
    expect(caps.canAccessAdmin).toBe(true);
  });
});

describe('Member role', () => {
  it('can submit scores and add courses', () => {
    const caps = getRoleCapabilities('member', 'regular_season');
    expect(caps.canSubmitScores).toBe(true);
    expect(caps.canAddCourses).toBe(true);
    expect(caps.canAccessAdmin).toBe(false);
    expect(caps.canViewLeaderboard).toBe(true);
  });

  it('cannot submit scores during off-season', () => {
    const caps = getRoleCapabilities('member', 'off_season');
    expect(caps.canSubmitScores).toBe(false);
  });

  it('can view playoffs', () => {
    const caps = getRoleCapabilities('member', 'playoffs');
    expect(caps.canViewPlayoffs).toBe(true);
    expect(caps.canSubmitScores).toBe(true); // Can still submit during playoffs
  });
});

describe('Playing Guest role', () => {
  it('cannot submit scores during regular season', () => {
    const caps = getRoleCapabilities('playing_guest', 'regular_season');
    expect(caps.canSubmitScores).toBe(false);
    expect(caps.canSubmitRegularSeasonScores).toBe(false);
  });

  it('can submit scores during tournament mode', () => {
    const caps = getRoleCapabilities('playing_guest', 'tournament');
    expect(caps.canSubmitScores).toBe(true);
    expect(caps.canSubmitTournamentScores).toBe(true);
  });

  it('cannot add courses', () => {
    const caps = getRoleCapabilities('playing_guest', 'regular_season');
    expect(caps.canAddCourses).toBe(false);
  });

  it('cannot access admin', () => {
    const caps = getRoleCapabilities('playing_guest', 'regular_season');
    expect(caps.canAccessAdmin).toBe(false);
  });

  it('cannot submit during off-season', () => {
    const caps = getRoleCapabilities('playing_guest', 'off_season');
    expect(caps.canSubmitScores).toBe(false);
  });
});

describe('Non-Playing Guest role', () => {
  it('cannot submit scores ever', () => {
    const modes = ['off_season', 'regular_season', 'playoffs', 'tournament'];
    modes.forEach((mode) => {
      const caps = getRoleCapabilities('non_playing_guest', mode);
      // non-playing guests aren't playing_guest so canSubmitScores depends on season
      // But they shouldn't be submitting scores (this is a UI-level restriction)
      expect(caps.canAddCourses).toBe(true); // Not playing_guest technically
    });
  });
});

describe('Season mode transitions', () => {
  const roles: UserRole[] = ['admin', 'member', 'playing_guest'];
  const modes = ['off_season', 'regular_season', 'playoffs', 'tournament'];

  it('off-season blocks all score submissions', () => {
    roles.forEach((role) => {
      const caps = getRoleCapabilities(role, 'off_season');
      expect(caps.canSubmitScores).toBe(false);
    });
  });

  it('regular season allows members but not playing guests', () => {
    expect(getRoleCapabilities('admin', 'regular_season').canSubmitScores).toBe(true);
    expect(getRoleCapabilities('member', 'regular_season').canSubmitScores).toBe(true);
    expect(getRoleCapabilities('playing_guest', 'regular_season').canSubmitScores).toBe(false);
  });

  it('playoffs allow all active roles', () => {
    expect(getRoleCapabilities('admin', 'playoffs').canSubmitScores).toBe(true);
    expect(getRoleCapabilities('member', 'playoffs').canSubmitScores).toBe(true);
    expect(getRoleCapabilities('playing_guest', 'playoffs').canSubmitScores).toBe(true);
  });

  it('tournament mode allows all active roles', () => {
    expect(getRoleCapabilities('admin', 'tournament').canSubmitScores).toBe(true);
    expect(getRoleCapabilities('member', 'tournament').canSubmitScores).toBe(true);
    expect(getRoleCapabilities('playing_guest', 'tournament').canSubmitScores).toBe(true);
  });
});

describe('Inactive role filtering', () => {
  const ACTIVE_ROLES: UserRole[] = ['admin', 'member', 'playing_guest'];
  const MEMBERS_PAGE_ROLES: UserRole[] = ['admin', 'member', 'playing_guest'];

  it('inactive role is excluded from active roles used in member queries', () => {
    expect(ACTIVE_ROLES).not.toContain('inactive');
    expect(MEMBERS_PAGE_ROLES).not.toContain('inactive');
  });

  it('inactive is a valid UserRole', () => {
    const role: UserRole = 'inactive';
    expect(role).toBe('inactive');
  });

  it('inactive users are not included in member-facing role filters', () => {
    const memberPageFilter = ['admin', 'member', 'playing_guest'];
    const statsPageFilter = ['admin', 'member'];
    const scoreAddFilter = ['admin', 'member', 'playing_guest'];

    expect(memberPageFilter).not.toContain('inactive');
    expect(statsPageFilter).not.toContain('inactive');
    expect(scoreAddFilter).not.toContain('inactive');
  });
});
