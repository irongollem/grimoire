---
name: promo-episode
description: Write, film and cut a pair of Instagram Reels (DM side and player side) about one Grimoire feature, using the promo pipeline in scripts/promo. Use when the maintainer asks for the next promo episode, a Reel or short video about a feature, or to re-film an existing one.
user-invocable: true
---

# Promo episode

One feature, two short Reels: the DM's side and the player's side, posted a few
days apart. The pipeline is documented in `docs/promo-videos.md`; read it first.
The finished Workshop pair (`scripts/promo/episodes/workshop-*.ts`,
`scripts/promo/setup/workshop.ts`) is the worked example to copy.

Argument: the feature (e.g. "soundboard", "quests"), or an existing episode id
to re-film.

## 1. Pick the story

- Read the feature's doc in `context/features/` and find what a DM and a
  player each *do* with it that looks good on a phone. Open on the payoff.
- Look at the feature on a phone first. Use `scripts/promo/stage.ts`
  (`launch` + `openStage`) or a quick screenshot script at 390x693, as the DM
  fixture and the player fixture. A layout that falls apart at phone width is
  a finding to report, not something to film around silently.
- Four or five shots per episode, under about 45 seconds. Each shot: a
  caption of eight words at most, one or two sentences of narration in plain
  spoken English (no em-dashes), and the actions.

## 2. Stage the scene

- Film only the DM fixture's demo copy (`setup/demo.ts`). Never the
  maintainer's own campaigns, never production.
- Write `scripts/promo/setup/<feature>.ts`: idempotent SQL through
  `runSqlFile(localDb(), …)` that puts the scene back before every take.
  Invented content follows the demo's world (Sugarwell, a candy city).
- If the demo itself lacks something the episode needs (art, content), say so
  and propose adding it to the production demo template; that is a production
  write the maintainer approves.

## 3. Write and film

- `scripts/promo/episodes/<feature>-dm.ts` and `<feature>-player.ts`, set
  `pairedWith` on both, add both to `episodes/index.ts`.
- `npm run promo:record -- <id>` (local stack running; it starts its own app
  server). On a failure, read `shots/<shot>.failed.png` before changing a
  selector.
- Look at every take: build a contact sheet per shot
  (`ffmpeg -i shots/<s>.mp4 -vf "fps=4/<dur>,scale=270:-1,tile=4x1" -frames:v 1 sheet.png`)
  and read it. Check for jumps (use `scrollTo`, not `scrollIntoViewIfNeeded`),
  holds long enough to read, and the outcome you meant (change `seed` until
  the dice land right).
- `npm run promo:assemble -- <id>` for a silent draft.

## 4. Hand over

Put both drafts and the narration on an artifact page for the maintainer (the
videos as published files, `script.md` text inline), with your notes per shot.
They record with `npm run promo:voice` (a page that lists every episode;
picking one shows its shots), which saves each take under the right name and
builds the Reel.

Commit the episode, setup and any pipeline fix by explicit file. Never commit
`promo-out/`.
