---
title: The Interlude — Downtime
section: The Interlude
section_order: 13
order: 0
summary: What the downtime deck is, how a draw flows from grant to resolution, and why it is built this way.
keywords: interlude, downtime, draw, credit, carouse, craft, deck, card back, prepped, vignette, outcome, grant, resolve
---

The Interlude is Grimoire's **downtime system**. It turns the quiet weeks between sessions into something a player actually opens the app to do — and it makes the results **real campaign content** rather than a line in a chat log. Find it in the sidebar under **Campaign → Interlude** (route `/downtime`); players reach the same system from the **Interlude** tab of their portal.

It's a campaign-toggleable optional rule (like Crafting), on by default. If you don't see it, switch it on in **Campaign Settings → Rules → The Interlude** — turning it off hides it from your sidebar and from every player's portal.

The whole system is one loop:

> **You grant a draw → the player spends it on an activity card → the draw lands `pending` → you resolve it on one board → the outcome becomes a real, linked, editable entity in your campaign.**

## Key ideas

| Term | Meaning |
| --- | --- |
| **Draw / credit** | One unit of downtime. One credit lets a player spend one draw. Balances are per **character**, not per user, and derived (`granted − spent, excluding cancelled`) — never stored, so they can't drift. |
| **Activity card** | One of eight archetypes a player can spend a draw on: Carouse, Craft & Enchant, Research & Scribe, Train, Run a Business, Pit Fighting, Lie Low, Pull a Job. |
| **Pending draw** | A spent draw waiting for you to resolve it. Appears on your Interlude board. |
| **Vignette** | The short beat of fiction you write (or draft) when resolving a draw — its title and text. |
| **Outcome** | What a resolved draw produces: a vignette plus a real, linked entity (an NPC, item, or note). |
| **Prepped back** | A specific NPC/item/note you've slotted onto an archetype ahead of time, so the deck deals it instead of a random seed. |

## How it works

### 1. Grant downtime

Downtime is **a gift you give, not a meter that fills** — there is deliberately no automatic tie to long rests or the calendar. When the story says there's a lull, click **Grant downtime** (on the Interlude board or on a row in the Party Tracker) and hand out credits to one character or the whole party, with an optional reason.

**One credit = one draw.**

### 2. The player spends a draw

In the player portal's **Interlude** tab, the player sees their draw balance and a hand of activity cards. Choosing a card spends the credit and files a `pending` draw — nothing is decided yet.

### 3. You resolve it

Every pending draw across the whole party appears on your **Interlude board**. Each shows what the deck dealt, a title and vignette you can rewrite freely, and a checklist of proposed consequences.

- **Draft** — optional AI assist that writes the vignette and proposed consequences for you (1 credit), grounded against your campaign's real NPCs, locations, and shops when it can find a match. It replaces what the deck dealt but travels the same resolve path — you can still edit everything before confirming.
- **Resolve** — creates the outcome and the linked entity.
- **Cancel draw (refunds the credit)** — voids the draw and returns the credit to the character.

### 4. Consequences are proposed, never imposed

An outcome *proposes*; you dispose. Nothing touches a character sheet until you tick the box.

- **Coin, HP, and conditions** are applied automatically once ticked. Coin never goes below zero, HP is clamped between 0 and the character's maximum, and a condition is never added twice.
- **Items** are the one exception: an item consequence is a note to *you* to hand something over at the table. The app won't reach into a player's inventory.

## Stacking the deck

The back of every card can be **prepped**. In **Stack the deck** on the Interlude board, you slot a real NPC, item, or note onto a specific archetype:

> _"The next underworld contact any rogue meets is **Vesh**, the crime boss I've been planning."_

**Prepped backs are dealt first, in order. When the pile runs dry, the deck falls back to a random system seed.**

A prepped back can be **one-shot** (Vesh appears once, then is consumed) or **recurring** (never consumed). This is what lets the same deck serve two very different DMs: one who plots six sessions ahead, and one who preps nothing and still gets genuine, keepable content out of every draw.

## What your players see

Players never see your board, prepped backs, or the credit-granting UI. In their **Interlude** tab (bottom nav, hidden along with yours if the rule is off) they see only:

- Their current draw balance for their active character.
- The hand of activity cards they can spend a draw on.
- A history of their own resolved outcomes — the vignette and, once you've ticked "share", the linked entity.

A spent draw turns the card face-down immediately (a real 3D flip, not an instant swap), gets a confirming toast, and moves into a "pending — with your DM" list above the deck — so a tap never looks like it did nothing.

## Tips

- **Cancelling refunds; resolving does not.** A cancelled draw returns the credit to the character.
- **Unspent credits are a prompt.** The board shows who is sitting on draws they haven't used.
- **Everything is editable.** A seeded NPC is an ordinary NPC the moment it's created — nothing marks it as generated.
- **Seeded content is private by default.** A new contact or note is hidden from players until you choose to share it.
- **Item consequences never auto-add to inventory.** Minting an item catalog row is not the same as giving it to a character — hand it over yourself, or drop it via the [Item Vault](#vault-overview).
- Outcomes can be printed as cards: Card Forge's **NPCs**/**Monsters**/**Items**/**Spells**/**Interlude** source tabs include an **Interlude** source specifically for downtime activity cards and their prepped backs, with a shared deck back you choose. See [Card Forge — Card Printer](#card-forge-card-printer).

## Related

- [Party Tracker](#party-tracker) — where **Grant downtime** also lives, alongside the rest of your party's live state.
- [Card Forge — Card Printer](#card-forge-card-printer) — print the deck, including Interlude cards.
- [Campaign Settings](#campaign-settings) — switch The Interlude and other optional rules on or off.
