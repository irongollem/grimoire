#!/usr/bin/env tsx
/**
 * Fills a notice board with real written notices on the local stack, so the
 * notice-board feature (#1064) can be looked at with actual content.
 *
 * ## Which campaign
 *
 * The published demo copy (Sugarwell) that `npm run dev:demo` puts on the DM
 * fixture: the campaign `dm-fixture` owns in which `player-fixture` is seated
 * with a claimed character. It is the only campaign where both sides of a board
 * can be seen, and its content is public by design. Run `npm run dev:demo`
 * first; this script exits with that message if there is none.
 *
 * ## Usage
 *
 *   npm run dev:notice-board                  # (re)create the board, pins, quests, handouts
 *   npm run dev:notice-board -- --present     # put the board on the table (presented_at = now)
 *   npm run dev:notice-board -- --unpresent   # take it off the table again
 *   npm run dev:notice-board -- --clear       # remove only what this script made
 *
 * ## How its own rows are found
 *
 * The board table has no free marker column, and a board's name depends on the
 * place it hangs at. So the two quests and two handouts carry the tag
 * `dev-notice-board-fixture`, and a board counts as the fixture's when one of
 * its pins links a tagged quest. Deleting that board cascades its pins and its
 * place placement; the tagged quests and handouts are then deleted. A board a
 * DM made by hand never links a tagged quest, so it is never touched.
 *
 * Loopback-only, through the shared guard in `lib/dev-stack.ts`.
 */
import { parseArgs } from "node:util";
import {
  boardNameFor,
  buildFixtureQuests,
  FALLBACK_BOUNTY_TARGET,
  FIXTURE_PINS,
  FIXTURE_TAG,
  layoutProblems,
  pickBoardPlace,
  TAKEN_DAYS_AGO,
  TAKEN_SESSION_NUMBER,
  tiptapDoc,
} from "./dev-notice-board-fixture.data.ts";
import { quote, sql } from "./lib/dev-db.ts";
import { readLocalStack } from "./lib/dev-stack.ts";

const DM_EMAIL = "dm-fixture@example.invalid";
const PLAYER_EMAIL = "player-fixture@example.invalid";

interface Target {
  ownerId: string;
  campaignId: string;
  campaignName: string;
  partyMemberId: string;
  partyMemberName: string;
}

function findTarget(dbUrl: string): Target | null {
  const row = sql(
    dbUrl,
    `select c.user_id, c.id, c.name, cm.party_member_id, pm.name
       from public.campaigns c
       join auth.users dm on dm.id = c.user_id and dm.email = ${quote(DM_EMAIL)}
       join auth.users pl on pl.email = ${quote(PLAYER_EMAIL)}
       join public.campaign_members cm on cm.campaign_id = c.id and cm.user_id = pl.id
       join public.party_members pm on pm.id = cm.party_member_id
      where cm.party_member_id is not null
      order by (c.name ilike 'Sugarwell%') desc, c.created_at desc
      limit 1`,
  );
  if (!row) return null;
  const [ownerId, campaignId, campaignName, partyMemberId, partyMemberName] = row.split("\t");
  if (!ownerId || !campaignId || !campaignName || !partyMemberId || !partyMemberName) return null;
  return { ownerId, campaignId, campaignName, partyMemberId, partyMemberName };
}

function fixtureBoardIds(dbUrl: string, t: Target): string[] {
  return sql(
    dbUrl,
    `select distinct b.id from public.notice_boards b
       join public.notice_board_pins p on p.board_id = b.id
       join public.quests q on q.id = p.quest_id
      where b.campaign_id = ${quote(t.campaignId)} and ${quote(FIXTURE_TAG)} = any(q.tags)`,
  )
    .split("\n")
    .filter(Boolean);
}

