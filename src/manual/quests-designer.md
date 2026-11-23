---
title: Quest Designer (AI)
section: Quests
section_order: 3
order: 3
summary: "Design it: a back-and-forth conversation with the AI that proposes a whole beat tree from your description, asking back where a fork is genuinely ambiguous."
keywords: quest designer, design it, ai, conversation, beat tree, propose, exchange, credits, questions
---

**Design it** is a conversational way to build a quest's whole story flow up front, instead of typing beats one at a time. You describe the quest in your own words; the model proposes a beat tree and, where your description leaves a fork genuinely ambiguous, asks back rather than guessing. Find it on the **New Quest** page (**Campaign → Quests → New Quest**), as the third option on the segmented control alongside **Type it** and **Paste a page**. It only appears when AI is switched on for the campaign; it works the same on every plan, billed to credits.

## Key ideas

| Term | What it means |
| --- | --- |
| Turn | One exchange: your prose or answers, sent, the model's proposed tree comes back. Each turn is priced separately. |
| Question | A specific fork the model isn't sure how to resolve from your description: it offers two to four options plus free text. |
| Tree | The model's current proposal: beats, routes, and objectives, shown live on the right as you go. |

## Designing a quest

1. Under **Describe the quest**, write what the quest is, the stages you see, and where it might fork, in your own words, up to 4,000 characters. Click **Propose a tree**; the badge above the button shows the credit cost before you commit.
2. The model returns a first tree, shown on the right as a preview, and, if anything was genuinely ambiguous, one or more **questions**, each naming what it's about, why it's asking, and two to four options (plus a free-text option as an escape hatch). Pick an answer for each.
3. Add anything else worth telling it in **Anything else to tell it? (optional)**, then click **Send answers**. The model revises the tree in place (the preview badges each beat **new** or **changed** and lists what was removed) and returns any remaining questions. An empty question list means the tree is settled.
4. Repeat until you're happy, or until you hit the ten-exchange budget for this sitting (shown as **Exchange N of 10**, with a running credit total alongside it).
5. Click **Create quest** to land the current tree as a real quest: its beats, routes, and objectives are created exactly as previewed. You don't have to wait for every question to be answered first: you can create now and finish the rest in Story Flow.

**Edit** (next to your original prose, once a turn has happened) lets you revise your description and start over from a fresh proposal. **Start over** clears the whole conversation.

## What the tree is made of

The tree is a spine, the same shape you would build by hand in Story Flow:

- **Beats**: the scenes, in story order, each with a title and a kind. The first is the quest's opening beat.
- **Routes**: the connections between beats. A fork where the party chooses is a set of **choice** routes. Something that happens next to the main story is an **and also** route.
- **Objectives**: what the party is trying to achieve, each tied to the beat that raises it. One raised by the opening beat starts out live. One raised only by a later beat waits, because the party has not been sent down that branch yet.

Each beat also arrives with a short rumor line and a reveal line, the two things players are shown about it once you share it. They hold no DM-only secrets, and every beat still starts hidden: writing what players would see is not showing it to them. Sharing stays your call, beat by beat.

If the model's answer leaves out a piece, for example a route pointing at a beat that is not there, that piece is dropped and the rest of the quest still lands. Nothing is invented to fill a hole.

## After you click Create quest

The quest opens in Story Flow with every beat and route on the canvas. From there:

1. Click a beat to open it in the drawer on the right. It shows where it is staged, the read-aloud, the description and **Where it can go**, the routes out of it.
2. Use **Edit text** to change a beat's words. It saves itself as you type.
3. Click a route to rename it, give it a cost, or change it between **Choice** and **And also**.

The designer writes the spine and the rumor and reveal lines. The read-aloud text and the longer DM lead of each beat are yours to write, by hand or with **Fill with AI** below.

## Filling one beat with AI

You do not have to use the designer to get help with a single scene. At the top of a beat's text form (click **Edit text** in the drawer) is **Fill with AI**. It is there only when AI is switched on for the campaign.

1. Optionally type a steer, such as "a tense negotiation" or "a trap in the cellar", in the box. The box is optional; leave it empty and the model works from the quest alone.
2. Check the credit cost shown below the box, then click **Fill**.
3. The model proposes a **title**, **read-aloud** text and a **DM lead** for the beat, and they appear in the beat's own fields. Edit anything you like. It saves like any other edit.

The model reads the quest's title and summary, the beat's kind and current title and notes, where the beat is staged, the beats that come before and after it, and the objectives still open, so the new text carries on the flow instead of repeating it.

If the beat already has read-aloud or lead text, Grimoire first asks **Replace the existing text?** Decline and nothing is spent. A beat filled by AI carries the AI label until you change its words.

## What your players see

Nothing: this is a prep-time tool. Nothing about a quest is visible to players until one of its beats is rumored or revealed, exactly as for any other quest.

## Tips

> Each exchange is priced separately and shown to you before you send it: answering eight questions is eight small charges, not one surprise total at the end.

- The conversation isn't saved as you go: closing the page loses your progress. Create the quest (even with open questions left) if you want to keep what's already been proposed.
- This only creates a new quest. Revising an existing quest's tree in conversation isn't built yet: use Story Flow directly for that.

## Related

- [Quest Log](#quest-log)
- [Quest Story Flow: Beats, Routes & Objectives](#quest-story-flow-beats-routes-objectives)
- [AI Generation & Credits](#ai-generation-credits)
