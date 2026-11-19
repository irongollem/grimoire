# The Campaign's Canon

The world's larger shape in one place (epic #1226): what is true, what is moving, what the DM keeps back, what has
happened, and what the table added. A DM writes it at a real table first; the generators read it as the **world
block**, and the AI table reads and adds to it last.

Design: the canvas *Campaign Canon* (claude.ai artifact `MAukzQW1bDDG832DT4ZepT`, frames `01 Delta` to `13`, plus
`04b`), approved 19 Nov 2026. The decisions are in the epic's body; read it before changing any of this.

## Parts

| Part | `canon_entries.part` | Built in | Players see |
| --- | --- | --- | --- |
| Premise and tone | `premise`, with a `premise_kind`: `pitch`, `theme`, `table`, `voice`, `look`, `line`, `veil` | story 2 | what the DM shared, never the voice or the look |
| Truths | `truth`, with `knowledge`: `all`, `some`, `secret` | story 2 | known to all; known to some when it is `known_to` their character, or a faction their character is in; never a secret truth |
| What is moving | `force` | story 4 | never |
| Secrets and open questions | `secret`, `question` | story 3 | a secret once the DM reveals it; never a question |
| Lore, told in passages | `lore` | story 5 | the passages told |
| The Chronicle | `chronicle` | story 6 | what the DM shared |

`private.canon_entry_seen(entry, member)` is the one audience rule: `get_player_canon` and the players' world web
(`private.player_world_ties`) both use it, so a player's journal and their web never disagree. It is total (an absent
entry or member is false, never NULL). The world's name stays `campaigns.setting`; nothing else of the canon may live on
the `campaigns` row, which every member reads (#1228).

## Data

- `canon_entries` (`20261119214935_campaign_canon.sql`): one table for every part; a part differs by a few columns,
  and later stories add their own columns and child tables (a force's steps, a lore entry's passages, a secret's
  clues). RLS: the campaign's DMs read and write; players read only `get_player_canon`, which never returns the reveal
  list and withholds secret blocks in the body. It rings the campaign doorbell (`canon_entries` → `CANON_KEY`,
  `CONNECTIONS_KEY`).
- The world web's seventh kind, `canon` (`from_/to_canon_entry_id` on `world_links`; pairs `canon_person`,
  `canon_faction`, `canon_location`, `canon_deity`, `canon_item`, `canon_canon` in
  `supabase/functions/_shared/worldLinkCatalogue.ts`). A canon entry is always the `from` end. "Known to some" is
  `known_to` links, never free text.
- `campaigns.description` and `campaigns.ai_setting_prompt` are gone: both became `pitch` entries (the description
  shared with the party, as the row was; the setting prompt kept by the DM).

## The world block

`supabase/functions/_shared/worldBlock.ts` builds it from `campaigns.setting`, the premise entries and the truths known
to all; nothing else can enter (no secret, no force, no truth known to some). Every generator appends
`worldBlockText`, which renders lines as "Never include, in any form" and veils as "May happen, but only off the page",
so they bind every suggestion; pictures take `worldImageSetting` (the world, the look and the lines). Edge functions
load it with `loadWorldBlock` (`worldBlockLoad.ts`); the browser's local-key path with `fetchWorldBlock`
(`src/ai/worldBlock.ts`), and only when a local key will run the generation (`captureImageGenerationContext`). The
Chronicler's `{settingPrompt}` placeholder is filled with it.

## The page

`/canon` (`src/views/canon/CanonView.vue`, components in `src/components/canon/`, data in `src/composables/canon/`),
after Notes in the nav. `?entry=<id>` selects and scrolls to an entry; search results and the world web link there.
Premise and tone and the truths autosave; the World field moved here from Campaign settings' Details tab.

## AI help on each part

Help on a part ships with that part's story, as DM help at a real table (frame 13). `suggest-canon` (server path only,
DM-gated, `canon_premise_suggestion` / `canon_truth_suggestion` at 1 credit, prompt rows `canon_premise` /
`canon_truths`) answers two modes: **Draft from a pitch** proposes premise entries (pitch, themes, at the table, voice,
look) from a few lines, and **Suggest truths** proposes up to eight truths with their marks. The pure check is
`supabase/functions/_shared/canonSuggestions.ts`: lines and veils are never proposed (they are agreed with the
players), a "known to some" truth names only people and factions the campaign has (unknown names are set aside, and a
"some" truth with nobody left is set aside rather than offered). Nothing is written until the DM accepts
(`src/components/canon/CanonSuggestions.vue`); an accepted entry and the `known_to` ties it brings carry
`ai_provenance`. An AI-written entry is marked edited by the database the first time its words change
(`private.canon_entries_mark_edited`), whoever changes them.

## MCP

`canon` is an MCP kind (`supabase/functions/_shared/mcp/registry.ts`), read and written under the DM's own access;
`campaign_overview` returns the world block.
