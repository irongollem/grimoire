---
name: whats-new
description: Write a "What's new" post for the Dungeon Grimoire Discord from the commits released since the last one, as a short bullet list of the new things users will be glad to have and the annoyances that are now gone, and record the commit it ended on. Use when the user asks for release notes, a changelog post, a Discord update, or "what's new". Takes an optional commit to start from.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
---

# /whats-new — Discord release notes since the last post

Arguments: `$ARGUMENTS` — optional. A commit (hash, short hash or tag) to start **after**. When given, it wins over the recorded one.

The output is a post for the people who use the app: DMs and their players. It is not a changelog for the people who build it, and it is not a complete account of what changed either.

**The post exists to make users happy.** There are exactly two reasons a line earns its place: it is something new they will want to try, or it is something that bugged them and no longer does. A change that is merely true, visible and correct does not qualify. Nobody is glad to learn a settings page was re-laid-out. Most of the work in this skill is deciding what to leave out, and the first run got that wrong by listing nineteen things where ten mattered (the maintainer's words, 2 Oct 2026: "They dont care for small and insignificant updates").

State lives in `.claude/skills/whats-new/last-posted.json`. The record of what shipped stays the git history (see Work Tracking in `CLAUDE.md`); this file only remembers where the last post stopped, so the next one diffs from there instead of from the beginning of the repo.

---

## Step 1 — Find the range

Shell variables do not survive between Bash calls. Read each value from the output and paste it into the next command.

**Base** (exclusive, the commit the last post ended on):

1. If `$ARGUMENTS` names a commit, use it: `git rev-parse --verify "<arg>^{commit}"`.
2. Otherwise read `commit` from `.claude/skills/whats-new/last-posted.json`.
3. If there is neither, **stop and ask for a commit to start from**. Never fall back to the whole history: 2,400 commits is not a post, and it is exactly what this skill exists to avoid.

**End** (inclusive, the newest commit users can actually see):

```bash
git fetch origin main --quiet
gh run list --workflow release.yml --branch main --status success --limit 10 \
  --json headSha,event,createdAt \
  --jq '[.[] | select(.event != "pull_request")][0]'
```

That is the head of the last **successful** "Test and release" run, not `origin/main` and not local `HEAD`. The three differ more often than you would think: local `main` regularly carries unpushed commits, and a push whose run is red or still going has not deployed (a red `database` job strands the release). Announcing something that is not live is the one mistake a reader will notice immediately.

If `gh` is unavailable, use `git rev-parse origin/main` and say in the hand-over that the end was not checked against a release.

**Check the pair before reading anything:**

```bash
git merge-base --is-ancestor <base> <end> && echo ok
git rev-list --count --no-merges <base>..<end>
```

- Not an ancestor: stop and say so. The base is on another branch, or newer than the release.
- Count is 0: nothing has shipped since the last post. Say that and stop. Do not touch the state file.

## Step 2 — Read what shipped

Subjects first, oldest to newest, with the diff size so a one-line tweak and a new feature do not look alike:

```bash
git log --no-merges --reverse --date=short --format='%h %ad %s' --shortstat <base>..<end>
```

Commits here follow `type(scope): subject`, which does most of the sorting for you:

| Commit | Default |
| --- | --- |
| `feat(...)` | Candidate. |
| `fix(...)` | Candidate, if the bug was live before `<base>`. |
| `perf(...)` | Candidate only if someone would feel it. |
| `refactor`, `test`, `ci`, `chore`, `docs`, `build`, dependency bumps, review fix-ups | Out. |
| scope `admin`, `dev`, anything under `/dev/*` or the Admin panel | Out. Users never see it. |

A default is not a verdict. A `refactor` that changed how a page looks is in; a `feat` that only added a table is out. For every candidate whose subject does not make the user-visible effect obvious, read the body, and if that is still not enough, the diff:

```bash
git show --no-patch --format='%h %s%n%n%b' <hash>
git show --stat --format= <hash>
```

Commit bodies in this repo explain intent well. Feature docs in `context/features/` and manual pages in `src/manual/` explain what a feature is *for* when the commit assumes you know.

**Then reduce. This is where the post is made:**

- **Ask of every candidate: would a user be glad to read this?** Either "I want to try that" or "finally". If the honest reaction is a shrug, it is out, however much work it was and however visible it is. What usually fails the test:
  - layout and polish passes (a page centred, a toggle restyled, an icon swapped, a widget gaining a size option);
  - a default that changed without giving anyone a new ability;
  - fixes for bugs almost nobody hit, or that needed an unusual setup to see;
  - internal speed-ups nobody would feel;
  - anything you would have to explain before the reader knew why they should care.

  "Not everyone uses it" is **not** on that list. A real new capability goes in even when it serves part of the audience: players only, parents only, people who connected an assistant. That holds for AI features in particular. Announce them plainly, without hedging or apology; anyone who does not want AI has a switch that turns it off, so a line about it costs them nothing and tells the people who do want it something good.

  A fix clears the bar when the bug blocked something outright, lost someone's work, or was the kind of daily friction people complain about. Diff size is not the measure: a 1,200-line security migration is out, and a 90-line change that makes a pane resizable is in.
- **One bullet per thing a user would name, not per commit.** A dozen `feat(theme): Vellum …` commits are one bullet about the new look.
- **A fix to something that arrived in this same range is not a bullet.** Nobody outside ever saw that bug. Fold it into the feature or drop it.
- **Check that it survived.** Later commits revert, replace and rename. Before writing a bullet for a headline item, confirm it exists at `<end>` (`git grep -n "<its symbol or label>" <end> -- src`), and scan the range for reverts (`git log --grep='^Revert' <base>..<end>`).
- **Leave out what is not reachable.** Admin-only, dev-only, behind a flag, or schema that no screen uses yet.
- **Security fixes are not in the post.** Nobody is happier for reading "Security hardening", and a line like that is a signpost in a public repo. Never describe what was exposed or how. If a security change also gave users something they can see (a note that now shows each reader only the names they know), write the benefit and nothing about what it closed.
- **Money is exact or absent.** If something costs credits or is Pro-only, say so plainly and check the number in the code. Never imply a paid thing is free or the reverse.

`src/lib/announcements.ts` holds the in-app notices. An entry added in this range is something already judged worth interrupting users for: it leads the post, and the post describes it in the same terms so the app and the Discord do not tell two versions.

## Step 3 — Write the post

**Audience:** people who run or play in a campaign. They know D&D and the app's screens. They do not know table names, component names, issue numbers or commit types, and none of those appear.

**Use the names on the screen.** The nav labels in `src/lib/nav.ts` are the vocabulary: Atlas, Workshop (not crafting), Reliquary, Bestiary, Spellbook, Item Vault, Hall of Heroes, Scriptorium, Card Forge, Cartographer, Interlude. The product is **Dungeon Grimoire**. Shared content is the library, never "SRD".

**Each bullet says what you can now do and where**, in one or two sentences, second person, present tense:

- Yes: `- **Atlas**: drag the edge of the location tree to resize it, and Overview and Map are now proper tabs.`
- No: `- Refactored AtlasTree to support resizable panes (#902)`
- No: `- Exciting improvements to the Atlas experience!`

Say who it is for when it is not everyone: `(players)` for the player portal under `/play`, `(Pro)` for Pro-only.

**Style:**

- No em-dashes. They read as machine-written; use a colon, a comma or a full stop.
- No hype words, no exclamation marks beyond one in the intro if it has earned it, no emoji in bullets. A section heading may carry one.
- Two sections, matching the two reasons a line is here: **New**, then **Fixed and improved**. Inside a section, biggest first. Drop a section that is empty.
- Fixed and improved is for things people actually ran into. No catch-all line for the small ones ("several layout fixes"); if they did not clear the bar on their own, they do not get in as a group.
- Aim for 5 to 10 bullets, and one Discord message. A quiet fortnight is a four-bullet post, not a padded one; a busy one still tops out around twelve. When you are over, cut the weakest bullet before you shorten the good ones.

**Discord format.** Discord renders `#`/`##` headings, `- ` bullets, `**bold**`, `-# ` small text and `[text](url)` links. It has no tables. A bare URL unfurls into a preview card; wrap it as `<https://…>` to stop that. The app lives at `https://app.dungeongrimoire.com`.

**A message is capped at 2,000 characters.** Count before you hand it over (`wc -m` on a scratchpad copy). A post over the cap is usually a post with too much in it, so go back to the bar above first. Only when every remaining bullet has earned its place do you split at the section boundary into two messages, each a complete block on its own.

Shape:

```md
# What's new in Dungeon Grimoire
-# 18 Sep to 2 Oct 2026

One or two sentences on the headline change.

## New
- **Name**: what you can do now, and where to find it.

## Fixed and improved
- **Name**: what used to get in the way, and no longer does.
```

The date line is the commit date of the first commit after `<base>` to the commit date of `<end>`:

```bash
git log -1 --date=format:'%-d %b %Y' --format=%ad <end>
```

## Step 4 — Record where it ended

Write `.claude/skills/whats-new/last-posted.json` with full 40-character hashes:

```json
{
  "commit": "<end>",
  "previous": "<base>",
  "posted": "<today, YYYY-MM-DD>",
  "commits": <the non-merge count from Step 1>
}
```

`previous` is there so a post that was generated but never sent can be redone: run `/whats-new <previous>`.

Commit that one file, by path, so it is not left loose in a checkout other work commits from with `-a`. The path after `--` is what keeps anything else already staged out of the commit; the `add` is needed because on the first run the file is untracked, and a path-limited commit refuses a file git does not know:

```bash
git add .claude/skills/whats-new/last-posted.json
git commit -m "chore(whats-new): record <short end> as the last announced commit" \
  -m "Co-Authored-By: <Model Name> <noreply@anthropic.com>" \
  -- .claude/skills/whats-new/last-posted.json
```

Do not push. Rewording the post afterwards needs no new record; the range has not changed.

If the range held nothing a user would be glad to hear about, write no post and leave the state file alone. The next run reads those commits again, which costs nothing.

## Step 5 — Hand it over

1. The post, in a fenced `md` block per Discord message so it copies verbatim.
2. Below it, briefly: the range (`<short base>..<short end>`, dates, commit count), the character count per message, and anything the user should know before posting:
   - commits on `origin/main` or local `main` newer than `<end>`, which were left out because they are not released;
   - a judgment call worth a second look (a feature you could not confirm is reachable, a credit cost you could not verify).

The user posts it. This skill never sends anything to Discord.
