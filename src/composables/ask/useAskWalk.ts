/**
 * "Design it with me" inside the Familiar (#1282): the engine of a scripted walk through the canon. The Familiar asks one
 * question per stop, the DM answers in a sentence or two, and the answer becomes a section block with three ways on:
 * write it as it stands (no model), enhance it with AI (priced, gated, one helper call) or skip. Only Enhance calls a
 * model, and an answer typed while the walk waits for one goes to the walk, never to a chat turn.
 *
 * State lives in the thread (the question and block items) and here (which stop is asked, which are done this walk).
 * The canon itself is the walk's memory: a stop is filled because the canon says so, and `handled` only covers the
 * moment between a write and the refetch that shows it.
 */
import { creditsText } from "@/lib/ask/askCredits";
import { computed, ref, watch } from "vue";
import {
  draftHeldBecause, followUpOf, isThin, questionOf, sameStop, stepOf, stopKey, walkScope,
  type WalkDraft, type WalkState, type WalkStop, type WalkStopRef,
} from "@/lib/canon/canonWalk";
import { findItem, type AskItem, type AskThreadState, type NewItem } from "./askItems";

type BlockItem = Extract<AskItem, { kind: "walk-block" }>;
type QuestionItem = Extract<AskItem, { kind: "walk-question" }>;

