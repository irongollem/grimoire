/**
 * The pure halves of the account-level and player-side content `dev-campaigns.ts`
 * writes: the Hall of Heroes copy, and the rows a player authors that can never
 * come from production (journal entries, discovered monsters, shared recipes).
 * Kept apart from the script so the statements can be tested without a stack.
 *
 * The player-side text is invented and deliberately generic. A real player's
 * journal is theirs, and this repo is public: nothing here is, or is derived
 * from, production content.
 */
import { markdownToTiptap } from "./tiptap.ts";
import { dollar, ident, sharedColumns, uuid } from "./dev-demo-sql.ts";

/** Marks the journal rows this script wrote, so a re-run replaces exactly those. */
export const FIXTURE_TAG = "dev-fixture";

export type JournalCategory = "adventure" | "clue" | "discovery" | "session" | "character" | "rumor";

export interface JournalDraft {
  title: string;
  /** Tiptap JSON, as the journal editor stores it. */
  content: string;
  category: JournalCategory;
  tags: string[];
  is_private: boolean;
  shared_with_dm: boolean;
}

const CATEGORIES: JournalCategory[] = ["adventure", "clue", "discovery", "session", "character", "rumor"];
const PLACES = ["the old toll bridge", "a drowned chapel", "the salt road", "a lantern-lit market", "the charcoal burners' camp", "a hedge maze", "the east watchtower", "a ruined mill"];
const FOLK = ["a limping tinker", "two nervous guards", "an innkeeper with ink-stained fingers", "a boy selling maps", "a veiled courier", "the ferry widow", "a retired cartographer", "a travelling bell-ringer"];
const FINDS = ["a key with no lock to match", "a ledger missing its last page", "a map marked in three different hands", "a coin none of us could place", "a wax seal pressed with a crescent", "a feather too large for any bird we know", "a letter addressed to nobody", "a lantern that burns cold"];
const THOUGHTS = ["Worth asking about again once we are rested.", "I do not trust how tidy it all was.", "Noting it here so I do not forget.", "The others disagree, but I think it matters.", "Mark this one for when we return.", "It may be nothing. It may not."];

/** Deterministic, so two runs write the same prose and a diff of the fixture is meaningful. */
export function journalDrafts(count: number): JournalDraft[] {
  return Array.from({ length: count }, (_, i) => {
    const category = CATEGORIES[i % CATEGORIES.length];
    const place = PLACES[(i * 3) % PLACES.length];
    const folk = FOLK[(i * 5 + 1) % FOLK.length];
    const find = FINDS[(i * 7 + 2) % FINDS.length];
    const thought = THOUGHTS[i % THOUGHTS.length];
    const content = markdownToTiptap(
      `We reached ${place} and met ${folk}, who would say little.\n\nAmong their things: ${find}. ${thought}`,
    );
    if (content === null) throw new Error("A journal draft rendered to nothing.");
    return {
      title: `Entry ${i + 1}: ${place.replace(/^(the|a) /, "")}`,
      content,
      category,
      tags: [FIXTURE_TAG],
      // A spread of the two sharing states, so a list shows both.
      is_private: i % 4 !== 0,
      shared_with_dm: i % 4 === 0,
    };
  });
}

export interface PlayerContentPlan {
  campaignId: string;
  playerId: string;
  /** The character the player claimed. Without one there is nobody to share recipes or monsters with. */
  partyMemberId: string | null;
  journal: JournalDraft[];
  monsterLimit: number;
  recipeLimit: number;
}

/**
 * One transaction that replaces this script's player-side rows in a campaign.
 *
 * Triggers stay on: `discovered_monsters` stamps the open session and checks
 * same-campaign references, and the point is to get rows the app would have
 * written. The deletes come first, scoped to what this script owns (the tagged
 * journal entries; the whole campaign's discovered monsters, which a copy made
 * by `copy_demo_template` starts without).
 */
