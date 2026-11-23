// Ask Grimoire's tools (#1253): the MCP readers (bound and pinned by the caller), and Ask's own four. `find` reads by
// meaning, `ask_choice` puts a question to the DM, `offer_ideas` lays out a brainstorm, `propose` names a generator.
// None of them writes: what a proposal does, the browser does, after the DM confirms the quote.
//
// Two of them end the turn (`ask_choice`, `propose`): the DM's reply, or their press of the quote's button, is the
// next step, so another model call would only restate what is on the screen. The loop is not told to stop (it is the
// table's loop and knows nothing of Ask), so `endAware` answers the call that would follow with an empty step.
// Pure with its dependencies passed in, so every guard below is tested without a database.

import type { AskEvent, AskProposal } from "./askContract.ts";
import { checkProposal, generatorsFor } from "./askPropose.ts";
import { checkIdeas } from "./askIdeas.ts";
import { recordsRead, type ReadLog } from "./askReads.ts";
import type { AskCampaignRow, AskFound, AskRecordLookup } from "./askTypes.ts";
import type { AskRecordType, AskChoice } from "./askContract.ts";
import { isRecord } from "./parse.ts";
import type { AgentTool, CallModel, CallTool, ToolAnswer } from "./types.ts";

const QUESTION_MAX = 300;
const CHOICES_MIN = 2;
const CHOICES_MAX = 5;
const LABEL_MAX = 60;
const REPLY_MAX = 300;
const NOTE_MAX = 40;
const FIND_QUERY_MAX = 200;

export type AskEnd = "ask" | "propose";

const STOP_NOW = "It is shown to the DM. Stop now and write nothing more in this turn.";

/** Ask's own tool schemas. The generator enum is the campaign's: no 5e generator is offered where there are no 5e rules. */
export function askOwnTools(fiveE: boolean): AgentTool[] {
  const recordTypes = ["npc", "monster", "item", "spell", "location", "faction", "quest", "quest_beat", "encounter", "deity", "party_member", "note", "canon", "room"];
  return [
    {
      name: "find",
      description: "Search the campaign by meaning, not by exact words: the DM's NPCs, places, factions, notes, quests, canon, items and monsters. Use it when you do not know the name. Returns the nearest records (type, id, name); use `get` to read one.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "What to look for, in a sentence or a few words." } },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: "ask_choice",
      description: "Ask the DM ONE question with choices they can press. Use it only for what is missing or ambiguous. After calling it, stop: the DM's answer is your next message.",
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question, short." },
          choices: {
            type: "array",
            description: `${CHOICES_MIN} to ${CHOICES_MAX} choices.`,
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "What the chip says." },
                reply: { type: "string", description: "What is sent back as the DM's message when the chip is pressed." },
                note: { type: "string", description: "A small detail on the chip. Say \"costs extra\" for a choice that costs more, never a number." },
              },
              required: ["label", "reply"],
              additionalProperties: false,
            },
          },
        },
        required: ["question", "choices"],
        additionalProperties: false,
      },
    },
    {
      name: "offer_ideas",
      description: "Lay out brainstormed ideas. Each idea has lines; mark a line canon only when it rests on records you read (give them in refs), otherwise it is new. An idea may hand off to a generator.",
      inputSchema: {
        type: "object",
        properties: {
          ideas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                lines: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      canon: { type: "boolean", description: "True only if the campaign already says this." },
                      text: { type: "string" },
                      refs: {
                        type: "array",
                        description: "Records you read that this line rests on.",
                        items: {
                          type: "object",
                          properties: { type: { type: "string", enum: recordTypes }, id: { type: "string" } },
                          required: ["type", "id"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["canon", "text"],
                    additionalProperties: false,
                  },
                },
                handoff: {
                  type: "object",
                  description: "Optional: the generator that would make this idea real.",
                  properties: {
                    generator: { type: "string", enum: generatorsFor(fiveE).map((g) => g.id) },
                    concept: { type: "string" },
                    inputs: { type: "object", additionalProperties: true },
                  },
                  required: ["generator", "concept"],
                  additionalProperties: false,
                },
              },
              required: ["title", "lines"],
              additionalProperties: false,
            },
          },
        },
        required: ["ideas"],
        additionalProperties: false,
      },
    },
    {
      name: "propose",
      description: "Propose one generator for what the DM asked. Nothing is made: the DM sees a quote with the generator's real price and confirms. Call it once, when you have what you need. After calling it, stop.",
      inputSchema: {
        type: "object",
        properties: {
          generator: { type: "string", enum: generatorsFor(fiveE).map((g) => g.id) },
          concept: { type: "string", description: "What the DM described, in their words, with every detail they gave." },
          inputs: { type: "object", description: "The generator's options, only the keys it lists and only what the DM said or you resolved with the readers.", additionalProperties: true },
          target: {
            type: "object",
            description: "For a generator that works on an existing record: the record, which you must have read.",
            properties: { type: { type: "string", enum: recordTypes }, id: { type: "string" } },
            required: ["type", "id"],
            additionalProperties: false,
          },
        },
        required: ["generator", "concept"],
        additionalProperties: false,
      },
    },
  ];
}

