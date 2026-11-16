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

## Not built yet

The edge function that runs a turn (loading the world, the tool handlers from `_shared/mcp/tools.ts` called in process, streaming to the browser, writing the turn), metering by measured tokens against a budget the player sees, the rolling summary, the checks on what is shown (#1061), moderation of free text, the standing AI disclosure at the table, and any screen.
