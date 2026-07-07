import { test, expect } from '@playwright/test';

/**
 * Smoke test: the apps/web (@topview/web) dev server boots and renders its
 * SPA shell. Deliberately black-box — it asserts against the served HTML/DOM
 * only (never imports from apps/web/src), matching this suite's contract of
 * driving a *running* apps/web over HTTP (see ../package.json,
 * docs/architecture.md).
 *
 * Assertions are kept structural rather than content-specific (no copy/text
 * assumptions) so this test stays stable as the upload/pipeline/editor UI
 * described in the blueprint is built out on top of the shell.
 */
test.describe('apps/web app shell', () => {
  test('serves the SPA and mounts the React root without crashing', async ({ page }) => {
    // Uncaught exceptions are a strong "it crashed" signal. Deliberately not
    // also failing on console.error here: that would make this smoke test
    // fragile against benign framework/dev-mode warnings unrelated to the
    // shell actually rendering.
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    const response = await page.goto('/');
    expect(response, 'dev server should respond to GET /').not.toBeNull();
    expect(response?.ok(), `expected 2xx from ${response?.url()}, got ${response?.status()}`).toBeTruthy();

    // Vite's index.html mounts the React app into #root (apps/web/index.html
    // + src/main.tsx per the blueprint) — assert the mount point exists and
    // that React has actually rendered something into it, rather than
    // asserting specific copy.
    const root = page.locator('#root');
    await expect(root).toBeAttached();
    await expect(root).not.toBeEmpty();

    expect(pageErrors, `uncaught page errors: ${pageErrors.map((e) => e.message).join('; ')}`).toEqual([]);
  });

  test('serves a well-formed HTML document with a title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
  });
});
