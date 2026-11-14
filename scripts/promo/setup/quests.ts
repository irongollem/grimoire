/**
 * The quest episodes' scene, in the local demo copy only.
 *
 * Both episodes film "The Locked Workshop" in the DM fixture's demo campaign. A take leaves a running cursor
 * (`quest_runtime_state`), transitions, revealed beats, ticked objectives and fired consequences, so `setupQuests`
 * puts the quest back to "active, nothing run yet, shared with Chicory" before every take and `teardownQuests`
 * puts it back as the demo ships it (hidden from players, no words written for the reveal). The party's first
 * position is made in a browser (Party here on the entry beat), the way the DM makes it.
 */
import { runSqlFile } from "../../lib/dev-campaign-io.ts";
import { quote, sql } from "../../lib/dev-db.ts";
import type { Offstage } from "../types.ts";
import { demoCampaignId, localDb } from "./demo.ts";

const TITLE = "The Locked Workshop";

/** What a player is told when each of the first beats is revealed (Tiptap docs, Sugarwell's voice). */
const REVEAL_TEXT: Record<string, string> = {
  "Sister Ribbon's Offer": "Sister Ribbon of the Confectioners' Guild asked you to open Master Nougatine's workshop, shut for twelve years, so her apprentice Honeycomb can inherit it.",
  "The Sealed Door": "The workshop door is glazed shut with old sugar. Something inside is still ticking.",
  "The Watching Pack": "Spun glass hounds lift their heads in the dark hall, and the ticking stops.",
};

function doc(text: string): string {
  return quote(JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }));
}

function questId(): string {
  const id = sql(localDb(), `select id from public.quests where campaign_id = ${quote(demoCampaignId())} and title = ${quote(TITLE)}`);
  if (!id) throw new Error(`The demo campaign has no quest "${TITLE}". Has the demo template changed?`);
  return id;
}

/** Everything a run leaves behind on the quest, as one statement block. `shared` is whether Chicory has been told of it: a quest shows when one of its beats does, so that is the entry beat rumored. */
function resetSql(shared: boolean): string {
  const c = quote(demoCampaignId());
  const q = quote(questId());
  const reveals = Object.entries(REVEAL_TEXT)
    .map(([title, text]) => `update public.quest_beats set reveal_text = ${shared ? doc(text) : "null"} where quest_id = ${q} and title = ${quote(title)};`)
    .join("\n");
  return `begin;
    delete from public.quest_consequence_events where quest_id = ${q};
    delete from public.quest_beat_transitions where to_quest_id = ${q} or from_quest_id = ${q};
    delete from public.quest_runtime_state where quest_id = ${q};
    delete from public.quest_threads where quest_id = ${q} and label <> 'Main';
    update public.quest_beats set visibility = 'hidden' where quest_id = ${q};
    ${reveals}
    update public.quest_objectives set status = 'pending' where quest_id = ${q} and status <> 'dormant';
    update public.quest_objectives set status = 'dormant' where quest_id = ${q} and sort_order = 3;
    update public.quests set status = 'active' where id = ${q} and campaign_id = ${c};
    ${shared ? `update public.quest_beats set visibility = 'rumored' where id = (select entry_beat_id from public.quests where id = ${q});` : ""}
  commit;`;
}

export function setupQuests(): void {
  runSqlFile(localDb(), resetSql(true));
}

export function teardownQuests(): void {
  runSqlFile(localDb(), resetSql(false));
}

export const QUEST_PATH = () => `/quests/${questId()}`;

/** The offstage DM ticks Party here on the entry beat. Arriving reveals a beat (#1194), so this is what shows the first scene to players. */
export async function arriveAtEntry(dm: Offstage): Promise<void> {
  await dm.page.goto(`${dm.base}${QUEST_PATH()}`);
  await dm.page.getByText("Sister Ribbon's Offer").first().click({ timeout: 30_000 });
  await dm.page.getByRole("checkbox", { name: "Party here" }).first().click();
  await dm.page.getByText("Party is here", { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 20_000 });
}

/** The offstage DM takes the one route out under Where it can go and advances: The Sealed Door, which completes the first objective. */
export async function advanceToNextBeat(dm: Offstage): Promise<void> {
  await dm.page.getByRole("region", { name: "Where it can go" }).getByRole("button", { name: /^Take / }).first().click();
  await dm.page.getByRole("button", { name: "Advance", exact: true }).last().click();
  await dm.page.getByRole("dialog").waitFor({ state: "detached", timeout: 20_000 });
}
