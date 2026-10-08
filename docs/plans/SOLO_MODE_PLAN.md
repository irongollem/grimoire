# Solo Mode — an AI Dungeon Master over your own world

Sign in, pick a character, and play through your own campaign while an AI runs the
table: it narrates, voices your NPCs, stages your quest beats, and runs the fights.
Before you start, you choose how much it may invent beyond what you have authored.

Status: **scoped, not started** (8 Oct 2026). This document is the scoping record. It
says what exists, what is missing, and the order to build it in. Four foundations are
filed as their own issues because each is worth having without solo mode: #1016,
#1017, #1018 and #1019.

**The first step is through the MCP server (§4a), not a built-in AI.** The player's
own AI client (Claude, ChatGPT, …) is the Dungeon Master. Grimoire supplies the base
prompt and the systems underneath it: state, rules, dice, and the record of play. The
built-in solo table (§4) comes later, if it is still wanted.

---

## 1. Verdict

The world model is ready, and it is the hard part to have:

- beats, objectives, threads, consequences and clocks;
- location and door facts;
- character data with pure rules functions;
- player projections and `[secret]` blocks;
- embeddings, provenance and credits.

Three things are missing:

1. **An agent runtime.** Every AI call today is one non-streaming request: a system
   prompt and one user message in, JSON out (`src/ai/providers/types.ts:22-28`,
   `supabase/functions/_shared/textGen.ts:148-172`). There is no tool calling, no
   stored conversation, no streaming and no handling for long contexts. The Quest
   Designer is the only multi-turn flow, and it is stateless (`quest-designer-turn`):
   the client re-sends everything, with a 10-turn cap.
2. **A combat engine.** The encounter runner records what the DM decides. Monster
   actions are prose (`MonsterStatBlock`, `src/types/monster.types.ts:35-66`). Nothing
   compares a roll to AC, resistances are display text, and conditions have no
   duration. The turn state machine lives in a Pinia store
   (`src/stores/encounterRun.ts`). → #1017, #1018.
3. **An answer to "who is the DM?"** `campaign_members` is unique on
   (campaign, user), and the #847 lens fence evicts an account whose lens and role
   disagree. One account cannot be both DM and player.

## 2. The decisions that make it small

### The player owns the campaign

In solo mode it is their world and their secrets. The AI acts under **their own DM
credentials**, through the same RPCs and RLS a human DM uses. That removes:

