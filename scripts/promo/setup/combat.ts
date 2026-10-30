/**
 * The combat episodes' scene, in the local demo copy only.
 *
 * Both episodes film "The Working Kitchen" in the DM fixture's demo campaign. A take leaves a running fight
 * (an `encounter_state` row), an unnumbered open session (Go Live starts one), chat lines and wounded heroes, so
 * `setupCombat` clears all of that before a take and `teardownCombat` after it. The runner's own lobby
 * (Go Live, initiatives, reveals, Start combat) is driven in a browser by the helpers below, because a fight only
 * exists once somebody has clicked through it; the episodes call them from `prepare` or from a shot.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Page } from "playwright";
import { runSqlFile } from "../../lib/dev-campaign-io.ts";
import { quote } from "../../lib/dev-db.ts";
import type { Offstage } from "../types.ts";
import { sql } from "../../lib/dev-db.ts";
import { demoCampaignId, localDb } from "./demo.ts";

export const KITCHEN_ID = "1a88bf80-98bb-40e9-bd5e-589b2c1626e5";
export const RUN_PATH = `/encounters/${KITCHEN_ID}/run`;

/** Hit points the heroes start a fight with, by name: two of them are visibly worn, the rest are fresh. */
const START_HP: Record<string, number> = {
  "Rosetta \"Rosie\" Vermeil": 41,
  "Vellum Ochre": 19,
};

let takeStarted: string | null = null;

/**
 * The party's place in the Atlas is parked while a take runs. With a session open, the app plays the ambience of
 * wherever the party stands and pops the soundboard widget over the right-hand side of the runner on every page
 * load, which would cover the stat block the DM episode films. Where the party stood is kept in a file so a take
 * that was killed before its teardown still restores it on the next run.
 */
const PARKED = "promo-out/.combat-party-location";

function parkPartyLocation(c: string): void {
  if (!existsSync(PARKED)) {
    const at = sql(localDb(), `select coalesce(current_location_id::text, '') from public.campaigns where id = ${c}`);
    mkdirSync(dirname(PARKED), { recursive: true });
    writeFileSync(PARKED, at);
  }
  runSqlFile(localDb(), `update public.campaigns set current_location_id = null where id = ${c};`);
}

function restorePartyLocation(c: string): void {
  if (!existsSync(PARKED)) return;
  const at = readFileSync(PARKED, "utf8").trim();
  runSqlFile(localDb(), `update public.campaigns set current_location_id = ${at ? quote(at) : "null"} where id = ${c};`);
  rmSync(PARKED);
}

/** Everything a fight leaves behind that is not a hero's own row: the live state, the open session, the chat. */
function sweepSql(c: string, since: string, discovered: boolean): string {
  return `delete from public.encounter_state where campaign_id = ${c};
          update public.campaign_sessions set ended_at = now() where campaign_id = ${c} and started_at is not null and ended_at is null;
          delete from public.campaign_sessions where campaign_id = ${c} and (number is null or number > 2);
          delete from public.campaign_messages where campaign_id = ${c} and created_at >= ${since}::timestamptz;
          ${discovered ? `delete from public.discovered_monsters where discovered_at >= ${since}::timestamptz and campaign_id = ${c};` : ""}`;
}

function heroesSql(c: string): string {
  const wear = Object.entries(START_HP)
    .map(([name, hp]) => `update public.party_members set current_hp = least(${hp}, max_hp) where campaign_id = ${c} and name = ${quote(name)};`)
    .join("\n");
  return `update public.party_members
             set current_hp = max_hp, temp_hp = 0, conditions = '[]'::jsonb, concentration = null, current_initiative = null,
                 death_save_successes = 0, death_save_failures = 0
           where campaign_id = ${c};
          ${wear}`;
}

export function setupCombat(): void {
  const c = quote(demoCampaignId());
  takeStarted = new Date().toISOString();
  parkPartyLocation(c);
  runSqlFile(localDb(), `begin; ${sweepSql(c, "'2026-10-29'", false)} ${heroesSql(c)} commit;`);
}

