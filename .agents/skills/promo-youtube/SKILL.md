---
name: promo-youtube
description: Write, film and cut a long-form YouTube video that explains one Grimoire feature in depth, the DM's laptop and the player's phone in one video, with chapters and subtitles, using the promo pipeline's YouTube format. Use when the maintainer asks for a YouTube video, a tutorial, a walkthrough, a deep dive or a longer explainer about a feature, or to re-film one.
user-invocable: true
---

# YouTube video

A Reel teases a feature in 30 to 50 seconds; a YouTube video explains it. One
video per feature, both sides of the table in it, as long as the feature
honestly needs: some run four minutes, some twelve. No padding, no fixed
length. The series opens with "Getting started" and then follows the Reels
(combat, character sheets, running a session, ...), so a Reel can point at its
long video.

The pipeline is documented in `docs/promo-videos.md` (read "YouTube format" and
"Writing an episode"). The finished `yt-*` episodes in
`scripts/promo/episodes/` are the worked examples to copy. Recording the voice
and assembling is `/promo-booth`.

Argument: the feature, or an existing `yt-*` id to re-film.

## 1. Know the feature

- Read its `context/features/` doc in full, then the components it names.
  Every sentence of narration must be true of the app today: open the code
  for each claim. A feature doc can lag the code; the code wins.
- Find the shape of the explanation: what it is for, the main flow from start
  to finish, then the two or three details a user would not find alone. Order
  chapters the way someone would use the feature at the table.
- Note where the two sides meet (DM damage landing on a player's phone, a
  handout appearing, a turn passing). Those moments are why DM and player
  share one video; film them as cause on one screen, effect on the other.

## 2. Write the episode

`scripts/promo/episodes/yt-<feature>.ts`, registered in `episodes/index.ts`:

- `format: "youtube"`, `account: "dm"`, `device: "desktop"` for the DM's
  laptop (the whole 1440x900 screen is readable on YouTube). The player's own
  phone is `device: "phone", account: "player"` on the shot: a real signed-in
  player, not the DM's Preview (keep Preview for explaining Preview itself).
- **Every** shot off the episode's default names its `device` and `account`,
  not only the first: a shot that omits them falls back to the episode's DM
  laptop, even straight after a phone shot. The first shot on a new
  account and device pair needs `startAt`; later ones continue where that page
  was left.
- `chapter: "Title"` on the first shot of each chapter. YouTube needs at least
  three chapters of ten seconds or more, the first at 0:00 (the assembler
  handles that).
- `caption`: a short heading for what is on screen (eight words at most). It
  shows as a lower third on desktop and a text panel beside the phone.
- `narration`: spoken English, warm and plain, second person, British spelling
  as in the existing episodes, no em dashes, no superlatives. One to four
  sentences per shot. Several short shots beat one long one.
- Say the name on screen. The viewer has no time to read a section's heading
  while the voice is already explaining it, so the first time a shot reaches
  a part, the line names it by the app's own label, word for word ("Under
  Equipped, ...", "The Spawn panel ..."), never by a description ("the paper
  doll", "the panel at the bottom"). A viewer who hears the name finds it on
  screen, and finds it again in the app. Check each label in the code; a part
  with no heading needs no name.
- Pace: about 2.5 words a second. Fill each shot's narration time with action
  or a deliberate hold on what is being described; a still frame held for more
  than two seconds looks dead.
- `focus()` points at a detail worth pointing at. On YouTube it is not needed
  for legibility, so use it less than in a Reel.
- The offstage actor (`ctx.offstage("player" | "dm")`) acts unfilmed, for the
  effect-on-the-other-screen moments.
- Selectors: the app keeps hidden copies of headings, nav links and chat lines
  for other widths, so `.first()` often lands on an invisible one and the wait
  times out with "resolved to hidden". Wait and tap on
  `.filter({ visible: true }).first()`. A confirm is a danger dialog (role
  `alertdialog`), so find its button on the page, not inside `"dialog"`. An
  open sheet or chat covers what is under it; close it with its own button
  before the next tap.
- Setup and teardown: reuse the feature's `setup/*.ts` from its Reels; anything
  the take changes is put back, against the local stack only, on the demo
  copy's rows.

## 3. Film and check

- `npm run promo:record -- yt-<feature>` (local stack and demo copy running:
  `npm run db:start && npm run dev:auth && npm run dev:demo`). On a failure,
  read `shots/<shot>.failed.png` before touching a selector; re-film one shot
  with `-- --shot <id>`.
- Build a contact sheet per shot and read it (see `/promo-booth`, "Checking a
  cut"). Check the action matches the narration, nothing jumps, and the dice
  land the way the narration says (change `seed`).
- `npm run promo:assemble -- yt-<feature>` for a silent draft with chapters.

## 4. Hand over

Give the maintainer the episode id to voice in the booth, the chapter list,
and anything you could not film or verify. Their takes go in with
`/promo-booth`. Commit the episode and any setup by explicit file, never
`promo-out/`.
