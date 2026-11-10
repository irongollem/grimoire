/**
 * Where promo episodes are filmed: the DM fixture's copy of the published demo
 * campaign, the one campaign that is public by design. `npm run dev:demo`
 * makes it and seats the player fixture there with a character.
 *
 * Never film another campaign. `dev:campaigns` puts the maintainer's own
 * production campaigns on the same account, and those are nobody's to publish.
 */
import { sql, quote } from "../../lib/dev-db.ts";
import { readLocalStack } from "../../lib/dev-stack.ts";
import { FIXTURE_EMAIL, PLAYER_EMAIL } from "../../lib/dev-campaign-io.ts";

let dbUrl: string | null = null;

/** The local database, past the loopback guard. */
export function localDb(): string {
  dbUrl ??= readLocalStack().DB_URL;
  return dbUrl;
}

/** The DM fixture's demo copy: a campaign it owns that was loaded from a demo template. */
export function demoCampaignId(): string {
  const id = sql(
    localDb(),
    `select c.id from public.campaigns c join auth.users u on u.id = c.user_id
      where u.email = ${quote(FIXTURE_EMAIL)} and c.demo_source is not null
      order by c.demo_source desc limit 1`,
  );
  if (!id) throw new Error("The DM fixture has no demo campaign. Run `npm run dev:auth` and then `npm run dev:demo`.");
  return id;
}

/**
 * Answers the campaign's AI question for a fresh demo copy, as "off". A copy whose `ai_enabled` was never chosen
 * opens the first-visit "Bring AI to this campaign?" chooser over the DM's screen, which blocked every tap of a
 * take after `dev:demo` made a new copy (10 Nov 2026). Off is what an unchosen campaign already shows, so the
 * footage is unchanged; a choice already made (the Cartographer Reel styles with AI) is left alone.
 */
export function settleAiChoice(campaignId: string): void {
  sql(localDb(), `update public.campaigns set ai_enabled = false where id = ${quote(campaignId)} and ai_enabled is null`);
}

/** The character the player fixture plays in the demo copy. */
export function playerCharacter(campaignId: string): { id: string; name: string } {
  const row = sql(
    localDb(),
    `select pm.id || E'\\t' || pm.name from public.party_members pm join auth.users u on u.id = pm.owner_user_id
      where pm.campaign_id = ${quote(campaignId)} and u.email = ${quote(PLAYER_EMAIL)} limit 1`,
  );
  if (!row) throw new Error("The player fixture has no character in the demo campaign. Run `npm run dev:demo` again.");
  const [id, name] = row.split("\t");
  return { id, name };
}

/** One id by name in the demo copy, or a clear error naming what is missing. */
export function idByName(table: "items" | "crafting_recipes", campaignId: string, name: string): string {
  const id = sql(localDb(), `select id from public.${table} where campaign_id = ${quote(campaignId)} and name = ${quote(name)} limit 1`);
  if (!id) throw new Error(`The demo campaign has no ${table} row named "${name}". Has the demo template changed?`);
  return id;
}
