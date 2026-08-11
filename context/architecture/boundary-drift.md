# Boundary Drift — where the map and the territory disagree

The other three docs describe the *intended* architecture. This one records
where the code already deviates from it, so a reader debugging near one of
these spots isn't misled by the clean diagrams — and so drift gets fixed or
sanctioned instead of silently normalized.

**Audited from code alone on 2026-08-11** (grep sweeps over import edges,
raw-client call sites, filter refs, file sizes). Re-run the checks below when
touching these areas; update this doc — or CLAUDE.md § Sanctioned Exceptions —
when an entry is fixed or ruled intentional. Open work is tracked in the
linked issues, per the repo's work-tracking convention.

## Boundaries that hold (verified, not assumed)

- **`src/rules/` is pure** — no supabase/fetch/localStorage/composable
  imports anywhere in the non-test modules.
- **`src/cartographer/` ↔ `src/lib/battlemap/`** — zero imports in either
  direction; the authoring/runtime split is intact.
- **Stores do no direct DB I/O** — no `supabase.from/rpc/functions` calls in
  any store (auth's session handling goes through `supabase.auth`, which is
  its job); `encounterRun`'s persistence stays injected via
  `setPersistHandler` as designed.
- **Infra subsystems are consumed in the right direction** — features import
  `dice/`, `audio/`, `tiptap/` freely; root modules importing `lib/dice/`
  (`trapAdvisor`, `lootTableRoll`, …) is infra-on-infra, not a breach. One
  exception, below.

## Broken boundaries (open issues)

1. **`lib/tiptap/` ↔ `lib/scriptorium/` circular dependency** —
   [#721](https://github.com/irongollem/grimoire/issues/721).
   `scriptorium/scriptoriumExtensions.ts:15-22` → tiptap (correct direction),
   but `tiptap/watercolor.ts:2` → `scriptorium/furniture/watercolorAssets`
   points infra at a feature, dragging scriptorium furniture into every
   `RichTextEditor` bundle. Same breach class as the codified
   "root must not import from a feature folder" rule.

2. **Encounter runner components hand-insert `campaign_messages`** —
   [#722](https://github.com/irongollem/grimoire/issues/722).
   `EncounterRunner.vue:442`, `RunnerBossMechanics.vue:149`,
   `RunnerEntityDetail.vue:296,381` each rebuild the insert row that
   `useCampaignMessages` owns — four copies of a write-path row shape that
   will drift when a column changes.

3. **Filter State Pattern violations** —
   [#723](https://github.com/irongollem/grimoire/issues/723).
   `NotesList.vue:135` keeps `search` in a local ref while its *sort* state
   correctly lives in `useUiStore` two lines later; `ScriptoriumDocumentList`,
   `CompendiumTab`, `ManualTab`, `StoreInventory` likewise. Dialog-scoped
   searches (`NpcSetEditorModal`, `AssetInsertPanel`, `WorldBundleTab`) were
   left off the list — resetting on close is plausibly intended, and if so
   belongs in Sanctioned Exceptions.

## Standing debt (documented, not issue-tracked)

- **24 files exceed the 600-line soft max** (excluding `src/data/`, generated
  modules, tests). Top of the list: `CartographerEditorView.vue` (1885),
  `stores/soundboard.ts` (1286), `RichTextEditor.vue` (1074),
  `useWorldBundle.ts` (1061), `stores/ui.ts` (1007), `useCampaignBackup.ts`
  (993). The rule is "evaluate a split before adding more" — so this list is
  the *watch list* for the next person adding non-trivial code to any of
  them, not a refactor mandate. `routes.ts` (911) and `ui.ts` are arguably
  size-intrinsic (route table; the mandated single filter store) — if so,
  they should be called out as exceptions where they live.
- **Raw client calls in UI components** beyond the issues above, each small
  but each a bypass of the composable layer: `EncounterSheet.vue:454`
  (direct `encounter_state` update when stopping another run),
  `SimulacrumWizard.vue:127` (direct `minis` read),
  `LibraryArtRepairPanel.vue` (six raw select/delete sites — admin-only
  tooling, lowest priority). Pre-auth flows (`SignupView.vue:126` calling
  `validate_app_invite`) are fine: there is no campaign context yet, which
  is what the composable layer keys on.

## Re-running the audit

```sh
# UI importing the raw client (expect: auth views + the issues above)
rg -l 'from "@/lib/supabase"' src/views src/components

# rules/ purity (expect: empty)
rg -n 'supabase|fetch\(|localStorage' src/rules --glob '!*.test.ts'

# cross-subsystem lib imports (judge direction: features may import infra,
# infra must not import features)
rg -n 'from "@/lib/(audio|battlemap|dice|downtime|illuminate|library|scriptorium|tiptap|quests|encounters|npcs)/' src/lib --glob '!*.test.ts'

# authoring/runtime split (expect: empty both ways)
rg -n 'lib/battlemap' src/cartographer; rg -n 'cartographer' src/lib/battlemap

# oversize files
find src -name "*.ts" -o -name "*.vue" | grep -v ".test.ts" | grep -v "src/data/" \
  | grep -v ".generated." | xargs wc -l | awk '$1>600' | sort -rn
```
