# Features — Chat & Dice

Shipped features in the **Chat & Dice** area, newest first. Part of the Grimoire feature log — see the [log index](../index.md).

- [x] **Custom polyhedral-dice icons** — bespoke glyphs for d2/d4/d6/d8/d10/d12/d20/d100 (`IconDie*`), feeding the `DiceRoller` grid in place of its unicode-character placeholders; the generic `IconDice`/`IconDiceRoll` now point at the iconic d20 (dropping Lucide Dice6/Dices). d8 + d100 traced from the cleaner alternative sheet (`art-src/dice/image.png`), the rest from `source-sheet.png`. Generated markup in `src/lib/diceGlyphs.generated.ts`

- [x] **Realtime fix**: Added `REPLICA IDENTITY FULL` to `campaign_messages` — silently-dropped Realtime events with RLS now deliver correctly

- [x] **Vendor offer chat message** — DM posts price propositions from chat toolbar (ShoppingBag button) or directly from store/inn/tavern location wares (ShoppingBag per item, pre-fills price from override/item.cost via parser); players see PAY button; auto-converts wallet across denominations (PP→GP→SP→CP greedy, EP preserved); item added to inventory if specified; insufficient funds shown inline

- [x] **Player-to-player item trading** — players list inventory items for sale from the item detail panel (price in any coin mix) or via the ShoppingBag shortcut on each inventory row; posted as `player_offer` chat message; other players see BUY button (affordability-checked); DM sees "Accept (DM)" to take the item for free from seller; on purchase: seller's wallet credited, buyer's wallet debited, item `carried_by` transferred; DM buy removes item outright

- [x] **DM "Talk As" NPC persona** — persistent "As:" combobox above the whisper selector in chat (DM only); when set, all messages, vendor offers, vendor claims, and trade purchases are sent under the NPC's name; chat bubbles reflect the NPC name rather than the DM account; clearing the selection reverts to normal DM identity

- [x] **Chat item drop details** (irongollem/grimoire#25) — item drop cards in campaign chat now show a collapsible Show Details button for vault-linked items; expands inline to show type, subtype, rarity, weight/cost, attunement, weapon damage/range/properties, charges, and full description via RichTextViewer — no navigation away from chat required

- [x] **Chat tab: draggable vertical position** (irongollem/grimoire#78) — chat tab button is now draggable up/down the right edge; position saved in localStorage (`grimoire:chat-tab-top`); click still opens chat when not dragged (delta < 6px); grab cursor on hover

- [x] **Dice roll feedback: animation + sound** (irongollem/grimoire#128) — synthesized Web Audio dice sounds (no audio files) with distinct crit/fumble effects; `DiceResult.vue` scramble animation (400–500ms cycling numbers that snap to result); crit/fumble CSS flash; toggle in Player Settings → Combat Notifications; wired into DiceRoller, encounter runner, party initiative, chat dice, combat/skill/death-save/hit-die rolls