export interface AskToolsInput {
  campaign: AskCampaignRow;
  fiveE: boolean;
  /** The MCP reader schemas the model is shown. */
  mcpTools: AgentTool[];
  /** The MCP readers, already bound to the allow list and pinned to the campaign. */
  callMcp: CallTool;
  find(query: string): Promise<AskFound[] | null>;
  loadRecord(type: AskRecordType, id: string): Promise<AskRecordLookup | null>;
  newId(): string;
  reads: ReadLog;
  emit(event: AskEvent): void;
}

export interface AskTools {
  tools: AgentTool[];
  callTool: CallTool;
  /** The proposal this turn made; null when it made none. A turn with one is "routed". */
  proposal(): AskProposal | null;
  /** What ended the turn's need to continue, if anything did. */
  ended(): AskEnd | null;
  /** The model, but a call made after the turn ended answers at once with nothing and costs nothing. */
  endAware(call: CallModel, who: { provider: string; model: string }): CallModel;
}

function choicesOf(raw: unknown): AskChoice[] {
  const out: AskChoice[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    if (!isRecord(c) || typeof c.label !== "string" || c.label.trim() === "") continue;
    const label = c.label.trim().slice(0, LABEL_MAX);
    const reply = typeof c.reply === "string" && c.reply.trim() !== "" ? c.reply.trim().slice(0, REPLY_MAX) : label;
    const note = typeof c.note === "string" && c.note.trim() !== "" ? c.note.trim().slice(0, NOTE_MAX) : undefined;
    out.push({ label, reply, ...(note === undefined ? {} : { note }) });
    if (out.length === CHOICES_MAX) break;
  }
  return out;
}

