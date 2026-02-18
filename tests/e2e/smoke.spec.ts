import { test, expect } from '@playwright/test';

test('app responds', async ({ page }) => {
  await page.goto('/');
  // Use something stable. If you don’t have a title set, this avoids false failures.
  await expect(page).toHaveURL(/http:\/\/localhost:3000/);
});