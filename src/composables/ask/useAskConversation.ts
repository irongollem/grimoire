/**
 * Ask Grimoire (#1253): one conversation with the `ask-turn` function, and what the DM does with what it proposes.
 *
 * The model never runs a generator. A `propose` event becomes a quote card; only the DM's press on it calls the
 * adapter's `run`, once per `proposalId` (`ran` is the guard: a second press, a re-render or a remount of the card
 * cannot make a second record). Lives in the panel's scope, which stays mounted while the panel is merely hidden,
 * so a running turn or generation carries on.
 */
import { ref } from "vue";
import {
  ASK_REFUSALS,
  askGenerator,
  type AskChoice,
  type AskContext,
  type AskIdea,
  type AskProposal,
  type AskRecordRef,
  type AskTurnBody,
} from "@edge-shared/agent/askContract";
import { readEventStream } from "@/lib/agentStream/readEventStream";
import { parseAskEvent } from "@/lib/agentStream/parseAskEvent";
import type { AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import { sendToAskTurn, type AskTransport } from "./askTransport";

export type ResultPart = AskRunPart & { left?: boolean; retrying?: boolean };

export type AskItem =
  | { kind: "user"; id: number; text: string }
  | { kind: "reply"; id: number; text: string; who: string | null }
  | { kind: "ask"; id: number; question: string; choices: AskChoice[]; answered: boolean }
  | { kind: "read"; id: number; records: AskRecordRef[] }
  | { kind: "ideas"; id: number; ideas: AskIdea[]; handedOff: number[] }
  | { kind: "proposal"; id: number; proposal: AskProposal; state: "quote" | "cancelled" | "running" | "done" | "failed" }
  | { kind: "confirmed"; id: number; text: string }
  | {
      kind: "result";
      id: number;
      name: string;
      noun: string;
      review: boolean;
      record: AskRunResult["record"];
      route: string | null;
      parts: ResultPart[];
    }
  | { kind: "upsell"; id: number }
  | { kind: "error"; id: number; message: string };

type ReplyItem = Extract<AskItem, { kind: "reply" }>;
type NewItem = AskItem extends infer T ? (T extends { id: number } ? Omit<T, "id"> : never) : never;

/** What the panel needs to know when a run ends: the notice and the unread dot hang off it. */
export interface AskRunFinished {
  name: string;
  noun: string;
  review: boolean;
  route: string | null;
  credits: number;
  /** The page the DM was on when they pressed the button. */
  startedAt: string;
}

/** The floating notice: a finished run plus the campaign it was made in. */
export type AskNotice = Omit<AskRunFinished, "startedAt"> & { campaign: string };

export interface AskConversationDeps {
  campaignId: () => string | null;
  context: () => AskContext;
  adapters: AskAdapters;
  /** The page now, to tell whether the DM moved on while it ran. */
  routePath: () => string;
  transport?: AskTransport;
  onFinished?: (finished: AskRunFinished) => void;
}

const NOT_ANSWERED = "Grimoire could not answer that. Try again.";

function refusalMessage(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" && body.error !== "") return body.error;
  return NOT_ANSWERED;
}

export function partsCredits(parts: readonly AskRunPart[]): number {
  return parts.reduce((sum, p) => sum + p.credits, 0);
}

export function useAskConversation(deps: AskConversationDeps) {
  const transport = deps.transport ?? sendToAskTurn;
  const items = ref<AskItem[]>([]);
  const running = ref(false);
  /** What the server last said is left of today's free questions; null until a turn has said. */
  const freeLeft = ref<number | null>(null);
  let sessionId: string | undefined;
  let controller: AbortController | null = null;
  let nextId = 1;
  /** Bumped by a new conversation, so a run that finishes after it does not write into the new thread. */
  let epoch = 0;
  const ran = new Set<string>();
  const retrying = new Set<string>();

  function push(item: NewItem): AskItem {
    items.value.push({ ...item, id: nextId++ } as AskItem);
    // Return the reactive proxy, so a later mutation of it reaches the screen.
    return items.value[items.value.length - 1] as AskItem;
  }

  function find<K extends AskItem["kind"]>(id: number, kind: K): Extract<AskItem, { kind: K }> | undefined {
    return items.value.find((i): i is Extract<AskItem, { kind: K }> => i.id === id && i.kind === kind);
  }

  async function streamTurn(message: string) {
    const campaignId = deps.campaignId();
    if (campaignId === null) {
      push({ kind: "error", message: "Pick a campaign first, then ask." });
      return;
    }
    const body: AskTurnBody = { campaignId, message, context: deps.context(), ...(sessionId ? { sessionId } : {}) };
    controller = new AbortController();
    const mine = controller;
    running.value = true;
    let reply: ReplyItem | null = null;
    try {
      const response = await transport(body, mine.signal);
      if (!response.ok) {
        let parsed: unknown = null;
        try {
          parsed = await response.json();
        } catch {
          // A refusal that is not JSON (a gateway's page) still says no.
        }
        if (typeof parsed === "object" && parsed !== null && "error" in parsed && parsed.error === ASK_REFUSALS.allowanceSpent) {
          push({ kind: "upsell" });
        } else {
          push({ kind: "error", message: refusalMessage(parsed) });
        }
        return;
      }
      for await (const event of readEventStream(response, parseAskEvent)) {
        if (event.type === "text") {
          if (reply === null) reply = push({ kind: "reply", text: "", who: null }) as ReplyItem;
          reply.text += event.delta;
          continue;
        }
        // Anything that is not words ends the paragraph being written.
        switch (event.type) {
          case "session":
            sessionId = event.sessionId;
            break;
          case "ask":
            reply = null;
            push({ kind: "ask", question: event.question, choices: event.choices, answered: false });
            break;
          case "read":
            if (event.records.length > 0) push({ kind: "read", records: event.records });
            break;
          case "ideas":
            reply = null;
            push({ kind: "ideas", ideas: event.ideas, handedOff: [] });
            break;
          case "propose": {
            const generator = askGenerator(event.proposal.generator);
            if (reply && generator) reply.who = `${generator.noun} generator`;
            reply = null;
            push({ kind: "proposal", proposal: event.proposal, state: "quote" });
            break;
          }
          case "done":
            freeLeft.value = event.freeLeft;
            break;
          case "error":
            push({ kind: "error", message: event.message });
            break;
          case "tool_start":
          case "tool_end":
            break;
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) push({ kind: "error", message: NOT_ANSWERED });
    } finally {
      if (controller === mine) {
        running.value = false;
        controller = null;
      }
    }
  }

  async function send(text: string) {
    const message = text.trim();
    if (message === "" || running.value) return;
    // Typing instead of pressing a chip answers the question too.
    for (const item of items.value) if (item.kind === "ask") item.answered = true;
    push({ kind: "user", text: message });
    await streamTurn(message);
  }

  function choose(itemId: number, choice: AskChoice) {
    const item = find(itemId, "ask");
    if (!item || item.answered || running.value) return;
    item.answered = true;
    void send(choice.reply);
  }

  function newConversation() {
    epoch += 1;
    controller?.abort();
    controller = null;
    running.value = false;
    sessionId = undefined;
    items.value = [];
  }

  // ── what the DM does with a proposal ──────────────────────────────────────────────────────────────────────────

  /** An idea's handoff becomes a proposal and so a quote. Once per idea: a second press makes no second card. */
  function handOff(itemId: number, ideaIndex: number) {
    const item = find(itemId, "ideas");
    const idea = item?.ideas[ideaIndex];
    if (!item || !idea?.handoff || item.handedOff.includes(ideaIndex)) return;
    item.handedOff.push(ideaIndex);
    push({
      kind: "proposal",
      state: "quote",
      proposal: { proposalId: crypto.randomUUID(), generator: idea.handoff.generator, concept: idea.handoff.concept, inputs: idea.handoff.inputs },
    });
  }

  function adjust(itemId: number, inputs: Record<string, unknown>) {
    const item = find(itemId, "proposal");
    if (item?.state !== "quote") return;
    item.proposal = { ...item.proposal, inputs };
  }

  function cancel(itemId: number) {
    const item = find(itemId, "proposal");
    if (item?.state === "quote") item.state = "cancelled";
  }

  async function confirm(itemId: number) {
    const item = find(itemId, "proposal");
    if (item?.state !== "quote") return;
    const { proposal } = item;
    const generator = askGenerator(proposal.generator);
    const adapter = deps.adapters.adapterFor(proposal.generator);
    if (!generator || !adapter) return;
    const quote = adapter.quote(proposal);
    // The button is disabled in these states; the guard is for a press that races a re-quote.
    if (quote.block !== null) return;
    const price = quote.byok ? "your own key" : quote.total === null ? null : `${quote.total} credits`;
    if (price === null) return;
    if (ran.has(proposal.proposalId)) return;
    ran.add(proposal.proposalId);
    item.state = "running";
    push({ kind: "confirmed", text: `You confirmed: ${generator.action} · ${price}` });
    const startedAt = deps.routePath();
    const mine = epoch;
    let result: AskRunResult;
    try {
      result = await adapter.run(proposal);
    } catch {
      item.state = "failed";
      // Whether it ran is unknown, so the id stays in `ran`: it is never run a second time on a guess.
      if (mine === epoch) push({ kind: "error", message: "That did not finish. Check the list before asking again." });
      return;
    }
    item.state = "done";
    const name = result.record?.name ?? generator.action;
    const review = generator.ending === "review";
    if (mine === epoch) {
      push({ kind: "result", name, noun: generator.noun, review, record: result.record, route: result.route, parts: result.parts.map((p) => ({ ...p })) });
    }
    deps.onFinished?.({ name, noun: generator.noun, review, route: result.route, credits: partsCredits(result.parts), startedAt });
  }

  async function retryPart(resultId: number, index: number) {
    const item = find(resultId, "result");
    const part = item?.parts[index];
    if (!item || !part?.retry || part.left) return;
    const key = `${resultId}:${index}`;
    if (retrying.has(key)) return;
    retrying.add(key);
    part.retrying = true;
    try {
      item.parts[index] = { ...(await part.retry.run()) };
    } catch {
      part.retrying = false;
      part.error = "That did not work either.";
    } finally {
      retrying.delete(key);
    }
  }

  function leavePart(resultId: number, index: number) {
    const part = find(resultId, "result")?.parts[index];
    if (part) part.left = true;
  }

  return { items, running, freeLeft, send, choose, newConversation, handOff, adjust, cancel, confirm, retryPart, leavePart };
}
