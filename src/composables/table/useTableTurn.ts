import { computed, ref, shallowRef, type Ref } from "vue";
import { supabase } from "@/lib/supabase";
import { readTableStream } from "@/lib/table/readTableStream";
import { applyTableEvent, boardItem, nextItemId, playerItem } from "@/lib/table/storyReducer";
import type { BoardLine } from "@/lib/table/fight/boardLines";
import type { FightChange, FightTurn } from "@/lib/table/fight/fightChange";
import type { PlayMode, RollAnswer, RollAsk, StoryItem, TableFight, TablePressure } from "@/lib/table/soloTypes";
import { NO_ANSWER, refusalFailure, WITHHELD, type TurnFailure } from "@/lib/table/turnRefusal";

export interface TurnRequest {
  campaignId: string;
  message: string;
  mode: PlayMode;
  sessionId?: string;
  startLocationId?: string;
  characterId?: string;
  /** The answer to a roll the table asked for. Sent only while one is asked for: the server refuses it otherwise. */
  roll?: RollAnswer;
  /** A new sitting asks the Dungeon Master to open the scene: no words, no session yet. */
  opening?: true;
  /** A fight at the table has ended: the Dungeon Master is asked to tell what comes of it. No words. */
  aftermath?: true;
  /** In a fight: the turn of someone with the party whom the rules cannot play. */
  helperTurn?: { name: string };
  /** The player says nothing and the characters go on with what they were saying. No words. */
  listening?: true;
  /** In a fight on the board: what the player's turn still holds. */
  fightTurn?: FightTurn;
}

/** Sends one turn and hands back the raw response. The seam a test replaces; the default talks to `agent-turn`. */
/** A turn that carries no words of the player's: the scene's opening, a fight's aftermath, the characters going on while the player listens, or a helper's turn in a fight. */
type Wordless = "opening" | "aftermath" | "listening" | { helper: string };

export type TurnTransport = (request: TurnRequest, signal: AbortSignal) => Promise<Response>;

export const sendToAgentTurn: TurnTransport = async (request, signal) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(request),
    signal,
  });
};

export interface TableTurnOptions {
  campaignId: () => string | null;
  /** The conversation to continue; null for a new one. */
  sessionId: string | null;
  /** Only used for a new conversation: the server refuses them on a continued one. */
  characterId?: () => string | null;
  startLocationId?: () => string | null;
  transport?: TurnTransport;
  /** The conversation now has an id (a new one is created by its first turn). */
  onSession?: (sessionId: string) => void;
  /** The party arrived somewhere. */
  onScene?: (scene: { id: string; name: string }) => void;
  /** The clock the scene runs against moved, started or (null) came off. */
  onPressure?: (pressure: TablePressure | null) => void;
  /** The table asked for a roll (what the card shows), or the request came off (null) because a turn was sent. */
  onAskRoll?: (ask: RollAsk | null) => void;
  /** The story turned into a fight, or (null) its aftermath has been told. */
  onFight?: (fight: TableFight | null) => void;
  /** In a fight on the board: what the player's turn still holds, sent with every message; null outside a fight. */
  fightTurn?: () => FightTurn | null;
  /** The Dungeon Master's ruling changes the fight on the board: the page carries it out. */
  onFightChange?: (change: FightChange) => void;
  /** Whole days passed in the story this turn: the campaign's date moves on by them. */
  onDays?: (days: number) => void;
  /** A turn was kept. `floor` is "characters" when they were still talking among themselves and nothing waits on the player. */
  onDone?: (floor: "characters" | "player") => void;
}

async function refusalOf(response: Response): Promise<TurnFailure> {
  let code: string | null = null;
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") code = body.error;
  } catch {
    // A refusal that is not JSON (a gateway's page) is still a refusal: the status alone decides.
  }
  return refusalFailure(response.status, code);
}

/**
 * One sitting at the AI table: sends a turn and folds the event stream into the story page as it arrives.
 * The story it holds is what happened since this screen opened; a stored conversation is the caller's history.
 */
