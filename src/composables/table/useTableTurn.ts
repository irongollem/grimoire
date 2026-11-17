import { computed, ref, shallowRef, type Ref } from "vue";
import { supabase } from "@/lib/supabase";
import { readTableStream } from "@/lib/table/readTableStream";
import { applyTableEvent, nextItemId, playerItem } from "@/lib/table/storyReducer";
import type { PlayMode, StoryItem } from "@/lib/table/soloTypes";
import { NO_ANSWER, refusalFailure, type TurnFailure } from "@/lib/table/turnRefusal";

export interface TurnRequest {
  campaignId: string;
  message: string;
  mode: PlayMode;
  sessionId?: string;
  startLocationId?: string;
  characterId?: string;
}

/** Sends one turn and hands back the raw response. The seam a test replaces; the default talks to `agent-turn`. */
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
  /** A turn was kept. */
  onDone?: () => void;
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
  let controller: AbortController | null = null;
  // Bumped when the screen moves to another conversation, so a turn still winding down from the old one writes nothing.
  let generation = 0;
  let pending: { id: string; mode: PlayMode; text: string } | null = null;

  const turnsPlayed = computed(() => live.value.filter((item) => item.kind === "player").length);

  function setUnsent(id: string, unsent: boolean): void {
    live.value = live.value.map((item) => (item.id === id && item.kind === "player" ? { ...item, unsent } : item));
  }

  /** The turn was not kept, so nothing it wrote counts: back to the player's own line, which stays and waits. */
  function discardTurn(playerId: string): void {
    const at = live.value.findIndex((item) => item.id === playerId);
    live.value = at < 0 ? live.value : live.value.slice(0, at + 1);
    setUnsent(playerId, true);
  }

  async function play(playerId: string, mode: PlayMode, text: string): Promise<void> {
    const campaignId = options.campaignId();
    if (campaignId === null) return;
    const request: TurnRequest = { campaignId, message: text, mode };
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
    try {
      const response = await transport(request, signal);
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
        failure.value = await refusalOf(response);
        discardTurn(playerId);
        return;
      }
      for await (const event of readTableStream(response)) {
        if (mine !== generation) return;
        if (event.type === "session") {
          sessionId.value = event.sessionId;
          options.onSession?.(event.sessionId);
        } else if (event.type === "error") {
          failure.value = NO_ANSWER;
          discardTurn(playerId);
          return;
        } else if (event.type === "done") {
          kept = true;
          credits.value += event.credits;
        } else {
          if (event.type === "scene") options.onScene?.(event.scene);
          live.value = applyTableEvent(live.value, event);
        }
      }
      if (!kept) {
        // A stream that ends without its last event never finished: the server keeps a turn only after `done`.
        failure.value = NO_ANSWER;
        discardTurn(playerId);
        return;
      }
      options.onDone?.();
    } catch {
      if (mine !== generation) return;
      if (signal.aborted) {
        // Stop ends the answer where it is. What was already said stays, and is what you pay for.
        live.value = [...live.value, { id: nextItemId(), kind: "margin", text: "You stopped the answer here", count: 1 }];
        return;
      }
      failure.value = NO_ANSWER;
      discardTurn(playerId);
    } finally {
      if (mine === generation) {
        running.value = false;
        controller = null;
      }
    }
  }

  /** Say it aloud or do it. Returns false when nothing was sent (empty, or a turn is already running). */
  async function send(mode: PlayMode, text: string): Promise<boolean> {
    const message = text.trim();
    if (running.value || message === "" || message.length > 4000) return false;
    const item = playerItem(mode, message);
    pending = { id: item.id, mode, text: message };
    live.value = [...live.value, item];
    await play(item.id, mode, message);
    return true;
  }

  /** Send the failed message again, in the same mode. The player's line is already on the page. */
  async function resend(): Promise<boolean> {
    if (running.value || pending === null || failure.value === null) return false;
    const { id, mode, text } = pending;
    setUnsent(id, false);
    await play(id, mode, text);
    return true;
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
    pending = null;
  }

  return { sessionId, live, running, failure, credits, turnsPlayed, send, resend, stop, reset };
}
