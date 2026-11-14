/** "Late in the Kind Country" on the DM fixture: the full campaign the demo comes from, put there by `npm run dev:campaigns`. */
import { quote, sql } from "../../lib/dev-db.ts";
import { FIXTURE_EMAIL } from "../../lib/dev-campaign-io.ts";
import { localDb } from "./demo.ts";

export const KIND_COUNTRY = "Late in the Kind Country";

export function kindCountryCampaignId(): string {
  const id = sql(
    localDb(),
    `select c.id from public.campaigns c join auth.users u on u.id = c.user_id
      where c.name = ${quote(KIND_COUNTRY)} and u.email = ${quote(FIXTURE_EMAIL)} limit 1`,
  );
  if (!id) throw new Error(`The DM fixture has no "${KIND_COUNTRY}". Run \`npm run dev:campaigns\`.`);
  return id;
}
