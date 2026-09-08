# Campaign Notes & Calendar

## Dashboard (`src/views/DashboardView.vue`)

Two compositions on one route, chosen by whether a session is running (#758). Since #761 the compositions are **data, not markup**: `DashboardView.vue` renders a single `grid grid-cols-1 lg:grid-cols-3 gap-4` by `v-for`-ing over a `DashboardLayoutEntry[]` and resolving each entry's widget id through `WIDGET_COMPONENTS` (`src/components/dashboard/widgetComponents.ts`) — `<component :is="WIDGET_COMPONENTS[entry.id]" v-for="entry in widgets" :key="entry.key" :class="WIDTH_CLASSES[entry.width]" />`. Since #762 that array comes from `useDashboardLayout(view)`, which returns the DM's saved arrangement merged against the registry, falling back to `DEFAULT_LAYOUTS[view.value]` (`src/lib/dashboard/defaultLayouts.ts`) when nothing is saved — see **Persistence** below. Every widget still owns its own queries and its own body, and `components/dashboard/DashboardWidget.vue` still owns the card shell, the semantic tone and the height cap — the registry only arranges opaque components.

**To add a widget:** write the component under `components/dashboard/widgets/`, register its metadata in `src/lib/dashboard/widgetCatalog.ts` (`DASHBOARD_WIDGETS`), map its id to the component in `src/components/dashboard/widgetComponents.ts` (`WIDGET_COMPONENTS` — a `Record<DashboardWidgetId, Component>`, so a missing mapping is a compile error, not a runtime hole), and add it to `DEFAULT_LAYOUTS` if it should ship visible. If it needs per-instance configuration, also mark it `configurable: true` and add an editor to `WIDGET_SETTINGS_COMPONENTS` — see **Per-instance settings** below. Never drop it into the view directly — that import list and the two `<template v-if>` blocks are gone; `DashboardView.vue` no longer knows any widget by name.

**Width model:** each widget declares `widths: readonly WidgetWidth[]` and a `defaultWidth` in its catalogue entry; `WidgetWidth` is `"cell" | "wide" | "full"`, mapped to grid spans on the 3-column `lg` grid (`cell` = 1 col, `wide` = 2, `full` = 3 — `WIDTH_CLASSES` in `DashboardView.vue`). Below `lg` everything is one column, in layout order. Every widget but `dm-screen-card` is `maxInstances: 1`, and all are offered on **both** surfaces (`surfaces: ["prep", "session"]`) — the prep/session split you see today lives entirely in which widgets `DEFAULT_LAYOUTS` happens to include for each surface, not in a widget's own eligibility. `selfHiding: true` marks a widget that renders nothing when its data is empty (`PinnedNotesWidget`, `RecentNpcsWidget`, `LiveEncounterBanner`) — CSS grid closes over the resulting comment node with no gap. `DEFAULT_LAYOUTS` entries carry a `key` distinct from `id`, because the catalogue is not restricted to singletons: `dm-screen-card` is `maxInstances: 6` and `addWidget` mints `dm-screen-card`, `dm-screen-card-2`, … through `instanceKey`. `v-for` keys on `key`, never on `id`. `src/lib/dashboard/widgetCatalog.test.ts` covers the registry's own invariants (unique ids, valid widths, valid surfaces, `maxInstances` respected); `widgetCatalog.ts` stays free of component imports on purpose, so it tests without mounting Vue.

**Height model (#768).** Each entry also carries a `height` in **half-widget units** — `WidgetHeight` is `1 | 2 | 3 | 4`, where **2 is a normal card**, so 1 is half of one. The grid sets `grid-auto-rows: 9rem` and each item gets `lg:row-span-{n}`; two rows plus the 1rem gap comes to 19rem, which is within a hair of the `max-h-76` every card used to cap itself at — so a default board is the same size it was before heights existed and only a DM who changes one sees a difference.

It exists because CSS grid places row by row and a row is as tall as its tallest item, so *Next session* — one line of text — used to sit in a row beside an eight-row *Quests* and waste everything under it, while the fourth cell wrapped to a new row instead of filling that hole.

**Row spans apply from `lg` only**, exactly like the widths. Below that the grid is one column, where vertical space is the thing there is most of and a fixed row height would only squash cards. `DashboardWidget` is `h-full min-h-0` and its body scrolls from `lg` up **whatever the widget asked for** — including `maxHeight="none"` ones, because the grid decides the height there and even a self-sizing card can be handed less room than its content wants.

**`heights` is almost always absent, and that is deliberate.** A width changes how many columns a card occupies and widgets genuinely have opinions about that; a height is only how much content you want on screen, every card scrolls inside whatever it is given, and none of them *break* at any height. So the registry restricts nothing and sets only `defaultHeight` — a starting guess so a fresh board tessellates untuned (a one-line countdown starts at 1). An earlier revision capped short widgets at `[1, 2]` and it was wrong: this epic's premise is that the DM arranges their own screen, and `heightsFor`/`defaultHeightFor` exist for a widget that would truly render wrong, which is none of them yet. `defaultHeightFor` falls back to the widget's *first offered* height rather than blindly to 2, so a widget declaring `heights: [1]` and forgetting its default cannot end up at a height it just refused.

**Packing is opt-in: the "Pack tightly" toggle** in Customize mode, stored as `DashboardLayout.dense` on the layout blob — per user × campaign × surface, cleared by Reset along with everything else, and written only when on so an un-toggled layout stays byte-identical to a pre-#768 one. It sets `grid-auto-flow: row dense`, which fills the holes heights leave behind by letting a later small widget slide up past an earlier one.

**That reordering is exactly why it is not the default.** #760's promise is that what you arranged is what renders; an engine that quietly reorders it breaks the one thing the epic is for. As something the DM turns on, it stops being the engine overriding them and becomes them trading order for density, deliberately and reversibly — which is why the toggle lives beside Reset with the other layout-wide controls, and not in the normal view: it is an arrangement decision, not a viewing one.

**The two modes are now geometrically identical, and getting there reversed a #763 decision.** #763 floated each widget's control pill in the row gap *above* it, opening `gap-y-12` / `md:gap-y-8` while customizing to make room, because an overlay covers real content. With content-sized cards that only added whitespace. With fixed row heights it changed the cards themselves: a two-row card is `2 × 9rem + gap`, so the wider gap made every spanned widget taller and shifted where every column started — you were arranging a board that was not the board you got, which is the one thing the mode must never do.

The pill therefore **overlays the card's top-right corner**, and the grid keeps its 1rem row gap in both modes with no extra top padding. Covering a "View all →" link while the mode is open is by far the smaller cost — you are arranging the board, not navigating off it. Measured: identical card tops and heights in both modes.

**`h-full min-h-0` on the frame's slot host is load-bearing.** Outside the mode the widget *is* the grid item, so `DashboardWidget`'s own `h-full` resolves against the row span. Inside it the widget sits one div deeper, and a host with no height of its own makes `h-full` mean "as tall as the content" — so every card grew straight out of its allotted rows, in the one mode whose entire job is showing what the board will look like. Covered by a test that asserts the classes rather than the rendering, since jsdom does not lay out a grid.

**The widget is also inert while customizing** (`pointer-events-none` on the slot host; the pill is a sibling, so its controls still work). Full fidelity, so you still judge the real board — you simply cannot click into it. That closes a genuine trap: a stray click on a widget's own link used to navigate off the dashboard in the middle of a rearrangement.

**Size controls step both ways.** `cycleWidth`/`cycleHeight` take a `direction`, and the pill renders a stepper (`‹ Cell ›`, `⌄ 2 ⌃`) rather than a one-way cycle — returning from the last width used to mean walking the whole ring, and overshooting by one is the commonest thing a DM does with a size control. `wrapIndex` exists because JavaScript's `%` keeps the sign: a bare `(at - 1) % length` yields `-1` at index 0, so the control would silently do nothing at exactly the place it is most likely to be pressed.

**Persistence (#762).** A layout the DM has rearranged lives in `dashboard_layouts` (migration `20260823214517`), keyed `(user_id, campaign_id, surface)` with the arrangement in a `layout` jsonb column. `DashboardView.vue` reads it through `useDashboardLayout(view)` (`src/composables/dashboard/useDashboardLayout.ts`), which returns the *merged* layout — never a loading state, because an absent or still-loading row merges to `DEFAULT_LAYOUTS[surface]`, so a DM who never customized sees exactly the dashboard above with no flash of empty grid.

Supabase and not `localStorage`, deliberately: `ui.sessionRunning` used to be a `useLocalStorage` value, and a DM who preps on a desktop and runs the table on a laptop never saw the same state twice — the bug #758 existed to kill. A rearranged screen is the same promise. `usePlayerNavPrefs` (nav order in `localStorage`) is the counter-example not being followed here.

The row is own-data under plain RLS — four `auth.uid() = user_id` policies, no `SECURITY DEFINER` RPC, so the advisor baseline is unmoved. It is not membership-gated on read: a layout is a private preference *about* a campaign, not campaign data, and a stale row for a campaign you left renders nothing and cascades away with the campaign. That cascade is also what enrols the table in the GDPR paths for free — `export_user_data` walks the `auth.users` FK graph at runtime rather than a manifest (`context/compliance/data-subject-rights.md` §4), so **do not** add a hand-written entry for it anywhere. The table is not in `useCampaignLiveSync` either, and that is not an oversight: the rows are per-user, so there is no second participant for a realtime channel to notify.

**Merge semantics — the load-bearing part.** A layout is written once and then read for months while the registry moves underneath it, so `src/lib/dashboard/savedLayout.ts` reconciles the two on every read (`parseDashboardLayout` then `mergeDashboardLayout`, both pure, both covered by `savedLayout.test.ts`):

1. **A saved widget the registry no longer has** — dropped silently; it was removed or renamed by a deploy.
2. **A registry widget the layout never knew about** — inserted at its default-layout position and reported in `newWidgetIds`, which #763's picker badges "New". Anchored rather than appended on purpose: the foot of a long dashboard is exactly where a new widget goes unnoticed, and being noticed is the entire point. A new widget the surface's defaults leave *off* reaches `newWidgetIds` only, so it never forces itself onto a screen the DM has arranged.
3. **A width the widget does not support** — snapped to its `defaultWidth`; a `wide` entry on a full-only widget renders as a broken cell.

Case 2 turns on `DashboardLayout.known` — every widget id the registry offered at save time, stamped by `saveLayout`, never by the caller. Without it, "absent from `widgets`" is ambiguous: Customize mode can *remove* a widget, so a gap is either a deliberate removal or a widget that shipped later. Re-adding the first would make removal impossible; hiding the second would make every future widget undiscoverable. **This is the correction to the merge rules as #762 originally wrote them** — rule 2 as stated there ("registry widget not in the saved layout → appended") silently makes removal impossible once #763 ships a remove control. A row with no `known` is read as having known about everything, so nothing is re-added.

Validation is client-side and not a jsonb check constraint, because the definition of a valid entry *is* the TypeScript registry and a SQL copy would drift; a malformed blob parses to `null` and therefore behaves exactly as a missing row. `DashboardLayoutEntry.settings?` is reserved headroom for per-instance widget config (#764's DM-screen quick card) — written as absent today, but parsed and merged as a round-trip so the first configurable widget needs no migration.

Saves are optimistic and do not invalidate the query afterwards: #763 writes through on every reorder, and a refetch per drag is precisely the flicker that would defeat it. Each mutation captures its query key at `onMutate` and rolls back into *that* key, so a campaign switch mid-flight cannot corrupt an unrelated cache entry.

**Customize mode (#763).** A **Customize / Done** toggle in the dashboard `PageHeader` `#actions` edits whichever surface is showing; the surface toggle still switches sides while customizing. Entering it changes the *widgets* not at all — that is the governing rule. A DM judges a layout by looking at the board they actually have, so customize mode adds controls and nothing else: no frame drawn around each card, no title strip, no reskin. An earlier revision did all three and made arranging look like a different page from the one being arranged.

Each widget gets a control pill — grip, width stepper, height stepper, settings gear (configurable widgets only), remove. **It overlays the card's top-right corner.** #763 originally floated it in the row gap above each widget, opening the grid's row spacing to make room, because an overlay covers content — `DashboardWidget` puts its "View all →" link in exactly that corner. #768 reversed that: once widgets had fixed row heights, a wider gap stopped being whitespace and started changing card geometry, so the modes no longer matched. See the height-model note above for the full reasoning. There is now **no spacing difference at all** between the two modes.

**Adding a widget is a picker, not a drawer** — `DashboardShelf.vue` renders an `EntityCombobox` in the header beside the surface toggle. The issue specified a drawer; it was replaced after seeing it run, because a drawer pushed the whole board down on entering the mode, and because #764 grows this catalogue past 25 widgets, where a list of rows is a wall and a searchable picker is not. Options carry title, description, a **New** badge for ids in `newWidgetIds` (#762's merge case 2 — the entire discovery path for future widgets), and a "appears on its own once it has something to show" line for `selfHiding` widgets. It empties itself on select: a sanctioned add-picker, so its query is a local ref and **not** `useUiStore` state — the Filter State Pattern governs filters over the list *on the page*, and this filters a popup of candidates. #765 (drag a widget out of the shelf) was filed against the drawer and closed obsolete with it.

**The Customize button carries an `EntityNewDot`** when the picker holds a widget the DM has not seen. Load-bearing, not decoration: #762's merge only re-inserts a widget the surface's defaults ship *visible*, and most of #764's catalogue will not be — a curated default board of seven beats one of thirty. A picker-only widget would otherwise wait inside a mode nobody had a reason to open, leaving #762's "a new widget must be discoverable" promise unmet. The dot hides while customizing, where the options carry their own **New** badges. **So every catalogue issue should say whether its widget ships in `DEFAULT_LAYOUTS` or picker-only** — the two have different discovery paths.

**Self-hiding widgets render a placeholder while customizing** — you cannot drag what is not there. Emptiness is measured from the rendered DOM (`childElementCount` on a `v-show`n host, after mount and update), **not** from the slot's vnodes. Vnode inspection only sees a `v-if` sitting directly on the slot's root, and a self-hiding widget is a *component* whose comment node lives inside its own render — so the vnode approach reported every widget as non-empty and the placeholder never appeared, with fourteen tests green. `DashboardCustomizeFrame.test.ts` covers the component case explicitly.

**Every *discrete* edit is a pure function** in `src/lib/dashboard/arrangeOps.ts` — `moveEntry`, `cycleWidth`, `removeEntry`, `addWidget`, `configureEntry`, `shelfWidgets`, `isDefaultLayout`, `instanceKey`. Each returns its own `announcement`, which is what the view puts in the `aria-live` region, so a control and its keyboard equivalent describe the same change identically. **Continuous pointer-drag reordering is not among them and deliberately so:** Sortable splices `draft` itself through `v-model` and `onDragEnd` only queues the save and announces a generic "Widget moved." A drag relocates a widget by however many places the gesture crossed, which `moveEntry`'s ±1 step cannot express — `moveEntry` is the *keyboard* move. Do not go looking in `arrangeOps` for a drag-order bug; it is not there. **Move clamps, width cycles wraps**: an Arrow-Up on the first widget that wrapped it to the bottom is a keyboard user's worst surprise, since they cannot see the whole grid to notice where it went; a width control is one button pressed until it looks right, with no hidden state, so a dead end just feels broken. `instanceKey` is tested directly rather than through `addWidget`: only one widget allows a second instance, so an `addWidget` test would be testing that widget's registry entry as much as the key logic.

**Per-instance settings (#764).** A widget marked `configurable: true` in the registry gets a gear in its Customize-mode pill, before the remove control; it opens `DashboardWidgetSettingsModal.vue`, which resolves an editor out of `WIDGET_SETTINGS_COMPONENTS` (`components/dashboard/widgetComponents.ts`) and mounts it for that one layout entry. The blob lives on the entry itself — `DashboardLayoutEntry.settings`, the headroom #762 reserved — so it round-trips through `parseDashboardLayout`/`mergeDashboardLayout` with no jsonb migration, and two instances of the same widget hold different configurations.

Four things about this are deliberate and will look like oversights:

1. **Edits apply immediately; "Done" closes and does not commit.** Nothing else in Customize mode is provisional — width cycles, removal and drags all write straight through the 500ms debounce — and one dialog with OK/Cancel semantics among them would be the only place a change could be abandoned. Reset-to-default is the escape hatch, as it is for every other edit.
2. **`configureEntry` replaces the whole blob, never merges.** An editor always emits the complete shape it owns. A merge would make a setting impossible to *unset*, which is the bug a settings dialog grows on its second field.
3. **`configurable` is a registry flag, not "does an editor exist".** `widgetCatalog.ts` is deliberately free of component imports, so it has to be able to say a widget is configurable without seeing the editor. `widgetComponents.test.ts` closes the gap in both directions — a configurable widget with no editor opens an empty dialog, and an editor for a non-configurable widget is a control nothing can reach.
4. **The settings prop is bound conditionally** (`widgetProps()` in `DashboardView.vue`). A widget that declares no `settings` prop would take it as a fallthrough attribute and stamp `settings="[object Object]"` onto its own root element.

`isDefaultLayout` compares settings as *configuration* rather than as objects — absent, `{}` and `{ k: undefined }` all agree, and key order does not matter, so a layout never differs from its own jsonb round trip. No default layout ships a configurable widget today, so that comparison cannot fire; it is written now so that the first one that does not silently stop Reset from offering itself.

**Removing a configured widget discards its settings.** The entry goes, and `settings` goes with it; re-adding from the shelf starts fresh. The announcement says "removed to the shelf" because nothing is *deleted* from the campaign — but the arrangement of that instance is not kept anywhere.

**DM screen quick card (`DmScreenCardWidget.vue`)** — the first configurable widget, and the reason the epic exists. One reference table out of `DM_SCREEN_SECTIONS` (`src/data/dmScreen.ts`), chosen per instance, `maxInstances: 6`. Picker-only: it is **not** in `DEFAULT_LAYOUTS`, so it reaches DMs through the shelf's **New** badge and the Customize dot. `src/lib/dashboard/dmScreenCard.ts` owns the option list, the default table id and the parse; the default is `difficulty-class` rather than the first table in the data, because an unconfigured card has to show something and "Actions in Combat" is ten rows nobody looks up. An unknown stored id falls back to the default rather than throwing — it is jsonb written by an older build.

The table itself is `components/rules/ScreenReferenceTable.vue`, extracted from `ScreenTab.vue` when the widget needed it, with a `density` prop (`compact` on the dashboard, where comfortable padding costs about two visible rows). `/rules` → Screen and the widget must look like the same reference, and two copies of a table whose first column is bold-and-nowrap would have drifted on the first styling touch.

**Roll a table (`RollTableWidget.vue`)** — one saved roll table (#120's entity), rolled in place. Configurable, `maxInstances: 4`, picker-only. The entity had existed for months reachable only from Dungeon Craft, which is where you *build* a wandering-monster table; this is where you use one.

`src/lib/dashboard/rollTableCard.ts` resolves in **three** states, not two, and that is the difference from the DM screen card: a roll table is a campaign row, so its id can be valid at save time and gone by the next read (deleted, or a campaign switch). `none` = the campaign has no tables; `ready`; `missing` = the layout names one this campaign does not have. A `missing` card **says so and rolls nothing** — substituting the next table would have it roll something the DM never asked for while looking exactly as if it had. An *unconfigured* card falls to the first table by name, so a freshly added card works before anyone opens the gear; that fallback is a default, not a choice, which is why the settings picker shows empty rather than pre-selecting it.

The result panel is `components/dungeon-features/RollTableResult.vue`, extracted from `RollTableDetailView`'s roll panel. Shared because the encounter jump is conditional — an entry may or may not name an encounter, and a second copy that forgot the `v-if` renders a link to `/encounters/null`. The Roll *button* is deliberately not in it: the detail view disables its own on a range error computed from an unsaved form, and the widget has no form. Each owns its trigger; the component owns the answer. The last roll is a local `ref` and never layout state — otherwise the dashboard reopens tomorrow still claiming the party met six goblins.

**Conditions (`ConditionsWidget.vue`)** — all sixteen, names always visible, rules text one tap away. Picker-only, `maxInstances: 1`, no settings. Reads `getConditions(ruleset)` from `src/rules/conditions.ts` and **never** `srdConditions2014`/`2024` directly: those are baked per edition and `conditionPatches.ts` is applied on the way out of the helper, so a widget reading the data modules would silently ship unpatched text. Edition comes from `useRuleset()`.

One row open at a time, not a multi-open accordion. A card whose height depends on how many rows the DM left open is a card that moves the widgets beneath it, and sitting still in a grid cell is most of what a dashboard widget is for. The drawer animates through `drawerTransition()` per the Motion rules. The row header is a raw `<button>` rather than an `AppButton` — it is full-width clickable text with no padding recipe, border or radius of its own, which is the documented no-chrome exception; an `AppButton` would draw a control where the design wants a list.

**Last session (`LatestSessionNoteWidget.vue`)** — the most recent `category: "session"` note, one tap from the board. Picker-only, `maxInstances: 1`. "What happened last time" is the question every session opens with, and the answer already existed behind a list, a category filter and a click.

Which note is "the last one" is not one field, which is why `src/lib/dashboard/latestSessionNote.ts` exists with tests rather than a `.sort()` in the template. A session note carries three ideas of when it happened and campaigns fill in different ones: `session_num` (what the DM chose — authoritative), then `session_real_date` (when it was played), then `created_at` (when it was typed up, which for three back-dated recaps written on one Sunday is not session order). Each is a tie-break on the last, and a note missing a field sorts *below* one that has it — an unnumbered session is not session zero. An unparseable `session_real_date` is treated as absent, because `NaN` in a comparator wins or loses depending on argument order.

**Dice roller (`QuickDiceWidget.vue`)** — the seven standard dice plus a free expression field, with advantage/disadvantage. Picker-only, `maxInstances: 1`. The floating `DiceRoller` already covers the general case from every page; this is the narrower, faster sibling for the two things a DM reaches for constantly — one die, or a short expression they know by heart.

**Every roll goes through `@/lib/dice/roller`, never `@/lib/dice/dice`.** That module's own docstring makes it a rule: sound and the future roll-history hook live in the wrapper, so a component that rolls directly is a silent die. `parseExpression` is imported from `dice.ts` because parsing is not rolling.

Advantage applies to the d20 only — 5e ties it to checks, saves and attacks, and "roll two d6 and keep the higher" is a house rule, so offering the toggle on every die would imply a mechanic the game does not have. The toggle nevertheless stays *visible* for all dice rather than appearing and disappearing per click, and `effectiveMode()` collapses it to normal for a non-d20 so the result never labels itself with a mode that did nothing. `src/lib/dashboard/quickDice.ts` holds the button list, that rule, expression validation (`empty` is its own state, not an error — an empty field is the resting state, not a mistake) and the reshaping of both roll paths into one display shape.

**Death saves (`DeathSavesWidget.vue`)** — the third self-hiding widget, and the one whose absence *is* the feature. Picker-only, `maxInstances: 1`, `selfHiding: true`. It does not exist on the page until someone is down; a card that sat there saying "nobody is dying" would teach the DM to stop reading it.

Three decisions in `src/lib/dashboard/deathSaves.ts` that will look arbitrary and are not:

1. **"Dying" is `current_hp <= 0`, reused rather than reinvented.** `PartyTrackerRow.vue:217` and `PlayerConditions.vue:41` already agree on that threshold and both render the same death-save UI at it. A second definition here — "has a save recorded", say — could disagree with the tracker about who is dying, which is the one bug this widget cannot have.
2. **Three successes drops out; three failures does not.** Stabilizing ends the danger even though HP stays 0, and the always-on Party widget already shows that 0 — repeating it here is the noise that erodes trust in the silence. A death is the most time-sensitive thing at the table (a revivify window closing), so it keeps shouting, sorted first, until the DM acts.
3. **A missing count stays `null` and never becomes `0`.** `useParty` casts the query result through an unchecked `data as PartyMember[]`, and this app has shipped with production schema drifted from its migrations before — so the counts are read as `unknown` and narrowed. "No count recorded" and "0 successes so far" are different facts and the pips render them differently (dashed vs. hollow). **Both boundary checks read the narrowed value, never the raw field** — against a drifted column returning the string `"3"`, a raw `!== 3` keeps a stabilized character shouting and a raw `=== 3` never marks a dead one dead. A module that distrusts a type in one place and trusts it two lines later is not defensive, it is inconsistent; `deathSaves.test.ts` covers exactly that.

This is also the one widget in the folder where `party.value ?? []` is correct: an unloaded roster and a roster with nobody dying both render nothing, so no distinction is lost. Every non-self-hiding widget must keep them apart — see `RollTableWidget` — because there the collapse shows an empty state before the query has looked.

**Table vitals (`TableVitalsWidget.vue`)** — remaining spell slots, class-resource pools and who is concentrating on what: the three `PartyMember` columns `PartyWidget` does not surface (it owns HP, AC, conditions and passive scores). Picker-only, `defaultWidth: "wide"` because a row carries a name, a concentration badge and several pills at once, and `selfHiding: true` because the only party it is empty for — no casters, no class resources, nobody concentrating — is empty for that party *permanently*, so the card would otherwise sit there forever.

Read-only by design: this is a scan-during-combat card, and every control that changes one of these numbers already lives on the party tracker.

`src/lib/dashboard/tableVitals.ts` treats all three columns as `unknown` and validates structurally, even though `PartyMember` declares narrower types — they are jsonb, and a hand-edited row or a pre-migration character can hand back anything. It reuses `slotPool()` from `src/rules/spellSlots.ts` rather than re-deriving the "legacy rows omit `pool`, default to `spellcasting`" rule, which already lives in one place that every other slot-consuming component reads.

**The pills are `AppButton variant="tinted"`, and the conversion reached into the player portal.** A coloured pill whose colour means something is what that variant is for, and `tone-caution`/`tone-info` land within a hair of the raw `amber-500`/`blue-500` pair `PlayerResourcePools.vue` had spelled out by hand — so both call sites now go through the primitive rather than becoming two copies free to drift. While in that file, a hand-rolled `<button>` carrying the full chrome recipe (sitting directly beside the `AppButton` that answered it) became an `AppButton` too.

**Downtime queue (`DowntimeQueueWidget.vue`)** — player downtime draws with `status: "pending"`, oldest first, `tone="caution"`. Picker-only, `maxInstances: 1`, and deliberately **not** self-hiding: an empty queue is the good state here and worth saying out loud ("Nothing waiting. Every draw has been resolved."), where a card that vanished would leave the DM wondering whether it had checked. That is the opposite call from Table Vitals, and the difference is whether the empty state is *information*.

There is no per-draw deep link — `/downtime` ("The Interlude") is a single board whose own filter already defaults to pending — so every row and the header action go to the same place, like `PrepGapsWidget`. `src/lib/dashboard/downtimeQueue.ts` joins draws to the roster and to `getDowntimeActivity()`, falling back to the same `"??? (removed)"` marker `DowntimeBoardView` already uses for a deleted character rather than inventing a second wording.

The `?? []` in that widget is load-bearing on `isLoading`: while either query is unloaded `DashboardWidget` renders its spinner and never reaches the body. Without that gate it would tell the DM every draw was resolved before it had looked — which is exactly the failure the loading/empty split exists to prevent, and why the collapse is only safe where something else keeps the two apart.

**Unclaimed loot (`QuestLootWidget.vue`)** — the missing reader for `undispatchedLootCount` and `unclaimedLootCount`, which `QuestBoardSummary` (`src/lib/quests/board.ts:27-28`) has computed for every quest since the board shipped and which nothing outside the board ever read.

**The two counts are different states and are never summed.** `undispatchedLootCount` is loot in `delivery_state: "held"` — the DM prepared a reward and never dropped it into chat, so nobody at the table knows it exists; that is the DM's own action item and takes the caution tint. `unclaimedLootCount` is `"chat"` or `"partially_claimed"` — already dropped, the party just has not taken it; the DM's part is done, so it reads quieter. (Semantics from `src/lib/quests/loot.ts:9-10`, confirmed against `QuestBeatLootPanel.vue:93-97`.) Adding them would ask the DM to act on a number describing nothing real, so the row shows two badges or one, never a total.

`isLoading` comes from the queries' own flags rather than `data === undefined`: a query that errored also leaves `data` undefined but is no longer loading, and this card has no error state of its own, so it should stop spinning rather than spin forever.

**Upcoming events (`UpcomingEventsWidget.vue`)** — the next few events on the *in-world* calendar with a countdown for deadlines, which is a different question from `NextSessionWidget` ("when do we next play", a real-world date out of `session_proposals`). Picker-only, `maxInstances: 1`.

**`src/lib/calendar/upcoming.ts` is a new folder, and the arithmetic in it is the reason.** No next-N query existed anywhere, and the three ad-hoc day-ordering implementations that did exist are each wrong for this purpose and were deliberately not copied: `CalendarTimeline.vue`'s `eventToFrac` flattens every month to a nominal 30 days (fine for a pixel ruler, wrong for a countdown); `useCalendarEvents`'s Supabase `.order()` chains sort festival days before month 1 regardless of their real `afterMonth`; and `CalendarGrid.vue:268-275` hardcodes a Gregorian February rule. `upcoming.ts` instead builds a real per-year day index from `CalendarAdapter.months` / `.intercalaryDays` / `.isLeapYear`, handling two intercalary days sharing an `afterMonth`, `isLeapOnly` gating, and true cross-year arithmetic — an event in the first month of next year must sort *after* the last month of this one, which is what a naive `year * 365` gets wrong. Thirteen tests cover exactly those edges.

"Today" comes from `useCampaignStore().todayYear/todayMonth/todayDay` (`src/stores/campaign.ts:177-179`) — the same source `SessionWidget` already displays and advances. Clicking an event mirrors `CalendarEventRefChip.vue`'s `navigate()` rather than inventing a second way to focus a date.

**The type filter lives in `useUiStore`** (`upcomingEventsFilterType` / `upcomingEventsHasActiveFilters` / `resetUpcomingEventsFilters`) with a **Clear** control that appears only while filtered. It filters the list already on the card, so neither sanctioned exception applies. The Clear looks redundant beside a select whose first option is "All types" and is kept anyway: the point of the rule is that every filtered list offers the same way out, and a card that invented its own would be the one place it did not.

**How long a month is belongs to the calendar (fixed alongside #764).** `CalendarAdapter` carries an optional `daysInMonth(year, month)`; only `gregorianAdapter` implements it, because Gregorian is the one calendar here that folds its leap day into a month. Every fantasy setting keeps months fixed and puts the leap day in an **intercalary** day — Harptos's Shieldmeet sits after month 7.

**Jump to… (`JumpToWidget.vue`)** — `useGlobalSearch` embedded as a card, for the DM who keeps the dashboard open and does not want a modal over it mid-session. It re-implements nothing; the nine-table fan-out and the ⌘K palette are the same query.

Its four states are spelled out rather than derived from `groups.length`, because three of them look identical if you only count: below two characters the query is *disabled* and answers with its placeholder `[]`, which is the same empty array a genuine no-match returns and the same one an in-flight request has not replaced yet. "Type more", "searching" and "nothing matches" are three different things to say. The search box is a local `ref` — it filters a popup of candidates, which is the sanctioned add-picker shape, the same one `GlobalSearch` itself has.

**Quick create (`QuickCreateWidget.vue`)** — five links to blank editors (NPC, quest, note, encounter, location). Links, not dialogs: every one of those routes already knows how to be an empty form, and a widget that grew its own would be five more forms to keep in step with five real ones. The icons are the nav glyphs, so a button and the sidebar entry it leads to carry the same mark. Note the route is `/locations/new` — the nav says Atlas, the router says locations.

**Rule tracker (`RuleTrackerWidget.vue`)** — a homebrew rule's stateful tracker (Sanity, Exposure, Corruption…) live for the whole party, with its DM buttons. The second **configurable** widget, `maxInstances: 4`, and `src/lib/dashboard/ruleTrackerCard.ts` is `rollTableCard.ts`'s shape again: three states, and a `missing` card that says so rather than showing another rule's tracker. It has one extra failure mode — a rule that still exists but *lost its tracker* resolves to `missing` too, since there is nothing left to draw.

**`DmTrackerButtons` could not be reused whole, and the reason is worth knowing before you try again.** It takes a `partyMemberId` and internally loops **every** rule that has `tracker.dmButtons`, rendering all of them for that member — there is no prop to scope it to one rule. A Sanity card that dropped it in would also sprout Corruption and Hunger buttons. So the widget loops the party itself and reuses `RuleTrackerPanel` verbatim (pure presentation, needed no change), building buttons from `resolution.rule.tracker.dmButtons` and applying them through `useApplyTrackerDelta()` — the same composable `DmTrackerButtons` calls, so the clamp/upsert logic is invoked, never duplicated.

The `?? []` inside `memberEntries` is unreachable in the render path: `loading` explicitly requires both the roster and the tracker states to have arrived, and the body is not rendered until it is false. Rendering early would flash "No party members to track yet" at a table that has one, and show everybody at the tracker's floor before their real values load.

**Recent quest activity (`QuestActivityWidget.vue`)** — the beat-to-beat feed out of `quest_beat_transitions`, a complete audit trail that nothing read. Not self-hiding: "no beats played yet" is informative for a fresh campaign.

Nothing in the app turned a transition into a sentence, so `questActivity.ts`'s phrasing is new rather than a duplicate — `QuestRunPath.vue` renders a destination beat plus a raw uppercase kind badge and reads a different, narrower shape (`QuestRuntimeContext.path_so_far`). The table denormalises `from_quest_title` / `from_beat_title` / `to_*` at write time (`20260810000007_atomic_quest_runtime_navigation.sql:34-53`), so no beat fetch is needed. The null pairs are not defensive padding: only `start` leaves the `from_*` columns null (kind `enter`) and only `end` leaves the `to_*` null, and table check constraints guarantee each pair is null-null or both-present.

**Deities (`DeityLookupWidget.vue`)** — domains, alignment and symbol, in `ConditionsWidget`'s accordion. `selfHiding: true`: an empty pantheon is "not set up yet" rather than news, and most campaigns never record one.

It **groups by pantheon only when the deities span more than one bucket**, counting "no pantheon" as a bucket. A Faerûn campaign with thirteen pantheons is a wall without headers; a homebrew campaign with six unaffiliated gods would get a repeated "Unaffiliated" header on every row. The case that decides the rule is one real pantheon plus a few strays: that still groups, because folding the strays under the pantheon's header would misattribute them. `useAllDeities()` already joins the pantheon, so there is no second query.

**Rules search (`RulesSearchWidget.vue`)** — the compendium, searchable from the board. `rulesSearch.ts` lifts `CompendiumTab.vue:119-125`'s matcher unchanged (`name` or `content`, lowercased `includes`) and adds only ranking — title matches before body-only ones, stable, no double-listing — plus a limit. `CompendiumTab` could now call it with a high limit instead of keeping its own copy; that swap was left for whoever next touches that file.

**No mechanism exists to focus one rule in the compendium**: `CompendiumTab`'s `selected` is a plain local `ref`, wired to neither URL nor store. What *is* store-backed is `ui.compendiumSearch`, the tab's own filter. So a result sets that to the rule's name and pushes `/rules?tab=compendium` — it does not select the rule, but it narrows the destination to (usually) just that entry. A real deep link would need `CompendiumTab` to read a query param.

The result rows are `AppButton variant="menu" size="body" block` using its default slot, not the raw-`<button>` exception `ConditionsWidget` takes — the rows carry two lines of content and the same primitive `CompendiumTab` already uses for its own results. The repo's `convention-guard.sh` hook flagged the first draft, which is the hook doing its job.

**Cursed items (`CursedItemsWidget.vue`)** — cursed loot whose `curse_revealed` is still false. `selfHiding: true`, for the death-saves reason rather than the deities reason: an unrevealed curse is a rare narrative device, and many campaigns sit at zero for months.

**Cursedness is not on the inventory row.** `PartyInventoryItem` has no `is_cursed`; it lives on the linked `items` row as a non-null `curse_description`, joined by `item_id` — so an inventory entry with no `item_id` (a custom-named line) can never be cursed. The filter is "linked item has a curse description AND `curse_revealed === false`".

This is DM-private by construction: it reads `usePartyInventory()`/`useItems()` (the owner-scoped DM reads), never `get_player_visible_items`, and the dashboard sits outside the `/play` router fence. `ItemDetailPanel` — the only place `curse_revealed` is toggled — already gates its curse block on `canIdentify || inv?.curse_revealed`.

**Ambience (`SoundboardScenesWidget.vue`)** — jumps to a named soundboard page. `selfHiding: true`; a campaign with no named pages has nothing to jump to and the soundboard already opens on "All".

**#764 said to include this "only with a shared component", and the answer turned out to be that it needs none — because it carries no control.** The two-surfaces rule governs a *control* that appears both on `/soundboard` and in the floating `SoundboardWidget`; this widget only navigates, so there is no second copy of anything to drift. Choosing a page is one piece of state — `ui.soundboardActivePage`, which `SoundboardPageTabs` binds with `v-model` — and the widget sets that same field before routing to the page the tabs live on. The tabs remain the only thing that renders a page control. If this ever grows transport buttons, that reasoning expires and the rule bites.

**Initiative (`InitiativeMiniWidget.vue`)** — round, whose turn, who is next, and every combatant's HP, self-hiding unless a combat is running. Read-only: the encounter runner owns advancing turns and editing HP, and a second controller would be two places to be wrong from.

It reimplements neither the order nor the tie-break — it imports `sortCombatantsByInitiative` (`src/rules/combatantSort.ts`) and `stepTurnIndex` (`src/rules/encounterCombatLogic.ts`) from the runner's own pure modules. That is also what makes "next" correct at the end of a round and past a downed combatant: `stepTurnIndex`'s alive predicate is `hp > 0 || type === "player"`, so a downed monster is skipped and a player rolling death saves is not. `active_combatant_index` is clamped rather than defaulted, so a realtime row momentarily one-past-end after a splice does not read as index 0.

It shares `useRunningEncounters()` with `LiveEncounterBanner`, so mounting both uses one ref-counted realtime channel. **The two are not merged, deliberately**: the banner has no card chrome and must survive at widths where there is no widget grid at all, so it cannot depend on being in the DM's layout.

**Encounters needing prep (`EncounterGapsWidget.vue`)** — three gaps, ranked: no combatants (nothing to roll initiative for), no location, no reward. Finished encounters are excluded entirely — "not ready to run" cannot apply to something that already ran.

**Reward-lessness is checked only when the encounter has combatants**, and that is the load-bearing restraint. `Encounter` has no "kind" field distinguishing a social encounter from a half-built combat one, so combatant presence is the only usable signal; flagging a reward-less zero-combatant encounter would both double-penalise the same missing piece and wrongly accuse a legitimately reward-less social scene. `art_objects` is deliberately not a gap either: no editor binds it, so it would be a gap the DM has no way to close.

**Shops needing stock (`StoreRestockWidget.vue`)** — the catalogue marked this as needing new plumbing and it did, but a composable rather than a migration. `useStoreStockCounts(locationIds)` in `useStoreItems.ts` fetches every stock row for a set of locations in one `in` filter, selecting only `location_id` and `visible`; the per-location `useStoreItems` would have been one request per shop.

Two states, and **not** "stale". A staleness rule would have to invent a number of days, and `updated_at` says nothing about whether the shelves are bare — a village smith restocked once a year is not a problem. What is checkable: `empty` (a store-type location with no stock at all) and `hidden` (stock exists but not one row is `visible`). The second is the one worth surfacing, because from the players' side it is indistinguishable from an empty shop — so it is exactly the shop the DM believes is finished.

**Recently discovered monsters (`RecentMonstersWidget.vue`)** — the mirror of Recent NPCs, full-width, self-hiding. Discoveries reference **either** a DM-created `monsters` row or a shared `library_monsters` one (`monster_id` / `library_monster_id`); `useAllMonsters()` already merges both into one bestiary keyed by id, and `/monsters/:id` resolves either shape, so nothing branches on which table a row came from. A discovery with no timestamp is **dropped rather than coerced to epoch zero**: there is no honest position for an unknown time in a newest-first list.

**Monster quick-pull (`MonsterPullWidget.vue`)** — a random monster for an improvised encounter, by CR band and creature type. The pick goes through `rollParsed` from `@/lib/dice/roller`, never `Math.random()`, so the selection is a die roll like every other in the app and the pure module takes a plain index (which is what makes it testable).

**Habitat is deliberately not a filter.** It is free text and `null` on every Open5e-imported row — roughly 2,900 of ~3,541 bestiary entries (`open5eMonsterImport.ts:199`) — so a habitat filter would empty the pool for almost the whole bestiary. The CR bands match `LOOT_CR_TIERS` (`src/types/lootTable.types.ts:16`) so "CR 5–10" means one thing across the app, and fractional CRs go through the existing `crToNumber` rather than a second fraction parser.

**Quest triggers due (`QuestTriggersWidget.vue`)** — scheduled consequences about to fire. `time` triggers (`offset_days > 0`) get a countdown and a 14-day horizon; `event` triggers (`offset_days === 0`) fire the instant their condition happened and are exempt from the horizon, described by their condition rather than a countdown that would always read "Today".

**It matches `fireDueTriggers`' day math, not `lib/calendar/upcoming.ts`'s, and that is deliberate.** `useQuests.ts:44-47` uses a private helper with fixed 12×30-day months that ignores intercalary days; `upcoming.ts` is adapter-aware. The adapter version is more nearly *correct*, and using it here would make the widget disagree with the code that actually fires the trigger — a card saying "in 2 days" for something that fires in 3. A widget must agree with reality before it agrees with the calendar. The underlying inconsistency is filed rather than silently changed, since fixing it moves when triggers fire.

**Players wrote (`SharedJournalWidget.vue`)** — shared player journal entries the DM has not read. Self-hiding, and it empties itself as the DM works through it, because opening an entry marks it read.

**#764 expected this to need a schema addition — "the inverse of `player_read_items`" — and it does not.** That table is keyed `(user_id, campaign_id, entity_type, entity_id)` with four plain `auth.uid() = user_id` policies; nothing in it is player-specific except its name. The DM is an authenticated user who owns the campaign, so `useReadItems("journal_entry")` *is* the DM-has-seen marker, with no migration and no new RLS surface. The table's name is now a little wrong — it is a per-*user* read marker — and that is recorded here rather than migrated, since renaming it would touch every existing row and reader for no behavioural gain.

Unread re-triggers on edit (`isNew` takes `updated_at`), so an entry the DM read and the player then revised comes back — the same behaviour the player portal's own unread dots have.

`CalendarGrid.vue` used to answer the question itself: `currentMonth === 2 && adapter.isLeapYear(year) ? 29 : month.days`, applied to *every* adapter. Faerûn's leap rule is `every4` and Ches is 30 days, so in any year divisible by four — including 1492 DR, the default — the grid rendered Ches with 29 cells and **the 30th of Ches could not be reached at all**. `SessionWidget`'s day-advance and `lib/calendar/upcoming.ts` now ask the adapter too, so the grid, the date control and the countdown cannot disagree about how long a month is. Regression cover in `upcoming.test.ts`.

**In-world day arithmetic lives in `src/lib/calendar/dayMath.ts` (#766).** `buildYearIndex`, `ordinalWithinYear`, `daysBetween`, `daysFromTo`, `isOnOrBefore`, `addDays`. Everything walks whole years, because adjacent years are not the same length — a Harptos leap year carries Shieldmeet.

It exists because four places did this arithmetic and all four did it differently: `CalendarTimeline`'s `eventToFrac` (nominal 30-day months, fine for a ruler), `CalendarGrid` (a Gregorian February rule applied to every adapter — the Ches bug above), `upcoming.ts` (correct, but private), and `useQuests.ts`, which **scheduled and fired every quest trigger** on twelve exactly-30-day months with intercalary days ignored. A Harptos year is 365 or 366 days, so triggers drifted 5–6 days per in-world year against the calendar the DM reads.

**That one hid because both halves used the same wrong helper.** `scheduleQuestTriggers` stamped a fire date with it and `fireDueTriggers` compared against it with the same function, so they agreed with each other perfectly and nothing looked broken. It only surfaced when the #764 dashboard card computed the same date correctly and disagreed — which is why that widget originally *mirrored* the wrong formula on purpose.

Two decisions worth keeping:

- **`addDays` never returns an intercalary day.** `quest_trigger_scheduled` stores three integer columns and has nowhere to put "Shieldmeet", so an offset landing on a festival rolls forward to the next dated day. Intercalary days still *count* as elapsed — ignoring them is the bug.
- **Rows scheduled before the fix keep their stored dates.** Recomputing on read would move deadlines a DM has already been told about, mid-campaign. A handful of legacy rows a few days out is the better trade, and `fireDueTriggers` says so at the point of the comparison.

`useQuests.ts` reads the adapter from the store rather than taking it as a parameter: four call sites across three components is four chances to pass the wrong calendar, and a trigger belongs to a campaign, which has exactly one.

**Keyboard**: the grip is focusable; Arrow keys move one position, `Delete`/`Backspace` removes, and the width control is an ordinary button in the tab order. No document-level listener — these are handlers on the focused element, so `useHotkeys` (for global shortcuts) does not apply.

**Motion**: reordering animates through `captureFlipPositions` / `playFlipTransition` in `src/lib/motion.ts` (`FLIP_MS` 220 — a shorter hop than `AppModal`'s 260ms click-to-centre flight; position only, since a reorder is not an appearance change). The FLIP bracket wraps the keyboard and button paths only: a pointer drag is already animated by Sortable, and playing both would fight.

**Persistence is write-through and debounced** (500ms) through #762's `saveLayout`, which is optimistic, so nothing on screen waits for a write. Leaving the mode or unmounting the view flushes rather than discards — a pending debounce that died with the mode would lose the last edit silently. **Reset** deletes the row via `resetLayout` and answers with an **undo toast** rather than a confirm dialog; the view snapshots the entries *before* the call, because nothing else remembers them once the row is gone. That toast action is why `useToast` gained `action?: { label, run }` — wrapped once at `push()` so it fires at most once and dismisses itself, with the dismiss in a `finally` so a failed undo does not strand a dead button on screen.

`title`/`description` on each catalogue entry feed the picker's options; they are no longer unused.

`?view=prep` / `?view=session` overrides the derived default, so a DM mid-session can check what still needs preparing without ending the table. Choosing the side the session would have picked anyway **clears** the override rather than pinning it — otherwise one toggle would freeze the page on that side for the evening. Same shape as `QuestDetailView`: derived default, explicit escape hatch.

That the composition follows the session is the point, not a convenience: [#758](https://github.com/irongollem/grimoire/issues/758)'s worst finding was that starting a session changed nothing visible on a laptop. It changes the page now.

**At the table** (`DEFAULT_LAYOUTS.session`) — `LiveEncounterBanner`, `PartyWidget`, then `QuestsWidget` / `SessionWidget` / `UnidentifiedWidget`, then `RecentNpcsWidget` and `PinnedNotesWidget`.

**Prep** (`DEFAULT_LAYOUTS.prep`) — `PrepGapsWidget` / `QuestsWidget` / `NextSessionWidget` / `UnidentifiedWidget` as four flat adjacent cells (the 4th wraps to a second grid row at `lg`), then `PartyWidget` and `PinnedNotesWidget`. `LiveEncounterBanner` and `SessionWidget` are absent: in-world time and live combat are table concerns. (Before #761 the third and fourth of those four cells were one cell stacking `NextSessionWidget` above `UnidentifiedWidget` in a nested flex column — the flat layout model can't express that nesting, so it's now two adjacent cells; the only sanctioned visual diff from the pre-#761 dashboard.)

`DashboardStats` sits under both, always `full`-width. Deliberately not a `DashboardWidget` — it is a row of links that happen to carry a number, with no card chrome.

Widget notes:

- **`PartyWidget`** — `max-height="none"`; a responsive grid is its own size. Online dot via `useCampaignPresence`.
- **`PrepGapsWidget`** — `prepGapCount` and `undispatchedLootCount` from `useQuestBoardSummaries`, neither previously visible outside the quest board. A prep gap is `deriveQuestBeatPrepGaps`, which is **broader than a deleted attachment**: missing DM guidance, missing rumor/reveal copy, an unreviewed improvised beat, a disconnected staging beat. The count cannot say which, so the copy says "not ready to run" rather than naming a cause it does not know. Gaps sort above loot — a beat that cannot run blocks the evening; an undelivered reward only disappoints afterwards.
- **`NextSessionWidget`** — nearest non-cancelled `session_proposals` row, shown as a countdown. The deadline is the point: gaps matter *because* Thursday is coming.
- **`RecentNpcsWidget`** — up to 10 NPCs in visit order (`useRecentNpcs`, localStorage `grimoire_recent_npcs_<campaignId>`, per-campaign). Visit recorded in `NpcDetailView` via `watch(id)`.
- **`PinnedNotesWidget`** — `is_pinned` notes, max 4, hidden when none.

### The quests widget is one list, on purpose

`QuestsWidget` had three predecessors — *In progress* (chains with a live cursor), *Active Quests* (the kanban lane) and *Rumors*. All three read the same data, each stood mostly empty, and a quest being played appeared in two at once.

Two wrong answers were tried before the right one, and both are worth not repeating:

- **Stacking** them as three sections of one card only moved the duplicate next to its twin.
- **Grouping** by stage under headings looks right until quests are properly built out — at which point every active quest holds a cursor, so *Party is here* and *Active* list the same quests under two headings, and the heading repeats what the row's own badge says.

So `lib/dashboard/questRows.ts` merges every reading into **one row per quest**, sorted `here → paused → active → rumor`, and the widget renders a flat list. A cursor always wins over the lane: where the party is standing is the strongest thing you can say about a quest, and it carries the beat, which beats the giver at a glance. `DashboardQuestRow` never changes shape between stages — a rumor and an active quest are one thing at two points of its life, so only the dot and the trailing label differ.

Guarantee held in `questRows.test.ts`: `end_campaign_quest_session` pauses every open chain when a session ends, so "has a cursor" must never render as "the party is here".

`SessionWidget` is in-world time and place (Game Day via `useSetCampaignToday`; Current Location via `useSetCampaignLocation`; DM-only "Sync to party →" via `useSyncPartyLocation`). It is **not** the live session of [#758](https://github.com/irongollem/grimoire/issues/758) — game-world time advances whether or not the table is sitting.

### Key composables used

- `useRecentNpcs` — `src/composables/dashboard/useRecentNpcs.ts` — module-level singleton, localStorage-backed.
- `useSetCampaignToday` / `useSetCampaignLocation` — `src/composables/campaign/useCampaigns.ts`.
- `useSyncPartyLocation` — `src/composables/party/useParty.ts` — batch `UPDATE party_members SET current_location_id WHERE id IN (...)`.
- `useCampaignLiveQuests` — `src/composables/quests/useQuestFlow.ts` — the open-chain set. Shared with the Run cockpit and, per [session-mode.md](../../docs/session-mode.md), the planned `LiveRail`; add consumers to it rather than re-querying `get_campaign_live_quests`.

### campaigns table additions (migration `20260508000008`)

- `current_location_id uuid REFERENCES locations(id) ON DELETE SET NULL`
- (`current_month`, `current_day` were already present; migration uses `IF NOT EXISTS`.)

---

## Working on this feature? Start here

Read these five files first — they cover the entire data and component surface:

1. `src/types/notes.types.ts` — `Note`, `NoteCategory`, `NoteInsert`, `NoteUpdate`
2. `src/types/calendar.types.ts` — `CalendarEvent`, `CalendarEventType`, `HarptosDate`, `CalendarAdapter`, `CalendarEventInsert`, `CalendarEventUpdate`, `LinkedEntityType`
3. `src/composables/notes/useNotes.ts` — all note CRUD composables
4. `src/composables/calendar/useCalendarEvents.ts` — all calendar event CRUD composables plus entity-pin helpers
5. `src/components/notes/NoteEditor.vue` — the main editor and all its special integrations. The session-dates card and the calendar-event sync live beside it in `NoteSessionDatesPanel.vue` and `composables/notes/useNoteCalendarSync.ts` (#814)

---

## Notes Feature

### Routes

| Route         | Name          | Component                            | Access                  |
| ------------- | ------------- | ------------------------------------ | ----------------------- |
| `/notes`      | `notes`       | `src/views/notes/NotesView.vue`      | DM (requiresAuth)       |
| `/notes/new`  | `note-new`    | `src/views/notes/NoteDetailView.vue` | DM                      |
| `/notes/:id`  | `note-detail` | `src/views/notes/NoteDetailView.vue` | DM                      |
| `/play/notes` | `play-notes`  | `src/views/play/PlayerNotesView.vue` | Player (requiresPlayer) |

### Database Table: `notes`

Key columns:

| Column                         | Type                      | Notes                                 |
| ------------------------------ | ------------------------- | ------------------------------------- |
| `id`                           | uuid PK                   |                                       |
| `user_id`                      | uuid FK → auth.users      | DM owner                              |
| `campaign_id`                  | uuid FK → campaigns       | nullable; scoped to active campaign   |
| `title`                        | text                      | required, default 'Untitled Note'     |
| `content`                      | text                      | Tiptap JSON string (not HTML)         |
| `category`                     | text                      | see `NoteCategory`                    |
| `tags`                         | text[]                    | free-form, GIN-indexed                |
| `session_num`                  | integer                   | session category only                 |
| `is_pinned`                    | boolean                   | floats to top of list                 |
| `player_visible_to`            | uuid[]                    | party_member IDs; empty = DM-only     |
| `session_start_year/month/day` | integer                   | in-game start date (session category) |
| `session_end_year/month/day`   | integer                   | in-game end date (optional)           |
| `session_real_date`            | text                      | real-world "YYYY-MM-DD"               |
| `linked_calendar_event_id`     | uuid FK → calendar_events | auto-managed; null on event delete    |
| `sort_order`                   | integer                   | manual drag order; null until reordered (migration `20260608000002`) |

**RLS (current):** `auth.uid() = user_id` gives DM full access. Players select where their `party_member_id` is in `player_visible_to`:

```sql
create policy "notes_select" on notes for select using (
  auth.uid() = user_id
  or (
    campaign_id is not null
    and campaign_id in (select campaign_id from campaign_members where user_id = auth.uid())
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = auth.uid()
        and cm.campaign_id = notes.campaign_id
        and cm.party_member_id = any(notes.player_visible_to)
    )
  )
);
```

### TypeScript Types — `src/types/notes.types.ts`

```ts
type NoteCategory = "general" | "session" | "lore" | "location" | "quest" | "faction";
interface Note { id, user_id, campaign_id, title, content, category, tags, session_num, is_pinned,
                  player_visible_to, session_start_year/month/day, session_end_year/month/day,
                  session_real_date, linked_calendar_event_id, created_at, updated_at }
type NoteInsert = Omit<Note, "id" | "user_id" | "created_at" | "updated_at">
type NoteUpdate = Partial<NoteInsert>
```

### Composables — `src/composables/notes/useNotes.ts`

TanStack Query key: `"notes"`.

| Export                     | Returns                  | Description                                              |
| -------------------------- | ------------------------ | -------------------------------------------------------- |
| `useNotes()`               | `UseQueryResult<Note[]>` | All notes for active campaign (fetched `updated_at DESC`; the view re-sorts client-side via `sortEntities`) |
| `useNote(id: Ref<string>)` | `UseQueryResult<Note>`   | Single note by ID                                        |
| `useCreateNote()`          | `UseMutationResult`      | `mutationFn: (note: Omit<NoteInsert, "campaign_id">)`    |
| `useUpdateNote()`          | `UseMutationResult`      | `mutationFn: ({ id, update })`                           |
| `useDeleteNote()`          | `UseMutationResult`      | `mutationFn: (id: string)`                               |
| `useReorderNotes()`        | `UseMutationResult`      | `mutationFn: (orderedIds: string[])` — writes `sort_order = index` (manual drag) |

All mutations call `queryClient.invalidateQueries({ queryKey: ["notes"] })` on success.

### View Components

**`src/views/notes/NotesView.vue`**

- Uses `useQuota("notes")` — shows `PaywallModal` (from `src/components/common/PaywallModal.vue`) when `canCreate` is false
- Renders `NotesList` inside `ListPageLayout`

**`src/views/notes/NoteDetailView.vue`**

- `isNew`: `route.name === "note-new"`
- `isEditing`: `route.query.edit === "true"`
- Renders `NoteEditor` when new or editing, `NoteSheet` when viewing
- Uses `useNote(id)` for data fetch

### UI Components

**`src/components/notes/NotesList.vue`**

- Consumes `useNotes()` and `useQuota("notes")`
- Client-side filtering: free-text search (title + tags), category pill buttons
- **Sort:** a `SortControl` (`src/components/common/SortControl.vue`) exposes four modes — Created / Updated / Title A–Z / Manual — with an asc/desc toggle. Sort preference lives in `useUiStore` (`notesSortBy`, `notesSortDir`). Default is **Created, descending** (newest first). Ordering uses the shared `sortEntities` util (`src/lib/noteSort.ts`). Pinned notes float to the top in every mode (rendered as a separate static group); in **Manual** mode only the unpinned remainder is draggable (`VueDraggable`, handle `.note-drag-handle`), persisted via `useReorderNotes()` writing `sort_order = index`.
- Each card is the extracted `NoteCard` (`src/components/notes/NoteCard.vue`), reused by both the static grid and the draggable grid
- `NoteCard`'s `AudienceRevealControl` is the `inline` form and lives on the **category + session** row, right-aligned — the three things a note *is*, on one line. It used to be an `overlay`-form chip absolutely positioned over the category colour bar, which put an opaque dark square on top of the first word of every title; and the scrim that form wears is for artwork, which a note card has none of. Do not move it back to the card corner: the drag handle (`.note-drag-handle`, Manual sort) already owns the top-right
- Category colour map: `general=#6b7280`, `session=#2563eb`, `lore=#7c3aed`, `location=#059669`, `quest=#d97706`, `faction=#dc2626`
- Content preview via `extractTiptapText(note.content)` from `src/lib/utils.ts`
- Filter state (search + category), sort state and the Clear button all live in `useUiStore` — `notesSearchQuery`, `notesFilterCategory`, `notesHasActiveFilters`, `resetNotesFilters`, `notesSortBy`, `notesSortDir` (#723). The bar itself is the shared `ListFilterBar` / `ListSearchInput` / `ListFilterGroup` trio, not hand-rolled markup
- **Session sequence:** filter to the Session category + Manual sort to drag session notes into the order they should read (the `Session N` label / `session_num` is unaffected — `sort_order` is a separate column)

**`src/components/notes/NoteEditor.vue`**

All note creation and editing happens here. Key integrations:

1. **`RichTextEditor`** (`src/components/common/RichTextEditor.vue`) — full editor with all extensions; uses `allow-calendar-events` prop and `@insert-calendar-event` event to enable the calendar toolbar button

2. **`InlineCalendarEventModal`** (`src/components/calendar/InlineCalendarEventModal.vue`) — triggered by the calendar toolbar button; on `@event-created` calls `rteRef.value?.insertCalendarEventRef(...)` to embed a `CalendarEventRef` chip in the note body

3. **`AudienceRevealControl`** (`src/components/common/AudienceRevealControl.vue`) — the app's one reveal control (#741), bound to the draft here because the editor owns its Save; `NoteSheet` and `NoteCard` mount the same control bound to the row, so a note can be revealed without opening the editor. Controls `player_visible_to: string[]` (party member IDs). When a note is newly shared on save, `sendCampaignAnnouncement` from `src/composables/campaign/useCampaignBroadcast.ts` broadcasts a message to players, and `notifyNoteShared` from `src/composables/campaign/useEmailNotify.ts` emails the newly added players (see [notifications.md](notifications.md))

4. **Session date sync — `useNoteCalendarSync()`** (`src/composables/notes/useNoteCalendarSync.ts`), called after every save:
   - If start date is present: creates or updates a `session`-type calendar event (colour `#C9920A`) linked to the note via `linked_note_id`; patches note's `linked_calendar_event_id`
   - If start date removed, or the note stops being a session note: deletes the linked calendar event and clears `linked_calendar_event_id`
   - Insert order avoids circular FK: insert note first (no linked event) → insert event with `linked_note_id` → patch note
   - Takes an explicit argument object rather than reaching into component state, which is what makes the three branches testable without mounting the editor (`useNoteCalendarSync.test.ts`). Lifted out of `NoteEditor` by [#814](https://github.com/irongollem/grimoire/issues/814).
5. **Session dates — `NoteSessionDatesPanel.vue`**, rendered under `v-if="category === 'session'"`. Owns the whole concern: the three date rows, the `linked_calendar_event_id` indicator, and the pre-fill. `NoteEditor` holds one `NoteSessionDates` ref (`types/notes.types.ts`) instead of seven, and `buildPayload()` maps it back to the seven columns.

   **The pre-fill moved from `watch(category, …, { immediate: true })` to the panel's `onMounted`,** which is equivalent because the panel mounts exactly when the category becomes (or starts as) `session` — the same transition the watcher fired on. It reads `useNotes()`, finds the highest `session_num`, and pre-fills the start date from that note's end date (start date as fallback). It still no-ops when editing an existing note or when a start date is already set.

6. **`TagInput`** (`src/components/common/TagInput.vue`) for the `tags` field

7. **VueDatePicker** (`@vuepic/vue-datepicker`) for `session_real_date` — stored as "YYYY-MM-DD" string; lives in `NoteSessionDatesPanel`, which also imports the vendor stylesheet it needs

8. **Chronicler AI image generation** (DM-only, shown whenever `campaign.activeCampaign.image_provider` is configured — `hasImageProvider`). Works with every provider we expose (OpenAI, Google Gemini) on both the server-side edge-function path and the BYOK local-vault path, which routes through the shared `getImageProvider()` abstraction (`src/ai/providers/`):
   - `ChroniclerGenerateDialog` (`src/components/notes/ChroniclerGenerateDialog.vue`) — AI scene illustration. **Queued model**: `startChroniclerImage()` (`src/ai/useChroniclerImageGeneration.ts`) starts the render job and returns a `jobId` in seconds; the dialog emits `started`, clears the prompt, and stays open so several images can be queued back-to-back. Each start drops a **`pendingImage` anchor node** (`src/lib/tiptap/PendingImage.ts`, card view `src/components/tiptap/PendingImageCard.vue`) at the cursor via `rteRef.insertPendingImageAtCursor(...)`. `usePendingImageResolver` (`src/composables/usePendingImageResolver.ts`, pure doc-scan helpers in `src/lib/pendingImages.ts`) watches anchors and swaps each for the finished image **by jobId at the anchor's current position** — surviving typing, navigation, even reopening the note days later (ready job rows persist; they ARE the gallery rows). The resolver is wired into **both** `RichTextEditor` and the read-only `RichTextViewer`, so a note saved mid-render swaps its anchor for the image in the rendered view too (in-memory only). When a job settles, every live resolver instance is notified to re-scan: the anchor may have moved instances mid-wait (view a note → click Edit destroys the viewer's editor while its wait is in flight), and without the re-scan the module-level tracked-jobs dedupe would strand the anchor as forever-pending. **Server-side persistence (#614):** a job started from a *saved* note records `target_table='notes'/target_column='content'` (validated as the caller's own note in that campaign), and `completeImageJob` special-cases that target to `resolveNotePendingImage` (`_shared/notePendingImage.ts`) — an updated_at-CAS rewrite of the note's content that swaps the anchor for the image node, so shared-note viewers (players, whose RLS hides the job row) get the image without waiting for the DM's next edit + save. Best-effort by design: a lost CAS race or deleted anchor never fails the job, and unsaved-new-note jobs carry no target (client resolvers alone cover them). Failed/orphaned jobs flip the anchor to a "failed" card with a Remove button. Deleting an anchor is allowed — the image then lands gallery-only. BYOK local mode uses `local-` pseudo-job ids (in-memory; don't survive reload — the anchor then reads failed).
   - `ChroniclerLibraryPicker` (`src/components/notes/ChroniclerLibraryPicker.vue`) — browse and insert previously generated images; calls `rteRef.value?.insertImageAtCursor(url)`

   **Where "at the cursor" actually is** — `insertionPos` (`src/lib/tiptap/insertionPos.ts`), which every `insert*AtCursor` on `RichTextEditor` routes through. ProseMirror's selection starts at the top of the document and stays there until something moves it, so an editor nobody has clicked into reports position 1 — indistinguishable from a cursor deliberately at the top. Reaching for a toolbar button without clicking into the prose first (the ordinary way to use a toolbar) therefore dropped chronicles, images and pending-image anchors *above* the DM's own notes. `RichTextEditor`'s `onFocus` flips a `cursorPlaced` flag; until it does, insertions append to the end. The same helper steps out of an enclosing `aiGenerated` wrapper, so a second chronicle sits beside the first instead of nesting inside its provenance markers.

9. **Chronicler AI text generation — "Write Chronicle"** (DM-only, Pro-gated in the UI, toolbar button when `hasTextProvider`): `ChroniclerWriteDialog.vue` takes raw session facts (a `MentionTextarea`, `@`-mentions client-resolved to NPC/monster/party-member descriptions) plus a tone, and `useChroniclerTextGeneration` returns markdown that "Insert into Note" splices into the currently-open note — there is no chronicle table; chronicles ARE note content. Server path = `generate-chronicle-text` (credits key `chronicle_text`); local-key mode keeps the ungrounded client path (policy — see `useQuestGeneration.ts`). The function deliberately does NOT use `_shared/textGen.ts`'s `callText`: that dispatcher forces JSON-mode output, which commit `97261fe1` removed from chronicles because constrained decoding let an unescaped quote silently truncate the narrative — the transport stays local until `callText` grows a plain-text opt-out (documented in the function's module doc).

   **The draft is the DM's, and costs credits — four rules the dialog now enforces.** Each replaced a way the paid output could be lost or misplaced without a word:

   - **The title line goes to the title field.** The system prompt never asks for a title, but every model opens with one (`# Session 4: The Duke's Blood`), and it was landing in the body while the note's own Title and Session # stayed empty. `parseChronicleHeading` (`src/ai/chronicleHeading.ts`, colocated test) lifts it out: a leading H1, or a heading at any level naming a session number — never a later `##`, which is a scene divider. The preview shows both values in editable fields, so what reaches the note is visible before Insert. A title the DM already wrote **keeps the field** and the model's is offered as a one-tap "Use" chip; applying a session number also switches `category` to `session`, because `buildPayload()` nulls `session_num` for every other category and it would otherwise be dropped on save. Because the title can now be AI-authored, `save()`'s material-edit diff (#606) covers it as well as the body — but only via `aiTitleSnapshot`, which stays null unless a Chronicle actually wrote the title, so editing a DM-written one never flips `edited: true`.
   - **Stepping back keeps the draft.** "← Edit facts" used to null the generated markdown, so the only way back to it was a second generation and a second charge. The dialog is a `step` ref over a retained draft, with "Back to draft →" returning for free.
   - **The backdrop does not dismiss** (`:backdrop-dismiss="false"`), and Escape/Cancel confirm once a draft exists. A click landing beside the panel is not a decision to discard a paid narrative. This is now a general rule rather than one dialog's fix — `ChroniclerGenerateDialog` and the cartographer's AI style modals carry it too, it is written up on `AppModal`'s `backdropDismiss` prop, and `src/components/common/appModalPaidBackdrop.test.ts` fails if a modal that prices, shows or runs a generation ships without it.
   - **Leaving the note editor asks** — via `useUnsavedGuard` (`src/composables/useUnsavedGuard.ts`), which registers both `onBeforeRouteLeave` and `onBeforeRouteUpdate`. The update hook is the load-bearing one: dropping `?edit=true` (the browser's Back button) is a same-route update, so a leave guard alone never fires, yet `NoteDetailView`'s `v-if` unmounts the editor and takes the unsaved chronicle with it. The composable was extracted by [#814](https://github.com/irongollem/grimoire/issues/814) and is shared with the cartographer editor; its test drives a real router, because the whole claim is *which hook fires for which navigation* and a mocked router would only replay the author's assumption.

   **Retrieval grounding (#600).** The server path embeds `raw_text` once and injects two independent blocks (either can be present without the other; any failure drops both and degrades to the pre-#600 prompt): the shared campaign-entity block (`_shared/campaignEntityRetrieval.ts`, same as quest/roll-table), and a Chronicler-specific `---BEGIN PRIOR CHRONICLES---` block — up to 6 prior **`category = 'session'` notes only** via `match_campaign_notes` (migration `20260804000001`, `p_categories` predicate in the `WHERE`), re-sorted chronologically (`session_num` asc, unnumbered notes last) with 600-char snippets and an instruction to use them for continuity/callbacks, never re-narration. Every note category is *embedded* (the corpus also serves #599), but the Chronicler retrieves session notes exclusively: a recap is player-facing prose, and lore/quest/faction/location/general notes are the DM's planning material — an unrevealed twist retrieved from a lore note would surface in the recap as a "callback", leaking the spoiler in the DM's own voice. Do not widen the category list without a per-note "revealed" signal. The note open in the editor is excluded via `exclude_note_id` so a recap never retrieves the note it will be inserted into. Only the DM-authored `notes` table is embedded — never `entity_notes` / `player_journal_entries` / `npc_player_notes` (player-authored; #599's exclusion rule). Notes embed on every save (`queueNoteEmbedding` in `useNotes.ts`, plus the downtime seed-reward path) and are the sixth admin backfill target. There is no chip/resolution surface here: the output is prose the DM edits, nothing maps back into rows — grounding is input-side only. Full mechanism: world-building.md's "Retrieval grounding" section.

10. **Image cleanup** — on update, calls `cleanupRemovedRichTextImages(oldContent, newContent)` from `src/composables/useImageUpload.ts`; on delete, calls `removeRichTextImages(content)`

**`src/components/notes/NoteSheet.vue`**

- Read-only view; shows metadata badges + `RichTextViewer` content
- "Edit" button pushes `?edit=true` to query params; "Delete" uses `useDeleteNote()` + `removeRichTextImages`

**Post-mutation navigation:**

- Create → `router.replace("/notes/:id")` (lands on view mode)
- Save → `router.push("/notes")`
- Delete → `router.push("/notes")`

### Player-Facing Notes View — `src/views/play/PlayerNotesView.vue`

- Uses `useNotes()` — Supabase RLS filters automatically; only notes with the player's `party_member_id` in `player_visible_to` are returned
- Read-only accordion list: pinned-first sort, expand to `RichTextViewer`
- No create/edit/delete capability for players

---

## Player Adventure Journal

Separate from DM notes — entirely player-owned.

### Route

`/play/journal` (embedded tab in player portal, `requiresPlayer`)
View: `src/views/play/PlayerJournalView.vue`

### Database Table: `player_journal_entries`

Key columns: `id`, `user_id`, `campaign_id`, `title`, `content` (Tiptap JSON), `category`, `tags`, `is_private` (bool, default true), `ref_type`, `ref_id`, `ref_label`, `created_at`, `updated_at`.

### TypeScript Types — `src/composables/notes/usePlayerJournal.ts`

Types are defined inline in the composable file (not a separate `.types.ts`):

```ts
type JournalCategory =
  | "adventure"
  | "clue"
  | "discovery"
  | "session"
  | "character"
  | "rumor";
type JournalRefType =
  | "quest"
  | "npc"
  | "location"
  | "item"
  | "monster"
  | "encounter";
interface PlayerJournalEntry {
  id;
  user_id;
  campaign_id;
  title;
  content;
  category;
  tags;
  is_private;
  ref_type;
  ref_id;
  ref_label;
  created_at;
  updated_at;
}
```

### Composables — `src/composables/notes/usePlayerJournal.ts`

TanStack Query key: `"player_journal"`.

| Export                      | Returns                                | Description                                        |
| --------------------------- | -------------------------------------- | -------------------------------------------------- |
| `useMyJournalEntries()`       | `UseQueryResult<PlayerJournalEntry[]>` | Current user's own entries (fetched `created_at DESC`; the view re-sorts) |
| `useSharedJournalEntries()`   | `UseQueryResult<PlayerJournalEntry[]>` | Other players' non-private entries                 |
| `useCreateJournalEntry()`     | `UseMutationResult`                    | `mutationFn: (entry: Omit<Insert, "campaign_id">)` |
| `useUpdateJournalEntry()`     | `UseMutationResult`                    | `mutationFn: ({ id, update })`                     |
| `useDeleteJournalEntry()`     | `UseMutationResult`                    | `mutationFn: (id: string)`                         |
| `useReorderJournalEntries()`  | `UseMutationResult`                    | `mutationFn: (orderedIds: string[])` — writes `sort_order = index` (My Journal manual drag) |

`JOURNAL_CATEGORIES` and `JOURNAL_CATEGORY_LIST` are exported constants for colour/label display. `is_private = true` entries are filtered by RLS; players cannot see other players' private entries.

---

## Calendar Feature

### Calendar Routes

| Route            | Name            | Component                               | Access                  |
| ---------------- | --------------- | --------------------------------------- | ----------------------- |
| `/calendar`      | `calendar`      | `src/views/calendar/CalendarView.vue`   | DM (requiresAuth)       |
| `/play/calendar` | `play-calendar` | `src/views/play/PlayerCalendarView.vue` | Player (requiresPlayer) |

### Player Calendar (`/play/calendar`)

Shows the current in-game date prominently, a read-only Harptos month grid, and an upcoming events list. Only events with `player_visible = true` are shown. Players cannot create or edit events.

- **Composable:** `usePlayerCalendarEvents(year)` — fetches `player_visible = true` events for the active campaign year
- **Grid:** reuses `CalendarGrid` via `eventsOverride` + `readOnly` props (no create/edit interactions)
- **Nav:** `CalendarDays` icon, positioned after Quests in `ALL_PLAYER_NAV`

DMs mark events visible via the "Visible to players" checkbox in `EventModal` and `InlineCalendarEventModal`.

### Database Table: `calendar_events`

Key columns:

| Column                | Type                 | Notes                                   |
| --------------------- | -------------------- | --------------------------------------- |
| `id`                  | uuid PK              |                                         |
| `user_id`             | uuid FK → auth.users |                                         |
| `campaign_id`         | uuid FK → campaigns  |                                         |
| `title`               | text                 | required                                |
| `description`         | text                 | Tiptap JSON (optional)                  |
| `event_type`          | text                 | see `CalendarEventType`                 |
| `harptos_year`        | integer              | required                                |
| `harptos_month`       | integer              | null for festival days                  |
| `harptos_day`         | integer              | null for festival days                  |
| `festival_day`        | text                 | null for regular days                   |
| `is_multi_day`        | boolean              |                                         |
| `end_year/month/day`  | integer              | multi-day end date                      |
| `color`               | text                 | hex string (derived from `event_type`)  |
| `player_visible`      | boolean              | default false; DM-controlled visibility |
| `linked_quest_id`     | uuid FK → quests     | on delete cascade                       |
| `linked_encounter_id` | uuid FK → encounters | on delete cascade                       |
| `linked_location_id`  | uuid FK → locations  | on delete cascade                       |
| `linked_note_id`      | uuid FK → notes      | on delete set null                      |

**RLS:** Standard four-policy pattern (`auth.uid() = user_id`). Player read access via `usePlayerCalendarEvents` queries `player_visible = true` with `campaign_id` scope.

### TypeScript Types — `src/types/calendar.types.ts`

```ts
type CalendarEventType =
  | "campaign"
  | "world"
  | "session"
  | "festival"
  | "deadline"
  | "player_death"
  | "boss_fight"
  | "discovery"
  | "npc_death"
  | "travel"
  | "quest"
  | "encounter"
  | "location";
type LinkedEntityType = "quest" | "encounter" | "location";
interface CalendarEvent {
  id;
  user_id;
  campaign_id;
  title;
  description;
  event_type;
  harptos_year;
  harptos_month;
  harptos_day;
  festival_day;
  is_multi_day;
  end_year;
  end_month;
  end_day;
  color;
  linked_quest_id;
  linked_encounter_id;
  linked_location_id;
  linked_note_id;
  travel_party_member_ids;
  created_at;
  updated_at;
}
interface HarptosDate {
  year;
  month;
  day;
  festival_day;
}
type CalendarEventInsert = Omit<
  CalendarEvent,
  "id" | "user_id" | "created_at" | "updated_at" | "linked_note_id"
> & { linked_note_id?: string | null };
type CalendarEventUpdate = Partial<CalendarEventInsert>;
```

Helper functions (also in `calendar.types.ts`):

- `linkedEntityType(event): LinkedEntityType | null` — returns which FK is set
- `linkedEntityId(event): string | null` — returns the ID of the linked entity

### Composables — `src/composables/calendar/useCalendarEvents.ts`

TanStack Query key: `"calendar-events"`.

| Export                                                                                     | Description                                                                      |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `useCalendarEvents(year: MaybeRef<number>)`                                                | Events for a single year in the active campaign                                  |
| `useCalendarEventsRange(startYear, endYear: MaybeRef<number>)`                             | Events across a year range (used by timeline)                                    |
| `useEntityCalendarEvents(entityType: MaybeRef<LinkedEntityType>, entityId: MaybeRef<string | null>)`                                                                          | Events pinned to a specific quest/encounter/location               |
| `useCreateCalendarEvent()`                                                                 | `mutationFn: (event: CalendarEventInsert)` — injects `campaign_id` automatically |
| `useUpdateCalendarEvent()`                                                                 | `mutationFn: ({ id, update: CalendarEventUpdate })`                              |
| `useDeleteCalendarEvent()`                                                                 | `mutationFn: (id: string)`                                                       |
| `useCalendarEventById(id: MaybeRef<string                                                  | null>)`                                                                          | Single event by UUID; `staleTime: 5min`; returns `null` if deleted |
| `useLinkedNoteCalendarEvent(noteId: MaybeRef<string                                        | null>)`                                                                          | Event linked to a specific note via `linked_note_id`               |

### Pinia Store — `src/stores/calendar.ts`

`useCalendarStore()` — persisted to `localStorage` under key `grimoire_calendar_position`.

Key state and actions:

| Property/Method                      | Type                        | Description                                                       |
| ------------------------------------ | --------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| `activeCalendarId`                   | `ref<string>`               | Active adapter ID (e.g. `"faerun"`)                               |
| `view`                               | `ref<CalendarView>`         | `"month"` or `"timeline"`                                         |
| `currentYear`                        | `ref<number>`               | Currently displayed year                                          |
| `currentMonth`                       | `ref<number>`               | Currently displayed month (1-indexed)                             |
| `adapter`                            | `computed<CalendarAdapter>` | Active `CalendarAdapter` from registry                            |
| `timelineZoom`                       | `ref<TimelineZoom>`         | Number of years shown in timeline                                 |
| `highlightedEventId`                 | `ref<string                 | null>`                                                            | For CalendarEventRef chip navigation |
| `prevMonth()` / `nextMonth()`        | fn                          | Navigate one month                                                |
| `goToYear(year)`                     | fn                          | Jump to year                                                      |
| `goToMonth(year, month)`             | fn                          | Jump to specific month                                            |
| `setView(v: CalendarView)`           | fn                          | Switch month/timeline view                                        |
| `setCalendar(id)`                    | fn                          | Switch calendar adapter                                           |
| `loadFromCampaign(calendarId, year)` | fn                          | Called by campaign store on campaign switch                       |
| `setHighlightedEvent(id)`            | fn                          | Highlights an event after navigation from a CalendarEventRef chip |

Exported type: `CalendarView = "month" | "timeline"`.

### Calendar Adapter Pattern

All calendar adapters live in `src/settings/index.ts` (not directly in `src/calendars/`).

`src/calendars/index.ts` just re-exports from settings:

```ts
export {
  CALENDAR_REGISTRY,
  getCalendarAdapter,
  listCalendarAdapters,
} from "@/settings/index";
```

`src/settings/index.ts` builds `CALENDAR_REGISTRY` from all registered `DndSettingDef` objects plus the standalone `gregorianAdapter` from `src/calendars/gregorian.ts`.

Currently registered setting IDs: `faerun`, `eberron`, `greyhawk`, `dragonlance`, `ravenloft`, `planescape`, `spelljammer`, `darksun`, `mystara`, `gregorian`.

**To add a new calendar:** Create `src/settings/<name>.ts` exporting a `DndSettingDef`, then add it to the map in `src/settings/index.ts`. The adapter is automatically included in `CALENDAR_REGISTRY`.

`CalendarAdapter` interface (from `src/types/calendar.types.ts`):

```ts
interface CalendarAdapter {
  id: string; // registry key
  name: string; // display name
  epochName: string; // e.g. "DR"
  defaultYear: number;
  months: CalendarMonth[]; // { num, name, alias?, days }
  intercalaryDays: IntercalaryDay[]; // { name, afterMonth, description, isLeapOnly? }
  weekSize: number; // 10 for tenday (Harptos), 7 for Gregorian
  dayLabels?: string[]; // column headers (Gregorian only)
  weekRowNames?: string[]; // row labels (e.g. "First Tenday")
  weekdayOffset?: (year, monthNum) => number; // Gregorian offset
  isLeapYear: (year) => boolean;
  formatDate: (year, month, day, festivalDay) => string;
}
```

### View Components

**`src/views/calendar/CalendarView.vue`**

- Uses `useCalendarStore()` for view state
- Toggles between `CalendarGrid` (month view) and `CalendarTimeline` (chronicle view)
- Manages `EventModal` state: `modalOpen`, `editingEvent: CalendarEvent | null`, `initialDay: number | null`
- "Setting Events" button shows when `calendar.activeCalendarId in SETTING_BUNDLES` (from `src/data/bundles/index.ts`)
- Renders `SettingBundleModal` for batch event import

**`src/components/calendar/CalendarGrid.vue`**

- Reads events via `useCalendarEvents(yearRef)` where `yearRef = toRef(calendar, "currentYear")`
- Grid columns: `grid-cols-7` for 7-day adapters; `grid-cols-5 md:grid-cols-10` for 10-day (Harptos)
- Emits: `"edit-event": [event: CalendarEvent]`, `"create-event": [day: number]`
- Linked-entity events use `linkedEntityType()` / `linkedEntityId()` helpers to build `RouterLink` targets (`/quests/:id`, `/encounters/:id`, `/locations/:id`)

**`src/components/calendar/CalendarTimeline.vue`**

- Uses `useCalendarEventsRange(startYear, endYear)` for the visible window
- Zoom presets drive `startYear`/`endYear` range
- Session events rendered in a dedicated strip; regular events use lane collision-avoidance
- Emits: `"edit-event": [event: CalendarEvent]`

**`src/components/calendar/EventModal.vue`**

- Full CRUD modal for calendar events (create + edit + delete)
- Props: `modelValue: boolean`, `editEvent?: CalendarEvent | null`, `initialDay?: number | null`
- Uses `useCreateCalendarEvent`, `useUpdateCalendarEvent`, `useDeleteCalendarEvent`
- Travel events: uses `EntityCombobox` with `useAllLocations()` for destination; party member checkboxes via `useParty()`; on submit, calls `useUpdatePartyMember` for each selected traveler to update `current_location_id`
- `description` field uses `RichTextEditor`
- 8 preset colours; auto-assigns colour by event type

**`src/components/calendar/InlineCalendarEventModal.vue`**

- Lightweight create-only modal; no edit or travel fields
- Opened from within `NoteEditor` via the calendar toolbar button
- Emits `"event-created": [event: CalendarEvent]` back to the editor
- Editor calls `rteRef.value?.insertCalendarEventRef({ eventId, label, year, month })`

**`src/components/calendar/EntityCalendarSection.vue`**

- Reusable component embedded in quest, encounter, and location detail views
- Props: `entityType: LinkedEntityType`, `entityId: string | null`, `entityName: string`, `compact?: boolean`
- Two display modes: full card (default) and compact inline row (`compact` prop)
- Uses `useEntityCalendarEvents(entityTypeRef, entityIdRef)` to fetch existing pins
- "Pin date" form creates a new event with the correct `linked_*_id` set
- Links route back to calendar via `/calendar?year=X&month=Y`
- Entity type → event type/colour defaults:
  - `quest` → `{ color: "#C9920A", eventType: "quest" }`
  - `encounter` → `{ color: "#7C3AED", eventType: "encounter" }`
  - `location` → `{ color: "#2E7D32", eventType: "location" }`

**`src/components/calendar/SettingBundleModal.vue`**

- Imports pre-authored events from `src/data/bundles/` (currently: `faerun.ts`, `eberron.ts`, `greyhawk.ts`, `dragonlance.ts`)
- Batch-inserts events with a live progress counter

### CalendarEventRef Tiptap Extension

The inline calendar event reference chip is a custom Tiptap node:

- Extension definition: `src/lib/tiptap/CalendarEventRef.ts`
- Vue node view renderer: `src/components/tiptap/CalendarEventRefChip.vue`
- Interface: `CalendarEventRefAttrs { eventId: string, label: string, year: number | null, month: number | null }`
- Inserted via `editor.commands.insertCalendarEventRef(attrs)` or `rteRef.value?.insertCalendarEventRef(attrs)`
- In **viewer mode**: fetches event data via `useCalendarEventById(eventId)`. On click, calls `calendarStore.goToMonth(year, month)` then `calendarStore.setHighlightedEvent(id)` and navigates to `/calendar`
- In **editor mode**: renders as static chip (non-navigable)
- Shows `[event removed]` state with strikethrough when event no longer exists

`RichTextEditor` exposes the calendar event toolbar button only when `allow-calendar-events` prop is set (currently only `NoteEditor` passes it).

---

## Visibility & Access Summary

| Surface                         | DM                                             | Player                                                                                                                  |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Notes list (`/notes`)           | Full CRUD                                      | No access                                                                                                               |
| Note detail (`/notes/:id`)      | Read + Edit + Delete                           | No access                                                                                                               |
| Player notes (`/play/notes`)    | N/A                                            | Read-only; filtered by RLS to `player_visible_to`                                                                       |
| Player journal                  | N/A                                            | Full CRUD on own entries; read shared entries from others                                                               |
| Calendar (`/calendar`)          | Full CRUD                                      | No access                                                                                                               |
| Entity calendar pins            | DM creates/deletes via `EntityCalendarSection` | No access                                                                                                               |
| CalendarEventRef chips in notes | DM inserts via editor                          | Chips visible in shared notes; click navigates DM to calendar (players have no `/calendar` route, chip click would 404) |

---

## Known Patterns and Gotchas

1. **Session note → calendar event circular FK**: Insert note first (no linked event), then insert event with `linked_note_id`, then patch `note.linked_calendar_event_id`. Never try to set both FKs in a single transaction. `syncSessionCalendarEvent` in `useNoteCalendarSync` handles this correctly, and its test pins the ordering.

2. **`player_visible_to` is the sole source of truth**: There is no longer a `shared_with_players` boolean. An empty array means DM-only. Populate with party member UUIDs (not user IDs). The RLS policy enforces this via `cm.party_member_id = any(notes.player_visible_to)`.

3. **Calendar events do not have player-facing RLS**: The `calendar_events` table RLS only allows `auth.uid() = user_id`. Players cannot read calendar events even indirectly. The `CalendarEventRefChip` in viewer mode queries `useCalendarEventById` — this works for DMs but will return null for players (chips show as `[event removed]` state).

4. **CalendarStore position is persisted to localStorage**: `POSITION_KEY = "grimoire_calendar_position"`. Changing the active calendar via `setCalendar()` also resets `currentYear` to `adapter.defaultYear`. The campaign store calls `loadFromCampaign(calendarId, year)` when the active campaign changes.

5. **`content` field is Tiptap JSON string**: Use `RichTextViewer` to display, `RichTextEditor` to edit. Never use `<textarea>`. For content previews, use `extractTiptapText(content)` from `src/lib/utils.ts`.

6. **Filter state in NotesList**: search, category and sort are all in `useUiStore` (#723). Before that fix the sort was in the store and the search/category next to it were local `ref`s — half the pattern applied, which is exactly how it survived. Do not reintroduce a local filter `ref` here.

7. **Notes quota**: `useQuota("notes")` checks the `check_quota` RPC. On quota exceeded, show `PaywallModal` with `resource="notes"`. Both `NotesView` and `NoteEditor` do this independently.

8. **Travel events update party member locations**: Submitting an `EventModal` with `event_type === "travel"` calls `useUpdatePartyMember` for every checked traveler, setting `current_location_id` to the selected location.

9. **Setting bundles vs. calendar adapters**: Setting bundles (`src/data/bundles/`) contain pre-authored event data for import. Calendar adapters (`src/settings/`) define the calendar structure (months, festivals, etc.). They are separate concerns — a setting can have a bundle without a calendar adapter and vice versa (though in practice they're paired).

10. **`allow-calendar-events` prop on RichTextEditor**: This prop controls whether the calendar event toolbar button is rendered. Currently only `NoteEditor` passes it. If you add the inline event button to another editor, pass this prop.
