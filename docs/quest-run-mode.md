# Quest Run mode

Run mode is the cockpit for **one chain**, anchored to the quest URL that opened
it. The active beat always belongs to that quest.

It did not always. The cockpit was mounted per-quest from its route but read a
single campaign-wide cursor, so opening Run on quest A while the cursor sat in
quest B rendered B's beat, branches, attachments and loot under A's URL — and an
earlier version of this document described that as deliberate. It was bug 4 of
[#755](https://github.com/irongollem/grimoire/issues/755). Cursors are now per
quest and the anchor and the cursor are the same quest by construction.

Other chains the party has open are listed in the **Also open** rail, from
`get_campaign_live_quests`. Switching to one is plain navigation: no cursor
moves and nothing is recorded, which is what distinguishes it from Jump.

The current beat is one atomic `QuestRunBeatCard`. It presents read-aloud copy,
DM guidance, outcomes, attachment readiness, specialist links, and prepared
loot. Missing prep is a warning, never a gate. Supporting editors receive a
local `returnTo` URL containing `mode=run` and the current beat.

All movement uses `useQuestRuntimeCommand` and the version loaded with the
runtime context; both are scoped to this quest. The sticky controls expose
previous, authored branches, jump, pause/resume, and end at desktop and narrow
widths. **End** closes this chain only — other open chains keep their place.

Jump moves this chain's cursor, so its picker offers only this quest's beats and
ranks recent visits first. It carries no current/side/campaign grouping: that
existed because the picker once spanned the campaign, and with it went the
sub-quest sort hint. The path panel renders immutable transition snapshots, so
repeated beats remain understandable, as do the cross-quest detours recorded
before cursors were per quest.

Branch cards combine authored beat data, attachment readiness, and visit
history. A normal choice never changes player visibility. Hidden or rumored
destinations instead have a separate adjacent reveal action with explicit
audience wording. Large branch sets get a local filter, while cycles remain in
the list and are marked visited. At a dead end the same control surface offers
Jump, Improvise, Pause, and End; the quick improv panel creates a hidden
`is_improvised` beat and only enters it after creation succeeds.

On refresh or browser history navigation, this quest's persisted server cursor
wins and the URL is canonicalized to that beat while preserving other query
state. Run
hotkeys are registered through the shared registry and disabled while typing,
while a transition is pending, while paused, or while the jump picker is open:

- `Alt+Left`: previous visited beat
- `Alt+Right`: advance when exactly one authored choice exists
- `J`: open jump search