export function buildPlayerContentSql(plan: PlayerContentPlan): string {
  const campaign = uuid(plan.campaignId);
  const player = uuid(plan.playerId);
  const member = plan.partyMemberId === null ? null : uuid(plan.partyMemberId);
  const journal = `${dollar(JSON.stringify(plan.journal), "fx_journal")}::jsonb`;
  const limit = (n: number) => String(Math.max(0, Math.trunc(n)));

  const lines = [
    "begin;",
    `delete from public.player_journal_entries where user_id = '${player}' and campaign_id = '${campaign}' and tags @> array['${FIXTURE_TAG}'];`,
    // Newest first by construction: entry 1 is the most recent, so the list opens on it.
    "insert into public.player_journal_entries (user_id, campaign_id, title, content, category, tags, is_private, shared_with_dm, created_at, updated_at) " +
      `select '${player}', '${campaign}', x.title, x.content, x.category, x.tags, x.is_private, x.shared_with_dm, ` +
      "now() - (e.n * interval '7 hours'), now() - (e.n * interval '7 hours') " +
      `from jsonb_array_elements(${journal}) with ordinality as e(v, n) ` +
      "cross join lateral jsonb_to_record(e.v) as x(title text, content text, category text, tags text[], is_private boolean, shared_with_dm boolean);",
    `delete from public.discovered_monsters where campaign_id = '${campaign}';`,
    // The campaign's own monsters first, then the library monsters its enabled
    // sources offer: a real table's bestiary is mostly library creatures, and a
    // campaign may hold none of its own (the richest one holds one).
    "insert into public.discovered_monsters (campaign_id, monster_id, library_monster_id, visible_to, reveal_stats) " +
      `select '${campaign}', c.monster_id, c.library_monster_id, ${member === null ? "null::uuid[]" : `array['${member}']::uuid[]`}, c.n % 3 = 0 ` +
      "from (select x.*, row_number() over (order by x.own desc, x.name) as n from (" +
      `select m.id as monster_id, null::text as library_monster_id, m.name, true as own from public.monsters m where m.campaign_id = '${campaign}' ` +
      "union all " +
      "select null::uuid, lm.id, lm.name, false from public.library_monsters lm " +
      `where lm.source in (select s.source_slug from public.campaign_enabled_sources s where s.campaign_id = '${campaign}')` +
      `) x) c where c.n <= ${limit(plan.monsterLimit)};`,
  ];
  if (member !== null) {
    // A recipe reaches a character through its own `player_visible_to`, the
    // sharing column every module uses. Only ever added to: the copy carries
    // the DM's own sharing, which a replace would wipe, and adding the first
    // recipes by name again on a re-run changes nothing.
    lines.push(
      `update public.crafting_recipes set player_visible_to = array_append(player_visible_to, '${member}') ` +
        `where id in (select r.id from public.crafting_recipes r where r.campaign_id = '${campaign}' order by r.name limit ${limit(plan.recipeLimit)}) ` +
        `and not '${member}' = any(player_visible_to);`,
    );
  }
  lines.push("commit;");
  return lines.join("\n") + "\n";
}

/**
 * Replaces the account's Hall of Heroes with fresh copies of the pulled rows.
 *
 * The hall is account-level (no campaign), and nothing references its rows, so
 * a copy needs only a new id and a new owner. The fixture's hall is made by
 * this script alone, which is why it is replaced whole rather than by marker.
 */
export function buildHallSql(
  rows: Record<string, unknown>[],
  localColumns: string[],
  fixtureId: string,
  tag: string,
): string {
  const owner = uuid(fixtureId);
  const lines = ["begin;", `delete from public.hall_of_heroes where user_id = '${owner}';`];
  if (rows.length > 0) {
    const cols = sharedColumns("hall_of_heroes", localColumns, rows).filter((c) => c !== "id" && c !== "user_id");
    const stamped = "e || jsonb_build_object('id', gen_random_uuid(), 'user_id', " + `'${owner}'::text)`;
    lines.push(
      `insert into public.hall_of_heroes (id, user_id, ${cols.map(ident).join(", ")}) ` +
        `select x.id, x.user_id, ${cols.map((c) => `x.${c}`).join(", ")} ` +
        `from jsonb_array_elements(${dollar(JSON.stringify(rows), tag)}::jsonb) e ` +
        `cross join lateral jsonb_populate_record(null::public.hall_of_heroes, ${stamped}) x;`,
    );
  }
  lines.push("commit;");
  return lines.join("\n") + "\n";
}