/** What the engine reaches the canon and the helpers through, so it holds no query of its own. */
export interface AskWalkPorts {
  /** Every stop, in order, with its state from the canon. */
  stops: () => WalkStop[];
  /** The canon, its clues, passages and skips are in: a walk begun before would read a canon on its way as empty. */
  loaded: () => boolean;
  pitchWritten: () => boolean;
  /** Stores a section's skip. Throws on failure. */
  skip: (step: WalkStop["step"]) => Promise<void>;
  /** "Write it myself" (`writeWalk`). Throws on failure, with a sentence for the DM. */
  write: (stop: WalkStopRef, text: string, options: { replace: boolean }) => Promise<void>;
  /** What the helper costs; null while the price is not known. */
  price: (draft: WalkDraft) => number | null;
  /** Why the gilt button may not run at that price (AI off, plan, balance), or null. Spends nothing. */
  blockedBy: (total: number | null) => string | null;
  /** Another generation is running somewhere in the app. */
  busy: () => boolean;
  /** One helper call. Proposals are kept by the helper under `scope`, to be reviewed there. */
  draft: (request: { draft: WalkDraft; scope: string; steer: string; /** What the DM said, unchanged: empty for "you decide". */ answer: string; stop: WalkStopRef }) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface AskWalkDeps {
  items: { value: AskItem[] };
  thread: () => AskThreadState;
  alive: (thread: AskThreadState) => boolean;
  push: (item: NewItem, thread?: AskThreadState) => AskItem;
  ports: AskWalkPorts;
}

/** What Enhance is told when the DM said nothing ("you decide"): the helper has the pitch and the canon to go on. */
export const NO_ANSWER_STEER = "Write this from the pitch and what the canon already holds.";

/** The walk's opening, with what a draft costs said once here rather than on every button (a cheap one carries none). */
export function introText(draftPrice: number | null): string {
  const price = draftPrice === null ? "" : ` Each draft I write costs ${creditsText(draftPrice)}; the line above keeps the running total.`;
  return "Let's design your campaign together. I will ask one question for each part of the canon. Answer in your own words: the more you tell me, the more the draft will sound like your idea. " +
    `Then you choose: write it yourself, let me write it, or skip it.${price} Pressing Next section when you have nothing more to add tells me that part is done.`;
}
const PITCH_NEEDED = "The pitch is needed before anything else can be drafted.";
const CLOSING = "That is every part of the canon written or skipped. Open any chapter to carry on, or ask me for more whenever you like.";
const BUSY = "Another generation is running. Wait for it to finish, then try again.";
const PRICE_UNKNOWN = "The price is not known yet. Try again in a moment.";

export function useAskWalk(deps: AskWalkDeps) {
  const { ports } = deps;
  const active = ref(false);
  /** The stop the Familiar is asking about, or the one the DM last jumped to. */
  const current = ref<WalkStopRef | null>(null);
  const awaitingId = ref<number | null>(null);
  /** Stops finished in this walk: covers the moment between a write and the refetch that shows it. */
  /** Stops that have had their follow-up this walk: one each, however the DM answers it. */
  const followedUp = new Set<string>();
  /** What the DM first said at a stop that was then asked its follow-up: the follow-up's answer is joined to it. */
  const firstAnswers = new Map<string, string>();
  const handled = ref(new Map<string, Extract<WalkState, "filled" | "skipped">>());
  /** What the DM asked to change on a block, in order, so each "Again" keeps the earlier changes. */
  const changes = new Map<number, string[]>();

  const awaiting = computed<WalkStopRef | null>(() => {
    const id = awaitingId.value;
    if (id === null) return null;
    return findItem(deps.items.value, id, "walk-question")?.stop ?? null;
  });

  const progress = computed(() =>
    ports.stops().map((s) => ({
      ...s,
      state: handled.value.get(stopKey(s)) ?? s.state,
      current: current.value !== null && sameStop(s, current.value),
    })),
  );

  /** The newest block, when it holds a draft waiting for its review: typed words then change that draft. */
  const draftedBlock = computed<BlockItem | null>(() => {
    if (!active.value) return null;
    const last = [...deps.items.value].reverse().find((i): i is BlockItem => i.kind === "walk-block");
    return last?.phase === "drafted" ? last : null;
  });

  const block = (id: number): BlockItem | undefined => findItem(deps.thread().items, id, "walk-block");

  function closeOpenQuestion() {
    const id = awaitingId.value;
    if (id === null) return;
    const q = findItem(deps.thread().items, id, "walk-question");
    if (q) q.answered = true;
    awaitingId.value = null;
  }

  /** A stop as the thread keeps it: its place and name, never the state a progress row carries. */
  const refOf = (s: WalkStopRef): WalkStopRef => ({ step: s.step, memberId: s.memberId, memberName: s.memberName });

  /**
   * Settles every block still open as the walk moves on: kept if its section is now filled, else left. Without this the
   * Pitch's block kept its Again and Next (and its proposals) while the Familiar asked about Themes (live run, 26 Nov
   * 2026), and typed words could still be read as a change to it. A block with a write or draft under way finishes first.
   */
  function settleBlocks() {
    for (const item of deps.thread().items) {
      if (item.kind !== "walk-block" || !(item.phase === "open" || item.phase === "drafted" || item.phase === "failed")) continue;
      const filled = progress.value.some((s) => sameStop(s, item.stop) && s.state === "filled");
      item.phase = filled ? "saved" : "left";
      item.error = undefined;
    }
  }

  function ask(place: WalkStopRef) {
    closeOpenQuestion();
    settleBlocks();
    const stop = refOf(place);
    current.value = stop;
    const item = deps.push({ kind: "walk-question", stop, text: questionOf(stop), answered: false }) as QuestionItem;
    awaitingId.value = item.id;
  }

  /** The stop's follow-up, asked in place of the block: a new question, so the composer takes the focus again. */
  function askFollowUp(place: WalkStopRef, first: string) {
    closeOpenQuestion();
    settleBlocks();
    const stop = refOf(place);
    current.value = stop;
    followedUp.add(stopKey(stop));
    firstAnswers.set(stopKey(stop), first);
    const item = deps.push({ kind: "walk-question", stop, text: followUpOf(stop), answered: false, followUp: true }) as QuestionItem;
    awaitingId.value = item.id;
  }

  /** The first stop after `from` (wrapping round) that is still to do, or null when none is. */
  function nextTodo(from: WalkStopRef | null): WalkStop | null {
    const all = progress.value;
    const at = from === null ? -1 : all.findIndex((s) => sameStop(s, from));
    const order = [...all.slice(at + 1), ...all.slice(0, Math.max(at, 0))];
    return order.find((s) => s.state === "todo") ?? null;
  }

  function finish() {
    closeOpenQuestion();
    settleBlocks();
    active.value = false;
    current.value = null;
    deps.push({ kind: "reply", text: CLOSING, who: null });
  }

  /** Asks the next stop still to do, or ends the walk with its closing words. */
  function next() {
    if (!active.value) return;
    const stop = nextTodo(current.value);
    if (stop === null) finish();
    else ask(stop);
  }

  function whenLoaded(): Promise<void> {
    if (ports.loaded()) return Promise.resolve();
    return new Promise((resolve) => {
      const stop = watch(() => ports.loaded(), (ok) => {
        if (!ok) return;
        stop();
        resolve();
      }, { immediate: true });
    });
  }

  async function start() {
    if (active.value) return;
    active.value = true;
    handled.value = new Map();
    followedUp.clear();
    firstAnswers.clear();
    deps.push({ kind: "reply", text: introText(ports.price({ mode: "truths" })), who: null });
    await whenLoaded();
    // A new conversation while the canon loaded ended the walk: nothing is asked into a thread that is gone.
    if (!active.value) return;
    next();
  }

  function leave() {
    closeOpenQuestion();
    settleBlocks();
    active.value = false;
    current.value = null;
    handled.value = new Map();
    followedUp.clear();
    firstAnswers.clear();
    changes.clear();
  }

  /** The DM's words at a waiting question become the section block. */
  function toBlock(answer: string) {
    const stop = awaiting.value;
    if (stop === null) return;
    closeOpenQuestion();
    deps.push({ kind: "walk-block", stop, answer, phase: "open" });
  }

  function answer(text: string) {
    const words = text.trim();
    const stop = awaiting.value;
    if (words === "" || stop === null) return;
    deps.push({ kind: "user", text: words });
    const key = stopKey(stop);
    const question = findItem(deps.items.value, awaitingId.value ?? -1, "walk-question");
    // The follow-up's answer is added to the first one, and the block opens with both.
    if (question?.followUp === true) return toBlock([firstAnswers.get(key) ?? "", words].filter((w) => w !== "").join("\n\n"));
    // A thin answer gives the helper little to go on: ask once more, whatever the section, before anything is drafted.
    if (isThin(words) && !followedUp.has(key)) return askFollowUp(stop, words);
    toBlock(words);
  }

  /** "Just give me ideas" on a follow-up: the block opens now, with what the DM already said. */
  function justIdeas() {
    const stop = awaiting.value;
    if (stop === null) return;
    toBlock(firstAnswers.get(stopKey(stop)) ?? "");
  }

  /** "You decide": no words, so Enhance drafts from the pitch and the canon alone (and Write it myself has nothing to write). */
  function youDecide() {
    toBlock("");
  }

  const busyPhase = (b: BlockItem) => b.phase === "saving" || b.phase === "drafting";

  async function writeMyself(blockId: number, text: string, options: { replace?: boolean } = {}) {
    const thread = deps.thread();
    const b = block(blockId);
    if (!b || busyPhase(b) || b.phase === "saved" || b.phase === "skipped") return;
    b.answer = text;
    b.phase = "saving";
    delete b.error;
    try {
      await ports.write(b.stop, text, { replace: options.replace === true });
    } catch (e) {
      if (!deps.alive(thread)) return;
      b.phase = "failed";
      b.error = e instanceof Error ? e.message : "That could not be saved.";
      return;
    }
    if (!deps.alive(thread)) return;
    b.phase = "saved";
    handled.value.set(stopKey(b.stop), "filled");
    // Asked next from the stop just written, wherever the walk had been jumped from.
    current.value = b.stop;
    next();
  }

  /** One helper call for a block, with the steer it is given. */
  async function runDraft(b: BlockItem, steer: string) {
    const thread = deps.thread();
    const fail = (message: string) => {
      b.phase = "failed";
      b.error = message;
    };
    if (busyPhase(b)) return;
    delete b.error;
    const step = stepOf(b.stop.step);
    const held = draftHeldBecause(step, ports.pitchWritten());
    if (held !== null || step.draft === null) return fail(held ?? "There is nothing to draft here.");
    const draft = step.draft;
    // Nothing is spent unless the gate says yes, and a second generation never starts beside the first.
    const total = ports.price(draft);
    if (total === null) return fail(PRICE_UNKNOWN);
    const blocked = ports.blockedBy(total);
    if (blocked !== null) return fail(blocked);
    if (ports.busy() || deps.items.value.some((i) => i.kind === "walk-block" && i.phase === "drafting")) return fail(BUSY);
    b.phase = "drafting";
    const result = await ports.draft({ draft, scope: walkScope(b.stop), steer, answer: b.answer.trim(), stop: b.stop });
    if (!deps.alive(thread)) return;
    if (!result.ok) return fail(result.error);
    b.credits = (b.credits ?? 0) + total;
    b.phase = "drafted";
  }

  async function enhance(blockId: number, text?: string) {
    const b = block(blockId);
    if (!b || b.phase === "saved" || b.phase === "skipped" || b.phase === "drafted") return;
    if (text !== undefined) b.answer = text;
    // The pitch is the DM's words written out: with none, the helper would offer the walk's own steer as the pitch.
    if (b.stop.step === "pitch" && b.answer.trim() === "") {
      b.phase = "failed";
      b.error = "Tell me about your campaign first, and I will write the pitch from it.";
      return;
    }
    await runDraft(b, b.answer.trim() === "" ? NO_ANSWER_STEER : b.answer.trim());
  }

  /** Drafts again: what the DM typed while the draft waited is added to the steer, after the answer and earlier changes. */
  async function again(blockId: number, change?: string) {
    const b = block(blockId);
    if (!b || (b.phase !== "drafted" && b.phase !== "failed")) return;
    const said = change?.trim() ?? "";
    if (said !== "") {
      deps.push({ kind: "user", text: said });
      changes.set(blockId, [...(changes.get(blockId) ?? []), said]);
    }
    const base = b.answer.trim() === "" ? NO_ANSWER_STEER : b.answer.trim();
    const steer = [base, ...(changes.get(blockId) ?? []).map((c) => `Change: ${c}`)].join("\n");
    await runDraft(b, steer);
  }

  async function skip(stop: WalkStopRef) {
    if (stop.step === "pitch") return;
    const thread = deps.thread();
    if (stop.memberId === null) {
      try {
        await ports.skip(stop.step);
      } catch (e) {
        if (deps.alive(thread)) deps.push({ kind: "error", message: e instanceof Error ? e.message : "That could not be skipped. Try again." }, thread);
        return;
      }
      if (!deps.alive(thread)) return;
    }
    for (const i of deps.thread().items) {
      if (i.kind === "walk-block" && sameStop(i.stop, stop) && !busyPhase(i) && i.phase !== "saved") i.phase = "skipped";
    }
    handled.value.set(stopKey(stop), "skipped");
    // Asked next from where the DM stood: the stop they skipped, not a question that was waiting somewhere else.
    current.value = refOf(stop);
    next();
  }

  /**
   * "Next section" declares the section done. A section the canon does not hold is stored as skipped, so the walk does
   * not come back to it (a character stop stores nothing); one with something kept is filled already. The pitch is never
   * declared done empty: every draft is written from it, so the Familiar asks its follow-up, or says it is needed.
   */
  async function done(blockId: number) {
    const b = block(blockId);
    if (!b || busyPhase(b) || !active.value) return;
    const stop = b.stop;
    const filled = progress.value.some((s) => sameStop(s, stop) && s.state === "filled");
    if (filled) {
      current.value = refOf(stop);
      next();
      return;
    }
    if (stop.step === "pitch") {
      if (!followedUp.has(stopKey(stop))) askFollowUp(stop, b.answer.trim());
      else b.notice = PITCH_NEEDED;
      return;
    }
    await skip(stop);
  }

  /** Asks that stop's question now, wherever the walk was. */
  function jump(stop: WalkStopRef) {
    if (!active.value) active.value = true;
    handled.value.delete(stopKey(stop));
    ask(stop);
  }

  /** What the walk's drafts have cost in this thread, for its progress line. */
  const spent = computed(() => deps.items.value.reduce((sum, i) => sum + (i.kind === "walk-block" ? (i.credits ?? 0) : 0), 0));

  return { spent, active, awaiting, awaitingId: computed(() => awaitingId.value), current, progress, draftedBlock, start, answer, youDecide, justIdeas, done, writeMyself, enhance, again, skip, next, jump, leave };
}

export type AskWalk = ReturnType<typeof useAskWalk>;
