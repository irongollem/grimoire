# Fixes — Chat & Dice

Resolved bugs in the **Chat & Dice** area, newest first. Part of the Grimoire fix log — see the [log index](../index.md).

- [x] Chat message deletes not propagated in real-time — realtime subscription only registered `INSERT` and `UPDATE` handlers; `DELETE` events were ignored so other clients only saw deletions after a manual refresh; fixed by adding a `DELETE` postgres_changes handler that filters the message out of the local array (`src/composables/useCampaignMessages.ts`)

- [x] In player view, rolling shows a popup of my value nicely but doesnt add it to the chat, or at least not directly and I had to refresh. I feel the chat is very finnecky and the live data thing doesnt work that well

- [x] as a playerview, the bottom of the chat (with the actual input elements) is either not rendered, or rendered offscreen below the visible area (100vh instead of 100% perhaps?)

- [x] whispers not arriving, only after refresh — realtime WebSocket reconnect on visibilitychange + networkMode:'always'

- [x] all chat only appearing after refresh at players — same realtime fix

- [x] players that claimed a character still show their name instead of the char name when chatting etc. — useCampaignMessages now uses linked party member's character name as sender_name when available

- [x] in the whisper I only see "player" so I have no idea who's who — display_name is now populated from email at DB level; whisper dropdown shows display_name

- [x] DM should be able to delete ALL messages in the chat, not just their own; and delete all at once — DM delete button shown on all messages; trash icon in header clears entire chat; DB RLS updated to allow DM deletes

- [x] de chat moet niet hover zijn van 100vh - eventuele balken in scrollen van binnen — PlayerLayout uses h-dvh + min-h-0; chat aside uses min-h-0 instead of h-full sticky

- [x] Campaign chat header showed a DM-only "Open DM Manual entry" info icon (ⓘ) to players — the chat panel is shared between DM and player views, but its `ManualHelpLink page="campaign-chat"` (which deep-links into the DM Manual) rendered unconditionally. Players saw a permanent info icon whose tooltip read "Open DM Manual entry", pointing at DM-facing docs. Gated the link on `auth.isDM` (already in scope in the same header, used for the clear-all button) so only the DM sees it. (`src/components/chat/ChatPanelContent.vue`)
