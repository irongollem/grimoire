# Features — Quests

Shipped features in the **Quests** area, newest first. Part of the Grimoire feature log — see the [log index](../index.md).

- [x] Quests — full CRUD with kanban + list view, objectives checklist, sub-quests

- [x] Quest giver/location linking with item & encounter reward references

- [x] Player quest visibility (DM shares individual quests to player portal; per-player visibility via `PlayerVisibilityToggle`)

- [x] Player quest notes table with private/shared toggles per entry

- [x] Quest consequences (triggers) — DM configures time-delayed consequences on quest/objective completion; fires when DM advances in-game "today" date. Tables: `quest_triggers` + `quest_trigger_scheduled`. Today date tracked on `campaigns` (`current_month`, `current_day`), shown in calendar header (DM) and player portal top bar; date change broadcasts to chat.

- [x] **Quest improvements**: Currency reward fields (PP/GP/EP/SP/CP) on quests with drop-to-chat; per-ref player visibility toggle (Eye/EyeOff); removed broken Gregorian date inputs

- [x] **QuestDetailView — view/edit split** (irongollem/grimoire#168) — DM quest detail now renders a read-only sheet by default (status chip + giver / location / parent-quest chips + summary + Tiptap description + DM notes + interactive objectives + reward coin summary + reward item cards + linked encounters / NPCs / locations / monsters / sub-quests via `quest_refs`) with **Edit** flipping into `QuestEditor` via `?edit=true`. Editor gains a **Cancel** button that strips the flag (preserves `?parent=` etc.). Objectives stay interactive in view mode (check/uncheck + player-visibility toggle) since those are running-state during play; create / rename / re-order stays in the editor.
