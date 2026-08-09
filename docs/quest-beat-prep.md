# Quest beat preparation workspace

The story-flow canvas, compact inspector, and full beat page are projections of the same `quest_beats` row. They do not maintain separate inspector/page documents.

## Editing

- Selecting a graph node opens `QuestBeatInspector` without navigating or replacing the saved canvas viewport.
- `QuestBeatFields` powers both the inspector and `/quests/:questId/beats/:beatId`. Short fields and the DM lead fit in the inspector; long Tiptap sections live on the full page.
- Autosave includes the row's expected `updated_at`. A concurrent edit returns a conflict instead of silently overwriting newer prep; reloading the saved beat is explicit.
- `kind` is a presentation and suggestion hint. All narrative fields and attachments remain present when it changes.

## Contained prep

Attachments point to authoritative encounters, objectives, locations, NPCs, factions, audio, notes, and handouts. The inspector can link them, quick-create an encounter, remove held placements, and open the specialist editor. Specialist links carry a validated local `returnTo` URL; the application shell displays a return action while that query is present.

Loot uses the separate beat-loot orchestration described in [quest-beat-loot.md](./quest-beat-loot.md). The inspector never implements inventory delivery itself.

## Responsive behavior

At narrow widths the Vue Flow canvas remains hidden and the accessible beat outline is the navigation surface. Opening an outline row routes to the full beat page. The return URL carries the selected beat, while the canvas viewport remains in its existing per-quest local storage entry.
