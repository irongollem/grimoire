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

## Not built yet

The edge function that runs a turn (loading the world, the tool handlers from `_shared/mcp/tools.ts` called in process, streaming to the browser, writing the turn), spending the credits a turn is due and showing the player a budget, the rolling summary, the checks on what is shown (#1061), moderation of free text, the standing AI disclosure at the table, and any screen.
