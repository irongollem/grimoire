/**
 * Ask Grimoire (#1253): one conversation with the `ask-turn` function, and what the DM does with what it proposes.
 *
 * The model never runs a generator. A `propose` event becomes a quote card; only the DM's press on it calls the
 * adapter's `run`, once per `proposalId` (`ran` is the guard: a second press, a re-render or a remount of the card
 * cannot make a second record). Lives in the panel's scope, which stays mounted while the panel is merely hidden,
 * so a running turn or generation carries on.
 */
import { computed, ref, watch } from "vue";
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
import { isPreviewAdapter, type AskPreview, type AskPreviewShown, type AskResultLink, type AskRunPart, type AskRunResult } from "@/lib/ask/askAdapter";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import type { PendingGenerator } from "@/stores/ui/ask";
import { sendToAskTurn, type AskTransport } from "./askTransport";

export type ResultPart = AskRunPart & { left?: boolean; retrying?: boolean };

/** Where one row's own press stands: under way, done (with the links it left), or failed (the row may be pressed again). */
export interface PreviewRowState {
  phase: "running" | "done" | "failed";
  doneLabel?: string;
  links?: AskResultLink[];
  /** On a failed row, why; on a done row, a quiet note the press came back with. */
  error?: string;
}

/** A row of a preview is named by its place: the section and the row in it. */
export const previewRowKey = (section: number, row: number) => `${section}:${row}`;

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
      state: "quote" | "cancelled" | "running" | "previewing" | "discarded" | "done" | "failed";
      /** What the generation cost so far, the folded line's price: each "Again" adds its own. Set once it has run. */
      credits?: number;
      /** The DM's yes or no to each line that would change an existing record; read by the quote and the run. */
      choices: Record<string, boolean>;
      /** Set when a page's button opened the card, so the DM fills it in; a card the model proposed has no such mark. */
      origin?: "button";
      /**
       * Where the finished run landed: a run never holds up the conversation, so its result (or its failure) is added
       * at the bottom when it ends, and the proposal's own place links to it.
       */
      landedAt?: number;
    }
  /**
   * A generation held for the DM's yes (#1270): what it made, not saved yet. `ready` waits for Create, Again or
   * Discard; the other phases are a press under way or its end.
   */
  | {
      kind: "preview";
      id: number;
      proposalItemId: number;
      phase: "ready" | "saving" | "again" | "saved" | "discarded" | "failed";
      shown: AskPreviewShown;
      /** The rows whose own press has run or is running, by `previewRowKey`; cleared when "Again" replaces what is shown. */
      rows: Record<string, PreviewRowState>;
      /** A save or a second generation that did not work, said for the DM; the preview stays as it was. */
      error?: string;
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
      /** More ways in, beside the main Open. */
      links?: AskResultLink[];
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
  /**
   * A turn's own words, once, after its stream ended with a `done` event: the texts of the `reply` items it wrote that
   * are still on screen, exactly as they were accumulated. Not called for an aborted or withheld turn. Read aloud by
   * the Familiar's voice, which speaks nothing but these.
   */
  onReplied?: (replied: { sessionId: string; texts: string[] }) => void;
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

/** How long after the last words the Familiar keeps moving at least: text arrives in bursts, and a still-move-still flicker reads as a glitch. */
export const SPEAKING_TAIL_MS = 700;
/**
 * How long the Familiar talks per character it writes: about the pace of reading aloud briskly. A reply often lands in
 * one burst rather than a stream, and a mouth that moves for a second over three paragraphs reads as a glitch too
 * (maintainer, 24 Nov 2026), so the time follows the size of what was said, not how fast it arrived.
 */
export const SPEAKING_MS_PER_CHAR = 40;
/** The longest the Familiar keeps talking past now, so a very long answer does not leave it moving for a minute. */
export const SPEAKING_MAX_MS = 15_000;

/** When a Familiar that talks until `until` (ms) and has just heard `chars` more characters at `now` stops talking. */
export function speakingUntil(until: number, now: number, chars: number): number {
  const end = Math.max(until, now) + chars * SPEAKING_MS_PER_CHAR;
  return Math.min(Math.max(end, now + SPEAKING_TAIL_MS), now + SPEAKING_MAX_MS);
}

export function useAskConversation(deps: AskConversationDeps) {
  const transport = deps.transport ?? sendToAskTurn;
  const items = ref<AskItem[]>([]);
  const running = ref(false);
  /**
   * The Familiar is saying words right now: true from the first text it writes for as long as that text takes to say
   * (`speakingUntil`), even past the end of the stream. Its avatar moves only then (maintainer, 24 Nov 2026), not while
   * it reads or waits on a tool. Cancelling or starting over stops it at once.
   */
  const speaking = ref(false);
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let talkUntil = 0;
  function hush() {
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = null;
    talkUntil = 0;
    speaking.value = false;
  }
  function heard(chars: number) {
    const now = Date.now();
    talkUntil = speakingUntil(talkUntil, now, chars);
    speaking.value = true;
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = setTimeout(hush, talkUntil - now);
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
  /** The previews held for a yes, by their item: the call that saves each, and what the run's finish needs to say. */
  const held = new Map<number, { preview: AskPreview; proposalItemId: number; startedAt: string; campaignName: string }>();

  /**
   * A generation is in flight (a run under way, or a held generation being saved or redone): credits are being spent
   * and the result has nowhere to land but this thread, so starting over must wait for it.
   */
  const generating = computed(() => items.value.some((i) => (i.kind === "proposal" && i.state === "running") || (i.kind === "preview" && (i.phase === "saving" || i.phase === "again"))));
  /** What the DM has generated and not saved ("encounter"): starting over would lose it, credits and all; null when nothing is waiting. */
  const holding = computed(() => {
    const waiting = items.value.find((i) => i.kind === "preview" && i.phase === "ready");
    if (!waiting || waiting.kind !== "preview") return null;
    const owner = items.value.find((i) => i.id === waiting.proposalItemId);
    return (owner?.kind === "proposal" && askGenerator(owner.proposal.generator)?.noun) || "result";
  });

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
    let ended = false;
    let withheld = false;
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
          heard(event.delta.length);
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
            ended = true;
            break;
          case "error":
            // A withheld answer was already streamed: what it showed is taken back, so the sentence stands alone.
            if (event.withheld === true) {
              withheld = true;
              items.value = items.value.filter((i) => !written.has(i.id));
              hush();
            }
            reply = null;
            push({ kind: "error", message: event.message });
            break;
          case "tool_start":
          case "tool_end":
            break;
        }
      }
      if (ended && !withheld && !mine.signal.aborted && sessionId !== undefined) {
        const texts = items.value.filter((i): i is ReplyItem => i.kind === "reply" && written.has(i.id) && i.text.trim() !== "").map((i) => i.text);
        if (texts.length > 0) deps.onReplied?.({ sessionId, texts });
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) push({ kind: "error", message: NOT_ANSWERED });
    } finally {
      if (controller === mine) {
        running.value = false;
        // A finished answer is left to be said out; an aborted one (cancel, a new conversation) stops at once.
        if (mine.signal.aborted) hush();
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
    hush();
    sessionId = undefined;
    items.value = [];
    held.clear();
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

  /**
   * A page's Generate button: the generator's card, opened with its starting inputs and no model call. Unlike a
   * proposal from the model, the DM writes the concept into the card themselves.
   */
  function openGenerator({ generatorId, inputs, target, concept }: PendingGenerator) {
    const generator = askGenerator(generatorId);
    if (!generator) return;
    push({
      kind: "proposal",
      state: "quote",
      choices: {},
      origin: "button",
      proposal: {
        proposalId: crypto.randomUUID(),
        generator: generatorId,
        concept: concept ?? "",
        inputs: { ...generator.opened, ...inputs },
        ...(target ? { target } : {}),
      },
    });
  }

  /** A quote is edited freely; a generation held for a yes may be opened again to change an option before "Again". */
  function isEditable(item: Extract<AskItem, { kind: "proposal" }>): boolean {
    return item.state === "quote" || item.state === "previewing";
  }

  /** The DM's words in the card's concept box. */
  function setConcept(itemId: number, concept: string) {
    const item = find(itemId, "proposal");
    if (!item || !isEditable(item)) return;
    item.proposal = { ...item.proposal, concept };
  }

  function adjust(itemId: number, inputs: Record<string, unknown>) {
    const item = find(itemId, "proposal");
    if (!item || !isEditable(item)) return;
    item.proposal = { ...item.proposal, inputs };
  }

  /** A yes or no on a line of the quote. Only while it is a quote: a running or finished one has already been decided. */
  function decide(itemId: number, key: string, on: boolean) {
    const item = find(itemId, "proposal");
    if (!item || !isEditable(item)) return;
    item.choices = { ...item.choices, [key]: on };
  }

  function cancel(itemId: number) {
    const item = find(itemId, "proposal");
    if (item?.state === "quote") item.state = "cancelled";
  }

  async function confirm(itemId: number) {
    await launch(itemId, "run");
  }

  /** The card's "Quick create": the generator's no-AI route, which asks no model and spends nothing. */
  async function quick(itemId: number) {
    await launch(itemId, "quick");
  }

  async function launch(itemId: number, how: "run" | "quick") {
    const item = find(itemId, "proposal");
    if (item?.state !== "quote") return;
    const { proposal } = item;
    // The answers as they stand at the press: a change after it cannot reach a run already under way.
    const choices = { ...item.choices };
    const generator = askGenerator(proposal.generator);
    const adapter = deps.adapters.adapterFor(proposal.generator);
    if (!generator || !adapter) return;
    let confirmed: string;
    if (how === "quick") {
      // No quote to wait for: nothing is priced, so a credit or quota block on the AI route does not apply.
      if (!adapter.quick) return;
      confirmed = `You chose: Quick create, no AI`;
    } else {
      const quote = adapter.quote(proposal, choices);
      // The button is disabled in these states; the guard is for a press that races a re-quote.
      if (quote.block !== null) return;
      const price = quote.total === null ? null : creditsText(quote.total);
      if (price === null) return;
      confirmed = `You confirmed: ${generator.action} · ${price}`;
    }
    if (ran.has(proposal.proposalId)) return;
    ran.add(proposal.proposalId);
    item.state = "running";
    push({ kind: "confirmed", text: confirmed });
    const startedAt = deps.routePath();
    const campaignName = deps.campaignName();
    const mine = epoch;
    let result: AskRunResult;
    try {
      if (how === "run" && isPreviewAdapter(adapter)) {
        const outcome = await adapter.preview(proposal, choices);
        if (outcome.ok) {
          item.credits = partsCredits(outcome.preview.parts);
          item.state = "previewing";
          // A new conversation while it generated leaves no thread to show it in: nothing is kept for it.
          if (mine === epoch) {
            const card = push({ kind: "preview", proposalItemId: item.id, phase: "ready", shown: outcome.preview.shown, rows: {} });
            held.set(card.id, { preview: outcome.preview, proposalItemId: item.id, startedAt, campaignName });
          }
          return;
        }
        result = outcome.result;
      } else if (how === "quick" && adapter.quick) {
        result = await adapter.quick(proposal, choices);
      } else if (!isPreviewAdapter(adapter)) {
        result = await adapter.run(proposal, choices);
      } else {
        return;
      }
    } catch {
      item.state = "failed";
      // Whether it ran is unknown, so the id stays in `ran`: it is never run a second time on a guess.
      if (mine === epoch) item.landedAt = push({ kind: "error", message: "That did not finish. Check the list before asking again." }).id;
      return;
    }
    item.credits = partsCredits(result.parts);
    land(item, result, { mine, startedAt, campaignName, credits: item.credits });
  }

  /** A finished run's end: its result lands at the bottom of the thread (unless the thread was started over) and the panel is told. */
  function land(
    item: Extract<AskItem, { kind: "proposal" }>,
    result: AskRunResult,
    from: { mine: number; startedAt: string; campaignName: string; credits: number },
  ) {
    const generator = askGenerator(item.proposal.generator);
    if (!generator) return;
    item.state = "done";
    const name = result.record?.name ?? generator.action;
    const review = generator.ending === "review";
    if (from.mine === epoch) {
      item.landedAt = push({ kind: "result", name, noun: generator.noun, review, record: result.record, route: result.route, ...(result.links ? { links: result.links } : {}), ...(result.open ? { open: result.open } : {}), ...(result.picture ? { picture: result.picture } : {}), parts: result.parts.map((p) => ({ ...p })) }).id;
    }
    deps.onFinished?.({ name, noun: generator.noun, review, route: result.route, ...(result.open ? { open: result.open } : {}), credits: from.credits, campaign: from.campaignName, startedAt: from.startedAt });
  }

  /** What a failed part says, for a save that did not happen. */
  function failureOf(result: AskRunResult): string {
    return result.parts.find((p) => !p.ok && p.error)?.error ?? "It could not be saved.";
  }

  /**
   * Create on a held generation: saves it, then the usual result. Nothing is charged here (the generation was).
   * `phase` is the guard: a second press, or a press while "Again" runs, finds it no longer `ready` and does nothing,
   * so one preview makes one record.
   */
  async function createPreview(previewId: number) {
    const card = find(previewId, "preview");
    const keep = held.get(previewId);
    if (!card || !keep || card.phase !== "ready") return;
    // A row's own press is still under way: its record would be missing from what Create summarises.
    if (Object.values(card.rows).some((r) => r.phase === "running")) return;
    const item = find(keep.proposalItemId, "proposal");
    if (!item) return;
    card.phase = "saving";
    card.error = undefined;
    const mine = epoch;
    let result: AskRunResult;
    try {
      result = await keep.preview.create();
    } catch {
      // Whether it saved is unknown, so there is no second press: the DM checks the list.
      card.phase = "failed";
      card.error = "That did not finish. Check the list before asking again.";
      return;
    }
    if (result.record === null) {
      // Nothing was saved: the preview stays, and Create can be pressed again.
      card.phase = "ready";
      card.error = failureOf(result);
      return;
    }
    card.phase = "saved";
    held.delete(previewId);
    land(item, result, { mine, startedAt: keep.startedAt, campaignName: keep.campaignName, credits: item.credits ?? partsCredits(result.parts) });
  }

  /**
   * "Again": a deliberate new generation from the same inputs (as the DM has them now), at the quote's price. It has
   * its own guard, the phase: while it runs the card is not `ready`, so a double press is one generation. It replaces
   * what was shown; what the earlier one cost stays spent and is added to the folded line.
   */
  async function againPreview(previewId: number) {
    const card = find(previewId, "preview");
    const keep = held.get(previewId);
    if (!card || !keep || card.phase !== "ready") return;
    const item = find(keep.proposalItemId, "proposal");
    const adapter = item ? deps.adapters.adapterFor(item.proposal.generator) : undefined;
    if (!item || !adapter || !isPreviewAdapter(adapter)) return;
    // The gates again: a balance spent since, or a plan limit reached, says no before a second charge.
    const quote = adapter.quote(item.proposal, item.choices);
    if (quote.block !== null || quote.total === null) {
      card.error = quote.block?.message ?? "The price is not known yet.";
      return;
    }
    card.phase = "again";
    card.error = undefined;
    let outcome;
    try {
      outcome = await adapter.preview(item.proposal, { ...item.choices });
    } catch {
      card.phase = "ready";
      card.error = "That did not finish. Check your credits before asking again.";
      return;
    }
    if (!outcome.ok) {
      card.phase = "ready";
      card.error = failureOf(outcome.result);
      return;
    }
    item.credits = (item.credits ?? 0) + partsCredits(outcome.preview.parts);
    held.set(previewId, { ...keep, preview: outcome.preview });
    card.shown = outcome.preview.shown;
    card.rows = {};
    card.phase = "ready";
  }

  /**
   * A press on one row of the held generation ("Create quest" on a hook, "Said it" on a line). The row's own state is
   * the guard: a second press while it runs, or after it is done, finds it taken and does nothing, so one row makes
   * one record. The preview stays `ready`, so the other rows can be pressed; a failed row says why and may be pressed
   * again. Credits a row spends are added to the folded line, as an "Again" adds its own.
   */
  async function actOnRow(previewId: number, section: number, row: number) {
    const card = find(previewId, "preview");
    const keep = held.get(previewId);
    if (!card || !keep || card.phase !== "ready") return;
    const key = previewRowKey(section, row);
    const state = card.rows[key];
    if (state?.phase === "running" || state?.phase === "done") return;
    const action = card.shown.sections[section]?.rows[row]?.action;
    if (!action) return;
    card.rows[key] = { phase: "running" };
    const mine = epoch;
    let part: Awaited<ReturnType<typeof action.run>>;
    try {
      part = await action.run();
    } catch {
      if (mine !== epoch) return;
      card.rows[key] = { phase: "failed", error: "That did not finish. Check the list before pressing again." };
      return;
    }
    if (mine !== epoch) return;
    if (!part.ok) {
      card.rows[key] = { phase: "failed", error: part.error ?? "That did not work." };
      return;
    }
    const item = find(keep.proposalItemId, "proposal");
    if (item && part.credits > 0) item.credits = (item.credits ?? 0) + part.credits;
    card.rows[key] = { phase: "done", doneLabel: action.doneLabel, ...(part.links ? { links: part.links } : {}), ...(part.error ? { error: part.error } : {}) };
  }

  /** A choice on a row of the held generation (a creature's version): the preview records it and `create` saves it. */
  function choosePreview(previewId: number, key: string, value: string) {
    const card = find(previewId, "preview");
    const keep = held.get(previewId);
    if (!card || !keep || card.phase !== "ready" || !keep.preview.choose) return;
    card.shown = keep.preview.choose(key, value);
  }

  /** Discard: ends the held generation with nothing saved. What it cost is spent; the card says so. */
  function discardPreview(previewId: number) {
    const card = find(previewId, "preview");
    const keep = held.get(previewId);
    if (!card || !keep || card.phase !== "ready") return;
    card.phase = "discarded";
    held.delete(previewId);
    const item = find(keep.proposalItemId, "proposal");
    if (item) item.state = "discarded";
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

  return { items, running, generating, holding, speaking, freeLeft, send, choose, newConversation, handOff, openGenerator, setConcept, adjust, decide, cancel, confirm, quick, createPreview, actOnRow, againPreview, discardPreview, choosePreview, retryPart, leavePart };
}