export function makeAskTools(input: AskToolsInput): AskTools {
  const { campaign, reads, emit } = input;
  const own = askOwnTools(input.fiveE);
  const tools = [...input.mcpTools, ...own];
  const mcpNames = new Set(input.mcpTools.map((t) => t.name));
  let proposal: AskProposal | null = null;
  let ended: AskEnd | null = null;

  const failure = (content: string): ToolAnswer => ({ content, isError: true });
  const alreadyEnded = (): ToolAnswer =>
    failure(ended === "propose" ? "A proposal is already made this turn. Only one per turn." : "A question is already put to the DM this turn. Stop and wait for the answer.");

  /** Tells the browser which records an answer named, once each. Names only. */
  const reported = (name: string, args: Record<string, unknown>, answer: ToolAnswer): ToolAnswer => {
    const fresh = reads.add(recordsRead(name, args, answer));
    if (fresh.length > 0) emit({ type: "read", records: fresh });
    return answer;
  };

  async function read(name: string, args: Record<string, unknown>): Promise<ToolAnswer> {
    const answer = await input.callMcp(name, args);
    // `get` takes an id and no campaign, so the pinned campaign cannot narrow it: a row that belongs to another
    // campaign of the same DM is refused here, after the read and before anything of it is shown or kept.
    if (name === "get" && !answer.isError) {
      try {
        const row: unknown = JSON.parse(answer.content);
        if (isRecord(row) && typeof row.campaign_id === "string" && row.campaign_id !== campaign.id) {
          return failure("That record is not in this campaign.");
        }
      } catch {
        // An answer that is not JSON names no campaign; it is passed on as it is.
      }
    }
    return reported(name, args, answer);
  }

  async function find(args: Record<string, unknown>): Promise<ToolAnswer> {
    const query = typeof args.query === "string" ? args.query.trim().slice(0, FIND_QUERY_MAX) : "";
    if (query.length < 2) return failure("`query` needs at least two characters.");
    const found = await input.find(query);
    if (found === null) return failure("Search by meaning is not available right now. Use `search` for exact words.");
    const answer: ToolAnswer = {
      content: JSON.stringify({ query, count: found.length, hits: found.map((f) => ({ type: f.type, id: f.id, name: f.name, summary: f.descriptor })) }),
      isError: false,
    };
    return reported("find", args, answer);
  }

  async function propose(args: Record<string, unknown>): Promise<ToolAnswer> {
    if (ended !== null) return alreadyEnded();
    const checked = await checkProposal(args, { fiveE: input.fiveE, loadTarget: (type, id) => input.loadRecord(type, id) });
    if (!checked.ok) return failure(checked.error);
    // Calls of one step run together: a question put while the target was being checked ends the turn first.
    if (ended !== null) return alreadyEnded();
    proposal = { proposalId: input.newId(), ...checked.proposal };
    ended = "propose";
    emit({ type: "propose", proposal });
    const dropped = checked.dropped.length > 0 ? ` Options not kept (not this generator's, or not valid): ${checked.dropped.join(", ")}.` : "";
    return { content: `Proposed ${checked.proposal.generator}. ${STOP_NOW}${dropped}`, isError: false };
  }

  function askChoice(args: Record<string, unknown>): ToolAnswer {
    if (ended !== null) return alreadyEnded();
    const question = typeof args.question === "string" ? args.question.trim().slice(0, QUESTION_MAX) : "";
    if (question === "") return failure("A question needs its words.");
    const choices = choicesOf(args.choices);
    if (choices.length < CHOICES_MIN) return failure(`Give ${CHOICES_MIN} to ${CHOICES_MAX} choices, each with a label and a reply.`);
    ended = "ask";
    emit({ type: "ask", question, choices });
    return { content: `Asked. ${STOP_NOW}`, isError: false };
  }

  function offerIdeas(args: Record<string, unknown>): ToolAnswer {
    const checked = checkIdeas(args.ideas, reads);
    if (checked.ideas.length === 0) return failure("No idea had a title and a line of text. Nothing was shown.");
    emit({ type: "ideas", ideas: checked.ideas });
    const notes = checked.notes.length > 0 ? ` ${checked.notes.join(" ")}` : "";
    return { content: `Shown ${checked.ideas.length} idea${checked.ideas.length === 1 ? "" : "s"}.${notes}`, isError: false };
  }

  const callTool: CallTool = async (name, args) => {
    if (mcpNames.has(name)) return read(name, args);
    switch (name) {
      case "find": return find(args);
      case "ask_choice": return askChoice(args);
      case "offer_ideas": return offerIdeas(args);
      case "propose": return propose(args);
      default: return failure(`No such tool: ${name}`);
    }
  };

  return {
    tools,
    callTool,
    proposal: () => proposal,
    ended: () => ended,
    endAware: (call, who) => async (request) => {
      if (ended === null) return call(request);
      return { blocks: [], stop: "end", usage: { provider: who.provider, model: who.model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  };
}
