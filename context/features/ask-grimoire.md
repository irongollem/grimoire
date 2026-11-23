# Ask Grimoire (#1253)

The DM's assistant beside search. A DM types a request ("I need a new NPC, a half-elf about 27"), a question about their campaign, or a request for ideas, from any DM screen. Grimoire reads the campaign, asks only what it must, and either answers, lays out ideas marked canon or new, or proposes one of the app's generators. A proposal becomes a quote card; nothing is made or spent until the DM presses its button, and then the generator runs through the same workflow its own page uses, from the screen the DM is on.

The design is the canvas *Ask Grimoire* (claude.ai artifact `FK4DhWkHuZjcHW6VNdBt4D`, frames `01 Delta` to `11 One engine, two tables`); its decisions are on issue #1253. The server half (the `ask-turn` function, the engine it shares with the AI table, the tools, the pricing) is in [agent-runtime.md](agent-runtime.md), section "Ask Grimoire".

## Where it is

- **The Ask button** beside the global search: `AppSidebar` on a desktop, `AppTopBar` on a tablet and a phone (`src/components/ask/AskButton.vue`, icon `IconAsk`). `mod+J` opens it (`DefaultLayout`); `mod+K` stays search. The button carries a dot while a result the DM has not seen is waiting.
- **The search row.** From two typed characters, the search dropdown (`GlobalSearch`) and the phone search sheet (`AppTopBar`) offer "Ask Grimoire" with the query under it as their first row (`AskSearchRow`). Pressing it, or `mod+Enter`, opens the panel and sends the query. Search results still show below it, and plain Enter does what it always did.
- **Who sees it:** `useCanAsk()` (`src/composables/ask/useCanAsk.ts`), the one rule every entry point asks: the DM lens, in a campaign with AI switched on. That is where a DM could run a generator from its own page.

## The panel (`src/components/ask/`)

