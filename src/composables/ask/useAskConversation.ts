/**
 * Ask Grimoire (#1253): one conversation with the `ask-turn` function, and what the DM does with what it proposes.
 *
 * The model never runs a generator. A `propose` event becomes a quote card; only the DM's press on it calls the
 * adapter's `run`, once per `proposalId` (`ran` is the guard: a second press, a re-render or a remount of the card
 * cannot make a second record). Lives in the panel's scope, which stays mounted while the panel is merely hidden,
 * so a running turn or generation carries on.
 */
import { reactive, ref, watch } from "vue";
import { restoredItems, type StoredTurn } from "@/lib/ask/askRestore";
import { creditsText } from "@/lib/ask/askCredits";
import {
  ASK_OFF_TOPIC_MESSAGE,
  ASK_REFUSALS,
  askGenerator,
  type AskChoice,
  type AskContext,
  type AskRecordRef,
  type AskTurnBody,
} from "@edge-shared/agent/askContract";
import { readEventStream } from "@/lib/agentStream/readEventStream";
import { parseAskEvent } from "@/lib/agentStream/parseAskEvent";
import { isPreviewAdapter, type AskRunResult } from "@/lib/ask/askAdapter";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import { BIND_RECORD_TYPE, type AskBinder } from "@/lib/ask/askBind";
import type { PendingGenerator } from "@/stores/ui/ask";
import { sendToAskTurn, type AskTransport } from "./askTransport";
import { findItem, partsCredits, quickWaitsOnLoad, type AskItem, type AskThreadState, type NewItem, type ReplyItem } from "./askItems";
import { useAskInterview } from "./useAskInterview";
import { useAskPreviews } from "./useAskPreviews";
import { useAskWalk, type AskWalkPorts } from "./useAskWalk";
import { useAskWalkPorts } from "./useAskWalkPorts";
import { WALK_WAY_QUESTION } from "@/lib/ask/askWalkCopy";

export { previewRowKey, type AskItem, type ResultPart } from "./askItems";