- a service-role "AI DM" identity;
- co-DM (#590);
- a player-projection rewrite of every AI read.

Spoiler-safety becomes a presentation choice, not a security boundary. The AI reads
everything, including `[secret]` blocks. The player's screen shows what the player
projections (`get_player_visible_*`) would show, and the AI is told what is secret so
it narrates around it.

### A third surface, not a third role

The **solo table** is a new route under the DM lens. It composes the player-portal
pieces that already exist:

- sheet, rolls, spells and rests;
- journal and the read-aloud blockquote;
- room audio;
- the encounter view.

Around them sits a narration stream and an input box. No membership changes, and no
change to the lens fence.

### The model narrates and chooses; code adjudicates

The AI never does arithmetic and never rolls dice:

1. Code builds the list of legal options. ("Goblin 2: Scimitar → Aria,
   Shortbow → Aria, Disengage." "Aria asks to pick the lock: Thieves' Tools,
   DC from the door's `lock_note`.")
2. The model picks one and writes the prose.
3. Code rolls, through the existing `rollDice` / prompted-roll flow, so a player may
   still roll physical dice.
4. Code resolves through `src/rules/` and writes state through the existing RPCs.

This keeps play fair, cheap and testable, and every piece of it also serves a human
DM.

### Children stay out

Child accounts are refused AI at every gate (`_shared/accountGate.ts`, the MCP
server, `useChildAccount()`). Solo mode inherits that refusal. Reversing it would be a
policy decision with its own parental-consent design, not a side effect of this work.

## 3. The creativity dial

This is a per-campaign setting, chosen before play and changeable between sessions.

| Setting | The AI may | Writes |
| --- | --- | --- |
| **Canon** | Use only authored NPCs, places, monsters and items. It may describe, but may not name new things. | State only (facts, quest runtime, HP, position) |
| **Embellish** | Add unnamed colour: a barkeep, a side passage, a stray wolf from a monster you own | State, plus ephemeral flavour kept in the transcript only |
| **Invent** | Create named NPCs, places, encounters and loot that fit the world | New rows with `ai_provenance`, landing in a **review inbox** |

The review inbox is a missing system in its own right (§6). "Invent" without one
would quietly fill a DM's campaign with rows nobody approved.

Encounters follow the same dial. Canon uses only the campaign's monsters and
encounters; the other two settings may draw on the library, or build from
`generate-encounter`.

## 4. Architecture

```
solo table (Vue)
  │  player message / roll result
  ▼
solo-dm-turn  (edge function, SSE stream)
  ├─ loads: world snapshot RPC + transcript window + rolling summary
  ├─ tool loop (provider tool calling):
  │    read   → registry.ts handlers (from the MCP server), player projections,
  │             quest runtime context, embeddings retrieval
  │    act    → transition_quest_runtime, assert_quest_objective_status,
  │             tick_quest_clock, location_state_events, party position / date,
  │             reveal + share, combat commands (#1017 reducer)
  │    ask    → request_roll(skill|save|attack, dc) → back to the player
  ├─ meters: credits per turn from token usage; one ledger row per call (§6a)
  └─ writes: solo_turns (transcript), npc_memories (#1019), ai_provenance
```

### Pieces to build

- **Provider tool calling and streaming** in `_shared/textGen.ts`. Anthropic first:
  prompt caching matters for a long system prompt plus snapshot. The MCP
  `registry.ts` / `tools.ts` handlers are the tool definitions, reused in-process.
- **`solo_turns`**: the transcript, one row per message. Role, content, tool calls,
  tool results, token usage, `session_id`. A rolling summary is stored per session,
  and the Chronicler can recap from it.
- **World snapshot RPC**: one call that returns
  - party location and date;
  - live threads and current beats, with outgoing edges and gate state;
  - the objective ledger, clocks, and held and pending consequences;
  - site state for the current site;
  - the party's HP and conditions.

  `get_quest_runtime_context` and `get_campaign_live_quests` cover the quest part.
- **Server-side consequence runner**: #1016. An agent writing the date from an edge
  function has no DM shell watching it.
- **Combat**: #1017 (structured actions, resolver, turn reducer) and #1018
  (condition durations). Range is near/far bands first, the theatre of the mind; grid
  tactics come later.

## 4a. The first step: solo play through the MCP server

`supabase/functions/mcp` already exists. It is an OAuth 2.1 resource server that runs
every call under the user's own RLS scope. It offers `campaign_overview`,
`search`/`get`/`list`, `create`/`update`, `soundboard` and `voice_coach`. Pointing a
player's own AI client at it, with the right tools and a base prompt, gives solo play
without most of §4.

**What this removes from our side:**

- **The agent runtime.** No tool calling or streaming in `textGen.ts`, no
  `solo-dm-turn`, and no context-window management. The client does all of that.
- **The transcript store and its retention questions.** The conversation lives in
  the user's client.
- **Moderation of free player text.** It never reaches a model we operate.
- **Metering.** The user's own subscription pays for the conversation, so play costs
  no Grimoire credits. `voice_coach` stays the one credit-costing tool.
- **Most of the AI Act surface.** `ai-act.md` §3 already places this server outside
  Art 50 because it calls no model. **One thing to check:** if we ship the DM base
  prompt, is that still true? §2 holds that a Grimoire prompt keeps a Grimoire AI
  system Grimoire's. The register needs a line on this before the prompt ships,
  rather than an assumption either way.
- **Child accounts.** The MCP server already refuses them (`mcp/index.ts:152-166`).

**What it still needs from us.** This is the real work, and every piece also serves
the built-in path later:

1. **A base prompt, served as an MCP prompt.** The server advertises only `tools`
   today (`mcp/index.ts:83`). Add the `prompts` capability with a `solo_dm` prompt
   that takes the campaign, the character and the creativity dial as arguments. It
   carries:
   - the DM stance;
   - the dial's rules (§3);
   - "never roll, always call `roll`";
   - "secrets in `[secret]` blocks are for you; narrate around them";
   - the resume ritual: start from `solo_resume`, end with `record_session`.
2. **Game-state tools.** These are thin wrappers over RPCs that already exist:
   - `world_snapshot`: the snapshot RPC from §4;
   - `quest_advance` / `quest_assert` / `quest_clock`: `transition_quest_runtime`,
     `assert_quest_objective_status`, `tick_quest_clock`;
   - `place_fact`: `location_state_events`;
   - `move_party` / `advance_date`, which need #1016 so that consequences fire;
   - `reveal`: share an NPC, place or handout with the party.
3. **`roll`, the fairness tool.** The server rolls, and the result is posted to
   `campaign_messages` as a roll. The model cannot invent a number, and every roll is
   visible in the app's log. We can't force a client to call it, but the log shows it
   when one doesn't.
4. **Continuity.** Each conversation starts empty, so memory has to live in Grimoire:
   - `solo_resume` returns the snapshot, the last session's recap and recent NPC
     memories (#1019).
   - `record_session` writes the recap as the session note, which the Chronicler can
     already work from.

   This makes #1019 a phase-1 dependency rather than a nicety.
5. **Combat tools**, once #1017 and #1018 land: `combat_start`, `combat_options`
   (the legal-action list), `combat_act` (resolve through the reducer) and
   `combat_state`. Until then the model runs fights in the theatre of the mind, using
   `roll`.

**Grimoire as the second screen.** While the player talks to their AI, the app can
stay open beside it. Every tool write lands in the same tables live sync already
carries, so the map, sheet, HP, quest log and room audio update as the AI acts. The
player's lens is still the DM's (§2), so the right view is the DM preview of their
own character, which already renders the player projections.

**What it costs in exchange:**

- We don't control the experience. Prompt adherence varies by client and model.
- The app has no chat pane of its own; the conversation stays in the client.
- Setup is "connect an MCP server", which only a technical player will do.

Those three points are what would justify building §4 later. The MCP route answers
first whether anyone wants to play this way.

## 5. Phases

| Phase | Scope | Size | Value to human DMs |
| --- | --- | --- | --- |
| **0. Foundations** | #1016 consequence runner · #1017 structured actions + resolver + turn reducer · #1018 condition durations · #1019 NPC memory | L–XL | High: each one stands alone |
| **1. Solo through MCP** (§4a) | `prompts` capability + `solo_dm` · snapshot RPC + `world_snapshot` / `solo_resume` / `record_session` · quest, place, party and reveal tools · server `roll` · creativity dial at **Canon**. Needs #1016 and #1019; combat tools follow #1017 and #1018 | M | Every tool also lets a human DM run their table from their own AI |
| **1b. Built-in solo table** (§4) | Only if phase 1 shows demand. Tool calling + streaming · `solo_turns` + summary · `solo-dm-turn` · solo table UI · moderation · metering | L | Transcript for the Chronicler |
| **2. AI-run combat** | Monster turns: legal actions from #1017, model picks, reducer executes; player turns through the existing combat tab | M | "Autopilot this minion" in crowded fights |
| **3. Invention and depth** | **Embellish** / **Invent** with a review inbox · route graph · region encounter tables · faction clocks · grid tactics | M–L | Review inbox, route graph, encounter tables |

Order follows CLAUDE.md rule 4, the system before its neighbours: phase 0 is the
system, and solo mode hangs off it.

## 6. Missing systems, solo mode or not

Found by this scoping; useful at every table:

1. **Delayed consequences fire only from a DM's open shell.** → #1016
2. **Monster actions are prose; there is no resolver.** → #1017
3. **Conditions have no duration.** → #1018
4. **NPCs remember nothing.** → #1019
5. **NPC motives, secrets and knowledge are buried in prose.** The Voice Coach and
   every generator would ground better on fields.
6. **There is no route graph between places.** `related_location_ids` is untyped, and
   measured routes are never saved. Sites have a door graph; the overworld has none.
7. **Random-encounter tables cannot be bound to a region or terrain.** Roll tables
   have free-text tags only.
8. **Factions have no agenda or clock.** Quest clocks exist; nothing moves off-screen.
9. **Time of day, and a history of where and when.** The calendar is day-granular,
   and moving the party or the date is a bare UPDATE.
10. **There is no review inbox for AI-made content.** Generators save straight to
    live rows.
11. **There is no general flag store.** "The bridge is burned" has no home outside
    location facts and objectives.

## 7. Compliance and cost

This section applies to the built-in path (phase 1b). The MCP path (§4a) avoids most
of it, apart from the open question on the base prompt.

- **AI Act Art 50(1).** A conversational AI talking to a player is not "obvious from
  context" the way a Generate button is. It needs a persistent disclosure on the solo
  table and an update to `context/compliance/ai-act.md` §5.
- **Text moderation.** Free player text goes to a model. Image prompts are screened
  today; text is not.
- **Transcripts are new personal data.** They need a retention period, inclusion in
  `export-my-data`, deletion with the account, and a privacy-policy line.
- **Metering.** Credits are charged per call today; the Quest Designer charges 1
  credit an exchange. A play session runs to hundreds of tool-loop calls, so solo mode
  needs token-based metering, or a per-session budget the player sees, from the
  ledger's existing token columns. BYOK (Pro) is the natural first audience.

## 8. Open questions

- **A starter world.** The Sugarwell demo copies with a DM membership, which is what
  solo mode wants. Is it rich enough to play through, or does solo mode want its own
  template?
- **Physical dice.** Does the player roll physical dice by default, or auto-roll?
  Both paths exist in `usePromptedRoll`.
- **Death and failure.** The AI DM needs a stance: hard 5e death, or a softer setting
  on the dial.
- **Inviting a friend.** Can a solo campaign later take a second human player? That
  is the point where §2's "the player owns the campaign" stops holding, and it is
  where the player-projection work would come back.
