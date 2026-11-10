/**
 * The handout episodes' scene, in the local demo copy only.
 *
 * The DM has written a letter on the Letter paper (a one-chapter handout, fixed id, nobody holds it yet) and a
 * take gives it to the party and starts one more ("Untitled letter") from the New handout picker. Both are swept
 * before a take and after it: the letter is rewritten whole, every other handout made since the scene was cut is
 * deleted, and the read marks the player's phone left are cleared so the card arrives unread again.
 * The two "Steal this" documents are other work and are never touched: only this file's own id and rows named
 * "Untitled ..." with the handout kind are swept.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { runSqlFile } from "../../lib/dev-campaign-io.ts";
import { quote, sql } from "../../lib/dev-db.ts";
import { readLocalStack } from "../../lib/dev-stack.ts";
import { demoCampaignId, localDb } from "./demo.ts";

export const LETTER_ID = "4a4d0000-0000-4000-8000-0000000000a1";
export const LETTER_TITLE = "A Letter from the Lighthouse Keeper";

/**
 * The keeper's sketch of the demo's Spun Glass Hound, under the postscript: ink and watercolour, made from the
 * monster's own art with the image model (10 Nov 2026), so a handout on camera shows it can carry a picture.
 * It lives with the other promo assets in promo-out/ (never committed) and goes to local storage at setup.
 */
const SKETCH_FILE = "promo-out/handout-art/glass-hound-sketch.webp";
const SKETCH_PATH = "promo/glass-hound-sketch.webp";

const text = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

/** The letter as a chapter body: a heading, four short paragraphs, a postscript and the keeper's sketch. */
const letter = (sketchUrl: string) => ({
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: LETTER_TITLE }] },
    text("Dear wanderers of Sugarwell,"),
    text("The great lamp has gone dark, and the tide-bells ring all night with nobody to pull them."),
    text("Come to the Lighthouse before the next high tide. Bring a candle, a kind word, and a sweet tooth."),
    text("Yours in the dark, Keeper Marzipan"),
    text("P.S. Something made of glass prowls the rocks at night. I drew it as best I could."),
    { type: "image", attrs: { src: sketchUrl, alt: "The keeper's sketch of a glass hound on the rocks", width: "55%", dataAlign: "center" } },
  ],
});

/** Puts the sketch in the local asset bucket and returns its public url. */
async function uploadSketch(): Promise<string> {
  if (!existsSync(SKETCH_FILE)) throw new Error(`The keeper's sketch is missing: ${SKETCH_FILE}`);
  const stack = readLocalStack();
  const admin = createClient(stack.API_URL, stack.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error } = await admin.storage
    .from("asset-images")
    .upload(SKETCH_PATH, readFileSync(SKETCH_FILE), { contentType: "image/webp", upsert: true });
  if (error) throw new Error(`Could not upload the keeper's sketch: ${error.message}`);
  return admin.storage.from("asset-images").getPublicUrl(SKETCH_PATH).data.publicUrl;
}

function sweepSql(c: string): string {
  return `delete from public.player_read_items where campaign_id = ${c} and entity_type = 'handout';
          delete from public.scriptorium_documents
           where campaign_id = ${c} and kind = 'handout' and (id = ${quote(LETTER_ID)} or title like 'Untitled %');`;
}

export async function setupHandouts(): Promise<void> {
  const c = quote(demoCampaignId());
  const db = localDb();
  const owner = sql(db, `select user_id from public.campaigns where id = ${c}`);
  const body = quote(JSON.stringify(letter(await uploadSketch())));
  runSqlFile(
    db,
    `begin;
     ${sweepSql(c)}
     insert into public.scriptorium_documents (id, user_id, campaign_id, title, doc_type, kind, theme, page_size, is_two_column, show_page_numbers)
       values (${quote(LETTER_ID)}, ${quote(owner)}, ${c}, ${quote(LETTER_TITLE)}, 'custom', 'handout', 'letter', 'A5', false, false);
     -- A handout keeps its one chapter (private.keep_one_chapter), so it is written once and the document deleted whole.
     insert into public.scriptorium_chapters (document_id, position, title, content)
       values (${quote(LETTER_ID)}, 0, ${quote(LETTER_TITLE)}, ${body}::jsonb);
     commit;`,
  );
}

export function teardownHandouts(): void {
  runSqlFile(localDb(), `begin; ${sweepSql(quote(demoCampaignId()))} commit;`);
}
