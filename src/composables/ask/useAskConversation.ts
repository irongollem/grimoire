/**
 * Ask Grimoire (#1253): one conversation with the `ask-turn` function, and what the DM does with what it proposes.
 *
 * The model never runs a generator. A `propose` event becomes a quote card; only the DM's press on it calls the
 * adapter's `run`, once per `proposalId` (`ran` is the guard: a second press, a re-render or a remount of the card
 * cannot make a second record). Lives in the panel's scope, which stays mounted while the panel is merely hidden,
 * so a running turn or generation carries on.
 */
import { ref, watch } from "vue";
import { creditsText } from "@/lib/ask/askCredits";
import {
  ASK_OFF_TOPIC_MESSAGE,
  ASK_REFUSALS,
  askGenerator,
  type AskChoice,
  type AskContext,
  type AskReportDraft,
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
  | {
      kind: "proposal";
      id: number;
      proposal: AskProposal;
      state: "quote" | "cancelled" | "running" | "done" | "failed";
      /** The DM's yes or no to each line that would change an existing record; read by the quote and the run. */
      choices: Record<string, boolean>;
      /**
       * Where the finished run landed: a run never holds up the conversation, so its result (or its failure) is added
       * at the bottom when it ends, and the proposal's own place links to it.
       */
      landedAt?: number;
    }
  /** A report Ask drafted. Nothing is sent: the DM reviews it in the report form and presses Send there. */
  | { kind: "report"; id: number; report: AskReportDraft }
  | { kind: "confirmed"; id: number; text: string }
  | {
      kind: "result";
      id: number;
      name: string;
      noun: string;
      review: boolean;
      record: AskRunResult["record"];
      route: string | null;
      /** A result that lives in the page's own panel: opened there after navigating to `route`. */
      open?: () => void;
      /** The picture the run made, shown on the card. */
      picture?: string;
      parts: ResultPart[];
    }
  | { kind: "upsell"; id: number }
  | { kind: "error"; id: number; message: string };

function dedupeRecords(records: AskRecordRef[]): AskRecordRef[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.type}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type ReplyItem = Extract<AskItem, { kind: "reply" }>;
type NewItem = AskItem extends infer T ? (T extends { id: number } ? Omit<T, "id"> : never) : never;

/** What the panel needs to know when a run ends: the notice and the unread dot hang off it. */
export interface AskRunFinished {
  name: string;
  noun: string;
  review: boolean;
  route: string | null;
  open?: () => void;
  credits: number;
  /** The campaign's name at the press, so a switch while it ran cannot rename where it was made. */
  campaign: string;
  /** The page the DM was on when they pressed the button. */
  startedAt: string;
}

/** The floating notice: a finished run plus the campaign it was made in. */
export type AskNotice = Omit<AskRunFinished, "startedAt">;

export interface AskConversationDeps {
  campaignId: () => string | null;
  /** The active campaign's name, read at the confirm press. */
  campaignName: () => string;
  context: () => AskContext;
  adapters: AskAdapters;
  /** The page now, to tell whether the DM moved on while it ran. */
  routePath: () => string;
  transport?: AskTransport;
  onFinished?: (finished: AskRunFinished) => void;
}

const NOT_ANSWERED = "Your Familiar could not answer that. Try again.";

/** What a refusal's own code means, for the codes that come without a sentence. */
const REFUSAL_CODES: Readonly<Record<string, string>> = {
  rate_limited: "That was a lot of questions at once. Wait a moment and ask again.",
};

/**
 * A refusal before the stream: `{error: "refused", message}` carries a sentence for a person, and a code alone
 * (`rate_limited`) is the page's to word. A code is never shown as it is.
 */
export function refusalMessage(body: unknown): string {
  if (typeof body !== "object" || body === null) return NOT_ANSWERED;
  if ("message" in body && typeof body.message === "string" && body.message.trim() !== "") return body.message;
  if ("error" in body && typeof body.error === "string") return REFUSAL_CODES[body.error] ?? NOT_ANSWERED;
  return NOT_ANSWERED;
}

export function partsCredits(parts: readonly AskRunPart[]): number {
  return parts.reduce((sum, p) => sum + p.credits, 0);
}

/** How long after the last words the Familiar keeps moving: text arrives in bursts, and a still-move-still flicker reads as a glitch. */
export const SPEAKING_TAIL_MS = 700;

export function useAskConversation(deps: AskConversationDeps) {
  const transport = deps.transport ?? sendToAskTurn;
  const items = ref<AskItem[]>([]);
  const running = ref(false);
  /**
   * The Familiar is writing words right now: true while text arrives, false once it has paused a moment or the turn
   * ends. Its avatar moves only then (maintainer, 24 Nov 2026), not while it reads or waits on a tool.
   */
  const speaking = ref(false);
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  function hush() {
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = null;
    speaking.value = false;
  }
  function heard() {
    speaking.value = true;
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = setTimeout(hush, SPEAKING_TAIL_MS);
  }
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
    /** Every paragraph this turn wrote, so a withheld answer can take back all of them. */
    const written = new Set<number>();
    /** The read lines this turn pushed: only these may take more records, never an earlier turn's. */
    const readLines = new Set<number>();
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
        } else if (typeof parsed === "object" && parsed !== null && "error" in parsed && parsed.error === ASK_REFUSALS.offTopic) {
          // The server sends the code; the sentence is the contract's, so it reads the same wherever it is shown.
          push({ kind: "error", message: ASK_OFF_TOPIC_MESSAGE });
        } else {
          push({ kind: "error", message: refusalMessage(parsed) });
        }
        return;
      }
      for await (const event of readEventStream(response, parseAskEvent)) {
        if (event.type === "text") {
          if (reply === null) {
            reply = push({ kind: "reply", text: "", who: null }) as ReplyItem;
            written.add(reply.id);
          }
          reply.text += event.delta;
          heard();
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
            if (event.records.length > 0) {
              // The server reports each tool call on its own, so one answer arrives as "Read 1", "Read 1", "Read 5".
              // A read straight after another of this turn joins it: the DM sees one line per answer.
              const last = items.value.at(-1);
              if (last && last.kind === "read" && readLines.has(last.id)) {
                const known = new Set(last.records.map((r) => `${r.type}:${r.id}`));
                for (const r of event.records) if (!known.has(`${r.type}:${r.id}`)) last.records.push(r);
              } else {
                const line = push({ kind: "read", records: dedupeRecords(event.records) });
                readLines.add(line.id);
              }
            }
            break;
          case "ideas":
            reply = null;
            push({ kind: "ideas", ideas: event.ideas, handedOff: [] });
            break;
          case "propose": {
            const generator = askGenerator(event.proposal.generator);
            if (reply && generator) reply.who = `${generator.noun} generator`;
            reply = null;
            written.add(push({ kind: "proposal", proposal: event.proposal, state: "quote", choices: {} }).id);
            break;
          }
          case "report":
            reply = null;
            written.add(push({ kind: "report", report: event.report }).id);
            break;
          case "done":
            freeLeft.value = event.freeLeft;
            break;
          case "error":
            // A withheld answer was already streamed: what it showed is taken back, so the sentence stands alone.
            if (event.withheld === true) items.value = items.value.filter((i) => !written.has(i.id));
            reply = null;
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
        hush();
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
    hush();
    sessionId = undefined;
    items.value = [];
    // The allowance line goes back to the server's row: an own-key turn had streamed 0.
    freeLeft.value = null;
  }

  // A conversation belongs to one campaign: its session is that campaign's, and a quote confirmed after a switch
  // would run in the new one. A run already under way keeps going; the epoch keeps its result out of the new thread.
  watch(() => deps.campaignId(), () => newConversation());

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
      choices: {},
      proposal: { proposalId: crypto.randomUUID(), generator: idea.handoff.generator, concept: idea.handoff.concept, inputs: idea.handoff.inputs },
    });
  }

  function adjust(itemId: number, inputs: Record<string, unknown>) {
    const item = find(itemId, "proposal");
    if (item?.state !== "quote") return;
    item.proposal = { ...item.proposal, inputs };
  }

  /** A yes or no on a line of the quote. Only while it is a quote: a running or finished one has already been decided. */
  function decide(itemId: number, key: string, on: boolean) {
    const item = find(itemId, "proposal");
    if (item?.state !== "quote") return;
    item.choices = { ...item.choices, [key]: on };
  }

  function cancel(itemId: number) {
    const item = find(itemId, "proposal");
    if (item?.state === "quote") item.state = "cancelled";
  }

  async function confirm(itemId: number) {
    const item = find(itemId, "proposal");
    if (item?.state !== "quote") return;
    const { proposal } = item;
    // The answers as they stand at the press: a change after it cannot reach a run already under way.
    const choices = { ...item.choices };
    const generator = askGenerator(proposal.generator);
    const adapter = deps.adapters.adapterFor(proposal.generator);
    if (!generator || !adapter) return;
    const quote = adapter.quote(proposal, choices);
    // The button is disabled in these states; the guard is for a press that races a re-quote.
    if (quote.block !== null) return;
    const price = quote.byok ? "your own key" : quote.total === null ? null : creditsText(quote.total);
    if (price === null) return;
    if (ran.has(proposal.proposalId)) return;
    ran.add(proposal.proposalId);
    item.state = "running";
    push({ kind: "confirmed", text: `You confirmed: ${generator.action} · ${price}` });
    const startedAt = deps.routePath();
    const campaignName = deps.campaignName();
    const mine = epoch;
    let result: AskRunResult;
    try {
      result = await adapter.run(proposal, choices);
    } catch {
      item.state = "failed";
      // Whether it ran is unknown, so the id stays in `ran`: it is never run a second time on a guess.
      if (mine === epoch) item.landedAt = push({ kind: "error", message: "That did not finish. Check the list before asking again." }).id;
      return;
    }
    item.state = "done";
    const name = result.record?.name ?? generator.action;
    const review = generator.ending === "review";
    if (mine === epoch) {
      item.landedAt = push({ kind: "result", name, noun: generator.noun, review, record: result.record, route: result.route, ...(result.open ? { open: result.open } : {}), ...(result.picture ? { picture: result.picture } : {}), parts: result.parts.map((p) => ({ ...p })) }).id;
    }
    deps.onFinished?.({ name, noun: generator.noun, review, route: result.route, ...(result.open ? { open: result.open } : {}), credits: partsCredits(result.parts), campaign: campaignName, startedAt });
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

  return { items, running, speaking, freeLeft, send, choose, newConversation, handOff, adjust, decide, cancel, confirm, retryPart, leavePart };
}