`AskPanel` mounts the first time Ask is opened (`useAskUiStore().everOpened`, `src/stores/ui/ask.ts`) and stays mounted, so a run started in it outlives closing it. On a desktop it is a right-hand column beside the page, like Chat (Chat's tab moves to its edge while it is open); on a phone it is a sheet above the bottom bar. `AskSurface` lays out the header (title, Beta, New conversation, close), the campaign and the page the DM asked from, the thread (`AskThread`) and the composer (`AskComposer`).

- The DM's words are the hand (`data-hand`, Fondamento, `AskHandText`); Grimoire answers in print (Vellum ink, #1031).
- `AskReply` shows a question with its chips; a chip sends its reply and the chips go quiet once answered, by chip or by typing. `AskRead` is "Read N records. Show what I read". `AskIdeas` draws each idea's lines led by **Canon** (solid diamond) or **New idea** (open diamond), its references as links, and a hand-off button that turns the idea into a proposal.
- `AskQuoteCard` is the quote: a line per option, a ruled total, the gilt button "<action> · N credits", Adjust (`AskAdjust`: the generator's inputs as toggles, chips and fields) and Cancel. A `block` from the adapter replaces the gilt button with its sentence. A generator that works in its own screen shows an Open button instead.
- `AskResultCard` ends a run: each part with a tick or a cross, a priced Retry for a failed part that can be redone alone, and Open <noun> or Review suggestions. `AskResultNotice` is the floating slip (`data-slip`) that says the same when the panel was closed or the DM moved on: "<name> is ready.", Stay here, Open <noun>.
- `AskUpsell` replaces an answer when the day's five free questions are spent and the account cannot pay for the next one.
- The composer's line says how many free questions are left today, read from the caller's own `ask_usage` row (`useAskUsage`, scoped to `user_id`), then the `done` event's count.

## The conversation (`src/composables/ask/useAskConversation.ts`)

Posts `AskTurnBody` to `ask-turn` (`askTransport.ts`) with the page the DM is on (`askContext.ts`: the route and, on a record's page, the record), reads the stream with the shared SSE reader (`src/lib/agentStream/readEventStream.ts`, also the table's) and validates every event (`parseAskEvent.ts`; a malformed or unknown one is skipped). The guards it holds, each tested: a proposal runs once per `proposalId` whatever is pressed or re-rendered; a retry runs once per press; a cancelled card cannot be confirmed; a late result never lands in a newer conversation; the allowance refusal (`ask_allowance_spent`) shows the upsell; the off-topic refusal (`ask_off_topic`, 422) shows its one sentence and no upsell; a withheld answer (`error` with `withheld`) takes back the words it had streamed for that turn and leaves earlier turns alone.

## Generators (`src/ai/ask/`)

The contract both halves import is `supabase/functions/_shared/agent/askContract.ts`: `ASK_GENERATORS`, each with an id, the quote card's action and noun, an `ending`, the inputs the model may fill (a JSON Schema subset), the inputs worth asking about, a target's kinds and the 5e fence. The server validates a proposal against it; the browser validates it again (`askInputs.ts`) before anything reaches a workflow.

An **adapter** per generator (`src/ai/ask/adapters/<id>AskAdapter.ts`, the interface in `src/lib/ask/askAdapter.ts`) is a seam over the generator's own workflow:

- `quote(proposal)`: what Ask understood (credits empty), the priced lines from the generator's **quote composable** (`src/composables/ai/quotes/<id>Quote.ts`, built from the quote kit on the cost key the server charges), and a `block` from `useAskGate` (AI off, a 5e generator where the game system has no stat blocks, the plan's quota, a short balance) or a missing input.
- `run(proposal)`: the gates again, then the generator's generate-and-create workflow (`src/composables/<domain>/useGenerate<Thing>.ts`), the same function its page calls. It never navigates and never throws for a failed generation: a picture, a leader NPC, a note are parts of their own, so a failed part leaves the record saved and can be retried alone where the page can.

The page and Ask read the same quote composable, so they cannot quote different prices. Building them corrected several pages that priced only the text of a generator whose picture is on by default (item, spell, faction, place, puzzle, monster), and the monster's server key (it was charged under `monster_generation`, a key with no price row, until #1253).

The registry (`useAskAdapters.ts`) finds adapter and screen files by name, and a test holds every `ASK_GENERATORS` id to exactly one of them.

| Ending | What happens | Generators |
| --- | --- | --- |
| `record` | Quoted, run here, ends on Open <noun> | npc, monster, item, spell, faction, location, encounter, roll_table, loot_table, dungeon_feature, trap, puzzle, deity, species, background, class, subclass, class_feature, house_rule, recipe, scriptorium_draft, music_track |
| `fill` | Needs a target (from the page or the words; the server checks it is the campaign's) | portrait, quest_beat, room |
| `review` | Run here, then the page's own review: the result's `open()` opens that panel after navigating | quest_hooks, canon_suggestions, connection_suggestions |
| `screen` | No quote: Ask opens the screen with the request filled in (`src/ai/ask/screens/`, through the take-once `askPrefill` store), and the DM presses that screen's own button | quest_designer, map_style, complication |

**Adding a generator:** its entry in `ASK_GENERATORS`; its quote composable (verify the key in the edge function, not the panel) and make its page read it; its workflow extracted from the panel if it is still inline; its adapter file using `askAdapterKit.ts`; tests for the quote equal to the page's, each gate, an unknown input never reaching the workflow, a failed part leaving the record saved.

## Not built yet

- A run through a live model end to end in the local stack has not been done; every piece is tested against fakes.
- Tools that work inside an open editor (text enhance, the Illuminator, brush tips, a sculpted miniature) are not offered.
- A routed turn is free only when the DM runs the generator it proposed; the next Ask turn settles it (see agent-runtime.md, "Pricing"). The scope threshold has not been measured against a live judge: run `askScope.fixtures.ts` through TypeSafe and move `ASK_SCOPE_THRESHOLD` with it.
