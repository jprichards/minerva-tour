import { test, expect } from '@playwright/test';

/**
 * E2E tests that use the dev bypass to test protected pages.
 * These tests add ?dev_bypass=1 to access pages without auth.
 * Note: The pages may show loading states or empty data since
 * there's no real Supabase session, but they should render without errors.
 */

test.describe('Protected Pages via Dev Bypass', () => {
  test('home page loads with dev bypass', async ({ page }) => {
    await page.goto('/home?dev_bypass=1');
    await page.waitForTimeout(2000);
    // Should not redirect to login
    const url = page.url();
    expect(url).toContain('/home');
  });

  test('scores page loads with dev bypass', async ({ page }) => {
    await page.goto('/scores?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/scores');
  });

  test('leaderboard page loads with dev bypass', async ({ page }) => {
    await page.goto('/leaderboard?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/leaderboard');
  });

  test('profile page loads with dev bypass', async ({ page }) => {
    await page.goto('/profile?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/profile');
  });

  test('event-history page loads with dev bypass', async ({ page }) => {
    await page.goto('/event-history?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/event-history');
  });

  test('members page loads with dev bypass', async ({ page }) => {
    await page.goto('/members?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/members');
  });

  test('schedule page loads with dev bypass', async ({ page }) => {
    await page.goto('/schedule?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/schedule');
  });

  test('stats page loads with dev bypass', async ({ page }) => {
    await page.goto('/stats?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/stats');
  });

  test('playoffs page loads with dev bypass', async ({ page }) => {
    await page.goto('/playoffs?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/playoffs');
  });

  test('tournament page loads with dev bypass', async ({ page }) => {
    await page.goto('/tournament?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/tournament');
  });

  test('notifications page loads with dev bypass', async ({ page }) => {
    await page.goto('/notifications?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/notifications');
  });

  test('courses page loads with dev bypass', async ({ page }) => {
    await page.goto('/courses?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/courses');
  });

  test('add score page loads with dev bypass', async ({ page }) => {
    await page.goto('/scores/add?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/scores/add');
  });

  test('bridge scores page loads with dev bypass', async ({ page }) => {
    await page.goto('/scores/bridge?dev_bypass=1');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toContain('/scores/bridge');
  });
});
