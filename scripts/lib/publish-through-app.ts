/**
 * Publishes a Cartographer drawing the way a DM does: signs in as dm-fixture in a headless Chrome, opens the drawing
 * and presses Publish in the review. The app's own code bakes, uploads and writes the site, its rooms, ways and
 * snapshot. Shared by `dev:showcase` and the promo map setups. Loopback only: callers pass a local app URL.
 */

import { quote, sql } from "./dev-db.ts";
import { LOCAL_DEV_PASSWORD } from "./dev-stack.ts";

const FIXTURE_EMAIL = "dm-fixture@example.invalid";

export interface PublishTarget {
  dbUrl: string;
  campaignId: string;
  app: string;
  mapId: string;
  siteId: string;
}

/**
 * Signs in as dm-fixture in a headless Chrome, opens the drawing in the Cartographer and presses Publish in the
 * review: the app's own code bakes, uploads and writes the site, its rooms, ways and snapshot.
 */
export async function publishThroughApp(target: PublishTarget): Promise<void> {
  const { dbUrl, campaignId, app, mapId, siteId } = target;
  const { chromium } = await import("playwright");
  // The installed Chrome, as the promo scripts use: the bundled build is only there after `npx playwright install`.
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
    });
    await context.addInitScript(
      `localStorage.setItem("grimoire:user-mode", JSON.stringify("dm")); localStorage.setItem("grimoire_active_campaign", ${JSON.stringify(campaignId)}); localStorage.setItem("grimoire_active_campaign_dm", ${JSON.stringify(campaignId)});`,
    );
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    page.on("pageerror", (e) => console.warn(`  app error: ${e.message}`));

    try {
      await page.goto(`${app}/login`);
      await page.locator('input[autocomplete="username"]').fill(FIXTURE_EMAIL);
      await page
        .locator('input[autocomplete="current-password"]')
        .fill(LOCAL_DEV_PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 30_000,
      });

      await page.goto(`${app}/cartographer/${mapId}`);
      // The editor loads every published tile set in the background. Publishing before they are in bakes the water and
      // the sway from placeholders, so wait for the page to go quiet first.
      await page.waitForLoadState("networkidle", { timeout: 90_000 });
      await page.waitForTimeout(2_000);
      // A fixture campaign with a session left open asks "Still playing?" a few seconds after load.
      await page
        .getByRole("button", { name: "Still playing" })
        .click({ timeout: 8_000 })
        .catch(() => undefined);
      await page.getByRole("button", { name: "Map", exact: true }).click();
      await page.getByText("Review changes to the site").click();
      await page.getByRole("heading", { name: "Publish to Atlas" }).waitFor();
      const publish = page.getByRole("button", {
        name: /^Publish \d+ changes?$/,
      });
      await publish.waitFor();
      // The picker has the site preselected (the drawing already names it as its source); a plan appears once loaded.
      await page
        .getByText("Pick a place to publish")
        .waitFor({ state: "detached" });
      await publish.click();

      // Done when the modal closes and the site claims the drawing's rev; a failure leaves the error in the modal.
      const deadline = Date.now() + 240_000;
      for (;;) {
        const state = sql(
          dbUrl,
          `select (l.map_published_rev = m.rev) from public.locations l join public.dungeon_maps m on m.id = l.source_map_id where l.id = ${quote(siteId)}`,
        );
        if (state === "t") break;
        const failure = await page
          .locator("p.text-destructive")
          .first()
          .textContent({ timeout: 500 })
          .catch(() => null);
        if (failure)
          throw new Error(`Publish failed in the app: ${failure.trim()}`);
        if (Date.now() > deadline)
          throw new Error("Publish did not finish within four minutes.");
        await page.waitForTimeout(1500);
      }
    } catch (error) {
      // Set SHOWCASE_SHOT=/some/file.png to see what the headless page was looking at.
      if (process.env.SHOWCASE_SHOT)
        await page
          .screenshot({ path: process.env.SHOWCASE_SHOT })
          .catch(() => undefined);
      throw error;
    }
  } finally {
    await browser.close();
  }
}