function dedupeRecords(records: AskRecordRef[]): AskRecordRef[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.type}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
  /**
   * The DM's latest conversation in a campaign, to bring back into an empty thread after a reload: its session and
   * stored turns, or null when there is none. Read through the caller's own rows.
   */
  restore?: (campaignId: string) => Promise<{ sessionId: string; turns: StoredTurn[] } | null>;
  /** What "Design it with me" (#1282) reads and writes the canon through; the panel's own canon queries when left out. */
  walk?: AskWalkPorts;
  /** Ties a made record to what a page's card asked (`AskBind`); without it a card's bind is ignored. */
  bind?: AskBinder;
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
  /**
   * One thread per campaign, kept for the session: a conversation belongs to its campaign, so switching away parks it
   * (its held previews with it) and switching back restores it. `items` is always the one on screen.
   */
  const threads = new Map<string, AskThreadState>();
  const keyOf = (): string => deps.campaignId() ?? "";
  function freshThread(): AskThreadState {
    const thread: AskThreadState = { campaignId: keyOf(), items: reactive<AskItem[]>([]) as AskItem[], held: new Map(), sessionId: undefined };
    threads.set(thread.campaignId, thread);
    return thread;
  }
  let current = freshThread();
  const items = ref<AskItem[]>(current.items);

  /**
   * Fills a fresh thread with its campaign's last conversation, so a reload does not lose it. Only into a thread that
   * is still its campaign's, still empty and has not begun a turn of its own: a DM who typed before it arrived keeps
   * what they typed. New conversation does not call this: starting fresh is what it is for.
   */
  async function restoreInto(thread: AskThreadState): Promise<void> {
    if (!deps.restore || thread.campaignId === "") return;
    let found: { sessionId: string; turns: StoredTurn[] } | null = null;
    try {
      found = await deps.restore(thread.campaignId);
    } catch {
      return;
    }
    if (found === null || !alive(thread) || thread.items.length > 0 || thread.sessionId !== undefined) return;
    thread.sessionId = found.sessionId;
    for (const item of restoredItems(found.turns)) pushTo(item.kind === "reply" ? { ...item, who: null } : item, thread);
  }
  void restoreInto(current);
  /** A thread is live while it is still its campaign's: starting over replaces it, and a late result then writes nothing into it. */
  const alive = (thread: AskThreadState) => threads.get(thread.campaignId) === thread;
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
  let controller: AbortController | null = null;
  let nextId = 1;
  const ran = new Set<string>();
  const retrying = new Set<string>();
  const previews = useAskPreviews({
    items,
    thread: () => current,
    alive,
    adapters: deps.adapters,
    land: (thread, item, result, from) => land(thread, item, result, from),
  });
  const { generating, holding } = previews;

  /** Adds to a thread (the one on screen unless a run that started in another says so). */
  function pushTo(item: NewItem, thread: AskThreadState = current): AskItem {
    thread.items.push({ ...item, id: nextId++ } as AskItem);
    // Return the reactive proxy, so a later mutation of it reaches the screen.
    return thread.items[thread.items.length - 1] as AskItem;
  }

  // The scripted walk through the canon: its questions and blocks are items of this thread.
  const walk = useAskWalk({ items, thread: () => current, alive, push: pushTo, ports: deps.walk ?? useAskWalkPorts() });

  const push = pushTo;

  // The other way through it: the DM tells their story and the Familiar interviews. Every turn carries its mode.
  const interview = useAskInterview({ items, push: (item) => pushTo(item) });

  /** "Design it with me" first asks how: the chips below it start the walk or the interview. No model is asked. */
  function offerWays() {
    if (walk.active.value || interview.active.value) return;
    push({ kind: "walk-choose", text: WALK_WAY_QUESTION, answered: false });
  }

  /** The DM's pick of a way. Once: a second press, or a pick after the chips went quiet, starts nothing. */
  function chooseWay(itemId: number, way: "sections" | "story") {
    const item = find(itemId, "walk-choose");
    if (!item || item.answered) return;
    item.answered = true;
    if (way === "sections") void walk.start();
    else interview.start();
  }

  function find<K extends AskItem["kind"]>(id: number, kind: K): Extract<AskItem, { kind: K }> | undefined {
    return findItem(current.items, id, kind);
  }

  async function streamTurn(message: string) {
    const campaignId = deps.campaignId();
    // The thread this turn was asked in: every write goes here, never to whichever thread is on screen later.
    const thread = current;
    const push = (item: NewItem): AskItem => pushTo(item, thread);
    if (campaignId === null) {
      push({ kind: "error", message: "Pick a campaign first, then ask." });
      return;
    }
    const body: AskTurnBody = { campaignId, message, context: deps.context(), ...(interview.active.value ? { mode: "interview" as const } : {}), ...(thread.sessionId ? { sessionId: thread.sessionId } : {}) };
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
      if (mine.signal.aborted) return;
      if (!response.ok) {
        let parsed: unknown = null;
        try {
          parsed = await response.json();
        } catch {
          // A refusal that is not JSON (a gateway's page) still says no.
        }
        if (mine.signal.aborted) return;
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
        // A cancel or a campaign switch ends the turn: events already buffered write nothing.
        if (mine.signal.aborted) return;
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
            thread.sessionId = event.sessionId;
            break;
          case "ask":
            reply = null;
            push({ kind: "ask", question: event.question, choices: event.choices, answered: false });
            break;
          case "read":
            if (event.records.length > 0) {
              // The server reports each tool call on its own, so one answer arrives as "Read 1", "Read 1", "Read 5".
              // A read straight after another of this turn joins it: the DM sees one line per answer.
              const last = thread.items.at(-1);
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
              thread.items.splice(0, thread.items.length, ...thread.items.filter((i) => !written.has(i.id)));
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
      const spoken = thread.sessionId;
      if (ended && !withheld && !mine.signal.aborted && spoken !== undefined) {
        const texts = thread.items.filter((i): i is ReplyItem => i.kind === "reply" && written.has(i.id) && i.text.trim() !== "").map((i) => i.text);
        if (texts.length > 0) deps.onReplied?.({ sessionId: spoken, texts });
      }
    } catch (e) {
      if (!mine.signal.aborted && !(e instanceof DOMException && e.name === "AbortError")) push({ kind: "error", message: NOT_ANSWERED });
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
    // The walk's words never start a turn: an answer to its question is the section's, and words typed over a draft
    // change that draft.
    if (walk.awaiting.value !== null) {
      walk.answer(message);
      return;
    }
    const drafted = walk.draftedBlock.value;
    if (drafted !== null) {
      await walk.again(drafted.id, message);
      return;
    }
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

  /** Stops what is streaming and speaking: a turn belongs to the thread it was asked in and does not follow a switch. */
  function stopTurn() {
    controller?.abort();
    controller = null;
    running.value = false;
    hush();
    // The allowance line goes back to the server's row: an own-key turn had streamed 0.
    freeLeft.value = null;
  }

  /** Starts over in this campaign: the thread is replaced, so anything still running for the old one lands nowhere. */
  function newConversation() {
    stopTurn();
    walk.leave();
    interview.leave();
    current = freshThread();
    items.value = current.items;
  }

  // A conversation belongs to one campaign: its session is that campaign's, and a quote confirmed after a switch
  // would run in the other. The thread is parked, held previews and all, and comes back when the DM does. A run or an
  // "Again" already under way keeps going and lands in the thread it started in.
  watch(() => deps.campaignId(), () => {
    stopTurn();
    walk.leave();
    interview.leave();
    const parked = threads.get(keyOf());
    current = parked ?? freshThread();
    items.value = current.items;
    if (parked === undefined) void restoreInto(current);
  });

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
  function openGenerator({ generatorId, inputs, target, concept, bind }: PendingGenerator) {
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
      ...(bind ? { bind } : {}),
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
    const first = find(itemId, "proposal");
    if (first?.state !== "quote") return;
    // The card is drawn only once its adapter is here, so this is a plain read; the wait is for a press that beats the load.
    let adapter = deps.adapters.adapterFor(first.proposal.generator);
    if (!adapter) {
      adapter = await deps.adapters.loadAdapter(first.proposal.generator);
      // Look again after the wait: a second press, a cancel or a new conversation may have got in first.
    }
    const item = find(itemId, "proposal");
    if (item?.state !== "quote") return;
    const { proposal } = item;
    // The answers as they stand at the press: a change after it cannot reach a run already under way.
    const choices = { ...item.choices };
    const generator = askGenerator(proposal.generator);
    if (!generator || !adapter) return;
    let confirmed: string;
    if (how === "quick") {
      // Nothing is priced, so a credit or quota block on the AI route does not apply. What the quote is still reading
      // does: a press before the people and places have loaded would drop the ids they resolve.
      if (!adapter.quick) return;
      if (quickWaitsOnLoad(adapter.quote(proposal, choices))) return;
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
    const thread = current;
    let result: AskRunResult;
    try {
      if (how === "run" && isPreviewAdapter(adapter)) {
        const outcome = await adapter.preview(proposal, choices);
        if (outcome.ok) {
          item.credits = partsCredits(outcome.preview.parts);
          item.state = "previewing";
          // A new conversation while it generated leaves no thread to show it in: nothing is kept for it. A campaign
          // switch does not: the preview waits in its own thread.
          if (alive(thread)) {
            const card = push({ kind: "preview", proposalItemId: item.id, phase: "ready", shown: outcome.preview.shown, rows: {} }, thread);
            thread.held.set(card.id, { preview: outcome.preview, proposalItemId: item.id, startedAt, campaignName });
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
      if (alive(thread)) item.landedAt = push({ kind: "error", message: "That did not finish. Check the list before asking again." }, thread).id;
      return;
    }
    item.credits = partsCredits(result.parts);
    land(thread, item, result, { startedAt, campaignName, credits: item.credits });
  }

  /** A finished run's end: its result lands at the bottom of the thread (unless the thread was started over) and the panel is told. */
  function land(
    thread: AskThreadState,
    item: Extract<AskItem, { kind: "proposal" }>,
    result: AskRunResult,
    from: { startedAt: string; campaignName: string; credits: number },
  ) {
    const generator = askGenerator(item.proposal.generator);
    if (!generator) return;
    item.state = "done";
    const name = result.record?.name ?? generator.action;
    const review = generator.ending === "review";
    if (alive(thread)) {
      item.landedAt = push({ kind: "result", name, noun: generator.noun, review, record: result.record, route: result.route, ...(result.links ? { links: result.links } : {}), ...(result.open ? { open: result.open } : {}), ...(result.picture ? { picture: result.picture } : {}), parts: result.parts.map((p) => ({ ...p })) }, thread).id;
    }
    void tie(thread, item, result);
    deps.onFinished?.({ name, noun: generator.noun, review, route: result.route, ...(result.open ? { open: result.open } : {}), credits: from.credits, campaign: from.campaignName, startedAt: from.startedAt });
  }

  /**
   * A card a page opened may ask for its record to be tied to something on that page. Done once, when a record of the
   * type that bind takes lands; the card is told how it went. A failure leaves the record made.
   */
  async function tie(thread: AskThreadState, item: Extract<AskItem, { kind: "proposal" }>, result: AskRunResult) {
    const bind = item.bind;
    const record = result.record;
    if (!bind || !record || !deps.bind || record.type !== BIND_RECORD_TYPE[bind.kind]) return;
    let bound: { ok: boolean; text: string };
    try {
      bound = await deps.bind(bind, record);
    } catch {
      bound = { ok: false, text: `${record.name} was made, but it could not be tied to ${bind.formLabel}. Try it from the form in the Field guide.` };
    }
    const landed = item.landedAt === undefined ? undefined : findItem(thread.items, item.landedAt, "result");
    if (landed) landed.bound = bound;
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

  /** The conversation's id on the server once its first turn has begun (what Ooru's clips are kept under), read when asked. */
  const sessionId = (): string | null => current.sessionId ?? null;

  return { items, running, sessionId, walk, interview, offerWays, chooseWay, generating, holding, speaking, freeLeft, send, choose, newConversation, handOff, openGenerator, setConcept, adjust, decide, cancel, confirm, quick, createPreview: previews.createPreview, actOnRow: previews.actOnRow, againPreview: previews.againPreview, discardPreview: previews.discardPreview, choosePreview: previews.choosePreview, retryPart, leavePart };
}
