/**
 * The "Getting started" YouTube video's scene, in the local demo copy only.
 *
 * The video types an invite label and presses Generate Link on camera, so no
 * invite with that label may be left from an earlier take, and no session may
 * be open (an open session flips the dashboard to its At the table view before
 * the first shot). The New Campaign form is opened and cancelled, never
 * submitted, but a Free account at its campaign limit gets the paywall instead
 * of the form, so the DM fixture is Pro for the take, exactly as
 * `dev:campaigns` already leaves it, and put back afterwards.
 *
 * Everything here runs through the loopback guard in `localDb()`.
 */
import { runSqlFile } from "../../lib/dev-campaign-io.ts";
import { quote, sql } from "../../lib/dev-db.ts";
import { FIXTURE_EMAIL } from "../../lib/dev-campaign-io.ts";
import { demoCampaignId, localDb } from "./demo.ts";

/** The label the video types into the invite form; setup and teardown both remove invites that carry it. */
export const INVITE_LABEL = "For Alice";

/** The fixture's subscription row before the take: null when it had none, so teardown can delete the one setup wrote. */
let previousPlan: { plan: string; status: string } | null | undefined;

function fixtureId(): string {
  const id = sql(localDb(), `select id from auth.users where email = ${quote(FIXTURE_EMAIL)}`);
  if (!id) throw new Error("The DM fixture does not exist. Run `npm run dev:auth` first.");
  return id;
}

function removeInvitesSql(campaign: string): string {
  return `delete from public.campaign_invites where campaign_id = ${campaign} and label = ${quote(INVITE_LABEL)};`;
}

export function setupYtGettingStarted(): void {
  const campaignId = demoCampaignId();
  const c = quote(campaignId);
  const owner = quote(fixtureId());
  const row = sql(localDb(), `select plan_id || E'\\t' || status from public.user_subscriptions where user_id = ${owner}`);
  if (previousPlan === undefined) {
    // Only the first call of a process remembers: a second setup would otherwise record the Pro row it wrote itself.
    previousPlan = row ? { plan: row.split("\t")[0], status: row.split("\t")[1] } : null;
  }
  runSqlFile(
    localDb(),
    `begin;
     ${removeInvitesSql(c)}
     update public.campaign_sessions set ended_at = now() where campaign_id = ${c} and started_at is not null and ended_at is null;
     insert into public.user_subscriptions (user_id, plan_id, status) values (${owner}, 'pro', 'active')
       on conflict (user_id) do update set plan_id = 'pro', status = 'active';
     commit;`,
  );
}

/** After the last shot: removes the invite the take generated and puts the fixture's plan back. */
export function teardownYtGettingStarted(): void {
  const campaignId = demoCampaignId();
  const c = quote(campaignId);
  const owner = quote(fixtureId());
  const restore =
    previousPlan === undefined
      ? ""
      : previousPlan === null
        ? `delete from public.user_subscriptions where user_id = ${owner};`
        : `update public.user_subscriptions set plan_id = ${quote(previousPlan.plan)}, status = ${quote(previousPlan.status)} where user_id = ${owner};`;
  runSqlFile(localDb(), `begin; ${removeInvitesSql(c)} ${restore} commit;`);
}