export function useTableTurn(options: TableTurnOptions) {
  const transport = options.transport ?? sendToAgentTurn;
  const sessionId = ref<string | null>(options.sessionId);
  const live = shallowRef<StoryItem[]>([]);
  const running = ref(false);
  const failure: Ref<TurnFailure | null> = ref(null);
  /** Credits the turns of this screen billed; the stored sitting's earlier spend is the caller's to add. */
  const credits = ref(0);
  /** How many turns this screen has had kept. */
  const turnsKept = ref(0);
  let controller: AbortController | null = null;
  // Bumped when the screen moves to another conversation, so a turn still winding down from the old one writes nothing.
  let generation = 0;
  let pending: { id: string | null; start: number; mode: PlayMode; text: string; roll: RollAnswer | null; wordless: Wordless | null } | null = null;
  /** The roll the table is waiting for. Cleared by any turn sent; back if that turn is not kept, for the server still waits. */
  let asked: RollAsk | null = null;

  function setAsked(ask: RollAsk | null): void {
    asked = ask;
    options.onAskRoll?.(ask);
  }

  const turnsPlayed = computed(() => live.value.filter((item) => item.kind === "player").length);

  function setUnsent(id: string, unsent: boolean): void {
    live.value = live.value.map((item) => (item.id === id && item.kind === "player" ? { ...item, unsent } : item));
  }

  /**
   * The turn was not kept, so nothing it wrote counts (its roll line included): back to the player's own line, which
   * stays and waits. A roll sent without words has no line, so the page goes back to what it was before the turn.
   */
  function discardTurn(start: number, playerId: string | null, before: RollAsk | null): void {
    const player = playerId === null ? undefined : live.value.find((item) => item.id === playerId);
    live.value = [...live.value.slice(0, start), ...(player ? [player] : [])];
    if (playerId !== null) setUnsent(playerId, true);
    // The server still waits for the roll it asked for, unless this turn's own stream asked for another.
    if (asked === null) setAsked(before);
  }

  async function play(start: number, playerId: string | null, mode: PlayMode, text: string, roll: RollAnswer | null, wordless: Wordless | null = null): Promise<void> {
    const campaignId = options.campaignId();
    if (campaignId === null) return;
    const request: TurnRequest = { campaignId, message: text, mode };
    if (roll !== null) request.roll = roll;
    if (wordless === "opening") request.opening = true;
    if (wordless === "aftermath") request.aftermath = true;
    if (wordless === "listening") request.listening = true;
    if (wordless !== null && typeof wordless === "object") request.helperTurn = { name: wordless.helper };
    const fightTurn = options.fightTurn?.() ?? null;
    if (fightTurn !== null && wordless === null) request.fightTurn = fightTurn;
    const before = asked;
    setAsked(null);
    if (sessionId.value !== null) request.sessionId = sessionId.value;
    else {
      const start = options.startLocationId?.() ?? null;
      const character = options.characterId?.() ?? null;
      if (start !== null) request.startLocationId = start;
      if (character !== null) request.characterId = character;
    }

    const mine = generation;
    controller = new AbortController();
    const signal = controller.signal;
    running.value = true;
    failure.value = null;
    let kept = false;
    let floor: "characters" | "player" = "player";
    try {
      const response = await transport(request, signal);
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
        failure.value = await refusalOf(response);
        discardTurn(start, playerId, before);
        return;
      }
      for await (const event of readTableStream(response)) {
        if (mine !== generation) return;
        if (event.type === "session") {
          sessionId.value = event.sessionId;
          options.onSession?.(event.sessionId);
        } else if (event.type === "error") {
          failure.value = event.withheld === true ? WITHHELD : NO_ANSWER;
          discardTurn(start, playerId, before);
          return;
        } else if (event.type === "done") {
          kept = true;
          floor = event.floor === "characters" ? "characters" : "player";
          turnsKept.value += 1;
          credits.value += event.credits;
        } else {
          if (event.type === "scene") options.onScene?.(event.scene);
          if (event.type === "pressure") options.onPressure?.(event.pressure);
          if (event.type === "fight") options.onFight?.(event.fight);
          if (event.type === "fight_change") options.onFightChange?.(event.change);
          if (event.type === "days") options.onDays?.(event.days);
          if (event.type === "ask_roll") setAsked(event.roll);
          live.value = applyTableEvent(live.value, event, start);
        }
      }
      if (!kept) {
        // A stream that ends without its last event never finished: the server keeps a turn only after `done`.
        failure.value = NO_ANSWER;
        discardTurn(start, playerId, before);
        return;
      }
      options.onDone?.(floor);
    } catch {
      if (mine !== generation) return;
      if (signal.aborted) {
        // Stop ends the answer where it is. What was already said stays, and is what you pay for.
        live.value = [...live.value, { id: nextItemId(), kind: "margin", text: "You stopped the answer here", count: 1 }];
        return;
      }
      failure.value = NO_ANSWER;
      discardTurn(start, playerId, before);
    } finally {
      if (mine === generation) {
        running.value = false;
        controller = null;
      }
    }
  }

  /**
   * Say it aloud or do it, with the roll that was asked for when there is one (a roll alone is a turn: no words).
   * Returns false when nothing was sent (empty, or a turn is already running).
   */
  async function send(mode: PlayMode, text: string, roll: RollAnswer | null = null): Promise<boolean> {
    const message = text.trim();
    if (running.value || (message === "" && roll === null) || message.length > 4000) return false;
    const start = live.value.length;
    const item = message === "" ? null : playerItem(mode, message);
    pending = { id: item?.id ?? null, start, mode, text: message, roll, wordless: null };
    if (item) live.value = [...live.value, item];
    await play(start, item?.id ?? null, mode, message, roll);
    return true;
  }

  /** Send the failed message again, in the same mode. The player's line is already on the page. */
  async function resend(): Promise<boolean> {
    if (running.value || pending === null || failure.value === null) return false;
    const { id, start, mode, text, roll, wordless } = pending;
    if (id !== null) setUnsent(id, false);
    await play(start, id, mode, text, roll, wordless);
    return true;
  }

  /**
   * The Dungeon Master opens the scene of a sitting that has not begun: no words of the player's, and only while
   * the page is empty and no conversation exists. Returns false when there is nothing to open.
   */
  async function open(): Promise<boolean> {
    if (running.value || sessionId.value !== null || live.value.length > 0) return false;
    pending = { id: null, start: 0, mode: "do", text: "", roll: null, wordless: "opening" };
    await play(0, null, "do", "", null, "opening");
    return true;
  }

  /**
   * A fight on the board has ended: the Dungeon Master tells what comes of it. No words of the player's. Returns
   * false when it cannot be asked now (a turn is running, or there is no conversation).
   */
  async function aftermath(): Promise<boolean> {
    if (running.value || sessionId.value === null) return false;
    const start = live.value.length;
    pending = { id: null, start, mode: "do", text: "", roll: null, wordless: "aftermath" };
    await play(start, null, "do", "", null, "aftermath");
    return true;
  }

  /**
   * In a fight on the board it is the turn of someone with the party whom the rules cannot play: the Dungeon Master
   * tells the one thing they do. No words of the player's. Returns false when it cannot be asked now (a turn is
   * running, or there is no conversation): the helper then lets the moment pass.
   */
  async function helper(name: string): Promise<boolean> {
    if (running.value || sessionId.value === null) return false;
    const start = live.value.length;
    pending = { id: null, start, mode: "do", text: "", roll: null, wordless: { helper: name } };
    await play(start, null, "do", "", null, { helper: name });
    return true;
  }

  /**
   * The characters still had the floor and the player says nothing: they go on. No words of the player's. Returns
   * false when it cannot be asked now (a turn is running, or there is no conversation).
   */
  async function listen(): Promise<boolean> {
    if (running.value || sessionId.value === null) return false;
    const start = live.value.length;
    pending = { id: null, start, mode: "do", text: "", roll: null, wordless: "listening" };
    await play(start, null, "do", "", null, "listening");
    return true;
  }

  /** What happened on the board of a fight, written into the story as it happens. Never sent anywhere. */
  function note(lines: readonly BoardLine[], byServer: boolean): void {
    live.value = [...live.value, ...lines.map((line) => boardItem(line, byServer))];
  }

  function stop(): void {
    controller?.abort();
  }

  /** Start over on another conversation (or a new one with null), as when the address changes under a mounted page. */
  function reset(next: string | null): void {
    generation += 1;
    controller?.abort();
    controller = null;
    running.value = false;
    sessionId.value = next;
    live.value = [];
    failure.value = null;
    credits.value = 0;
    turnsKept.value = 0;
    pending = null;
    setAsked(null);
  }

  return { sessionId, live, running, failure, credits, turnsKept, turnsPlayed, send, resend, open, aftermath, helper, listen, note, stop, reset, setAsked };
}
