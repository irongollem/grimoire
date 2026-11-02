/**
 * Helpers for the long `yt-combat` video. The scene itself is `setupCombat` / `teardownCombat` (setup/combat.ts):
 * the same "Working Kitchen" fight the Reels film, put back before a take. Nothing here writes to the database;
 * these are only the locators and the turn order the shots share.
 */
import type { Locator, Page } from "playwright";
import { combatantWrap } from "./combat.ts";

/** The order the video plays: the Toffee Maw leads, then Fresco, and a dead Hound is skipped on the way round. */
export const ORDER = {
  "Toffee Maw": 21,
  Fresco: 18,
  Chicory: 16,
  "Rosetta \"Rosie\" Vermeil": 14,
  "Marzipan Sentry": 12,
  "Spun Glass Hound 1": 11,
  "Vellum Ochre": 9,
  "Spun Glass Hound 2": 8,
  "Toddy Bellows": 6,
};

/** The monsters the DM reveals in the lobby, so the players see all of them. */
export const MONSTERS = ["Marzipan Sentry", "Toffee Maw", "Spun Glass Hound 1", "Spun Glass Hound 2"];

/** The HP box of a runner row. */
export function hpOf(page: Page, name: string): Locator {
  return combatantWrap(page, name).locator(".hp-cell input").first();
}

/** The builder's card whose heading is `title` (Details, Party Members, Combatants, Difficulty Analysis). */
export function builderCard(page: Page, title: string): Locator {
  return page.locator("div.rounded-lg.border", { has: page.getByRole("heading", { name: title, exact: true }) }).first();
}

/** The builder's smaller cards (Events, Loot, Traps & Hazards) have a title span rather than a heading. */
export function sideCard(page: Page, title: string): Locator {
  return page
    .locator("div.rounded-lg.border", { has: page.locator("span.text-label-lg", { hasText: new RegExp(`^\\s*${title}`) }) })
    .first();
}

/** Scrolls the stat block panel (its own scroller, not the page) smoothly. */
export async function scrollPanel(page: Page, dy: number, ms = 800): Promise<void> {
  const box = await page.locator(".panel-shell").boundingBox();
  if (!box) throw new Error("The stat block panel is not open.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const steps = Math.round(ms / 16);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(250);
}

/** Waits until `name` is the combatant whose turn it is. */
export async function waitActive(page: Page, name: string): Promise<void> {
  await page.locator(".combatant-row.is-active", { hasText: name }).waitFor({ timeout: 8_000 });
}
