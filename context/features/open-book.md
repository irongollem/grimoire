# Open Book

A campaign released as a public, read-only book at `/w/<slug>` (#1085). The DM decides what goes in; visitors flip through it like a grimoire: a leather cover, chapter tabs, ribbons, page curl. Design: the 15-board canvas https://claude.ai/artifact/MoxErPvKQNUGoTmukgq7hN.

## Decisions

- **A release is a snapshot.** `release_open_book` freezes `private.open_book_snapshot` into `open_book_releases.snapshot`. Visitors read only that, through the `open-book` Edge Function with the service role. `anon` gains no table, policy or RPC. Editing the campaign changes nothing public until the next release.
- **The book never runs ahead of the table.** An entry is eligible only when *every* party member can read it (`player_visible_to ⊇ party`, and the party is not empty). The snapshot restates the `get_player_visible_*` projections' redaction with that whole-party predicate, because those projections are keyed on `auth.uid()`. Rich text goes through `private.withhold_secret_blocks`. A disguised NPC appears under its cover name. NPCs carry no prose (players never see appearance or personality).
- **`names` holds only cited ids.** Mentions store ids, not labels, so the snapshot ships a name map. It is limited to ids that the book's own text cites; otherwise a taken-out NPC's name leaked (caught by a test).
- **Owner only, Pro to release.** A co-DM edits the campaign but does not publish it. Preview (`preview_open_book`) is free for every owner; it is the upsell. A child account cannot release.
- **What goes in:** `include_shared` (default on) puts in everything the whole party can see; `open_book_entries` is the per-entry override (the eye control's "In the Open Book" option, and the bulk actions on NPC and faction lists). Entries are forgotten when their row is deleted.
- **Chapters:** Atlas, Folk, Factions and Houses, Pantheon, Lore and Legend, Chronicle (an almanac, then session reports), plus an index of names.

## Files

| Area | Where |
| --- | --- |
| Schema, snapshot, RPCs | `supabase/migrations/20261023230210_open_book.sql`; tests `supabase/tests/open_book.test.sql` |
| Demo copy carries the book | `20261023230211_demo_copy_carries_open_book.sql` (see `demo-campaign.md`) |
| PDF storage rules | `20261023230212_open_book_pdf_storage_policies.sql`; bucket `open-book-pdfs` in `storage-policy.ts` and `buckets.ts` |
| Public read | `supabase/functions/open-book/` (`?part=meta` for titles and cards) |
| Share pages and cards | `api/open-book-page.ts` (meta tags, rewrite of `/w/*` in `vercel.json`), `api/open-book-card.ts` + `_openBookCard*.ts` (satori + sharp, 1200×630 JPEG) |
| Types | `src/types/openBook.types.ts` |
| Book model, pagination, sections | `src/lib/openBook/` (`bookModel`, `sections`, `pagination`, `curl`, `ribbons`, `leather`, `preview`) |
| Reader | `src/components/openBook/reader/` (`BookReader`, `PageFlow`, `BookTurn`, `articles/*`), `src/views/openBook/`, `src/layouts/PublicLayout.vue` |
| Settings | Campaign settings tab "Open Book": `src/components/campaign/OpenBookTab.vue`, `src/components/openBook/settings/` |
| PDF | `src/lib/openBook/pdf/`, `src/composables/openBook/useOpenBookPdf.ts`, `src/components/openBook/print/` |

## How the reader works

- **Pagination is CSS columns.** An article flows into one tall multi-column box; a page is a window onto it, shifted by `k * pitch`. `pagination.ts` turns flow width into page count. A spread shows two pages, a phone one. Only a chapter's opener section has a frontispiece on its first verso; other entries start on the verso.
- **A lead picture stands alone** on page 1, contained to the page, never cropped. A session report's first picture becomes its lead plate (`splitLeadImage`).
- **Turning.** `BookTurn` owns the animation. The fold geometry is pure (`curl.ts`): the outer bottom corner lifts first, a tilted fold crosses the page with the next verso mirrored over it. A corner can be dragged; released past halfway it clicks the existing dog-ear, so the reader's own turn path runs. Reduced motion cross-fades.
- **Web and PDF page numbers differ.** The web book paginates to the reader's screen; the PDF is A5.

## Owner preview

"Preview the book" sets a per-tab sessionStorage marker `{slug, campaignId}` and opens the real reader at `/w/<slug>`. While it is set, `usePublicOpenBook` reads `preview_open_book` through the owner's session and dresses it as the next release. A banner says so and sets `noindex`. A refusal ends the preview and falls back to the public read. Without the marker, the public read never sends the session.

## PDF

Each release row has "Export PDF". The articles are drawn by the reader's own components in a throwaway Vue app with a memory router (they read `useRoute().params.slug`), laid out by Paged.js (A5: cover, title page, contents and index with page numbers, chapter openers, running heads; in-book links become PDF anchors), then printed by `render-pdf` (Cloudflare, rate-limited per user) and stored at `open-book-pdfs/<user>/<campaign>/<release>-<uuid>.pdf`. `pdf_url` goes on the release; the reader offers "Download PDF" when `allow_pdf` is on. Replacing or deleting removes the old file. Locally `render-pdf` answers 503 without its secrets.

## Rules that bite

- **Anything new a visitor can read must go through the snapshot**, with the whole-party predicate and secret-block removal. Never widen the Edge Function to read live tables.
- **A new entity type in the book** needs: a snapshot section, an `open_book_entries.entity_type` value, a forget trigger, an article component, and a redaction test.
- **The reader is a public route** (`meta.public`, `layout: "public"`). It must work signed out; `lens.test.ts` lists it as unfenced.
- **Images in a released book stay referenced.** `open_book_images_in_use` keeps `deleteUnreferenced` from removing a file any release still shows (one call per batch, whole-URL matches only).