/** Removes the board (pins and placement cascade), then the tagged quests and handouts. */
function clearFixture(dbUrl: string, t: Target): string {
  const boards = fixtureBoardIds(dbUrl, t);
  if (boards.length > 0) {
    sql(
      dbUrl,
      `delete from public.notice_boards where id in (${boards.map(quote).join(",")})`,
    );
  }
  const quests = sql(
    dbUrl,
    `with d as (delete from public.quests
                 where user_id = ${quote(t.ownerId)} and campaign_id = ${quote(t.campaignId)}
                   and ${quote(FIXTURE_TAG)} = any(tags) returning id)
     select count(*) from d`,
  );
  const docs = sql(
    dbUrl,
    `with d as (delete from public.scriptorium_documents
                 where user_id = ${quote(t.ownerId)} and campaign_id = ${quote(t.campaignId)}
                   and ${quote(FIXTURE_TAG)} = any(tags) returning id)
     select count(*) from d`,
  );
  return `Cleared ${boards.length} board(s), ${quests} quest(s), ${docs} handout(s) from "${t.campaignName}".`;
}

function insertQuest(dbUrl: string, t: Target, title: string, summary: string): string {
  return sql(
    dbUrl,
    `with ins as (
       insert into public.quests (user_id, campaign_id, title, summary, status, tags)
       values (${quote(t.ownerId)}, ${quote(t.campaignId)}, ${quote(title)}, ${quote(summary)},
               'undiscovered', array[${quote(FIXTURE_TAG)}])
       returning id)
     select id from ins`,
  );
}

function insertHandout(dbUrl: string, t: Target, title: string, paragraphs: readonly string[]): string {
  const words = paragraphs.join(" ").split(/\s+/).length;
  return sql(
    dbUrl,
    `with ins as (
       insert into public.scriptorium_documents
         (user_id, campaign_id, title, content, doc_type, tags, word_count)
       values (${quote(t.ownerId)}, ${quote(t.campaignId)}, ${quote(title)},
               ${quote(JSON.stringify(tiptapDoc(paragraphs)))}, 'custom',
               array[${quote(FIXTURE_TAG)}], ${words})
       returning id)
     select id from ins`,
  );
}

function pick(dbUrl: string, query: string): string[] {
  return sql(dbUrl, query).split("\t");
}

function setPresented(dbUrl: string, t: Target, present: boolean): string {
  const boards = fixtureBoardIds(dbUrl, t);
  if (boards.length === 0) return "No fixture board found. Run `npm run dev:notice-board` first.";
  sql(
    dbUrl,
    `update public.notice_boards set presented_at = ${present ? "now()" : "null"}
      where id in (${boards.map(quote).join(",")})`,
  );
  return present ? "Board is now on the table (presented)." : "Board is no longer presented.";
}

