---
name: make-art-from-queue
description: Use whenever Jeffrey asks to make, continue, review, redirect, or queue art in the shared GPT art folder (usually ~/Desktop/art-955/<feature-name>). Reopen the handoff and live queue at the start of each session, then review outputs and painter notes against current canon before changing prompts.
user-invocable: true
---

# Make art from the shared queue

Use this workflow for the user's handoff-driven art pipeline. The painter is GPT; Codex curates briefs, checks canon, reviews landed images, and communicates through the feature's `handoff.md`.

## Start each session

1. Resolve the feature folder from the conversation. For Kind Country it is `~/Desktop/art-955/kind-country/`.
2. Read `handoff.md` first, especially READ FIRST, Directions, Feedback, and recent painter notes. Read `PROMPT.md` for painter operating instructions. Treat the latest author ruling and manuscript continuity as authoritative over older prompts and historical handoff notes.
3. Inspect `briefs.json`, `review-rejected.json`, `out/log-*.jsonl`, `out/` and `node next.mjs --count`. Never rely on the count alone: inspect `out/.next*.json` worker snapshots too. A snapshot is stale when its output already exists and its mtime is later than that brief's `asked` timestamp; don't count or repaint it. If an output is missing and a painter may be generating it, write a handoff stop/hold note and avoid racing their active work.
4. Compare recent outputs visually. Read the painter's notes, but independently check anatomy, expression, materials, composition, scale, lighting and the brief's stated subject. Make a labeled contact sheet when it helps compare a batch.

## Source of truth and references

- Read project continuity and the exact character/place record before drafting. For Kind Country, consult `~/Documents/Claude/Projects/Sothery Book I - manuscript/CONTINUITY.md`, relevant chapter and `data/` files (especially `data/wick-housings.md`).
- Carry forward only current canon. Remove conflicting old instructions from a brief rather than appending another large paragraph that says both things.
- References are for anatomy, material and finish only. They do not authorize copying the reference's subject, face, pose, setting or composition. Do not attach an old portrait when the user says its setting and pose are irrelevant; use the current canon and a current anatomy reference instead.
- When an existing composition must be preserved, set `editReference` in the brief to the source path and say exactly what may change. `next.mjs` attaches it first and uses an edit-specific note; the other `references` remain anatomy/material/finish only. Do not use `editReference` for ordinary portrait references. Otherwise give the painter freedom to invent pose and setting from the character's role and story.
- Keep the global material-contrast rule: fantastical people and creatures have their own materials; ordinary surroundings, clothing, furniture and tools retain their real materials and finishes.
- Check for contradictions such as an explicitly requested Wick combined with “no Wick figures,” a named person without a people/anatomy reference, or an obsolete species-stage term.

## Queue changes

- Add new images as complete objects in `briefs.json`, with exact filename, lane, dimensions, concise subject, applicable world rules, references and a visible-content checklist.
- Queue a redo in `review-rejected.json` for the exact target filename. Give each redo its own `asked` timestamp using the real current local time. A finished image is considered redone only if it is newer than `asked`; never invent or future-date timestamps.
- Before adding a redo, check for an existing pending redo and the output's mtime. Update the existing reason when appropriate instead of duplicating the queue entry.
- Check that every referenced file exists. If a referenced image is itself pending or missing, the queue script should hold dependent briefs; don't bypass that dependency.
- Preview without reserving work via `node next.mjs --peek --worker N --of M`; painter calls without `--peek` claim one file atomically. A saved output clears its claim on the next queue call. If a painter abandons a task and is no longer generating, release it with `node next.mjs --release out/<filename>`. `node next.mjs --count` reports pending and claimed work; it can omit stale worker snapshots.
- The queue reserves one output per worker in `out/claims/`; workers may work-steal only unclaimed files. Keep worker IDs in `handoff.md`, honor `WAIT`, and check logs for duplicate `source` values before accepting a batch.
- Never overwrite a finished file manually. The painter saves to `out/`; rejected/previous versions belong in `out/rejected/` or a comparison sheet.

## Review and handoff

1. Open each new or revised image at useful size. Treat painter logs as notes, not approval.
2. Check the author's latest corrections and compare competing art side by side. Make judgment calls on whether a new image is stronger; preserve alternatives in `compare/` when useful.
3. Put concise, actionable notes in `handoff.md`: identify filenames, what is right, what failed, the intended correction, and any references/constraints. Record accepted and withdrawn briefs so painters do not revive them.
4. Don't push art into a book or replace a campaign portrait as an automatic consequence of generating it. For campaign portrait replacement, provide a comparison and get the user's choice first. Any new campaign NPC/monster added to the book also needs a campaign entry; Book II quests use the campaign quest system.
5. Do not set recurring checks or background watches unless the user requests them. When review and queue changes are done, report the queue count, key findings, links to comparison sheets, and any single remaining blocker.

## Kind Country anchors

- Exactly eight peoples inhabit Sothery; no real humans or ordinary Earth animals as inhabitants. Humanoid monsters remain allowed when the brief names them.
- Sothery is on the saucer; never show the saucer in its sky. The road spirals across the saucer; rim villages are inhabited. Rain wets and seeps away; inland named water is marmalade; the edge sea is dream essence.
- Each folk uses a cultural register as texture, never as a direct depiction of a real-world culture.
- For Wick specifics, trust the newest author additions in `CONTINUITY.md` and `data/wick-housings.md`, not the older generic candle prompts. Every housing is a distinct face; no noses or pupils; the common gourd is only one housing family; Wick society is hardened and warmth is guarded. Distinguish Emberling, Sheltering, adult kinds, Ashen, Smutter, Scorch/Reborn according to the current continuity text.
