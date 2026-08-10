# Quest Run mode

Run mode is a campaign runtime cockpit anchored to the quest URL that opened
it. The active beat may belong to that quest, a child quest, or another quest
in the campaign; this is deliberate and does not rewrite authored graphs.

The current beat is one atomic `QuestRunBeatCard`. It presents read-aloud copy,
DM guidance, outcomes, attachment readiness, specialist links, and prepared
loot. Missing prep is a warning, never a gate. Supporting editors receive a
local `returnTo` URL containing `mode=run` and the current beat.

All movement uses `useQuestRuntimeCommand` and the version loaded with the
runtime context. The sticky controls expose previous, authored branches, jump,
pause/resume, and end at desktop and narrow widths. Jump results rank recent
visits first and label the current quest, related quest line, and wider campaign
results. The path panel renders immutable transition snapshots, so repeated
beats and cross-quest detours remain understandable.

On refresh or browser history navigation, the persisted server cursor wins and
the URL is canonicalized to that beat while preserving other query state. Run
hotkeys are registered through the shared registry and disabled while typing,
while a transition is pending, while paused, or while the jump picker is open:

- `Alt+Left`: previous visited beat
- `Alt+Right`: advance when exactly one authored choice exists
- `J`: open jump search
