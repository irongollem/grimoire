// The DM fixture's own campaign: the clone `dev:auth` makes and names "<source> (fixture)".
//
// Not "the owner's earliest campaign", which is what every fixture script used to take: `dev:campaigns` copies the
// maintainer's production campaigns onto the same account with their original creation dates, so the earliest
// became a March copy of a production campaign and the party, the fixture content, the fixture quest and the
// showcase map all landed in a campaign the DM fixture does not have open.

import { quote, sql } from "./dev-db.ts";

export const FIXTURE_CAMPAIGN_SUFFIX = " (fixture)";

export function fixtureCampaign(dbUrl: string, ownerId: string): { id: string; name: string } | null {
  const row = sql(
    dbUrl,
    `select id, name from public.campaigns
      where user_id = ${quote(ownerId)} and right(name, ${FIXTURE_CAMPAIGN_SUFFIX.length}) = ${quote(FIXTURE_CAMPAIGN_SUFFIX)}
      order by created_at limit 1`,
  );
  if (!row) return null;
  const [id, name] = row.split("\t");
  return { id, name };
}
