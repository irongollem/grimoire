# Promo videos

Short vertical Instagram Reels, one feature per episode, filmed from the real
app. Episodes come in pairs, one from the DM's side and one from the player's,
posted a few days apart. The `/promo-episode` skill writes and films a new
pair; this page is how the pipeline works.

## Running it

Needs the local stack and the demo campaign:

```bash
npm run db:start && npm run dev:auth && npm run dev:demo
npm run promo:record -- workshop-player       # films every shot
npm run promo:voice                           # pick an episode, record the narration, build the Reel
```

`promo:voice` opens a local page (127.0.0.1 only) listing every recorded
episode with its progress; pick one (or switch from the menu at the top, or
start on one with `promo:voice -- <id>`) to see each shot's clip and line. Pick the microphone, press Space, and the clip plays while you read;
Enter keeps the take. It records with the browser's echo cancelling, noise
suppression and auto gain off (they ruin a condenser mic), trims the silence
(`wav.ts`) and saves `vo/<shot>.wav`, removing any older take of that shot.
"Assemble the Reel" runs `promo:assemble` and plays the result.
`promo:assemble -- <id>` on its own builds a draft with whatever takes exist.

The recorder starts its own app server on :5181 (`server.ts`) that does not
watch files: other sessions edit this checkout, and on the shared :5173 every
save reloaded the page mid-take. `PROMO_BASE_URL=<url>` films a server you run
yourself instead.

`promo:record -- <id> --shot <shot id>` re-films one shot and keeps the others.
A failed take saves the screen at that moment as `shots/<shot>.failed.png`.

Output lands in `promo-out/<id>/` (gitignored):

| File | What it is |
| --- | --- |
| `shots/<shot>.mp4` | one silent 1080x1920 clip per shot |
| `manifest.json` | shot order, captions, narration, lengths, sound cues |
| `script.md` | the narration to read, with a target length per shot |
| `vo/<shot>.wav` | your take for that shot, from `promo:voice` (`.m4a`, `.mp3`, `.aif` also work) |
| `<id>.mp4`, `cover.jpg` | the finished Reel and a cover frame |

Brand assets shared by every episode go in `promo-out/brand/`:
`intro.mp4` / `outro.mp4` (the sting, any size, scaled to fit) and
`theme.mp3` (the bed under every episode, ducked under the voice). Without
them the assembler draws placeholder title cards and plays no bed.

## How it works

- **Filmed where it is safe to show.** Every episode runs in the DM fixture's
  copy of the published demo campaign (`setup/demo.ts`), never another
  campaign: `dev:campaigns` puts the maintainer's real games on the same
  account. Each episode's `setup` puts the scene back (ingredients, pending
  rows) before every take, through the loopback guard.
- **A real browser at phone size.** `stage.ts` opens a visible Chrome window
  at 390x693 CSS pixels and 3x scale and records it through the DevTools
  screencast. Headless Chrome sends too few frames, at CSS-pixel size.
- **What the page does first** (`page-setup.js`): picks the campaign and the
  DM or player lens, seeds `Math.random` so the dice land the same every
  take (the episode's `seed`), draws a ring where each tap lands, and reports
  every sound the app plays so the assembler can mix it back in. A local
  storage URL is mapped to the production CDN, which has the files
  (`assets.ts`).
- **Assembly** (`assemble.ts`, timeline maths in `timeline.ts`): each shot is
  as long as its clip or its voice-over plus 0.4 s, whichever is longer, the
  last frame holding if you talk past it. The screen sits at 780x1387 on the
  Vellum page colour with the caption above it, inside Instagram's safe area.
  Loudness is normalised to -14 LUFS.

## Writing an episode

An episode is a TypeScript file in `scripts/promo/episodes/`, listed in
`episodes/index.ts`. Each shot has a caption (eight words at most: most Reels
play muted), a narration line, and a `run` that drives the page with the
helpers in `ShotContext` (`tap`, `type`, `scroll`, `scrollTo`, `hold`). Keep
an episode under about 45 seconds and open on the payoff.