function build(dbUrl: string, t: Target): void {
  const problems = layoutProblems(FIXTURE_PINS);
  if (problems.length > 0) throw new Error(`Fixture layout is broken: ${problems.join("; ")}`);

  console.log(clearFixture(dbUrl, t));

  const placeRows = sql(
    dbUrl,
    `select id, name from public.locations where campaign_id = ${quote(t.campaignId)} order by created_at, name`,
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, name] = line.split("\t");
      // A row without both columns would put an empty id into the SQL that follows; stop instead.
      if (!id || !name) throw new Error(`Malformed locations row from the database: ${JSON.stringify(line)}`);
      return { id, name };
    });
  const place = pickBoardPlace(placeRows);
  const boardName = boardNameFor(place);

  // Art for the bounty poster (an NPC with a portrait) and the "have you seen
  // this" pin (an item picture, else a place picture). Absent art is not an error.
  const npc = pick(
    dbUrl,
    `select name, portrait_url from public.npcs
      where campaign_id = ${quote(t.campaignId)} and portrait_url is not null order by name limit 1`,
  );
  const [npcName, npcPortrait] = npc;
  const found = pick(
    dbUrl,
    `select url from (
       select image_url as url, 0 as rank from public.items
        where campaign_id = ${quote(t.campaignId)} and image_url is not null
       union all
       select image_url, 1 from public.locations
        where campaign_id = ${quote(t.campaignId)} and image_url is not null
     ) s order by rank, url limit 1`,
  );
  const foundImage = found[0] || null;

  const subject = npcName || FALLBACK_BOUNTY_TARGET;
  const questHandouts = buildFixtureQuests(subject).map((q) => ({
    questId: insertQuest(dbUrl, t, q.title, q.summary),
    handoutId: insertHandout(dbUrl, t, q.handoutTitle, q.handout),
  }));

  const boardId = sql(
    dbUrl,
    `with ins as (
       insert into public.notice_boards (user_id, campaign_id, name, surface, is_revealed)
       values (${quote(t.ownerId)}, ${quote(t.campaignId)}, ${quote(boardName)}, 'cork', true)
       returning id)
     select id from ins`,
  );
  if (place) {
    sql(
      dbUrl,
      `insert into public.location_placements (user_id, location_id, notice_board_id)
       values (${quote(t.ownerId)}, ${quote(place.id)}, ${quote(boardId)})`,
    );
  }

  let inserted = 0;
  FIXTURE_PINS.forEach((pin, order) => {
    if (pin.style === "image" && !foundImage) return;
    const linked = pin.questIndex === undefined ? null : questHandouts[pin.questIndex];
    const isBounty = pin.style === "poster";
    const headline = isBounty ? subject : pin.headline;
    const imageUrl = isBounty ? (npcName ? npcPortrait || null : null) : pin.style === "image" ? foundImage : null;
    const taken = pin.status === "taken";
    sql(
      dbUrl,
      `insert into public.notice_board_pins
         (user_id, campaign_id, board_id, style, headline, body, reward, image_url, seal, size,
          x, y, sort_order, status, quest_id, handout_id, taken_by, taken_at, taken_session_number)
       values (${quote(t.ownerId)}, ${quote(t.campaignId)}, ${quote(boardId)}, ${quote(pin.style)},
         ${quote(headline)}, ${quote(pin.body)}, ${pin.reward ? quote(pin.reward) : "null"},
         ${imageUrl ? quote(imageUrl) : "null"}, ${pin.seal ? quote(pin.seal) : "null"}, ${quote(pin.size)},
         ${pin.x}, ${pin.y}, ${order}, ${quote(pin.status)},
         ${linked ? quote(linked.questId) : "null"}, ${linked ? quote(linked.handoutId) : "null"},
         ${taken ? quote(t.partyMemberId) : "null"},
         ${taken ? `now() - interval '${TAKEN_DAYS_AGO} days'` : "null"},
         ${taken ? TAKEN_SESSION_NUMBER : "null"})`,
    );
    inserted += 1;
  });

  console.log(`Notice board fixture ready.\n`);
  console.log(`  campaign  ${t.campaignName}`);
  console.log(`  board     ${boardName}`);
  console.log(`  hangs at  ${place ? place.name : "(no places in the campaign; not placed)"}`);
  console.log(`  pins      ${inserted} of ${FIXTURE_PINS.length}${foundImage ? "" : " (no picture found, image pin skipped)"}`);
  console.log(`  bounty    ${npcName ? `${npcName} (portrait ${npcPortrait ? "copied" : "missing"})` : `${FALLBACK_BOUNTY_TARGET} (no NPC portrait)`}`);
  console.log(`  taken by  ${t.partyMemberName}, session ${TAKEN_SESSION_NUMBER}`);
  console.log(`\nSign in as ${DM_EMAIL} / grimoire-local-dev. Put it on the table with \`npm run dev:notice-board -- --present\`;`);
  console.log(`remove everything with \`npm run dev:notice-board -- --clear\`.`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      clear: { type: "boolean", default: false },
      present: { type: "boolean", default: false },
      unpresent: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  const stack = readLocalStack();
  const target = findTarget(stack.DB_URL);
  if (!target) {
    console.error(
      `No campaign owned by ${DM_EMAIL} with ${PLAYER_EMAIL} seated and a claimed character. ` +
        `Run \`npm run dev:auth\` and then \`npm run dev:demo\` first.`,
    );
    process.exit(1);
  }

  if (values.clear) {
    console.log(clearFixture(stack.DB_URL, target));
  } else if (values.present) {
    console.log(setPresented(stack.DB_URL, target, true));
  } else if (values.unpresent) {
    console.log(setPresented(stack.DB_URL, target, false));
  } else {
    build(stack.DB_URL, target);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
