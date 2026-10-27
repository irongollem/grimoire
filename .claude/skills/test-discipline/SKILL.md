---
name: test-discipline
description: How to write a test that earns its place in this repo, and how to cut the ones that do not. Use whenever you write or change tests (a new module, a bug fix, an executor spec that says "add tests"), with `review` to check the tests in a diff, and with `prune <path>` to trim an existing test file or folder.
user-invocable: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Edit
  - Write
---

# /test-discipline: tests that fail on bugs

Arguments: none (writing mode, for the tests in your change), `review` (judge
the tests in the current diff), or `prune <path>` (trim existing tests).

## Why this exists

The 27 Oct 2026 audit (#1116) measured the vitest suite: 14,935 tests, all
green, about a minute of test time. Test bytes grew 9.5x between August and
October while source grew 2x.

- **About 16% are dead weight.** Of 2,524 sampled tests, 402 would let no bug
  through if deleted. Rules tests were the healthiest (88% worth keeping),
  components the weakest (77%, most of the loss in `AppButton`'s class map).
- **The bigger problem is depth, not size.** 56 realistic one-line bugs were
  planted in 14 modules, and the tests caught 56% of them: 36% in components,
  45% in composables. It took 6.3 tests per bug caught. The bugs that slipped
  through were guards: a cancelled confirm that still deleted, a portrait gated
  on the `name` field instead of `portrait`, an age check off by one day, a
  negative to-hit read as positive.

So the suite is wide and shallow: many tests of happy paths and literals, few
of the guard clauses where bugs actually live. Deleting the dead weight is the
smaller half of the fix. Writing the test that fails when the guard breaks is
the larger half.

## The one question

Every test answers: **what plausible bug does this fail on, that no other test
catches?** Say the bug in the test name ("cancelling the confirm keeps the
milestone"), not the function ("deleteMilestone works").

- A plausible bug is a dropped guard, a flipped comparison, an off-by-one, the
  wrong field, a missing scope, a leaked row. "The code changed" is not a bug.
- No bug you can name → do not write the test.
- Another test already fails on that bug → do not write the test.

## The mutation check, required for every guard you test

After writing a test for a branch or guard, break that line on purpose (flip
`<` to `<=`, drop the `if (!ok) return`, swap the field name, remove the
`.eq("user_id", …)`) and run the file. The test must go red. Then revert.

It takes a minute and it is the only proof that a test does what its title
says. The audit found `supabase/functions/_shared/childAccount.test.ts` tests titled "refuses a future
month" and "turns 16 this month as still under 16" that passed with exactly
those checks removed.

Do it in the code you wrote, too: for each guard you added in this change,
point at the test that goes red when you remove it. A guard with no such test
is the gap this skill exists to close.

## Where the expected value comes from

From **outside** the code:

- a 5e rule, cited by book, edition and heading: `// PHB 2014 "Cover"`,
  `// SRD 5.2 "Grappled"`. When the book says nothing, write
  `// app convention` so a design decision is never mistaken for a rule;
- a decision in a feature doc or epic body;
- an incident, by issue number.

Show the working in a comment when the number is derived. The model is the
Monk at `src/rules/armorClass.test.ts:176`: "Shield + plain base would be 15,
so the Monk puts the shield down and keeps 16."

**Never** run the code and paste what it returned. **Never** copy a table, a
label or a literal out of the source. Those tests can only fail when the code
changes, never when it is wrong.

## Which layer owns the assertion

Assert each behaviour once, at the lowest layer that owns it. An upper layer
tests only what the lower one cannot see: that it delegates (one
representative case), reactivity and lifecycle, how it renders the lower
layer's result, and the user flow.

To tell which you have: stub the lower function to a fixed value. If your
upper-layer assertion still holds, it is wiring and belongs up here. If it
needs the real branching, it is a duplicate and belongs in the lower test.

If you are about to copy a sibling's test file (`useSpellsByIds` from
`useItemsByIds`, one bulk-move suite per list view), the production code is
duplicated. Extract it and test it once.

## What to write, by kind of module

| Module | Write | Model |
|---|---|---|
| Pure logic, rules | Both sides of every comparison (`>=` needs the equal case and one below), each branch once, empty input once. Table cases as `it.each`, one or two rows per branch plus the boundaries. | `armorClass.test.ts`, `lootTableRoll.test.ts:191` |
| Data table (`src/data/`) | Invariants over the whole table: ids unique, every reference resolves, every edition covered. Never a row restated. | `starterRecipes.test.ts` |
| Composable over Supabase | Visible results against `createSupabaseFake()` (`src/test/supabaseFake.ts`; wiring in its header), never a hand-rolled `from().select().eq()` chain. Scoping to the caller is a security property ([Client Reads](../../../CLAUDE.md)): seed another user's row and assert it does not come back. | `useCampaignMembers.test.ts`, `useWorldWebEditing.test.ts` |
| Composable or store with state | Drive the public API, assert state. Assert the order of side effects only when order *is* the property. | `useCampaigns.dispose.test.ts` (#963) |
| Component | Mount, act as the user (click, type, confirm, **cancel**), assert what renders or is emitted. Every guard in a handler gets a test: cancel, disabled while pending, trim, clear after submit. This is where most bugs survived. | `BattleMapTokenLayer.test.ts:102`, `NoticeBoardPin.test.ts` |
| Copy in a component | Only when the text is derived from props or state. | `CampaignLensNotice.test.ts:39` |
| `cva` primitive | Which class *wins* a tailwind-merge conflict, on a real mount, plus sweeps ("every tone resolves through a token"). Never "variant X contains class Y": the compile-time assertion and `/dev/components` own that. | `AppButton.test.ts:258` |
| AI prompt builder | A property the prompt must hold (a disguised NPC's true name is withheld), never a phrase copied from the builder. | `supabase/functions/_shared/npcMemories.test.ts` |
| Gate (auth, child, lens, terms) | Every kind of account the gate meets, and the exact boundary value or day. | `src/router/guard.test.ts` |
| One-shot script | Tests while it is live. Delete the script and its tests together once it has run. | |
| Regression | Issue number in the `describe` or `it` title, one comment on what happened. | `savedLayout.test.ts` |

## Never write these

Each was found in the audit. The file:line is the example to recognise.

| Pattern | Looks like | Example |
|---|---|---|
| Call mirror | `rpc` name and `p_*` args (generated types already check them); the exact method order on a hand-built fake | `useQuestThreads.test.ts:98`, `audioEngine.test.ts:220` |
| Testing the test double | the logic under test is reimplemented inside `vi.mock` | `useImageProvenance.test.ts:63` |
| Label echo | `text()` contains a static string from the template | `QuestFlowCanvas.test.ts:175` |
| Stub then assert the stub | a stubbed child exists, or a never-rendered component is absent | `QuestOverviewLifecycle.test.ts:118` |
| Class pinning | Tailwind classes asserted in a DOM with no layout | `PageHeader.test.ts:40` |
| Constant echo | a constant, enum length, or table restated; a `Record<Union, string>` checked for completeness (the compiler does it) | `tiers.test.ts:118`, `useDsrRequests.test.ts:36` |
| Smoke | the only assertion is `toBeTruthy`, `exists()`, `length > 0`, or `x` is `x` | `brushMask.test.ts:93` |
| Combo padding | one test per enum member through the same `??` branch | `zones.test.ts:18` |
| Failure triplet | "surfaces an RPC failure" once per wrapper in the same file; keep one | `useQuestThreads.test.ts` |
| Overclaiming title | the title names a rule the input never exercises | `monsterGenerationConcept.test.ts:77` |

## Size signals

- Mock and fixture lines outnumber assertion lines 3 to 1: you are testing
  wiring. Find the logic and test it directly, or use a fake that holds rows.
- More than three tests on one branch: make it an `it.each` or delete some.
- The test file for a thin wrapper is longer than the wrapper's delegate test:
  stop and move the cases down a layer.

## `review` mode

For each test added or changed in the diff (`git diff HEAD -- '*.test.ts'`):

1. Name the bug it fails on. If you cannot, it goes.
2. Check it against the never-write table and the layer rule.
3. For each guard added or changed in the non-test diff, find the test that
   goes red when the guard is removed. Run the mutation check where unsure.

Report two lists with file:line: tests to drop, and guards with no test.

## `prune <path>` mode

Per test file under the path:

1. Read the test file and the module it covers.
2. For each test, name the bug it fails on, or mark it as one of the
   never-write patterns.
3. **Before deleting a test, name the kept test that fails on the same bug.**
   If there is none, it is not dead weight: keep it, or rewrite it to assert
   the behaviour instead of the implementation.
4. Collapse padding into `it.each`: one or two representatives per branch plus
   the boundaries.
5. Plant three or four mutants in the module's guards (one at a time, revert
   each). Add a test for every real behaviour change that survives. A prune
   that skips this leaves the suite smaller and no better.
6. Run the file and `rtk proxy npx oxlint --config oxlint.json <file>`. Report
   tests removed, tests added, and mutants caught before and after.

**Never prune:** a regression pin with an issue number, the structural
registries (`definerRefusalRegistry.test.ts`, `campaignSyncTables.test.ts`,
`loadingIndicator.test.ts`, `crossArtifactInvariants.test.ts`,
`bucketRegistryMirror.test.ts`, the `supabase/tests/*.test.sql` guards), or a
gate's account matrix. Each of those protects a whole class of bug at once.
