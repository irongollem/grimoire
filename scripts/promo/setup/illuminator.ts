/**
 * The scene for the `illuminator` Reel: a page of "Sothery: A Campaign Setting", the setting book that lives in the DM
 * fixture's copy of "Late in the Kind Country" (put there by `npm run dev:campaigns`).
 *
 * The take edits one painting of the book's second chapter where it sits, which writes the picture's recipe into the
 * chapter's `content` and uploads the Illuminator's `ill-*` pictures to storage. Both are put back:
 * - The chapter's `content`, `updated_at` and `word_count`, and the book's `updated_at` and `word_count`: snapshotted before the take (in memory and in a file under
 *   `promo-out/illuminator/`, so a take that died before its teardown still has one) and written back exactly. The
 *   file is the snapshot of the *untouched* chapter, so a setup that finds one restores it first and never takes a
 *   snapshot of an edited chapter.
 * - The files in the fixture's folder of the `asset-images` bucket created since the setup began: removed by creation
 *   time, which leaves everything older alone.
 * Nothing else is written. The book's id changes whenever `dev:campaigns` runs, so it is looked up by title.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { FIXTURE_EMAIL, runSqlFile } from "../../lib/dev-campaign-io.ts";
import { quote, sql } from "../../lib/dev-db.ts";
import { readLocalStack } from "../../lib/dev-stack.ts";
import { localDb, settleAiChoice } from "./demo.ts";
import { AI_PRO_REOFFER_NOTICE_VERSION } from "../../../supabase/functions/_shared/provenance/consent.ts";
import { kindCountryCampaignId } from "./kind-country.ts";

const BOOK_TITLE = "Sothery: A Campaign Setting";
/** The chapter that holds the painting, by its position in the book ("Welcome to Sothery"). */
const CHAPTER_POSITION = 1;
/**
 * The painting the take edits: the sunset over the orange sea with a teacup on the wall. It is wide, its sky is pale
 * enough for torn edges and the paper's grain to show, and it is no one's portrait. A fragment of its file name.
 */
export const PAINTING = "abbac9396ddb6fdf986478a56928a391ec45e685";

const SNAPSHOT = "promo-out/illuminator/chapter-before.json";

interface Snapshot {
  chapterId: string;
  content: string;
  updatedAt: string;
  wordCount: string;
  documentId: string;
  documentUpdatedAt: string;
  documentWordCount: string;
}

/** The book's id in Kind Country, found by title: it changes when `dev:campaigns` runs again. */
export function sotheryBookId(): string {
  const id = sql(
    localDb(),
    `select id from public.scriptorium_documents where campaign_id = ${quote(kindCountryCampaignId())} and title = ${quote(BOOK_TITLE)} limit 1`,
  );
  if (!id) throw new Error(`Kind Country has no book "${BOOK_TITLE}". Run \`npm run dev:campaigns\`.`);
  return id;
}

function chapterId(): string {
  const id = sql(
    localDb(),
    `select id from public.scriptorium_chapters where document_id = ${quote(sotheryBookId())} and position = ${CHAPTER_POSITION}`,
  );
  if (!id) throw new Error(`"${BOOK_TITLE}" has no chapter at position ${CHAPTER_POSITION}.`);
  return id;
}

function bucket() {
  const stack = readLocalStack();
  return createClient(stack.API_URL, stack.SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from("asset-images");
}

function ownerId(): string {
  const owner = sql(localDb(), `select id from auth.users where email = ${quote(FIXTURE_EMAIL)}`);
  if (!owner) throw new Error("The DM fixture does not exist. Run `npm run dev:auth`.");
  return owner;
}

/**
 * Writes the snapshot back, with `updated_at` as it was: the table's own trigger would stamp it with now, so the
 * trigger is off for this one transaction (`session_replication_role` is the superuser switch for that, local only).
 * Dollar quoting with a tag the content cannot contain carries the jsonb through psql unchanged.
 */
function restore(shot: Snapshot): void {
  runSqlFile(
    localDb(),
    `begin;
     set local session_replication_role = replica;
     update public.scriptorium_chapters
        set content = $promo$${shot.content}$promo$::jsonb, updated_at = ${quote(shot.updatedAt)}::timestamptz,
            word_count = ${Number(shot.wordCount)}
      where id = ${quote(shot.chapterId)};
     update public.scriptorium_documents
        set updated_at = ${quote(shot.documentUpdatedAt)}::timestamptz, word_count = ${Number(shot.documentWordCount)}
      where id = ${quote(shot.documentId)};
     commit;`,
  );
}

/** Takes the chapter as it is now, in the same text form the database prints it in. */
function readChapter(id: string): Snapshot {
  const row = sql(
    localDb(),
    `select c.content::text || E'\\x1f' || c.updated_at::text || E'\\x1f' || c.word_count || E'\\x1f' || d.id || E'\\x1f' || d.updated_at::text || E'\\x1f' || d.word_count
       from public.scriptorium_chapters c join public.scriptorium_documents d on d.id = c.document_id where c.id = ${quote(id)}`,
  );
  const [content, updatedAt, wordCount, documentId, documentUpdatedAt, documentWordCount] = row.split("\x1f");
  return { chapterId: id, content, updatedAt, wordCount, documentId, documentUpdatedAt, documentWordCount };
}

/** When this take's setup ran; null if the teardown runs in a process that never set up. */
let takeStarted: string | null = null;
let before: Snapshot | null = null;
let aiWasUnanswered = false;

export function setupIlluminator(): void {
  mkdirSync(dirname(SNAPSHOT), { recursive: true });
  // A take that died before its teardown left the untouched chapter in the file: put it back before anything else.
  if (existsSync(SNAPSHOT)) {
    restore(JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot);
    rmSync(SNAPSHOT);
  }
  before = readChapter(chapterId());
  writeFileSync(SNAPSHOT, JSON.stringify(before));
  takeStarted = sql(localDb(), "select now()::text");
  // A campaign whose AI question was never answered opens the "Bring AI to this campaign?" chooser over the first
  // click, and so does the one-time Pro notice. Both are answered as "off" / "Not now", which is what unanswered
  // already shows; the campaign's own answer goes back to unanswered in the teardown.
  const campaign = kindCountryCampaignId();
  aiWasUnanswered = sql(localDb(), `select ai_enabled is null from public.campaigns where id = ${quote(campaign)}`) === "t";
  settleAiChoice(campaign);
  runSqlFile(
    localDb(),
    `insert into public.ai_acknowledgements (user_id, kind, version)
       values (${quote(ownerId())}, 'ai_pro_reoffer', ${quote(AI_PRO_REOFFER_NOTICE_VERSION)}) on conflict do nothing;`,
  );
}

/** After the last shot, filmed or failed. Safe to run twice. */
export async function teardownIlluminator(): Promise<void> {
  if (before) {
    restore(before);
    before = null;
    rmSync(SNAPSHOT, { force: true });
  }
  if (aiWasUnanswered) {
    sql(localDb(), `update public.campaigns set ai_enabled = null where id = ${quote(kindCountryCampaignId())}`);
    aiWasUnanswered = false;
  }
  if (takeStarted === null) return;
  const made = sql(
    localDb(),
    `select name from storage.objects
      where bucket_id = 'asset-images' and name like ${quote(`${ownerId()}/%`)}
        and created_at >= ${quote(takeStarted)}::timestamptz`,
  )
    .split("\n")
    .filter((name) => name !== "");
  if (made.length > 0) await bucket().remove(made);
  takeStarted = null;
}
