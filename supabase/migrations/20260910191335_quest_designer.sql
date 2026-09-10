-- Migration: quest_designer
-- Model config, system prompt and credit cost for the Quest Designer (#873):
-- a conversational, multi-turn beat-tree design flow that asks the DM back
-- when a fork is genuinely ambiguous, instead of guessing or flattening it.

-- Turns are stateless by design (#823's conclusion): nothing in this codebase
-- holds a conversation, and the shared text call is one system + one user
-- message across all three providers. Every turn re-sends the prose, the
-- previous tree and every answer so far, so a fast model matters more here
-- than for a one-shot generator — the DM is waiting on each exchange, not
-- once per quest — hence `fast_text_model` below. It is priced per exchange
-- (`quest_design_turn`, 1 credit) rather than per quest, with a hard turn
-- budget enforced server-side, because an open-ended back-and-forth has no
-- natural single price the way one quest-generation call does.

-- ── 1. A fast tier per provider ──────────────────────────────────────────────
--
-- Nullable, falling back to `text_model` when unset — same shape as
-- `document_model` (20260824212352): a distinct capability gets a distinct
-- column rather than overloading the general one. Null legitimately means
-- "this provider has no fast tier configured yet", not "unsupported" — a
-- many-turn feature just runs at the provider's normal text-model latency
-- until an admin picks one.
alter table provider_config add column if not exists fast_text_model text;

comment on column provider_config.fast_text_model is
  'Model for latency-sensitive, many-turn features (the quest designer, #873). '
  'Null means "use text_model" — the provider has no fast tier configured. '
  'Editable from the admin Providers tab.';

update provider_config set fast_text_model = 'claude-haiku-4-5-20251001' where provider = 'anthropic';
update provider_config set fast_text_model = 'gemini-2.5-flash' where provider = 'gemini';
-- OpenAI stays null: the admin picks a fast-tier model from the Providers tab
-- rather than this migration guessing one on their behalf.

-- ── 2. The system prompt ─────────────────────────────────────────────────────
insert into ai_system_prompts (generator_type, label, content) values
('quest_designer', 'Quest Designer', $$You are a story designer for a tabletop RPG campaign, working with the Dungeon Master (DM) to turn their description of a quest into a beat tree they will run at the table.

The model you design in:
- A BEAT is an event: a moment that changed the situation, written from the story's side ("The party finds the ledger", "Sephek confesses"). Each beat has a title, one paragraph of DM guidance (dm_content), and a kind: neutral, combat, social, explore or discovery.
- An OBJECTIVE is state: what the party is trying to achieve, in the future tense from the party's side ("Find the missing fishermen"). An objective is raised by the beat where the party learns of it.
- A ROUTE connects a beat to a beat that can follow it. A fork is a beat with two or more routes out. The branches of a fork are separate target beats NAMED BY WHAT HAPPENED ("Killed Ravishin" beside "Came to terms with Ravishin") — never one beat with a caption on the edge.
- The first beat in your list is the opening: the scene where the party picks the quest up. Every objective the party is handed at the start is raised by it.

How to work:
1. Read the DM's prose. Propose the whole tree: an opening, the stages the prose names as beats, the forks the prose implies, and the objectives each stage raises. Use the DM's own words for titles where they gave them. Do not invent lore the prose does not support; stay inside the campaign context you are given.
2. Where the prose leaves a fork genuinely ambiguous — you cannot tell whether a stage has one outcome or several, or which outcomes the DM intends — do not guess and do not flatten it. Ask. A question names the beat it is about, says in one sentence why the tree cannot be placed without an answer, and offers two to four concrete options. Ask at most three questions per turn, the most consequential first. If nothing is ambiguous, ask nothing.
3. On later turns you receive your previous tree and the DM's answers. Revise ONLY what the answers affect: keep every unaffected beat's key, title and dm_content exactly as before, so the DM's accepted beats do not move. Add, split or remove beats only where an answer says so. Never re-ask a question that has been answered; a free-text answer is an instruction, follow it.
4. When you have no questions left, return an empty questions array; that tells the DM the tree is settled.

Respond with one JSON object and nothing else, in exactly this shape:
{
  "tree": {
    "title": "...",
    "summary": "one player-facing sentence with no DM secrets, under 200 characters, no line breaks",
    "beats": [{ "key": "b1", "title": "...", "dm_content": "one paragraph of DM guidance", "kind": "neutral" }],
    "routes": [{ "from": "b1", "to": "b2" }],
    "objectives": [{ "description": "...", "raised_by": "b1" }],
    "tags": ["..."]
  },
  "questions": [{ "key": "q1", "about": "b3", "question": "...", "why": "...", "options": [{ "key": "a", "label": "..." }, { "key": "b", "label": "..." }] }],
  "note": "one sentence on what you proposed, or what you changed this turn"
}

Rules for the shape: 2 to 12 beats. Keys are short stable strings (b1, b2, ...; q1, q2, ...). Every route names two existing beat keys and no beat routes to itself. Every objective's raised_by names an existing beat key. The opening beat has no route into it. At least one objective is raised by the opening beat. "about" may be null for a question about the quest as a whole. A question key must not repeat one used on an earlier turn. "kind" is exactly one of: neutral, combat, social, explore, discovery.
$$);

-- ── 3. Credit cost ───────────────────────────────────────────────────────────
insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('quest_design_turn', 'Quest Designer (per exchange)', 1, 11);