/** After the last shot: no running fight, no open session, no chat lines, heroes whole again. */
export function teardownCombat(): void {
  const c = quote(demoCampaignId());
  runSqlFile(localDb(), `begin; ${sweepSql(c, quote(takeStarted ?? new Date(Date.now() - 3_600_000).toISOString()), true)} ${heroesSql(c)} commit;`);
  restorePartyLocation(c);
}

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The DM's own page (never filmed) on the runner, in the lobby. */
export async function openRunner(dm: Offstage): Promise<void> {
  await dm.page.goto(`${dm.base}${RUN_PATH}`);
  await dm.page.getByRole("button", { name: "Go Live" }).waitFor({ timeout: 30_000 });
  await dm.page.waitForTimeout(1500);
}

/** Types each combatant's initiative into its INIT box. */
export async function setInitiatives(page: Page, order: Record<string, number>): Promise<void> {
  for (const [name, value] of Object.entries(order)) {
    const field = page.getByLabel(new RegExp(`^Initiative for ${escape(name)}(,|$)`));
    await field.fill(String(value));
    await field.dispatchEvent("change");
  }
}

/** Hidden → unseen → revealed on a monster's portrait, so the players see it in the fight. */
export async function revealMonster(page: Page, name: string): Promise<void> {
  const row = page.locator(".combatant-row").filter({ hasText: name }).first();
  for (let i = 0; i < 3; i++) {
    if ((await row.getByRole("button", { name: "Revealed. Click to hide" }).count()) > 0) return;
    await row.locator(".reveal-btn").click();
    await page.waitForTimeout(250);
  }
  throw new Error(`Could not reveal ${name}.`);
}

/** Stops the fight's music and closes the soundboard panel it opens (Start combat plays the encounter's theme). */
export async function closeSoundboard(page: Page): Promise<void> {
  const stop = page.getByRole("button", { name: "Stop All" }).first();
  await stop.waitFor({ timeout: 1_500 }).catch(() => undefined);
  if (await stop.count()) {
    await stop.click();
    await page.waitForTimeout(800);
  }
  await page.getByRole("button", { name: "Close soundboard widget" }).first().click({ timeout: 1_500 }).catch(() => undefined);
}

/** One combatant's row with its quick damage strip, which sits in the same wrapper. */
export function combatantWrap(page: Page, name: string) {
  return page.locator(".combatant-wrap").filter({ has: page.locator(".combatant-name", { hasText: new RegExp(`^${escape(name)}$`) }) }).first();
}

/** The DM presses Next Turn in their own browser. */
export async function nextTurn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next Turn", exact: true }).click();
  await page.waitForTimeout(900);
}

/** The DM selects a combatant, types an amount into the quick strip and presses Dmg. */
export async function damage(page: Page, name: string, amount: number): Promise<void> {
  const wrap = combatantWrap(page, name);
  await wrap.locator(".combatant-name").click();
  await wrap.getByPlaceholder("amt").fill(String(amount));
  await wrap.getByRole("button", { name: "Dmg" }).click();
  await page.waitForTimeout(600);
}

/**
 * A target for the camera that is not an element: an invisible box at a place on the screen (CSS pixels). The
 * runner's rows run the full width of the page, and the camera frames whatever it is pointed at, so pointing it at
 * a row shows a thin strip of the whole width; pointing it at the list's left columns shows the part a phone can read.
 */
export async function aim(page: Page, box: { x: number; y: number; width: number; height: number }) {
  // Browser code as a string: the scripts' tsconfig has no DOM types.
  await page.evaluate(`(() => {
    let el = document.getElementById("promo-aim");
    if (!el) {
      el = document.createElement("div");
      el.id = "promo-aim";
      document.body.appendChild(el);
    }
    el.style.cssText = "position:fixed;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;opacity:0;pointer-events:none;z-index:-1";
  })()`);
  return page.locator("#promo-aim");
}

/** The runner's list columns (initiative, name, hit points) with the top bar above them: what the DM episode shows. */
export function listColumn(page: Page) {
  return aim(page, { x: 240, y: 0, width: 560, height: 900 });
}
