# The agent runtime (#1205)

A conversation the server holds with a model that may call tools. It is the foundation under a table the AI runs (epic #1021) and under any later AI feature that takes more than one request. Nothing in the app calls it yet: there is no edge function and no screen. What exists is the core and the storage.

## Why it exists

Every other AI call in Grimoire is one request in and one answer out (`supabase/functions/_shared/textGen.ts`): a system prompt and one user message, JSON back, nothing kept. An AI Dungeon Master needs many messages, tool calls in the middle of a turn (roll, look something up, move a token), text that streams while it is written, and a stored history.

## The pieces (`supabase/functions/_shared/agent/`)

| File | What it is |
| --- | --- |
| `types.ts` | The vocabulary, provider-neutral: `AgentMessage` and its blocks (`text`, `tool_call`, `tool_result`, `opaque`), `AgentTool` (JSON Schema, the shape the MCP tools already have), `AgentUsage` (cached input counted apart, because it is billed apart), `CallModel`, `CallTool`, `AgentProviderError`. No I/O. |
| `turn.ts` | `runTurn`: one player message in, the model called, its tools run, the model called again, until it stops. Pure: the model and the tools come in as functions. Returns the messages to append, one usage per model call, and why the turn ended. |
| `openai.ts` | `openaiModel(apiKey, model)`: Chat Completions, always streamed, with tool calling. The first adapter because OpenAI (`gpt-5.6-luna`) is the only text provider production offers. |
| `anthropic.ts` | `anthropicModel(apiKey, model)`: Messages API, streamed, tools, prompt caching on the system block and the last tool. Correct against the reference documentation and recorded streams; never run against the live API, because no Anthropic key is configured. |
| `providerHttp.ts`, `sse.ts` | The streamed POST, its timeout (120 s for the whole stream), the caller's abort, and failures as `AgentProviderError`; the SSE reader. |

Raw `fetch`, no provider SDK, as in `textGen.ts`: edge functions carry none.

## Rules the turn loop keeps

- **A stored conversation never holds a tool call without its result.** A provider rejects the next request when one is missing, and a conversation that cannot be continued is a dead table. So a call to a tool that does not exist, a tool that throws, and every call left pending when a turn ends early (step limit, token budget, abort) all get an error result the model can read.
- **Tools of one message run together and answer in one message, in the order they were asked.** Splitting the answers teaches a model to stop calling tools in parallel.
- **The first model call always happens**; the step limit and the token budget are checked after a call that asked for tools.
- **A cut-off answer keeps its text and loses its tool calls** (a call cut at the output cap may be half a call).
- **A provider failure is not swallowed**: it goes to the caller, who decides about a retry. Only an abort ends the turn quietly.
- **An adapter never offers a call it could not parse.** Arguments that are not a JSON object are dropped; if none survive, the stop is `other`, not `tool_calls`.
- **A stream that ends without its terminal event is an error to retry**, not a short answer.

## What the live API taught (16 Nov 2026)

One real request against OpenAI, the only one made: `gpt-5.6-luna` on Chat Completions refuses function tools together with a reasoning effort ("use /v1/responses or set reasoning_effort to 'none'"). The adapter now sends `reasoning_effort: "none"` whenever a request declares tools, and keeps `textGen.ts`'s setting otherwise. **That fix has not been run against the API**, and no turn has completed against a real model yet. A model that should reason between tool calls needs the Responses API, which the adapter does not speak; its reasoning items are what the `opaque` block is for.

## Storage (`20261116075823`)

`agent_sessions` (one conversation: owner, campaign, kind, provider and model, a rolling summary with the sequence number it covers, running token and credit totals) and `agent_turns` (one message in order: its blocks, and on a message the model wrote, the tokens that call used).

- **Only the server writes.** There is no insert or update policy and no such grant for `authenticated`, on purpose: a client that could write a message could forge a tool result or a line from the model into a history the next request trusts.
- **Only the owner reads**, not the campaign's other members and not its DM. The owner may delete a session, which takes its messages.
- **Personal data.** Both tables reference `auth.users` with a cascade, so account erasure removes them and `export_user_data` includes them unprompted; `agent_turns.user_id` repeats the owner for that reason. Kept as long as the account is used (`context/compliance/retention.md`).
- Neither table rings the campaign doorbell (exempt in `live_sync_registry.test.sql`): nobody else reads them, and the page that runs a turn will stream it.
- `supabase/tests/agent_conversations.test.sql` holds the access rules, with the campaign's DM as the reader who must see nothing.

## Metering (`metering.ts`, migration `20261116080904`)

A fixed price per call cannot work here: one message from the player is several model calls of very different size. So a conversation is charged from measured tokens.

- `usdForUsage` prices a call from `ai_model_pricing`: full-rate input and cache writes at the input rate, cached input at `cached_input_cost_per_million_tokens`, output at the output rate. A cached rate that is not on file means the full input rate: a missing number never makes play cheaper.
- `creditsForUsd` is cost times the admin's margin, divided by what a credit is worth. Both come from `public.agent_credit_calibration()` (service role only), which reads `private.credit_calibration()`: the net euro cents a credit earns in the pack where it earns least, after VAT and the payment processor's cut. `get_credit_calibration_hints` reads the same function now, so the admin's price calibration and the metering cannot drift. With today's packs a credit is worth about 0.61 euro cents (`credit_calibration.test.sql` holds the figure to a hand calculation). An unusable calibration throws; it never bills nothing.
- **A session accrues exactly and bills whole credits.** The house rule is never to bill a fraction of a credit, and rounding each turn up would overcharge by about half. `agent_sessions.credits_spent` holds the exact running total; `creditsDue(before, after)` is the whole credits newly crossed, and that is what a turn spends. What is left under a whole credit when a conversation ends is not billed.
- A rough size: a turn of three model calls on `gpt-5.6-luna` (about 18,000 input and 1,500 output tokens) costs about half a US cent, which at a margin of 2 is about 1.6 credits.

## History and tools (`transcript.ts`, `mcpTools.ts`)

- `historyFrom` turns stored rows into the messages to send: in order, without the part the summary covers, each block checked because it is jsonb back from a database, and never starting with a tool result whose call was cut away. `rowsFor` turns a finished turn into rows; every step's tokens land on a row, so the usage columns always sum to what was billed. `systemWithSummary` keeps the standing instructions a byte-identical prefix so a provider's prompt cache holds.
- `bindTools` puts the MCP tool handlers behind an allow list that is the security boundary, not a hint: a tool outside it is never invoked. `SOLO_TABLE_TOOLS` is read and roll only (`roll`, `search`, `get`, `list`, `campaign_overview`); a test fails if `create` or `update` joins it. A result too long for the context is cut with a note; a tool that returns a file is refused.

## Running a turn (`supabase/functions/agent-turn/`, migration `20261116084411`)

`POST { campaignId, sessionId?, message }`. `handler.ts` holds every rule with its dependencies injected (57 tests against an in-memory store); `index.ts` wires the real ones and streams.

- **Before anything is streamed**, in the order the other AI functions use: the caller, the account gate (fail closed: a child or suspended account, or a lookup that could not be made), the campaign and `ai_enabled`, **only the campaign's DM**, the rate limit (`agent_turn`, 20 a minute), a provider that has an adapter, a price row for the model and a usable calibration (**it never runs unmetered**: no price is a 503), the screening of the player's message, and a reservation of 1 credit. Each refusal is an ordinary JSON response with its status. A `sessionId` that is another account's, or in another campaign, is a 404: it does not say the conversation exists.
- **Then the reply is `text/event-stream`**: `session` (a new conversation is created before the model is called), `text` deltas, `tool_start` and `tool_end` by name only (a tool's input and result never reach the browser: they can hold DM-only material the model looked up), then one `done` (how the turn ended, the whole credits charged, the tokens used) or one `error`.
- **Limits of one turn:** 8 model calls, 2,000 output tokens a call, 60,000 tokens in all.
- **Tools** are `SOLO_TABLE_TOOLS` through the caller's own RLS client, as the MCP server runs them, and **every call is pinned to the conversation's campaign** (`bindTools`' `pinned` argument wins over what the model wrote): the caller's access covers every campaign they run, and a conversation in one must not be talked into reading another.
- **Saved whole, then charged.** `append_agent_turns` writes the turn's messages and raises the session's totals in one transaction, and refuses when the conversation has moved on (a second tab), which the player hears as "This conversation was continued somewhere else." Only after a save are the due credits spent. A turn that is due nothing still writes a ledger row with its tokens (`recordFreeGeneration`), so usage is never invisible. The ledger's `input_tokens` is all input, cached included, because the ledger has no cached column; the exact split is on `agent_turns`, and the admin's cost estimate therefore reads a little high for cached input.
- **A failure mid-turn** (the provider, anything else) saves nothing and charges nothing, releases the reservation, and tells the browser a plain sentence, never the provider's own message. The player's message is not stored; the browser sends it again.
- **Own key (BYOK):** nothing is reserved, accrued or charged; a zero row records the tokens.
- **The system text** (`soloTablePrompt.ts`) is a first working version, not the design of the solo table: the standing part is byte-identical for every campaign and the campaign's name, ruleset and id follow in their own section, so a provider's prompt cache holds.
- **Screening** reuses the image-prompt check as it stands (`screenImagePrompt`: same thresholds, fails open), so a message near a threshold is kept in `prompt_screenings` for an admin to judge, as an image prompt is. Its thresholds were tuned for image prompts; screening made for chat does not exist yet.

Seen against the locally served function (16 Nov 2026), without any model call: no sign-in 401, an empty message and a missing campaign 400, AI off 403, and with AI on a member who is not the DM 403, with no conversation created and nothing in the ledger. **No turn has run end to end against a real model.**

## Not built yet

A screen, a budget the player sees, the rolling summary (the columns exist; nothing writes them), the checks on what is shown (#1061), the standing AI disclosure at the table, tools that write (the allow list is read and roll only), the Responses API for a model that reasons between tool calls, and a rule for a conversation whose provider changes between turns (it uses the provider resolved now, and the other provider's private blocks are dropped).
