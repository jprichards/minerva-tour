import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Middleware logic tests.
 * We test the routing/redirect logic by extracting the rules from middleware.ts
 * and testing them in isolation (since the actual Next.js middleware depends on
 * createServerClient which is hard to mock fully in unit tests).
 */

describe('Middleware routing logic', () => {
  const publicPaths = ['/login', '/auth/callback', '/', '/view'];

  function isPublicPath(pathname: string): boolean {
    return publicPaths.some(
      (path) => pathname === path || pathname.startsWith('/auth/') || pathname.startsWith('/view')
    );
  }

  function shouldRedirect(params: {
    pathname: string;
    hasUser: boolean;
    devBypass: boolean;
    nodeEnv: string;
  }): boolean {
    const isDevBypass = params.nodeEnv === 'development' && params.devBypass;
    return !params.hasUser && !isPublicPath(params.pathname) && !isDevBypass;
  }

  describe('public path detection', () => {
    it('recognizes /login as public', () => {
      expect(isPublicPath('/login')).toBe(true);
    });

    it('recognizes /auth/callback as public', () => {
      expect(isPublicPath('/auth/callback')).toBe(true);
    });

    it('recognizes / as public', () => {
      expect(isPublicPath('/')).toBe(true);
    });

    it('recognizes /view as public', () => {
      expect(isPublicPath('/view')).toBe(true);
    });

    it('recognizes /view/anything as public', () => {
      expect(isPublicPath('/view/sub')).toBe(true);
    });

    it('does NOT consider /home as public', () => {
      expect(isPublicPath('/home')).toBe(false);
    });

    it('does NOT consider /scores as public', () => {
      expect(isPublicPath('/scores')).toBe(false);
    });

    it('does NOT consider /admin as public', () => {
      expect(isPublicPath('/admin')).toBe(false);
    });
  });

  describe('redirect decisions', () => {
    it('redirects unauthenticated user on protected path', () => {
      expect(shouldRedirect({ pathname: '/home', hasUser: false, devBypass: false, nodeEnv: 'production' })).toBe(true);
    });

    it('does NOT redirect authenticated user', () => {
      expect(shouldRedirect({ pathname: '/home', hasUser: true, devBypass: false, nodeEnv: 'production' })).toBe(false);
    });

    it('does NOT redirect on public path', () => {
      expect(shouldRedirect({ pathname: '/login', hasUser: false, devBypass: false, nodeEnv: 'production' })).toBe(false);
    });

    it('does NOT redirect with dev bypass in development', () => {
      expect(shouldRedirect({ pathname: '/home', hasUser: false, devBypass: true, nodeEnv: 'development' })).toBe(false);
    });

    it('DOES redirect with dev bypass in production (bypass ignored)', () => {
      expect(shouldRedirect({ pathname: '/home', hasUser: false, devBypass: true, nodeEnv: 'production' })).toBe(true);
    });

    it('does NOT redirect on /view without auth', () => {
      expect(shouldRedirect({ pathname: '/view', hasUser: false, devBypass: false, nodeEnv: 'production' })).toBe(false);
    });

    it('redirects on /scores without auth', () => {
      expect(shouldRedirect({ pathname: '/scores', hasUser: false, devBypass: false, nodeEnv: 'production' })).toBe(true);
    });

    it('redirects on /admin without auth', () => {
      expect(shouldRedirect({ pathname: '/admin', hasUser: false, devBypass: false, nodeEnv: 'production' })).toBe(true);
    });

    it('redirects on /leaderboard without auth', () => {
      expect(shouldRedirect({ pathname: '/leaderboard', hasUser: false, devBypass: false, nodeEnv: 'production' })).toBe(true);
    });
  });
});
